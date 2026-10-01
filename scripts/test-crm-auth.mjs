// scripts/test-crm-auth.mjs
// Exercises the REAL nextbright-crm/js/auth.js, not a stub.
//
// A previous suite passed `getAccessToken` in by hand, which meant the module's
// own signed-out behaviour was never executed. That is how a hardcoded
// 'dev-demo-jwt-token' fallback survived: with no session the function returned
// a fake credential, every protected endpoint answered 401, and the UI called it
// an expired session instead of a sign-out.
//
//   node scripts/test-crm-auth.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const AUTH_SRC = 'nextbright-crm/js/auth.js';
const source = fs.readFileSync(AUTH_SRC, 'utf8');

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
 * Run the real auth.js with a controllable Supabase client.
 * `session` is what sb.auth.getSession() reports; null means signed out.
 */
function loadAuth({ session, refreshResult = null, fetchImpl } = {}) {
  const requests = [];
  const warns = [];
  let current = session;

  const sb = {
    auth: {
      getSession: async () => ({ data: { session: current }, error: null }),
      refreshSession: async () => (refreshResult
        ? { data: { session: refreshResult }, error: null }
        : { data: { session: null }, error: { message: 'no refresh token' } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null })
    }
  };

  const store = new Map();

  // The module bootstraps its real client from /api/public-config, so serve
  // that and hand back the fake client from window.supabase.createClient.
  // Exercising this path is the point: stubbing getAccessToken away is how the
  // hardcoded-token bug went unnoticed.
  const CONFIG = { projectUrl: 'https://mock-project.supabase.co', anonKey: 'anon-key-for-test' };
  let createClientCalls = 0;

  const sandboxFetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/api/public-config')) {
      return new Response(JSON.stringify(CONFIG), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    const req = {
      url,
      method: (init?.method || 'GET').toUpperCase(),
      headers: init?.headers || {}
    };
    requests.push(req);
    return fetchImpl ? fetchImpl(req) : new Response('{}', { status: 200 });
  };

  // Minimal DOM for the module's overlay helpers.
  const fakeEl = () => ({
    style: {}, classList: { add() {}, remove() {}, contains: () => false },
    appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {},
    querySelectorAll: () => [], textContent: '', innerHTML: '', id: ''
  });
  const documentStub = {
    createElement: fakeEl,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { appendChild() {}, removeChild() {} },
    addEventListener() {},
    readyState: 'complete'
  };

  const sandbox = {
    console: { log() {}, warn: (...a) => warns.push(a.join(' ')), error() {} },
    URL, URLSearchParams, Promise, Error, Object, Array, String, Boolean, Number,
    Date, Math, JSON, Set, Map, setTimeout, clearTimeout, Response, Headers,
    document: documentStub,
    supabase: {
      createClient: (url, key) => { createClientCalls += 1; return sb; }
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    fetch: sandboxFetch
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: AUTH_SRC });

  return {
    api: sandbox.NB_AUTH,
    requests,
    warns,
    sb,
    setSession: (s) => { current = s; },
    get createClientCalls() { return createClientCalls; }
  };
}

const future = (s) => Math.floor(Date.now() / 1000) + s;
const ok = () => new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });

console.log('=== nextbright-crm/js/auth.js (real module) ===');

await test('exposes NB_AUTH with getAccessToken and apiFetch', async () => {
  const { api } = loadAuth({ session: null });
  assert.ok(api, 'window.NB_AUTH was not created');
  assert.equal(typeof api.getAccessToken, 'function');
  assert.equal(typeof api.apiFetch, 'function');
});

await test('SIGNED OUT -> getAccessToken returns null, never a token', async () => {
  // The core regression. Any non-null value here is a hardcoded credential.
  const { api } = loadAuth({ session: null });
  const token = await api.getAccessToken();
  assert.strictEqual(token, null,
    `expected null when signed out, got ${JSON.stringify(token)}`);
});

await test('the module contains no hardcoded fallback token literal', async () => {
  // Guard the source, not just the behaviour, so a re-introduction is caught
  // even if it sits on a path this suite does not execute.
  const live = source
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/\/\/.*$/gm, '');           // line comments
  assert.ok(!/dev-demo-jwt-token/.test(live),
    'a hardcoded token literal is present in executable code');
  assert.ok(!/eyJ[A-Za-z0-9_-]{30,}\.eyJ/.test(live), 'a JWT literal is present in executable code');
});

await test('SIGNED IN -> returns the real access token', async () => {
  const { api } = loadAuth({ session: { access_token: 'real-user-token', expires_at: future(3600) } });
  assert.equal(await api.getAccessToken(), 'real-user-token');
});

await test('apiFetch with no session throws AUTH_REQUIRED and sends nothing', async () => {
  const { api, requests } = loadAuth({ session: null, fetchImpl: ok });
  await assert.rejects(
    () => api.apiFetch('/api/messages'),
    (err) => err.code === 'AUTH_REQUIRED' && err.status === 401
  );
  assert.equal(requests.length, 0, 'must not fire an unauthenticated request');
});

await test('apiFetch sends Authorization: Bearer <token>', async () => {
  const { api, requests } = loadAuth({
    session: { access_token: 'real-user-token', expires_at: future(3600) }, fetchImpl: ok
  });
  await api.apiFetch('/api/messages?limit=500');
  assert.equal(requests[0].headers.Authorization, 'Bearer real-user-token');
});

await test('apiFetch refreshes once on a 401 and retries with the new token', async () => {
  let attempt = 0;
  const { api, requests, sb } = loadAuth({
    session: { access_token: 'stale-token', expires_at: future(3600) },
    refreshResult: { access_token: 'renewed-token', expires_at: future(7200) },
    fetchImpl: () => { attempt += 1; return attempt === 1 ? new Response('{}', { status: 401 }) : ok(); }
  });
  const res = await api.apiFetch('/api/messages');
  assert.equal(res.status, 200);
  assert.equal(requests.length, 2, 'expected exactly one retry');
  assert.equal(requests[0].headers.Authorization, 'Bearer stale-token');
  assert.equal(requests[1].headers.Authorization, 'Bearer renewed-token');
});

await test('a 401 that cannot be refreshed is returned, not swallowed', async () => {
  const { api } = loadAuth({
    session: { access_token: 'stale', expires_at: future(3600) },
    refreshResult: null,
    fetchImpl: () => new Response('{}', { status: 401 })
  });
  const res = await api.apiFetch('/api/messages');
  assert.equal(res.status, 401);
});

await test('a 403 is returned without a refresh attempt', async () => {
  let calls = 0;
  const { api } = loadAuth({
    session: { access_token: 't', expires_at: future(3600) },
    refreshResult: { access_token: 'r', expires_at: future(7200) },
    fetchImpl: () => { calls += 1; return new Response('{"error":"nope"}', { status: 403 }); }
  });
  const res = await api.apiFetch('/api/messages');
  assert.equal(res.status, 403);
  assert.equal(calls, 1, '403 must not be retried');
});

await test('a 500 passes through with the real status', async () => {
  const { api } = loadAuth({
    session: { access_token: 't', expires_at: future(3600) },
    fetchImpl: () => new Response('{"error":"boom"}', { status: 500 })
  });
  assert.equal((await api.apiFetch('/api/messages')).status, 500);
});

await test('a POST body is sent as JSON with the token', async () => {
  const { api, requests } = loadAuth({
    session: { access_token: 'real-user-token', expires_at: future(3600) }, fetchImpl: ok
  });
  await api.apiFetch('/api/messages', { method: 'POST', body: JSON.stringify({ phone: '919000000001', text: 'hi' }) });
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].headers['Content-Type'], 'application/json');
  assert.equal(requests[0].headers.Authorization, 'Bearer real-user-token');
});

await test('no service-role key appears in the module', async () => {
  const live = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/SERVICE_ROLE|service_role/.test(live));
});

console.log(`\n${failed ? failed + ' test(s) failed.' : passed + ' passed, 0 failed.'}`);
process.exit(failed ? 1 : 0);
