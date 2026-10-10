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

  if (!['twilio', 'whatsapp', 'instagram'].includes(integration)) {
    return res.status(400).json({
      error: 'Unsupported integration for credentials save.',
      supported: ['twilio', 'whatsapp', 'instagram']
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

  // ── 1. TWILIO VOICE SAVE ──────────────────────────────────────────────────
  if (integration === 'twilio') {
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

    const { data: existing } = await admin
      .from('twilio_connections')
      .select('id, auth_token_encrypted')
      .eq('organization_id', access.organizationId)
      .eq('account_sid', accountSid)
      .maybeSingle();

    const authTokenRaw = String(body.authToken || body.auth_token || body['auth-token'] || '').trim();
    let authTokenEncrypted = existing?.auth_token_encrypted || null;

    if (authTokenRaw) {
      try {
        authTokenEncrypted = await encryptToken(authTokenRaw);
      } catch (error) {
        return res.status(500).json({ error: 'Could not secure the auth token. Check server encryption secret.' });
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
      updated_at: new Date().toISOString()
    };

    const { data: saved, error: saveError } = await admin
      .from('twilio_connections')
      .upsert(row, { onConflict: 'organization_id,account_sid' })
      .select('id, account_sid, from_number, region, is_active, updated_at')
      .single();

    if (saveError) {
      return res.status(500).json({ error: `Could not save Twilio connection: ${saveError.message}` });
    }

    const status = await getIntegrationStatus('twilio', { organizationId: access.organizationId });
    return res.status(200).json({ success: true, connection: saved, status });
  }

  // ── 2. WHATSAPP CLOUD API SAVE ───────────────────────────────────────────
  if (integration === 'whatsapp') {
    const phoneNumberId = String(body.phoneNumberId || body.phone_number_id || body['phone-number-id'] || '').trim();
    if (!phoneNumberId) {
      return res.status(400).json({ error: 'WhatsApp Phone Number ID is required.' });
    }

    const accessTokenRaw = String(body.accessToken || body.access_token || body.system_token || '').trim();
    const wabaId = String(body.wabaId || body.waba_id || body['waba-id'] || '').trim() || null;
    const phoneNumber = String(body.phoneNumber || body.phone_number || '').trim() || null;
    const displayName = String(body.displayName || body.display_name || '').trim() || null;

    const { data: existing } = await admin
      .from('whatsapp_connections')
      .select('id, access_token_encrypted')
      .eq('organization_id', access.organizationId)
      .eq('phone_number_id', phoneNumberId)
      .maybeSingle();

    let accessTokenEncrypted = existing?.access_token_encrypted || null;

    if (accessTokenRaw) {
      try {
        accessTokenEncrypted = await encryptToken(accessTokenRaw);
      } catch (error) {
        return res.status(500).json({ error: 'Could not secure WhatsApp token.' });
      }
    }

    if (!accessTokenEncrypted) {
      return res.status(400).json({ error: 'WhatsApp Permanent Access Token is required.' });
    }

    const row = {
      organization_id: access.organizationId,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      phone_number: phoneNumber,
      display_name: displayName,
      access_token_encrypted: accessTokenEncrypted,
      is_active: true,
      updated_at: new Date().toISOString()
    };

    const { data: saved, error: saveError } = await admin
      .from('whatsapp_connections')
      .upsert(row, { onConflict: 'organization_id,phone_number_id' })
      .select('id, phone_number_id, waba_id, phone_number, display_name, is_active, updated_at')
      .single();

    if (saveError) {
      return res.status(500).json({ error: `Could not save WhatsApp connection: ${saveError.message}` });
    }

    const status = await getIntegrationStatus('whatsapp', { organizationId: access.organizationId });
    return res.status(200).json({ success: true, connection: saved, status });
  }

  // ── 3. INSTAGRAM GRAPH API SAVE ──────────────────────────────────────────
  if (integration === 'instagram') {
    const instagramBusinessId = String(body.instagramBusinessId || body.ig_account_id || body.accountId || '').trim();
    if (!instagramBusinessId) {
      return res.status(400).json({ error: 'Instagram Business Account ID is required.' });
    }

    const accessTokenRaw = String(body.accessToken || body.page_access_token || '').trim();
    const username = String(body.username || '').replace(/^@/, '').trim() || null;
    const pageId = String(body.pageId || body.page_id || '').trim() || null;

    const { data: existing } = await admin
      .from('instagram_connections')
      .select('id, access_token_encrypted')
      .eq('organization_id', access.organizationId)
      .eq('instagram_business_id', instagramBusinessId)
      .maybeSingle();

    let accessTokenEncrypted = existing?.access_token_encrypted || null;

    if (accessTokenRaw) {
      try {
        accessTokenEncrypted = await encryptToken(accessTokenRaw);
      } catch (error) {
        return res.status(500).json({ error: 'Could not secure Instagram token.' });
      }
    }

    if (!accessTokenEncrypted) {
      return res.status(400).json({ error: 'Instagram Access Token is required.' });
    }

    const row = {
      organization_id: access.organizationId,
      instagram_business_id: instagramBusinessId,
      instagram_username: username,
      page_id: pageId,
      access_token_encrypted: accessTokenEncrypted,
      is_active: true,
      updated_at: new Date().toISOString()
    };

    const { data: saved, error: saveError } = await admin
      .from('instagram_connections')
      .upsert(row, { onConflict: 'organization_id,instagram_business_id' })
      .select('id, instagram_business_id, instagram_username, page_id, is_active, updated_at')
      .single();

    if (saveError) {
      return res.status(500).json({ error: `Could not save Instagram connection: ${saveError.message}` });
    }

    const status = await getIntegrationStatus('instagram', { organizationId: access.organizationId });
    return res.status(200).json({ success: true, connection: saved, status });
  }
}

export default async function handler(req, res) {
  const query = req.query || {};
  if (query.route === 'trigger-call') {
    const { default: triggerCall } = await import('./_trigger-call.js');
    return triggerCall(req, res);
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

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

  let organizationId = null;
  try {
    const { getBearerToken, verifyOrgAccess } = await import('./_supabase.js');
    if (getBearerToken(req)) {
      const access = await verifyOrgAccess(req);
      if (access?.organizationId) organizationId = access.organizationId;
    }
  } catch (e) {}

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
    const integrations = await getIntegrationStatuses(keys, { organizationId });
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
