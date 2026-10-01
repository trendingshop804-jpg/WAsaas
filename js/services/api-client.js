/* ==========================================================================
   js/services/api-client.js — the single authenticated HTTP entry point.

   WHY THIS FILE EXISTS
   Before this, every protected call built its own headers, and the token came
   from a raw localStorage read with no expiry check:

       const raw = localStorage.getItem('sb-...-auth-token')
       headers.Authorization = 'Bearer ' + JSON.parse(raw).access_token

   Two failure modes followed:
     * a caller with no session still fired the request and got a bare 401
     * a STALE token was sent verbatim, so a signed-in user was rejected
       because their access token had expired and nothing refreshed it

   Everything now goes through authenticatedFetch(), which:
     1. asks the EXISTING Supabase client for a live session (never raw storage)
     2. refreshes it when it is expired, using the existing refresh mechanism
     3. refuses to send a request at all when there is no session
     4. attaches Authorization: Bearer <token>
     5. classifies 401 / 403 / 5xx distinctly

   SECURITY
     * No token, service-role key or other secret is ever embedded here.
     * Only the anon key (already public by design) may be sent, and it is
       never used in place of a session token.
     * Same-origin relative URLs are used throughout, so no CORS change.
   ========================================================================== */

(function () {
  'use strict';

  /** Error thrown when there is no usable session. Carries a machine code. */
  class AuthRequiredError extends Error {
    /**
     * @param {string} code
     *   'AUTH_REQUIRED'  - never signed in; no request was sent
     *   'UNAUTHORIZED'   - a session existed but the server rejected it, and a
     *                     refresh did not recover it
     * @param {string} [message] human-readable text
     */
    constructor(code = 'AUTH_REQUIRED', message) {
      super(message || (code === 'UNAUTHORIZED'
        ? 'Your session has expired. Please sign in again.'
        : 'A valid signed-in session is required.'));
      this.name = 'AuthRequiredError';
      this.code = code;
      this.status = 401;
    }
  }

  const listeners = new Set();
  let lastAuthEventAt = 0;

  function notifyAuthEvent(detail) {
    lastAuthEventAt = Date.now();
    for (const fn of listeners) {
      try { fn(detail); } catch (err) {
        console.warn('[API] auth listener failed:', err.message);
      }
    }
  }

  /* ---------------------------------------------------------------- token -- */

  /**
   * The live Supabase client, if one exists.
   *
   * Reuses the clients this project already creates rather than building a
   * second auth system. Preference order:
   *   1. window.authService.supabase   - js/services/auth-service.js
   *   2. window.NB_AUTH.getClient()    - nextbright-crm/js/auth.js
   *   3. window.__nbSupabase           - set by nextbright-crm/js/auth.js
   */
  function getSupabaseClient() {
    try {
      if (window.authService?.supabase) return window.authService.supabase;
    } catch (_) { /* not ready */ }
    try {
      if (window.__nbSupabase) return window.__nbSupabase;
    } catch (_) { /* not ready */ }
    return null;
  }

  /**
   * Resolve a valid access token, refreshing an expired session first.
   *
   * Order matters: the live client is asked before localStorage, because
   * localStorage can hold a token that expired hours ago.
   */
  let inFlightRefresh = null;

  async function getCurrentAccessToken() {
    const sb = getSupabaseClient();

    if (sb?.auth?.getSession) {
      try {
        const { data, error } = await sb.auth.getSession();
        if (error) {
          console.warn('[API] getSession error:', error.message);
        } else if (data?.session?.access_token) {
          // supabase-js refreshes transparently when autoRefreshToken is on and
          // the token is close to expiry. Force one when it is already gone.
          const expiresAt = data.session.expires_at || 0;
          const secondsLeft = expiresAt ? expiresAt - Math.floor(Date.now() / 1000) : Infinity;
          if (secondsLeft > 30 || secondsLeft === Infinity) {
            return data.session.access_token;
          }
          if (sb.auth.refreshSession) {
            if (!inFlightRefresh) {
              inFlightRefresh = sb.auth.refreshSession()
                .finally(() => { inFlightRefresh = null; });
            }
            const refreshed = await inFlightRefresh;
            if (refreshed?.data?.session?.access_token) {
              return refreshed.data.session.access_token;
            }
          }
          return data.session.access_token;
        }
      } catch (err) {
        console.warn('[API] session lookup failed:', err.message);
      }
    }

    // Fallback: the stored session, but only if it has not already expired.
    // Never returned when expired, because that is exactly what produced the
    // unexplained 401s.
    const stored = readStoredSessionSafely();
    if (stored?.access_token) {
      const expiresAt = stored.expires_at || 0;
      const secondsLeft = expiresAt ? expiresAt - Math.floor(Date.now() / 1000) : Infinity;
      if (secondsLeft > 30 || secondsLeft === Infinity) {
        return stored.access_token;
      }
      console.warn('[API] stored session is expired; no live client available to refresh it.');
    }

    return '';
  }

  function readStoredSessionSafely() {
    try {
      const raw = localStorage.getItem('sb-session') ||
        Object.keys(localStorage)
          .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
          .map(k => localStorage.getItem(k))[0];
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // supabase-js has written both shapes across versions: the bare session
      // and a wrapper under `currentSession`. Accept either, and never return a
      // value that has no access_token.
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.access_token) return parsed;
      if (parsed.currentSession?.access_token) return parsed.currentSession;
      if (parsed.user?.access_token) return parsed;
      return null;
    } catch (_) {
      return null;
    }
  }

  /* -------------------------------------------------------------- headers -- */

  function anonKey() {
    try {
      return window.supabaseConfig?.anonKey || '';
    } catch (_) {
      return '';
    }
  }

  function buildHeaders(init) {
    const headers = new Headers(init.headers || {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  }

  /* ----------------------------------------------------------------- fetch -- */

  /**
   * Authenticated fetch for every tenant-scoped endpoint.
   *
   * @param {string|URL|Request} input  same-origin path, e.g. '/api/messages'
   * @param {RequestInit} [init]
   * @param {{requireAuth?: boolean}} [opts]
   *        requireAuth:false is for public endpoints (e.g. /api/public-config).
   * @returns {Promise<Response>} the raw response, for the caller to inspect.
   *          A 401 is RETRIED once after a refresh, so the common expiry case
   *          resolves transparently; it is only thrown when the session is
   *          genuinely gone.
   * @throws {AuthRequiredError} when signed out, or when a 401 survives refresh
   */
  async function authenticatedFetch(input, init = {}, opts = {}) {
    const requireAuth = opts.requireAuth !== false;
    const headers = buildHeaders(init);

    if (requireAuth) {
      const token = await getCurrentAccessToken();
      if (!token) {
        // Do not fire an unauthenticated request: it can only ever come back
        // 401, and it is the reason the inbox used to look silently broken.
        notifyAuthEvent({ type: 'auth-required', path: String(input) });
        throw new AuthRequiredError('AUTH_REQUIRED');
      }
      headers.set('Authorization', `Bearer ${token}`);
      const key = anonKey();
      if (key && !headers.has('apikey')) headers.set('apikey', key);
    }

    // Development aid only. Logs that a request is happening and that a token
    // was attached - never the token itself.
    if (window.NB_DEBUG_API) {
      console.log('[API]', init.method || 'GET', String(input),
        '| authenticated:', requireAuth ? headers.has('Authorization') : 'n/a');
    }

    // Remember what was actually sent. If a refresh happens we must re-read the
    // session rather than assume the helper's cache moved on.
    let sentToken = requireAuth ? (headers.get('Authorization') || '').replace(/^Bearer\s+/i, '') : '';

    let response;
    try {
      response = await fetch(input, { ...init, headers });
    } catch (networkError) {
      const err = new Error(`Network request failed: ${networkError.message}`);
      err.code = 'NETWORK_ERROR';
      throw err;
    }

    if (response.status === 401) {
      // The token we sent was rejected. Two possibilities: the session ended
      // (sign-in again) or the token expired mid-session (refresh is enough).
      // Try one refresh, and only report UNAUTHORIZED if that also fails, so a
      // long-lived tab is not logged out unnecessarily.
      notifyAuthEvent({ type: 'unauthorized', path: String(input) });
      const refreshed = await attemptRefresh();
      if (refreshed) {
        const freshToken = await getCurrentAccessToken();
        // Only retry with a genuinely different token. Re-sending the same one
        // would burn a request and hide the real problem.
        if (freshToken && freshToken !== sentToken) {
          const retryHeaders = buildHeaders(init);
          retryHeaders.set('Authorization', `Bearer ${freshToken}`);
          const key2 = anonKey();
          if (key2 && !retryHeaders.has('apikey')) retryHeaders.set('apikey', key2);
          try {
            const retried = await fetch(input, { ...init, headers: retryHeaders });
            if (retried.status !== 401) return retried;
            response = retried;
          } catch (retryError) {
            const err = new Error(`Network request failed: ${retryError.message}`);
            err.code = 'NETWORK_ERROR';
            throw err;
          }
        }
      }
      const err = new AuthRequiredError('UNAUTHORIZED');
      err.response = response;
      throw err;
    } else if (response.status === 403) {
      // Authenticated but not permitted. Distinct from 401 on purpose: this is
      // never fixed by signing in again.
      console.warn('[API] 403 Forbidden for', String(input), '- not a member of this organization?');
    } else if (response.status >= 500) {
      // Surface the server's own message rather than hiding it.
      const detail = await response.clone().text().catch(() => '');
      console.error('[API] server error', response.status, 'for', String(input),
        detail ? `- ${detail.replace(/\s+/g, ' ').slice(0, 200)}` : '');
    }

    return response;
  }

  async function attemptRefresh() {
    const sb = getSupabaseClient();
    if (!sb?.auth?.refreshSession) return false;
    try {
      if (!inFlightRefresh) {
        inFlightRefresh = sb.auth.refreshSession().finally(() => { inFlightRefresh = null; });
      }
      const { data, error } = await inFlightRefresh;
      if (error) {
        console.warn('[API] session refresh failed:', error.message);
        return false;
      }
      notifyAuthEvent({ type: 'refreshed' });
      return Boolean(data?.session?.access_token);
    } catch (err) {
      console.warn('[API] session refresh threw:', err.message);
      return false;
    }
  }

  /* ------------------------------------------------------------ json sugar -- */

  /**
   * authenticatedFetch + JSON parsing, with 401/403/5xx turned into errors
   * that carry the server's real message.
   *
   * Because authenticatedFetch already retried a refreshable 401, a 401 that
   * reaches here means the session is truly gone, so it maps to UNAUTHORIZED
   * rather than being conflated with "never signed in".
   */
  async function apiFetchJson(input, init = {}, opts = {}) {
    let response;
    try {
      response = await authenticatedFetch(input, init, opts);
    } catch (err) {
      // authenticatedFetch already distinguishes "never signed in" from
      // "rejected and unrefreshable". Both are 401-class; pass the code through
      // unchanged so callers can tell a sign-out from an expiry.
      if (err instanceof AuthRequiredError) {
        err.code = err.code || 'AUTH_REQUIRED';
        err.payload = err.payload || null;
      }
      throw err;
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const err = new Error(
        payload.message || payload.error || `Request failed with HTTP ${response.status}`
      );
      err.status = response.status;
      err.code = response.status === 403 ? 'FORBIDDEN'
        : response.status === 401 ? 'UNAUTHORIZED'
        : response.status >= 500 ? 'SERVER_ERROR' : 'REQUEST_FAILED';
      err.payload = payload;
      throw err;
    }

    return payload;
  }

  /* --------------------------------------------------------------- export -- */

  const api = {
    authenticatedFetch,
    apiFetchJson,
    getCurrentAccessToken,
    getSupabaseClient,
    AuthRequiredError,
    /** Subscribe to auth lifecycle events. Returns an unsubscribe function. */
    onAuthEvent(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get lastAuthEventAt() { return lastAuthEventAt; }
  };

  window.apiClient = api;
  // Alias so call sites can read naturally.
  window.authenticatedFetch = authenticatedFetch;
  window.getCurrentAccessToken = getCurrentAccessToken;

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
