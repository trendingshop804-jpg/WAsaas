import { createSupabaseAdminClient, getAuthenticatedUser, getUserOrganizationIds } from './_supabase.js';

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
function slugFor(name, userId) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56);
  return `${base || 'workspace'}-${String(userId).slice(0, 8)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const auth = await getAuthenticatedUser(req);
  if (!auth.user || auth.isApiKey) return res.status(auth.status || 401).json({ error: auth.message || 'A signed-in user session is required.' });
  const { rows, error: membershipError } = await getUserOrganizationIds(auth.user.id);
  if (membershipError) return res.status(503).json({ error: 'Could not verify organization membership. Please retry.' });
  if (rows.length) return res.status(409).json({ error: 'Your organization is already set up.', code: 'ALREADY_PROVISIONED' });

  const body = readBody(req);
  const name = String(body.organizationName || body.workspaceName || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Enter an organization name between 2 and 100 characters.' });
  const admin = createSupabaseAdminClient();
  if (!admin) return res.status(503).json({ error: 'Database service is unavailable.' });
  const slug = slugFor(name, auth.user.id);

  let organizationId;
  const { data: inserted, error: insertError } = await admin
    .from('organizations')
    .insert({ name, slug, owner_id: auth.user.id })
    .select('id, name, slug')
    .maybeSingle();
  if (inserted) organizationId = inserted.id;
  if (insertError && insertError.code !== '23505') return res.status(500).json({ error: 'Could not create your organization.' });
  if (!organizationId) {
    const { data: existing, error: existingError } = await admin
      .from('organizations').select('id, name, slug, owner_id').eq('slug', slug).maybeSingle();
    if (existingError || !existing || existing.owner_id !== auth.user.id) return res.status(409).json({ error: 'Could not safely create your organization. Please choose a different name.', code: 'ORGANIZATION_CONFLICT' });
    organizationId = existing.id;
  }
  const { error: memberError } = await admin.from('organization_users')
    .insert({ organization_id: organizationId, user_id: auth.user.id, role: 'Owner' })
    .select('organization_id').maybeSingle();
  if (memberError && memberError.code !== '23505') return res.status(500).json({ error: 'Organization was created but membership could not be completed. Please retry.' });
  const { data: organization } = await admin.from('organizations').select('id, name, slug').eq('id', organizationId).single();
  return res.status(201).json({ success: true, organization, role: 'Owner' });
}