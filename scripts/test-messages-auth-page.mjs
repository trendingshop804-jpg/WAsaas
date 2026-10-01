// scripts/test-messages-auth-page.mjs
// Guards the browser-facing 401 help page on /api/messages.
//
// Opening the API URL in a browser tab used to return a bare
// {"error":"Authentication required."} with no guidance. It now returns a short
// HTML explanation - but ONLY for a page navigation, and ONLY with no data.
//
// The security contract that must not move:
//   * the status stays 401
//   * the page contains no tenant data
//   * API clients (Accept: application/json) still get the original JSON body
//   * a request that merely *claims* to be a browser cannot unlock anything
//
//   node scripts/test-messages-auth-page.mjs

import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'mock-publishable-key';
delete process.env.ALLOW_DEV_AUTH;

const SESSION_TOKEN = 'mock-session-token';
const ORG = '11111111-1111-4111-8111-111111111111';

globalThis.fetch = async (input, options = {}) => {
  const url = String(input?.url || input);
  if (url.includes('/auth/v1/user')) {
    const auth = String(options?.headers?.Authorization || options?.headers?.authorization || '');
    return /mock-session-token/.test(auth)
      ? { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ id: 'u1', aud: 'authenticated' }), text: async () => '{}' }
      : { ok: false, status: 401, headers: { get: () => 'application/json' }, json: async () => ({ msg: 'invalid' }), text: async () => '{}' };
  }
  if (url.includes('/rest/v1/organization_users')) {
    const rows = [{ organization_id: ORG, user_id: 'u1', role: 'Owner' }];
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => rows, text: async () => JSON.stringify(rows) };
  }
  if (url.includes('/rest/v1/messages')) {
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => [], text: async () => '[]' };
  }
  throw new Error(`Unexpected fetch to ${url}`);
};

const { default: handler } = await import('../api/messages.js');

function mockRes() {
  return {
    statusCode: null, payload: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.payload = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; }
  };
}

const call = async (headers) => {
  const res = mockRes();
  await handler({ method: 'GET', headers, query: {} }, res);
  return res;
};

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

const NAV = { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'sec-fetch-mode': 'navigate' };
const API = { accept: 'application/json', 'sec-fetch-mode': 'cors' };

console.log('=== /api/messages browser 401 help page ===');

await test('a browser navigation with no session still returns 401', async () => {
  const res = await call(NAV);
  assert.equal(res.statusCode, 401, 'the help page must not turn this into a 200');
});

await test('the help page is HTML and explains what to do', async () => {
  const res = await call(NAV);
  assert.match(String(res.headers['Content-Type']), /text\/html/);
  assert.match(res.body, /Authorization/i);
  assert.match(res.body, /Bearer/);
  assert.match(res.body, /sign in/i);
  assert.equal(res.payload, null, 'must not also send a JSON body');
});

await test('the help page leaks no tenant data', async () => {
  const res = await call(NAV);
  const html = res.body;
  // No row payloads, no identifiers, no counts, nothing that looks like a lead
  // or conversation. A static explainer only.
  assert.ok(!html.includes(ORG), 'organization id appears in the page');
  assert.ok(!/"messages"\s*:/.test(html), 'a messages collection appears in the page');
  assert.ok(!/conversations"\s*:\[/.test(html), 'conversation data appears in the page');
  assert.ok(!/<script/i.test(html), 'the page must not contain executable script');
  assert.ok(!/<form/i.test(html), 'the page must not contain a form');
});

await test('a real API client still gets the original JSON 401', async () => {
  const res = await call(API);
  assert.equal(res.statusCode, 401);
  assert.ok(res.payload, 'expected a JSON body');
  // The body is now the clearer { error: 'Unauthorized', message, code } shape
  // so the client can tell "never signed in" from "session expired".
  assert.equal(res.payload.error, 'Unauthorized');
  assert.ok(res.payload.message, 'expected a human-readable message');
  assert.ok(res.payload.code, 'expected a machine-readable code');
  assert.equal(res.body, null, 'must not send HTML to an API client');
});

await test('a fetch() with no session still gets JSON, never the HTML page', async () => {
  // fetch() from the console sends Accept: */* by default, which is not text/html.
  const res = await call({ accept: '*/*' });
  assert.equal(res.statusCode, 401);
  assert.ok(res.payload, 'expected JSON');
  assert.equal(res.body, null);
});

await test('text/html without sec-fetch-mode is still treated as a navigation', async () => {
  const res = await call({ accept: 'text/html' });
  assert.equal(res.statusCode, 401);
  assert.ok(res.body, 'expected the help page');
});

await test('a browser navigation WITH a valid session is not short-circuited', async () => {
  // The token must be honoured - the help page is only for the no-token case.
  const res = await call({ ...NAV, authorization: `Bearer ${SESSION_TOKEN}` });
  assert.equal(res.statusCode, 200, 'a signed-in navigation must reach the real handler');
  assert.ok(res.payload, 'expected the real JSON payload');
  assert.equal(res.body, null);
});

await test('a browser navigation with an INVALID token still gets 401 JSON, not the page', async () => {
  const res = await call({ ...NAV, authorization: 'Bearer not-a-real-token' });
  assert.equal(res.statusCode, 401);
  assert.ok(res.payload, 'a rejected token must get the JSON error');
  assert.equal(res.payload.code, 'UNAUTHORIZED', 'a presented-but-rejected token is an expiry/rejection, not a first-time sign-in');
  assert.equal(res.body, null, 'must not send HTML when a token was supplied');
});

await test('sec-fetch-mode=cors with text/html does not unlock anything', async () => {
  const res = await call({ accept: 'text/html', 'sec-fetch-mode': 'cors' });
  assert.equal(res.statusCode, 401);
  assert.ok(res.payload, 'expected JSON - a non-navigation must not get the page');
  assert.equal(res.body, null);
});

await test('the page is not cacheable', async () => {
  const res = await call(NAV);
  assert.equal(String(res.headers['Cache-Control']), 'no-store');
});

console.log(`\n${failed ? failed + ' test(s) failed.' : passed + ' passed, 0 failed.'}`);
process.exit(failed ? 1 : 0);
