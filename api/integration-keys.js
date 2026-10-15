import { createHash, randomBytes } from 'node:crypto';
import { createSupabaseAdminClient, requireOrgAccess } from './_supabase.js';
import { encryptToken, decryptToken } from './_crypto.js';

const MAX_NAME_LENGTH = 80;

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function safeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

function apiKeyHint(value) {
  const text = String(value || '');
  if (text.length <= 8) return '••••••••';
  return `${text.slice(0, 4)}••••${text.slice(-4)}`;
}

function requireAdmin(access, res) {
  if (['OWNER', 'ADMIN', 'API_KEY'].includes(String(access.role || '').toUpperCase())) return true;
  res.status(403).json({ error: 'Only an Owner or Admin can manage integration API keys.' });
  return false;
}
function validatedHttpsUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return null;
  if (/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return null;
  return url.toString();
}

async function verifyExternalConnection(baseUrl, apiKey) {
  const safeUrl = validatedHttpsUrl(baseUrl);
  if (!safeUrl) {
    return { ok: false, httpStatus: 400, message: 'A public HTTPS API base URL is required for live validation.' };
  }
  if (!apiKey) {
    return { ok: false, httpStatus: 400, message: 'API key or access token is required.' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(safeUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-API-Key': apiKey,
        'User-Agent': 'NextBright-CRM-Connector/2.0'
      },
      redirect: 'error',
      signal: controller.signal
    });
    if (!response.ok) {
      return {
        ok: false,
        httpStatus: response.status,
        message: response.status === 401 || response.status === 403
          ? `Provider rejected the API key (HTTP ${response.status}). Nothing was saved.`
          : `Provider validation failed with HTTP ${response.status}. Nothing was saved.`
      };
    }
    return { ok: true, httpStatus: response.status, message: `Connection verified successfully (HTTP ${response.status}).` };
  } catch (error) {
    return { ok: false, httpStatus: 502, message: `Endpoint validation failed: ${error?.name === 'AbortError' ? 'request timed out' : (error.message || 'unreachable endpoint')}. Nothing was saved.` };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const access = await requireOrgAccess(req, res, null);
  if (!access) return;
  const admin = createSupabaseAdminClient();
  if (!admin) return res.status(503).json({ error: 'Server database configuration is unavailable.' });

  // GET: List all saved connections & generated platform API keys
  if (req.method === 'GET') {
    const [connections, keys] = await Promise.all([
      admin.from('external_integrations')
        .select('id, name, base_url, api_key_hint, created_at, updated_at')
        .eq('organization_id', access.organizationId)
        .order('name'),
      admin.from('organization_api_keys')
        .select('id, name, key_prefix, created_at, last_used_at, revoked_at')
        .eq('organization_id', access.organizationId)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
    ]);

    if (connections.error || keys.error) {
      console.error('[integration-keys] list failed:', connections.error?.message || keys.error?.message);
      return res.status(500).json({ error: 'Could not load integration settings.' });
    }

    return res.status(200).json({
      connections: connections.data || [],
      apiKeys: keys.data || []
    });
  }

  if (!requireAdmin(access, res)) return;
  const body = parseBody(req);

  // POST action: save-connection (Add / Update third-party CRM or software API key)
  if (req.method === 'POST' && body.action === 'save-connection') {
    const name = safeName(body.name);
    const rawKey = String(body.apiKey || '').trim();
    const baseUrl = String(body.baseUrl || '').trim().slice(0, 500);

    if (!name) return res.status(400).json({ error: 'Software or CRM name is required.' });
    if (!rawKey) return res.status(400).json({ error: 'API key or access token is required.' });
    if (!validatedHttpsUrl(baseUrl)) {
      return res.status(400).json({ error: 'A public HTTPS API base URL is required to validate the key.' });
    }

    const validation = await verifyExternalConnection(baseUrl, rawKey);
    if (!validation.ok) return res.status(validation.httpStatus >= 500 ? 502 : 400).json({ error: validation.message, validation });

    try {
      const encrypted = await encryptToken(rawKey);
      const row = {
        organization_id: access.organizationId,
        name,
        base_url: baseUrl,
        api_key_encrypted: encrypted,
        api_key_hint: apiKeyHint(rawKey),
        created_by: access.user.id,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await admin.from('external_integrations')
        .upsert(row, { onConflict: 'organization_id,name' })
        .select('id, name, base_url, api_key_hint, created_at, updated_at')
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, connection: data });
    } catch (error) {
      console.error('[integration-keys] save connection failed:', error.message);
      return res.status(500).json({ error: 'Could not securely save the integration API key.' });
    }
  }

  // POST action: test-connection (Test external CRM / software connection)
  if (req.method === 'POST' && body.action === 'test-connection') {
    const connectionId = String(body.id || '').trim();
    let baseUrl = String(body.baseUrl || '').trim();
    let apiKey = String(body.apiKey || '').trim();

    if (connectionId) {
      const { data: conn, error } = await admin.from('external_integrations')
        .select('id, name, base_url, api_key_encrypted')
        .eq('id', connectionId)
        .eq('organization_id', access.organizationId)
        .maybeSingle();

      if (error || !conn) return res.status(404).json({ error: 'Saved connection not found.' });
      baseUrl = conn.base_url || baseUrl;
      try {
        apiKey = await decryptToken(conn.api_key_encrypted);
      } catch (err) {
        return res.status(500).json({ error: 'Could not decrypt stored credentials for test.' });
      }
    }

    const validation = await verifyExternalConnection(baseUrl, apiKey);
    return res.status(validation.ok ? 200 : (validation.httpStatus >= 500 ? 502 : 400)).json({
      success: validation.ok,
      status: validation.ok ? 'connected' : 'validation_failed',
      httpStatus: validation.httpStatus,
      message: validation.message
    });
  }
  // POST action: generate-api-key (Create platform API key for external apps to call our SaaS)
  if (req.method === 'POST' && body.action === 'generate-api-key') {
    const name = safeName(body.name);
    if (!name) return res.status(400).json({ error: 'Enter a name for this API key (e.g. Make Production, Zapier).' });

    const rawKey = `nl_live_${randomBytes(32).toString('base64url')}`;
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const { data, error } = await admin.from('organization_api_keys').insert({
      organization_id: access.organizationId,
      name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      created_by: access.user.id,
      created_at: new Date().toISOString()
    }).select('id, name, key_prefix, created_at').single();

    if (error) {
      const message = error.code === '23505'
        ? 'An API key with that name already exists. Please choose a different name.'
        : `Could not generate an API key: ${error.message}`;
      return res.status(400).json({ error: message });
    }

    // Return plaintext key ONCE for client to copy and store
    return res.status(201).json({
      success: true,
      apiKey: rawKey,
      record: data,
      message: 'API key generated successfully. Copy it now as it will not be shown again.'
    });
  }

  // DELETE: Remove saved connection or revoke generated API key
  if (req.method === 'DELETE') {
    const id = String(req.query?.id || '').trim();
    const type = String(req.query?.type || '').trim();
    if (!id || !['connection', 'api-key'].includes(type)) {
      return res.status(400).json({ error: 'A key type (connection | api-key) and id are required.' });
    }

    const operation = type === 'connection'
      ? admin.from('external_integrations').delete().eq('id', id).eq('organization_id', access.organizationId)
      : admin.from('organization_api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('organization_id', access.organizationId).is('revoked_at', null);

    const { error } = await operation;
    if (error) return res.status(500).json({ error: 'Could not remove this item.' });
    return res.status(200).json({ success: true, message: 'Item deleted / revoked successfully.' });
  }

  res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
  return res.status(405).json({ error: 'Method Not Allowed' });
}
