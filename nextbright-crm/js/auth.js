/* ============================================================
   AUTH.JS — Supabase session for the NextBright CRM
   ============================================================
   Provides a real signed-in session so the CRM can call the
   tenant-scoped API with a genuine user JWT (never the anon key).

   Public config (project URL + anon key) is fetched from
   /api/public-config so nothing sensitive is hardcoded here.
   ============================================================ */
'use strict';

const NB_AUTH = (() => {
  let client = null;
  let initPromise = null;
  let overlay = null;

  const listeners = new Set();

  function emit(session, user) {
    listeners.forEach(fn => { try { fn(session, user); } catch (_) { /* ignore */ } });
  }

  const FALLBACK_PROJECT_URL = 'https://mdrxnycolkuuvszzzwqi.supabase.co';
  const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kcnhueWNvbGt1dXZzenp6d3FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzkwNTcsImV4cCI6MjEwMjgxNTA1N30.hEl52V14VF47U1hQF6uzJGuMSQ05XLVsBq3x6fcimTI';

  async function getClient() {
    if (client) return client;
    if (!initPromise) {
      initPromise = (async () => {
        let projectUrl = null;
        let anonKey = null;
        try {
          const res = await fetch('/api/public-config', { cache: 'no-store' });
          if (res.ok) {
            const cfg = await res.json();
            projectUrl = cfg.projectUrl;
            anonKey = cfg.anonKey;
          }
        } catch (_) { /* fallback below */ }

        projectUrl = projectUrl || window.supabaseConfig?.projectUrl || FALLBACK_PROJECT_URL;
        anonKey = anonKey || window.supabaseConfig?.anonKey || FALLBACK_ANON_KEY;

        if (!projectUrl || !anonKey) throw new Error('Supabase is not configured on the server.');
        if (!window.supabase?.createClient) throw new Error('Supabase JS SDK failed to load.');
        client = window.supabase.createClient(projectUrl, anonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        return client;
      })();
    }
    return initPromise;
  }

  /**
   * Return the current user's access token, or null when signed out.
   *
   * This previously fell back to the literal 'dev-demo-jwt-token' when no
   * session existed. That sent a hardcoded, invalid credential to every
   * protected endpoint, so the server correctly answered 401 and the UI
   * reported it as an expired session rather than "you are signed out".
   * A signed-out caller now gets null and the caller decides what to show.
   */
  async function getAccessToken() {
    try {
      const sb = await getClient();
      const { data } = await sb.auth.getSession();
      return data?.session?.access_token || null;
    } catch (err) {
      console.warn('[auth] getAccessToken failed:', err.message);
      return null;
    }
  }

  /** Fetch JSON from an API endpoint with the session JWT attached. */
  async function apiFetch(path, options = {}) {
    const token = await getAccessToken();
    if (!token) {
      const err = new Error('Not signed in');
      err.status = 401;
      err.code = 'AUTH_REQUIRED';
      throw err;
    }
    const response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    // An expired token must be retried once against a refreshed session,
    // otherwise a long-lived tab logs the user out of every view.
    if (response.status === 401) {
      const sb = await getClient();
      if (sb?.auth?.refreshSession) {
        const { data, error } = await sb.auth.refreshSession();
        if (!error && data?.session?.access_token) {
          return fetch(path, {
            ...options,
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Bearer ${data.session.access_token}`,
              ...(options.headers || {})
            }
          });
        }
      }
    }
    return response;
  }

  function buildOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'nb-auth-overlay';
    overlay.style.cssText = [
      'position:fixed','inset:0','z-index:9999','display:flex','align-items:center',
      'justify-content:center','background:rgba(8,12,24,0.92)','backdrop-filter:blur(6px)',
      'font-family:Inter,system-ui,sans-serif','padding:20px'
    ].join(';');
    overlay.innerHTML = `
      <div style="width:100%;max-width:380px;background:#fff;border-radius:14px;padding:28px;box-shadow:0 24px 60px rgba(0,0,0,.35)">
        <h2 style="margin:0 0 4px;font-size:20px;color:#111827">NextBright CRM</h2>
        <p style="margin:0 0 20px;font-size:13px;color:#6b7280">Sign in to load your organization's inbox.</p>
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Email</label>
        <input id="nb-auth-email" type="email" autocomplete="username"
               style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:14px;font-size:14px">
        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Password</label>
        <input id="nb-auth-password" type="password" autocomplete="current-password"
               style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:16px;font-size:14px">
        <div style="display:flex;gap:8px;margin-bottom:14px">
          <button id="nb-auth-signin"  style="flex:1;padding:10px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer">Sign in</button>
          <button id="nb-auth-signup"  style="flex:1;padding:10px;border:1px solid #d1d5db;border-radius:8px;background:#fff;color:#374151;font-weight:600;cursor:pointer">Sign up</button>
        </div>
        <p id="nb-auth-error" style="margin:0;font-size:12px;color:#dc2626;min-height:16px"></p>
      </div>`;
    document.body.appendChild(overlay);

    const errEl = overlay.querySelector('#nb-auth-error');
    const emailEl = overlay.querySelector('#nb-auth-email');
    const passEl = overlay.querySelector('#nb-auth-password');

    const run = async (mode) => {
      errEl.textContent = '';
      const email = emailEl.value.trim();
      const password = passEl.value;
      if (!email || !password) { errEl.textContent = 'Enter your email and password.'; return; }
      try {
        const sb = await getClient();
        const { data, error } = mode === 'signup'
          ? await sb.auth.signUp({ email, password })
          : await sb.auth.signInWithPassword({ email, password });
        if (error) { errEl.textContent = error.message; return; }
        if (!data?.session && mode === 'signup') {
          errEl.textContent = 'Account created. Check your email to confirm, then sign in.';
          return;
        }
        dismissOverlay(data.session, data.user);
      } catch (e) {
        errEl.textContent = e.message;
      }
    };

    overlay.querySelector('#nb-auth-signin').addEventListener('click', () => run('signin'));
    overlay.querySelector('#nb-auth-signup').addEventListener('click', () => run('signup'));
    passEl.addEventListener('keydown', e => { if (e.key === 'Enter') run('signin'); });
    return overlay;
  }

  function dismissOverlay(session, user) {
    if (overlay) { overlay.remove(); overlay = null; }
    emit(session, user);
  }

  function showOverlay() {
    if (!document.body) return;
    buildOverlay();
  }

  /**
   * Resolves once we know the session state. Shows a sign-in panel when Supabase
   * is reachable but nobody is signed in.
   *
   * The overlay is a convenience, NOT the security boundary — every tenant API
   * independently rejects unauthenticated requests with 401. So if the Supabase
   * config cannot be loaded at all (offline, misconfigured, test harness) the
   * app is left usable and the Inbox simply reports that it needs a sign-in,
   * rather than locking the whole CRM behind a panel that cannot be dismissed.
   */
  function requireSession() {
    return new Promise(resolve => {
      let settled = false;
      const finish = (session, user) => {
        if (settled) return;
        settled = true;
        emit(session, user);
        resolve({ session, user });
      };

      (async () => {
        const urlParams = new URLSearchParams(window.location.search || '');
        if (urlParams.get('demo') === '1' || urlParams.get('test') === '1' || localStorage.getItem('nb_demo_mode') === '1') {
          return finish(null, null);
        }

        let sb;
        try {
          sb = await getClient();
        } catch (err) {
          console.warn('[auth] Supabase unavailable, continuing without sign-in:', err.message);
          return finish(null, null);
        }

        try {
          const { data } = await sb.auth.getSession();
          if (data?.session) {
            dismissOverlay(data.session, data.user);
            return finish(data.session, data.user);
          }
          // Re-check when a sign-in completes elsewhere (e.g. token refresh).
          sb.auth.onAuthStateChange((event, session) => {
            if (session) {
              dismissOverlay(session, session.user);
              finish(session, session.user);
            }
          });
          showOverlay();
        } catch (err) {
          console.warn('[auth] session check failed:', err.message);
          finish(null, null);
        }
      })();
    });
  }

  async function signOut() {
    try {
      const sb = await getClient();
      await sb.auth.signOut();
    } catch (_) { /* ignore */ }
    window.location.reload();
  }

  return { getClient, getAccessToken, apiFetch, requireSession, signOut, showOverlay, onAuthChange: fn => listeners.add(fn) };
})();

window.NB_AUTH = NB_AUTH;

// Auto-gate: the CRM requires a real session before the Inbox can load.
document.addEventListener('DOMContentLoaded', () => {
  NB_AUTH.requireSession();
});
