import { createClient } from '@supabase/supabase-js';

export function getSupabaseServerConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return { url, serviceKey, publishableKey };
}

export function createSupabaseAdminClient() {
  const { url, serviceKey } = getSupabaseServerConfig();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function missingSupabaseServerConfig() {
  const { url, serviceKey } = getSupabaseServerConfig();
  const missing = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!serviceKey) missing.push('SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)');
  return missing;
}

export async function verifyOrganizationAccess(req, organizationId) {
  const { url, publishableKey } = getSupabaseServerConfig();
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  const admin = createSupabaseAdminClient();
  if (!url || !publishableKey || !token || !admin) return false;
  const publicClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await publicClient.auth.getUser(token);
  if (authError || !authData?.user) return false;
  const { data: membership, error: membershipError } = await admin
    .from('organization_users')
    .select('organization_id')
    .eq('organization_id', organizationId)
    .eq('user_id', authData.user.id)
    .maybeSingle();
  return !membershipError && Boolean(membership);
}