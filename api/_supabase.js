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

// ---------------------------------------------------------------------------
// Authenticated request helpers
//
// These exist so no handler ever has to trust an organization ID supplied by
// the client. The organization is always derived from the signed-in user's
// own membership rows, read through the service-role client.
// ---------------------------------------------------------------------------

/** Extract the bearer token, or '' when absent. */
export function getBearerToken(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization || '';
  return String(raw).replace(/^Bearer\s+/i, '').trim();
}

/**
 * Validate the bearer JWT with the ANON client (network call to GoTrue).
 * Returns { user } on success, or { error, status } on failure.
 */
/**
 * Short, safe description of an authentication outcome for server logs.
 * Records WHETHER a credential was presented and whether it verified. The
 * token itself is never included, and no header value is ever logged.
 */
function authLogFields(req) {
  const present = Boolean(getBearerToken(req));
  return { authHeaderPresent: present };
}

export async function getAuthenticatedUser(req) {
  const { url, publishableKey } = getSupabaseServerConfig();
  const token = getBearerToken(req);
  const admin = createSupabaseAdminClient();

  if (token) {
    // A token was presented, so it must be the token that decides the identity.
    // If we cannot validate it we must not substitute a different user for it.
    if (!url || !publishableKey) {
      console.warn('[getAuthenticatedUser] verification unavailable', authLogFields(req));
      return { error: 'Authentication unavailable. Please retry.', status: 503 };
    }
    try {
      const publicClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await publicClient.auth.getUser(token);
      if (!error && data?.user) {
        // userId only. Never the token, never the header value.
        console.log('[getAuthenticatedUser] token verified', {
          ...authLogFields(req),
          verified: true,
          userId: data.user.id
        });
        return { user: data.user };
      }
      console.warn('[getAuthenticatedUser] token rejected', {
        ...authLogFields(req),
        verified: false,
        reason: error?.message || 'no user returned'
      });
    } catch (e) {
      console.warn('[getAuthenticatedUser] GoTrue token validation notice:', e.message);
    }
    // An expired, forged or revoked token ends here. Falling through to any
    // other identity would silently promote the caller to that user's access.
    // The client distinguishes "expired, sign in again" from "never signed in".
    return {
      error: 'Unauthorized',
      message: 'Your session has expired. Please sign in again.',
      status: 401,
      code: 'UNAUTHORIZED'
    };
  }

  // No token at all: the request is unauthenticated and must stay that way.
  console.warn('[getAuthenticatedUser] no credential presented', authLogFields(req));
  // The only exception is an explicit, opt-in local dev switch. It requires an
  // env flag AND a non-production NODE_ENV, so it cannot be reached on a
  // deployed environment no matter how the server is configured.
  const devAuthEnabled =
    process.env.NODE_ENV !== 'production' &&
    String(process.env.ALLOW_DEV_AUTH || '').trim().toLowerCase() === 'true';

  if (devAuthEnabled) {
    if (!admin) {
      return { error: 'ALLOW_DEV_AUTH is set but the Supabase service-role client is unavailable.', status: 503 };
    }
    const { data: firstUser } = await admin.from('organization_users').select('user_id').limit(1).maybeSingle();
    const userId = firstUser?.user_id;
    if (userId) {
      console.warn('[getAuthenticatedUser] ALLOW_DEV_AUTH bypass used for user', userId);
      return { user: { id: userId, email: 'dev@local', role: 'authenticated' } };
    }
    return { error: 'ALLOW_DEV_AUTH is set but no organization member was found.', status: 503 };
  }

  return {
    error: 'Unauthorized',
    message: 'A valid signed-in session is required.',
    status: 401,
    code: 'AUTH_REQUIRED'
  };
}

/**
 * Resolve the organizations the signed-in user actually belongs to.
 * Membership is read with the service-role client (bypasses RLS) so that
 * organization_users can stay locked down to authenticated users only.
 *
 * Returns { rows, error } rather than a bare array, so callers can tell
 * "genuinely no membership" apart from "the lookup failed" — those need
 * different HTTP statuses (403 vs 503).
 */
export async function getUserOrganizationIds(userId) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { rows: [], error: { message: 'Supabase service-role client is not configured.' } };
  }
  const { data, error } = await admin
    .from('organization_users')
    .select('organization_id, role')
    .eq('user_id', userId);
  if (error) return { rows: [], error };
  return { rows: data || [], error: null };
}

/**
 * Gate for handlers that touch tenant data.
 *
 * Order of checks — both complete BEFORE any tenant data is read:
 *   1. A real Supabase session JWT is validated against GoTrue using the
 *      publishable key. The anon key is not a session and cannot pass this.
 *   2. Membership is read from organization_users with the service-role
 *      client. The organization comes from that result and NEVER from a
 *      client-supplied value.
 *
 * Statuses:
 *   401 - no / invalid / expired session, or auth not configured server-side
 *   403 - valid user with no membership, or asking for an org they are not in
 *   503 - the membership lookup itself failed, so the caller may retry
 *
 * Returns { user, organizationId, organizationIds, role } on success, or null
 * after having written the error response.
 */
export async function requireOrgAccess(req, res, requestedOrganizationId) {
  const { user, error, status, code, message } = await getAuthenticatedUser(req);
  if (!user) {
    // `message` distinguishes "no session" from "session expired" for the
    // client. `code` is stable and machine-readable. Neither leaks anything.
    res.status(status || 401).json({
      error: error || 'Unauthorized',
      message: message || 'A valid signed-in session is required.',
      code: code || 'AUTH_REQUIRED'
    });
    return null;
  }

  const { rows: memberships, error: membershipError } = await getUserOrganizationIds(user.id);
  if (membershipError) {
    // Deliberately NOT a 403: the caller may well be a valid member, and a
    // transient database error must not be reported as "you lost access".
    console.error('[requireOrgAccess] membership lookup failed:', membershipError.message);
    res.status(503).json({ error: 'Could not verify organization membership. Please retry.' });
    return null;
  }

  if (!memberships.length) {
    res.status(403).json({ error: 'Your account is not a member of any organization.' });
    return null;
  }

  const ids = memberships.map(m => m.organization_id);
  let organizationId = ids[0];

  if (requestedOrganizationId) {
    if (!ids.includes(requestedOrganizationId)) {
      // The client asked for an organization they do not belong to. Refuse and
      // log the attempt without echoing any tenant data.
      console.warn('[requireOrgAccess] cross-tenant request refused', {
        userId: user.id,
        membershipCount: ids.length
      });
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this organization.',
        code: 'CROSS_TENANT_DENIED'
      });
      return null;
    }
    organizationId = requestedOrganizationId;
  }

  // The resolved tenant is the single source of truth for every downstream
  // query. Logged for debugging; the id itself is not a secret.
  console.log('[requireOrgAccess] access granted', {
    userId: user.id,
    organizationId,
    membershipCount: ids.length
  });

  return {
    user,
    organizationId,
    organizationIds: ids,
    role: memberships.find(m => m.organization_id === organizationId)?.role || 'Sales Agent'
  };
}