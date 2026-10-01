// scripts/test-api-client.mjs
// Verifies the central authenticated fetch helper (js/services/api-client.js).
//
// The bug it guards against: the app read a raw localStorage session, never
// checked whether the token had expired, and sent it verbatim. A signed-in user
// with a stale token got an unexplained 401 and an empty inbox.
//
//   node scripts/test-api-client.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const CLIENT_SRC = 'js/services/api-client.js';
let passed = 0, failed = 0;

const test = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log('  PASS ', name);
  } catch (error) {
    failed += 1;
    console.log('  FAIL ', name);
    console.log('        ', error.message);
  }
};

/**
 * Load the real api-client.js in a fake browser and return handles to inspect
 * what it did. Nothing is stubbed inside the module itself.
 */
function loadClient({ stored = null, session = null, refresh = null, fetchImpl } = {}) {
  const requests = [];
  const logs = [];
  const store = new Map();
  if (stored) store.set('sb-mdrxnycolkuuvszzzwqi-auth-token', JSON.stringify(stored));

  const sandbox = {
    console: {
      log: (...a) => logs.push(a.join(' ')),
      warn: (...a) => logs.push('WARN ' + a.join(' ')),
      error: (...a) => logs.push('ERROR ' + a.join(' '))
    },
    Headers, Request, Response, URL, URLSearchParams,
    Promise, Error, Object, Array, String, Boolean, Number, Date, Math, JSON, Set, Map,
    setTimeout, clearTimeout,
    // A real localStorage surface. The session lookup calls Object.keys() on it,
    // so a plain object of methods would return the METHODS and find no session.
    // This Proxy reports the stored entry keys to Object.keys()/ownKeys.
    localStorage: new Proxy({
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
      key: (i) => [...store.keys()][i] ?? null
    }, {
      ownKeys: () => [...store.keys()],
      getOwnPropertyDescriptor: (t, k) => (store.has(k)
        ? { value: store.get(k), enumerable: true, configurable: true, writable: true }
        : undefined),
      has: (t, k) => store.has(k),
      get(t, prop) {
        if (prop === 'length') return store.size;
        if (store.has(prop)) return store.get(prop);
        return t[prop];
      }
    }),
    fetch: async (input, init) => {
      const req = {
        url: String(input),
        method: (init?.method || 'GET').toUpperCase(),
        headers: Object.fromEntries(new Headers(init?.headers || {}).entries())
      };
      requests.push(req);
      return fetchImpl ? fetchImpl(req) : new Response('{}', { status: 200 });
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  if (session || refresh) {
    // `live.current` is what getSession() reports. refreshSession() swaps it, so
    // the retry path genuinely observes a new token.
    const live = { current: session || null };
    const sb = {
      auth: {
        getSession: async () => (live.current
          ? { data: { session: live.current }, error: null }
          : { data: { session: null }, error: null }),
        refreshSession: async () => {
          if (!refresh) return { data: { session: null }, error: { message: 'no refresh token' } };
          live.current = refresh;
          return { data: { session: refresh }, error: null };
        }
      }
    };
    sandbox.authService = { supabase: sb };
    sandbox.__nbSupabase = sb;
  }

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(CLIENT_SRC, 'utf8'), sandbox, { filename: CLIENT_SRC });
  return { api: sandbox.apiClient, requests, logs, store };
}

const future = (secs) => Math.floor(Date.now() / 1000) + secs;
const past = (secs) => Math.floor(Date.now() / 1000) - secs;
const ok = (body = { conversations: [] }) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

console.log('=== js/services/api-client.js ===');

await test('exports the helper and exposes it on window', async () => {
  const { api } = loadClient();
  assert.equal(typeof api.authenticatedFetch, 'function');
  assert.equal(typeof api.getCurrentAccessToken, 'function');
  assert.equal(typeof api.apiFetchJson, 'function');
});

await test('attaches Authorization: Bearer <token> from the live session', async () => {
  const { api, requests } = loadClient({
    session: { access_token: 'live-token-abc', expires_at: future(3600) },
    fetchImpl: ok
  });
  await api.authenticatedFetch('/api/messages?limit=200');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.authorization, 'Bearer live-token-abc');
});

await test('no session -> throws AUTH_REQUIRED and sends NO request', async () => {
  const { api, requests } = loadClient({ fetchImpl: ok });
  await assert.rejects(
    () => api.authenticatedFetch('/api/messages'),
    (err) => err.code === 'AUTH_REQUIRED' && err.name === 'AuthRequiredError'
  );
  assert.equal(requests.length, 0, 'must not fire an unauthenticated request');
});

await test('an EXPIRED live session is refreshed before the request', async () => {
  let refreshed = 0;
  const { api, requests } = loadClient({
    session: { access_token: 'stale-token', expires_at: past(600) },
    refresh: { access_token: 'fresh-token', expires_at: future(3600) },
    fetchImpl: ok
  });
  const orig = api.getCurrentAccessToken;
  await api.authenticatedFetch('/api/messages');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.authorization, 'Bearer fresh-token',
    'the stale token must not be sent');
  assert.ok(refreshed === 0);
});

await test('an EXPIRED stored session is NOT used when no live client exists', async () => {
  // This is the exact production failure: a stale token in localStorage was
  // sent verbatim and the server answered 401 with no explanation.
  const { api, requests } = loadClient({
    stored: { access_token: 'ancient-token', expires_at: past(86400) },
    fetchImpl: ok
  });
  await assert.rejects(() => api.authenticatedFetch('/api/messages'), (e) => e.code === 'AUTH_REQUIRED');
  assert.equal(requests.length, 0);
});

await test('a VALID stored session is still honoured as a fallback', async () => {
  const { api, requests } = loadClient({
    stored: { access_token: 'stored-but-valid', expires_at: future(3600) },
    fetchImpl: ok
  });
  await api.authenticatedFetch('/api/messages');
  assert.equal(requests[0].headers.authorization, 'Bearer stored-but-valid');
});

await test('a stored session with no expires_at is accepted, not discarded', async () => {
  const { api, requests } = loadClient({
    stored: { access_token: 'no-expiry-field' },
    fetchImpl: ok
  });
  await api.authenticatedFetch('/api/messages');
  assert.equal(requests[0].headers.authorization, 'Bearer no-expiry-field');
});

await test('sets Content-Type only when there is a body', async () => {
  const { api, requests } = loadClient({
    session: { access_token: 't', expires_at: future(60) }, fetchImpl: ok
  });
  await api.authenticatedFetch('/api/messages');
  assert.equal(requests[0].headers['content-type'], undefined, 'GET must not declare a body type');
  await api.authenticatedFetch('/api/messages', { method: 'POST', body: '{"a":1}' });
  assert.equal(requests[1].headers['content-type'], 'application/json');
});

await test('does not overwrite an explicit Content-Type', async () => {
  const { api, requests } = loadClient({
    session: { access_token: 't', expires_at: future(60) }, fetchImpl: ok
  });
  await api.authenticatedFetch('/api/messages', {
    method: 'POST', body: 'x=1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  assert.equal(requests[0].headers['content-type'], 'application/x-www-form-urlencoded');
});

await test('a 403 is distinguishable from a 401 and is not retried', async () => {
  let calls = 0;
  const { api, requests } = loadClient({
    session: { access_token: 't', expires_at: future(60) },
    fetchImpl: () => { calls += 1; return new Response(JSON.stringify({ error: 'no access' }), { status: 403 }); }
  });
  const res = await api.authenticatedFetch('/api/messages');
  assert.equal(res.status, 403);
  assert.equal(calls, 1, '403 means signed in but not permitted - retrying is pointless');
  assert.equal(requests.length, 1);
});

await test('a 500 is surfaced, not hidden', async () => {
  const { api } = loadClient({
    session: { access_token: 't', expires_at: future(60) },
    fetchImpl: () => new Response('{"error":"boom"}', { status: 500 })
  });
  const res = await api.authenticatedFetch('/api/messages');
  assert.equal(res.status, 500, 'the real status must reach the caller');
});

await test('apiFetchJson maps 401/403/500 to distinct codes', async () => {
  for (const [status, code] of [[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [500, 'SERVER_ERROR']]) {
    const { api } = loadClient({
      session: { access_token: 't', expires_at: future(60) },
      refresh: null,
      fetchImpl: () => new Response(JSON.stringify({ error: 'x' }), { status })
    });
    await assert.rejects(() => api.apiFetchJson('/api/messages'), (e) => {
      assert.equal(e.code, code, `status ${status} should map to ${code}`);
      return true;
    });
  }
});

await test('a 401 that survives a refresh reports UNAUTHORIZED, not AUTH_REQUIRED', async () => {
  // Distinct codes matter: AUTH_REQUIRED means "sign in", UNAUTHORIZED means
  // "your session was rejected and could not be refreshed".
  const { api } = loadClient({
    session: { access_token: 't', expires_at: future(60) },
    refresh: null,
    fetchImpl: () => new Response('{}', { status: 401 })
  });
  await assert.rejects(() => api.apiFetchJson('/api/messages'), (e) => e.code === 'UNAUTHORIZED');
});

await test('a signed-out caller reports AUTH_REQUIRED and never hits the network', async () => {
  const { api, requests } = loadClient({ fetchImpl: ok });
  await assert.rejects(() => api.apiFetchJson('/api/messages'), (e) => e.code === 'AUTH_REQUIRED');
  assert.equal(requests.length, 0);
});

await test('a refreshable 401 is retried transparently and succeeds', async () => {
  let attempt = 0;
  const { api, requests } = loadClient({
    session: { access_token: 'stale', expires_at: future(60) },
    refresh: { access_token: 'renewed', expires_at: future(3600) },
    fetchImpl: () => {
      attempt += 1;
      return attempt === 1
        ? new Response('{}', { status: 401 })
        : ok({ conversations: [{ key: 'a' }] });
    }
  });
  const payload = await api.apiFetchJson('/api/messages');
  assert.equal(requests.length, 2, 'expected exactly one retry');
  assert.equal(requests[1].headers.authorization, 'Bearer renewed');
  assert.equal(payload.conversations.length, 1);
});

await test('403 is never retried even when a session could be refreshed', async () => {
  let calls = 0;
  const { api } = loadClient({
    session: { access_token: 't', expires_at: future(60) },
    refresh: { access_token: 'r', expires_at: future(3600) },
    fetchImpl: () => { calls += 1; return new Response('{"error":"nope"}', { status: 403 }); }
  });
  await assert.rejects(() => api.apiFetchJson('/api/messages'), (e) => e.code === 'FORBIDDEN');
  assert.equal(calls, 1);
});

await test('requireAuth:false is allowed to omit the token', async () => {
  const { api, requests } = loadClient({ fetchImpl: ok });
  const res = await api.authenticatedFetch('/api/public-config', {}, { requireAuth: false });
  assert.equal(res.status, 200);
  assert.equal(requests[0].headers.authorization, undefined);
});

await test('auth events are emitted so the UI can react', async () => {
  const { api } = loadClient({ fetchImpl: ok });
  const seen = [];
  const off = api.onAuthEvent((e) => seen.push(e.type));
  await assert.rejects(() => api.authenticatedFetch('/api/messages'));
  assert.ok(seen.includes('auth-required'));
  off();
});

await test('debug logging never prints the token', async () => {
  const { api, logs } = loadClient({
    session: { access_token: 'SUPER-SECRET-TOKEN', expires_at: future(60) },
    fetchImpl: ok
  });
  api.authenticatedFetch('/api/messages');   // NB_DEBUG_API is not set
  const blob = logs.join(' ');
  assert.ok(!blob.includes('SUPER-SECRET-TOKEN'), 'a token leaked into a log line');
});

await test('NB_DEBUG_API logs activity but never the token', async () => {
  const { api, requests, logs } = loadClient({
    session: { access_token: 'SECRET-ABC', expires_at: future(60) },
    fetchImpl: ok
  });
  // The module reads the flag off its own window, which IS the sandbox global.
  // Enable it inside a fresh sandbox so the flag is visible to the module.
  const src = fs.readFileSync(CLIENT_SRC, 'utf8');
  assert.ok(src.includes('window.NB_DEBUG_API'), 'debug flag must be read from window');

  const requests2 = [];
  const logs2 = [];
  const sandbox = {
    NB_DEBUG_API: true,
    console: {
      log: (...a) => logs2.push(a.join(' ')),
      warn: (...a) => logs2.push('WARN ' + a.join(' ')),
      error: (...a) => logs2.push('ERROR ' + a.join(' '))
    },
    Headers, Request, Response, URL, URLSearchParams,
    Promise, Error, Object, Array, String, Boolean, Number, Date, Math, JSON, Set, Map,
    setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, keys: () => [], get length() { return 0; } },
    fetch: async (input, init) => {
      const req = {
        url: String(input),
        headers: Object.fromEntries(new Headers(init?.headers || {}).entries())
      };
      requests2.push(req);
      return ok();
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  // A refreshSession that actually swaps the token, so the retry path is real.
  let current = { access_token: 'SECRET-ABC', expires_at: future(60) };
  sandbox.authService = { supabase: { auth: {
    getSession: async () => ({ data: { session: current }, error: null }),
    refreshSession: async () => {
      current = { access_token: 'RENEWED-XYZ', expires_at: future(3600) };
      return { data: { session: current }, error: null };
    }
  } } };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: CLIENT_SRC });

  await sandbox.apiClient.authenticatedFetch('/api/messages');
  const blob = logs2.join(' ');
  assert.ok(blob.includes('[API]'), 'debug output should be present when NB_DEBUG_API is on');
  assert.ok(blob.includes('authenticated: true'), 'debug output should report that a token was attached');
  assert.ok(!blob.includes('SECRET-ABC'), 'a token leaked into a debug log');
  assert.equal(requests2.length, 1);
});

await test('the module never references a service-role key', async () => {
  const src = fs.readFileSync(CLIENT_SRC, 'utf8');
  assert.ok(!/SERVICE_ROLE|service_role/.test(src), 'client helper must not know the service key');
  assert.ok(!/eyJ[A-Za-z0-9_-]{40,}/.test(src), 'no JWT-looking literal in the client helper');
});

await test('token preference: live client beats localStorage', async () => {
  const { api, requests } = loadClient({
    session: { access_token: 'from-live-client', expires_at: future(3600) },
    stored: { access_token: 'from-storage', expires_at: future(3600) },
    fetchImpl: ok
  });
  await api.authenticatedFetch('/api/messages');
  assert.equal(requests[0].headers.authorization, 'Bearer from-live-client');
});

console.log(`\n${failed ? failed + ' test(s) failed.' : passed + ' passed, 0 failed.'}`);
process.exit(failed ? 1 : 0);
