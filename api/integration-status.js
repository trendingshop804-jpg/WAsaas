import {
  getIntegrationStatus,
  getIntegrationStatuses,
  normalizeIntegrationKey,
  INTEGRATION_KEYS
} from './_integration-status.js';
import { createSupabaseAdminClient, requireOrgAccess } from './_supabase.js';
import { encryptToken } from './_crypto.js';

/**
 * GET  /api/integration-status[?integration=whatsapp]
 * POST /api/integration-status            { integration: 'twilio', ...credentials }
 * GET, POST /api/test-connection (via rewrite route=test-connection)
 *
 * Performs live provider checks on the server without exposing secrets or tokens.
 * The POST branch stores provider credentials server-side, encrypted, scoped to
 * the caller's own organization.
 */
const TWILIO_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/;
const ALLOWED_TWILIO_REGIONS = new Set(['US1', 'IE1', 'IN1', 'AU1', 'JP1', 'BR1', 'DE1', 'SG1']);

/**
 * POST /api/integration-status
 * body: { integration: 'twilio', accountSid, authToken, fromNumber, region }
 *
 * Why this exists: the Integrations form used to write credentials to browser
 * localStorage, which the server can never see, so Twilio could not be
 * configured from the app at all. Credentials now go to the server, encrypted,
 * scoped to the caller's own organization.
 *
 * Security:
 *   - requireOrgAccess() derives the organization from the signed-in user's
 *     membership. A body-supplied organizationId is never read.
 *   - Only OWNER / ADMIN may write.
 *   - The auth token is encrypted before it is stored and is never echoed back.
 */
async function saveCredentials(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const integration = normalizeIntegrationKey(body.integration || body.key || '');

  if (integration !== 'twilio') {
    return res.status(400).json({
      error: 'Only the twilio integration can be saved through this endpoint.',
      supported: ['twilio']
    });
  }

  const access = await requireOrgAccess(req, res, null);
  if (!access) return;

  if (!['OWNER', 'ADMIN'].includes(String(access.role || '').toUpperCase())) {
    return res.status(403).json({ error: 'Only an Owner or Admin can change integration credentials.' });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return res.status(503).json({ error: 'Server database configuration is unavailable.' });
  }

  // The form posts its field ids verbatim (kebab-case); accept camel/snake too.
  const accountSid = String(body.accountSid || body.account_sid || body['account-sid'] || '').trim();
  if (!accountSid) {
    return res.status(400).json({ error: 'Twilio Account SID is required.' });
  }
  if (!TWILIO_SID_PATTERN.test(accountSid)) {
    return res.status(400).json({ error: 'Twilio Account SID must be "AC" followed by 32 hex characters.' });
  }

  const fromNumberRaw = String(body.fromNumber || body.from_number || body['from-number'] || '').trim();
  if (fromNumberRaw && !/^\+?[0-9]{7,15}$/.test(fromNumberRaw.replace(/[\s()-]/g, ''))) {
    return res.status(400).json({ error: 'Caller number must be a valid phone number, e.g. +15551234567.' });
  }
  const fromNumber = fromNumberRaw ? `+${fromNumberRaw.replace(/[^0-9]/g, '')}` : null;

  const region = String(body.region || 'US1').trim().toUpperCase();
  if (!ALLOWED_TWILIO_REGIONS.has(region)) {
    return res.status(400).json({ error: `Unsupported region. Use one of: ${[...ALLOWED_TWILIO_REGIONS].join(', ')}.` });
  }

  // Look up the existing row so the token can be preserved when the operator
  // leaves the field blank. Re-sending a stored token is not possible: it is
  // never returned to a browser, only its ciphertext.
  const { data: existing, error: lookupError } = await admin
    .from('twilio_connections')
    .select('id, auth_token_encrypted')
    .eq('organization_id', access.organizationId)
    .eq('account_sid', accountSid)
    .maybeSingle();

  if (lookupError) {
    console.error('[integration-status] twilio lookup failed:', lookupError.message);
    return res.status(503).json({ error: 'Could not read the stored Twilio connection. Please retry.' });
  }

  const authTokenRaw = String(body.authToken || body.auth_token || body['auth-token'] || '').trim();
  let authTokenEncrypted = existing?.auth_token_encrypted || null;

  if (authTokenRaw) {
    try {
      authTokenEncrypted = await encryptToken(authTokenRaw);
    } catch (error) {
      console.error('[integration-status] twilio encrypt failed:', error.message);
      return res.status(500).json({ error: 'Could not secure the auth token. Check the server encryption secret.' });
    }
  }

  if (!authTokenEncrypted) {
    return res.status(400).json({ error: 'Auth token is required for a new Twilio connection.' });
  }

  const row = {
    organization_id: access.organizationId,
    account_sid: accountSid,
    auth_token_encrypted: authTokenEncrypted,
    from_number: fromNumber,
    region,
    is_active: true,
    connected_by: access.user?.id || null,
    updated_at: new Date().toISOString()
  };

  const { data: saved, error: saveError } = await admin
    .from('twilio_connections')
    .upsert(row, { onConflict: 'organization_id,account_sid' })
    .select('id, account_sid, from_number, region, is_active, updated_at')
    .single();

  if (saveError) {
    console.error('[integration-status] twilio save failed:', saveError.message);
    return res.status(500).json({ error: `Could not save the Twilio connection: ${saveError.message}` });
  }

  // Verified live so the badge reflects reality, not optimism.
  const status = await getIntegrationStatus('twilio', { organizationId: access.organizationId });

  return res.status(200).json({
    success: true,
    // auth_token_encrypted is deliberately absent from every response.
    connection: saved,
    status
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const query = req.query || {};
  const isTestConnection = query.route === 'test-connection';

  // ── Route: save provider credentials ─────────────────────────────────────
  if (req.method === 'POST' && !isTestConnection) {
    return saveCredentials(req, res);
  }

  // ── Route: /api/test-connection backward-compatibility adapter ──────────
  if (isTestConnection) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
      const waResult = await getIntegrationStatus('whatsapp');

      if (!waResult) {
        return res.status(500).json({
          connected: false,
          status: 'Error',
          message: 'WhatsApp status checker unavailable.'
        });
      }

      const isConnected = Boolean(waResult.connected);
      const statusLabel = isConnected
        ? 'Connected'
        : waResult.status === 'not_configured'
          ? 'Not Configured'
          : 'Error';

      const verifiedName = waResult.verifiedName || waResult.displayName || 'Meta WhatsApp Cloud API Verified';

      return res.status(200).json({
        connected: isConnected,
        status: statusLabel,
        message: isConnected
          ? '✓ WhatsApp Cloud API connection successful'
          : waResult.message || 'WhatsApp connection failed.',
        verifiedName,
        displayName: waResult.displayName || null,
        checkedAt: waResult.checkedAt || new Date().toISOString(),
        latencyMs: waResult.latencyMs ?? null
      });
    } catch (err) {
      console.error('[Test Connection Error]', err);
      return res.status(500).json({
        connected: false,
        status: 'Error',
        message: `WhatsApp connection failed: ${err.message}`
      });
    }
  }

  // ── Route: /api/integration-status standard endpoint ────────────────────
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const requested = query.integration || new URL(req.url || '/api/integration-status', 'http://localhost').searchParams.get('integration');
  let keys = INTEGRATION_KEYS;
  let normalized = null;

  if (requested) {
    normalized = normalizeIntegrationKey(requested);
    if (!INTEGRATION_KEYS.includes(normalized)) {
      return res.status(400).json({
        error: 'Unknown integration.',
        supported: INTEGRATION_KEYS
      });
    }
    keys = [normalized];
  }

  try {
    const integrations = await getIntegrationStatuses(keys);
    return res.status(200).json({
      success: true,
      integrations,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Integration Status Error]', error);
    return res.status(503).json({
      success: false,
      error: 'Integration status check failed.',
      checkedAt: new Date().toISOString()
    });
  }
}
