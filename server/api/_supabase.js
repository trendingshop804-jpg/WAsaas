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
  const apiKeyHeader = req.headers?.['x-api-key'] || req.headers?.['X-API-Key'] || req.headers?.['x-api-token'];
  if (apiKeyHeader) return String(apiKeyHeader).trim();
  const raw = req.headers?.authorization || req.headers?.Authorization || '';
  return String(raw).replace(/^Bearer\s+/i, '').trim();
}

/**
 * Validate the bearer JWT with the ANON client (network call to GoTrue)
 * OR validate an organization API key (nl_live_... / nb_live_...) against organization_api_keys.
 * Returns { user } on success, or { error, status } on failure.
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
    // 1. Check if token is an Organization API Key (e.g. nl_live_..., nb_live_..., or passed via x-api-key)
    const isLikelyApiKey = token.startsWith('nl_') || token.startsWith('nb_') || Boolean(req.headers?.['x-api-key']);
    if (isLikelyApiKey && admin) {
      try {
        const { createHash } = await import('node:crypto');
        const keyHash = createHash('sha256').update(token).digest('hex');
        const { data: keyRow, error: keyError } = await admin
          .from('organization_api_keys')
          .select('id, organization_id, name, key_prefix, created_by, revoked_at')
          .eq('key_hash', keyHash)
          .is('revoked_at', null)
          .maybeSingle();

        if (!keyError && keyRow) {
          // Update last_used_at asynchronously
          admin.from('organization_api_keys')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', keyRow.id)
            .then(() => {}).catch(() => {});

          console.log('[getAuthenticatedUser] API key verified', {
            keyPrefix: keyRow.key_prefix,
            organizationId: keyRow.organization_id
          });

          return {
            user: {
              id: keyRow.created_by || keyRow.id,
              email: `apikey-${keyRow.name.replace(/[^a-z0-9]/gi, '_')}@integration`,
              role: 'api_key'
            },
            organizationId: keyRow.organization_id,
            isApiKey: true,
            apiKeyName: keyRow.name
          };
        } else {
          console.warn('[getAuthenticatedUser] API key rejected or revoked');
          return {
            error: 'Unauthorized',
            message: 'Invalid or revoked API key.',
            status: 401,
            code: 'INVALID_API_KEY'
          };
        }
      } catch (err) {
        console.warn('[getAuthenticatedUser] API key verification error:', err.message);
      }
    }

    // 2. Validate Supabase Auth JWT
    if (!url || !publishableKey) {
      console.warn('[getAuthenticatedUser] verification unavailable', authLogFields(req));
      return { error: 'Authentication unavailable. Please retry.', status: 503 };
    }
    try {
      const publicClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await publicClient.auth.getUser(token);
      if (!error && data?.user) {
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
    return {
      error: 'Unauthorized',
      message: 'Your session has expired or the token is invalid. Please sign in again.',
      status: 401,
      code: 'UNAUTHORIZED'
    };
  }

  // No token presented
  console.warn('[getAuthenticatedUser] no credential presented', authLogFields(req));
  const devAuthEnabled =
    process.env.NODE_ENV !== 'production' &&
    String(process.env.ALLOW_DEV_AUTH || '').trim().toLowerCase() === 'true';

  if (devAuthEnabled) {
    if (!admin) {
      return { error: 'ALLOW_DEV_AUTH is set but the Supabase service-role client is unavailable.', status: 503 };
    }
    const { data: firstUser } = await admin.from('organization_users').select('user_id, organization_id').limit(1).maybeSingle();
    const userId = firstUser?.user_id;
    if (userId) {
      console.warn('[getAuthenticatedUser] ALLOW_DEV_AUTH bypass used for user', userId);
      return {
        user: { id: userId, email: 'dev@local', role: 'authenticated' },
        organizationId: firstUser?.organization_id
      };
    }
    return { error: 'ALLOW_DEV_AUTH is set but no organization member was found.', status: 503 };
  }

  return {
    error: 'Unauthorized',
    message: 'A valid signed-in session or API key is required.',
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
  const authResult = await getAuthenticatedUser(req);
  if (!authResult.user) {
    res.status(authResult.status || 401).json({
      error: authResult.error || 'Unauthorized',
      message: authResult.message || 'A valid signed-in session or API key is required.',
      code: authResult.code || 'AUTH_REQUIRED'
    });
    return null;
  }

  if (authResult.isApiKey) {
    if (requestedOrganizationId && requestedOrganizationId !== authResult.organizationId) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'This API key does not have access to the requested organization.',
        code: 'CROSS_TENANT_DENIED'
      });
      return null;
    }
    return {
      user: authResult.user,
      organizationId: authResult.organizationId,
      organizationIds: [authResult.organizationId],
      role: 'ADMIN',
      isApiKey: true,
      apiKeyName: authResult.apiKeyName
    };
  }

  const { user } = authResult;
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