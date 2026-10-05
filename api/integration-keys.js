import { createHash, randomBytes } from 'node:crypto';
import { createSupabaseAdminClient, requireOrgAccess } from './_supabase.js';
import { encryptToken } from './_crypto.js';

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
  return text.length <= 8 ? '••••••••' : `${text.slice(0, 4)}••••${text.slice(-4)}`;
}

function requireAdmin(access, res) {
  if (['OWNER', 'ADMIN'].includes(String(access.role || '').toUpperCase())) return true;
  res.status(403).json({ error: 'Only an Owner or Admin can manage integration API keys.' });
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const access = await requireOrgAccess(req, res, null);
  if (!access) return;
  const admin = createSupabaseAdminClient();
  if (!admin) return res.status(503).json({ error: 'Server database configuration is unavailable.' });

  if (req.method === 'GET') {
    const [connections, keys] = await Promise.all([
      admin.from('external_integrations')
        .select('id, name, base_url, api_key_hint, created_at, updated_at')
        .eq('organization_id', access.organizationId).order('name'),
      admin.from('organization_api_keys')
        .select('id, name, key_prefix, created_at, last_used_at, revoked_at')
        .eq('organization_id', access.organizationId).is('revoked_at', null).order('created_at', { ascending: false })
    ]);
    if (connections.error || keys.error) {
      console.error('[integration-keys] list failed:', connections.error?.message || keys.error?.message);
      return res.status(500).json({ error: 'Could not load integration settings.' });
    }
    return res.status(200).json({ connections: connections.data || [], apiKeys: keys.data || [] });
  }

  if (!requireAdmin(access, res)) return;
  const body = parseBody(req);

  if (req.method === 'POST' && body.action === 'save-connection') {
    const name = safeName(body.name);
    const rawKey = String(body.apiKey || '').trim();
    const baseUrl = String(body.baseUrl || '').trim().slice(0, 500) || null;
    if (!name || !rawKey) return res.status(400).json({ error: 'Software name and API key are required.' });
    if (baseUrl && !/^https:\/\//i.test(baseUrl)) return res.status(400).json({ error: 'Base URL must use HTTPS.' });
    try {
      const encrypted = await encryptToken(rawKey);
      const row = {
        organization_id: access.organizationId, name, base_url: baseUrl,
        api_key_encrypted: encrypted, api_key_hint: apiKeyHint(rawKey),
        created_by: access.user.id, updated_at: new Date().toISOString()
      };
      const { data, error } = await admin.from('external_integrations')
        .upsert(row, { onConflict: 'organization_id,name' })
        .select('id, name, base_url, api_key_hint, created_at, updated_at').single();
      if (error) throw error;
      return res.status(200).json({ connection: data });
    } catch (error) {
      console.error('[integration-keys] save connection failed:', error.message);
      return res.status(500).json({ error: 'Could not securely save the integration API key.' });
    }
  }

  if (req.method === 'POST' && body.action === 'generate-api-key') {
    const name = safeName(body.name);
    if (!name) return res.status(400).json({ error: 'Enter a name for this API key.' });
    const rawKey = `nl_live_${randomBytes(32).toString('base64url')}`;
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const { data, error } = await admin.from('organization_api_keys').insert({
      organization_id: access.organizationId, name, key_prefix: keyPrefix,
      key_hash: keyHash, created_by: access.user.id
    }).select('id, name, key_prefix, created_at').single();
    if (error) {
      const message = error.code === '23505' ? 'An API key with that name already exists.' : 'Could not generate an API key.';
      return res.status(400).json({ error: message });
    }
    // This is the only response that ever includes the plaintext key.
    return res.status(201).json({ apiKey: rawKey, record: data });
  }

  if (req.method === 'DELETE') {
    const id = String(req.query?.id || '').trim();
    const type = String(req.query?.type || '').trim();
    if (!id || !['connection', 'api-key'].includes(type)) return res.status(400).json({ error: 'A key type and id are required.' });
    const operation = type === 'connection'
      ? admin.from('external_integrations').delete().eq('id', id).eq('organization_id', access.organizationId)
      : admin.from('organization_api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('organization_id', access.organizationId).is('revoked_at', null);
    const { error } = await operation;
    if (error) return res.status(500).json({ error: 'Could not remove this item.' });
    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
  return res.status(405).json({ error: 'Method Not Allowed' });
}
