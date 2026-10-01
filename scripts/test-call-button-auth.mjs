// scripts/test-call-button-auth.mjs
// Proves the CRM/root "Call" button now presents a real Supabase session JWT
// to the authenticated /api/trigger-call proxy.
//
// The bug: requestServerCallWebhook() sent only Content-Type and Accept, so
// requireOrgAccess() rejected every call with 401 "Authentication required".
//
// Runs the real js/app.js and nextbright-crm/js/app.js call path against a fake
// window, a fake Supabase session and a fake server, then asserts the exact
// request that leaves the browser. Also drives api/trigger-call.js itself to
// prove the MacroDroid webhook flow still works end to end.
//
//   node scripts/test-call-button-auth.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SESSION_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.test-session-jwt.signature';
const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '764e9eab-26e5-4cdd-b554-25a41a25ea35';
const PHONE = '+918111986637';
const NAME = 'WhatsApp Contact (+918111986637)';

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

// ---------------------------------------------------------------------------
// 1. The browser side: load the real app.js and drive handleCallLead()
// ---------------------------------------------------------------------------

/**
 * Execute the call path from a real app.js inside a fake browser.
 * Only the section between the CALL WEBHOOK banner and the end of
 * handleCallLead is evaluated, so we test the shipped code, not a copy.
 */
async function runCallPath({ file, authKind, sessionToken, serverResponse }) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('const CALL_WEBHOOK_API');
  assert.ok(start > 0, `could not find the call section in ${file}`);
  const end = source.indexOf('window.handleMessageLead');
  assert.ok(end > start, `could not find the end of handleCallLead in ${file}`);
  const snippet = source.slice(start, end);

  const requests = [];
  const toasts = [];

  const windowStub = {
    location: { protocol: 'https:' },
    NB_AUTH: authKind === 'nb'
      ? { getAccessToken: async () => { if (!sessionToken) return null; return sessionToken; } }
      : undefined,
    supabaseConfig: authKind === 'config'
      ? { getSessionToken: () => sessionToken || '' }
      : undefined,
    fetch: async (url, options) => {
      requests.push({ url, options });
      const body = JSON.parse(options.body);
      return {
        ok: serverResponse.status < 400,
        status: serverResponse.status,
        json: async () => serverResponse.body
      };
    }
  };

  const context = vm.createContext({
    window: windowStub,
    navigator: {},
    console: { warn() {}, error() {}, log() {} },
    fetch: windowStub.fetch,
    Promise, Error, JSON, String, Boolean, Object, Array,
    setTimeout, clearTimeout
  });
  vm.runInContext(snippet, context, { filename: file });

  const result = await context.window.handleCallLead(NAME, PHONE);
  return { requests, result, toasts, showToast: toasts };
}

const OK_SERVER = { status: 200, body: { success: true, message: 'MacroDroid webhook triggered.' } };

for (const file of ['js/app.js', 'nextbright-crm/js/app.js']) {
  console.log(`=== ${file} ===`);

  await test(`${file}: sends Authorization: Bearer <session token>`, async () => {
    const { requests, result } = await runCallPath({
      file, authKind: 'nb', sessionToken: SESSION_TOKEN, serverResponse: OK_SERVER
    });
    assert.equal(requests.length, 1, 'expected exactly one request');
    const auth = requests[0].options.headers.Authorization;
    assert.equal(auth, `Bearer ${SESSION_TOKEN}`, 'missing or wrong Authorization header');
    assert.equal(result.success, true);
  });

  await test(`${file}: keeps the existing { name, phone } payload`, async () => {
    const { requests } = await runCallPath({
      file, authKind: 'nb', sessionToken: SESSION_TOKEN, serverResponse: OK_SERVER
    });
    const body = JSON.parse(requests[0].options.body);
    assert.deepEqual(Object.keys(body).sort(), ['name', 'phone']);
    assert.equal(body.name, NAME);
    assert.equal(body.phone, PHONE);
  });

  await test(`${file}: POSTs to the relative /api/trigger-call path only`, async () => {
    const { requests } = await runCallPath({
      file, authKind: 'nb', sessionToken: SESSION_TOKEN, serverResponse: OK_SERVER
    });
    assert.equal(requests[0].url, '/api/trigger-call');
    assert.equal(requests[0].options.method, 'POST');
  });

  await test(`${file}: no session -> no request, clear sign-in error`, async () => {
    const { requests, result } = await runCallPath({
      file, authKind: 'nb', sessionToken: null, serverResponse: OK_SERVER
    });
    assert.equal(requests.length, 0, 'must not call the API without a session');
    assert.equal(result.success, false);
    assert.match(result.error, /sign in/i);
  });

  await test(`${file}: a 401 from the server is surfaced, not swallowed`, async () => {
    const { result } = await runCallPath({
      file, authKind: 'nb', sessionToken: SESSION_TOKEN,
      serverResponse: { status: 401, body: { error: 'Authentication required. Please sign in.' } }
    });
    assert.equal(result.success, false);
    assert.match(result.error, /Authentication required/i);
  });

  await test(`${file}: falls back to supabaseConfig.getSessionToken()`, async () => {
    const { requests } = await runCallPath({
      file, authKind: 'config', sessionToken: SESSION_TOKEN, serverResponse: OK_SERVER
    });
    assert.equal(requests[0].options.headers.Authorization, `Bearer ${SESSION_TOKEN}`);
  });
}

// ---------------------------------------------------------------------------
// 2. The server side: /api/trigger-call still drives the MacroDroid webhook
// ---------------------------------------------------------------------------

console.log('=== api/trigger-call.js (MacroDroid flow still works) ===');

function loadHandler(env) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import(`../api/trigger-call.js?case=${Math.random()}`);
}

function mockRes() {
  return {
    statusCode: null, payload: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.payload = b; return this; },
    send(b) { this.payload = b; return this; },
    end() { this.payload = null; return this; }
  };
}

let membershipRole = 'Owner';
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, options = {}) => {
  const url = String(input?.url || input);
  if (url.includes('/auth/v1/user')) {
    const auth = String(options?.headers?.Authorization || options?.headers?.authorization || '');
    return /mock-session-token/.test(auth)
      ? { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ id: USER, aud: 'authenticated' }), text: async () => '{}' }
      : { ok: false, status: 401, headers: { get: () => 'application/json' }, json: async () => ({ msg: 'invalid' }), text: async () => '{}' };
  }
  if (url.includes('/rest/v1/organization_users')) {
    const rows = membershipRole ? [{ organization_id: ORG, user_id: USER, role: membershipRole }] : [];
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => rows, text: async () => JSON.stringify(rows) };
  }
  if (/macro\.webhook|ngrok|example\.com/.test(url)) {
    macroCalls.push({ url, options });
    return { ok: true, status: 200, headers: { get: () => 'text/plain' }, text: async () => 'OK' };
  }
  throw new Error(`Unexpected fetch to ${url}`);
};

let macroCalls = [];
process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'mock-publishable-key';
delete process.env.ALLOW_DEV_AUTH;
const MACRO_URL = 'https://macro.webhook.example.com/trigger';

const call = async (headers) => {
  const res = mockRes();
  const { default: handler } = await loadHandler({ MACRODROID_WEBHOOK_URL: MACRO_URL });
  await handler({ method: 'POST', headers, query: {}, body: { name: NAME, phone: PHONE } }, res);
  return res;
};

await test('a valid session triggers the MacroDroid webhook', async () => {
  macroCalls = [];
  const res = await call({ authorization: 'Bearer mock-session-token' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.equal(res.payload.success, true);
  assert.equal(macroCalls.length, 1, 'MacroDroid must actually be called');
  assert.ok(macroCalls[0].url.startsWith(MACRO_URL), 'the configured webhook must be used');
  assert.ok(macroCalls[0].url.includes(encodeURIComponent(PHONE.replace('+', '')) ) || macroCalls[0].url.includes('918111986637'),
    'the phone number must reach the webhook');
});

await test('no session -> 401 and MacroDroid is NOT called', async () => {
  macroCalls = [];
  const res = await call({});
  assert.equal(res.statusCode, 401);
  assert.match(res.payload.error, /Authentication required/i);
  assert.equal(macroCalls.length, 0);
});

await test('a non-member -> 403 and MacroDroid is NOT called', async () => {
  macroCalls = [];
  membershipRole = '';
  const res = await call({ authorization: 'Bearer mock-session-token' });
  membershipRole = 'Owner';
  assert.equal(res.statusCode, 403);
  assert.equal(macroCalls.length, 0);
});

await test('unconfigured MACRODROID_WEBHOOK_URL -> 503, URL never leaked', async () => {
  macroCalls = [];
  const res = await call({ authorization: 'Bearer mock-session-token' });
  // handler was reloaded with the URL set above, so re-run with it cleared
  const { default: handler } = await loadHandler({ MACRODROID_WEBHOOK_URL: undefined });
  const res2 = mockRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer mock-session-token' }, query: {}, body: { name: NAME, phone: PHONE } }, res2);
  assert.equal(res2.statusCode, 503);
  assert.ok(!JSON.stringify(res2.payload).includes('macro.webhook.example.com'), 'webhook URL leaked to the client');
});

globalThis.fetch = realFetch;
console.log(`\n${failed ? failed + ' test(s) failed.' : passed + ' passed, 0 failed.'}`);
process.exit(failed ? 1 : 0);
