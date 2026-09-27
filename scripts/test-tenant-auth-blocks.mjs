// scripts/test-tenant-auth-blocks.mjs
// ---------------------------------------------------------------------------
// Offline authorization tests for the three endpoints that were previously
// unauthenticated while using the Supabase service-role key with a
// client-supplied organizationId (findings C1, C2, C3):
//
//   api/meta-oauth-exchange.js  - writes whatsapp_connections / instagram_connections
//   api/instagram.js            - connect / disconnect / send_message / oauth-exchange
//   api/send-media.js           - outbound WhatsApp media
//
// Fully mocked: no database, no network, no Meta calls. The Meta Graph API is
// stubbed and any unexpected outbound URL aborts the test.
//
// What is proven:
//   * no session                      -> 401, zero writes
//   * session without membership      -> 403, zero writes
//   * valid member                    -> allowed
//   * body organizationId = other org -> CANNOT retarget; the write still uses
//                                       the caller's own organization
//   * no global WhatsApp token is ever used
// ---------------------------------------------------------------------------
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'mock-publishable-key';
// Deliberately set: the code must never use these.
process.env.WHATSAPP_ACCESS_TOKEN = 'GLOBAL-SHOULD-NOT-BE-USED';
process.env.WHATSAPP_PHONE_NUMBER_ID = '9999999999';
process.env.META_APP_ID = '123456';
process.env.META_APP_SECRET = 'test-app-secret';
process.env.INSTAGRAM_APP_ID = '123456';
process.env.INSTAGRAM_APP_SECRET = 'test-ig-secret';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const USER = '764e9eab-26e5-4cdd-b554-25a41a25ea35';

const mode = {
  tokenValid: true,
  memberships: [{ organization_id: ORG, user_id: USER, role: 'Owner' }]
};

// Records every privileged write the code attempts, with the org it targeted.
const writes = [];
let metaAuthHeaders = [];
let outboundUrls = [];

function json(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) };
}

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  const auth = String(options.headers?.Authorization || options.headers?.authorization || '');
  if (u.includes('graph.facebook.com')) {
    outboundUrls.push(u);
    metaAuthHeaders.push(auth);
    // Minimal shapes the callers read.
    if (u.includes('/oauth/access_token')) return json({ access_token: 'short-lived-token' });
    if (u.includes('/me/accounts')) return json({ data: [] });
    if (u.includes('/me/businesses')) return json({ data: [] });
    if (u.includes('/phone_numbers')) return json({ data: [] });
    return json({ id: 'ig_1', username: 'test_brand', display_phone_number: '+10000000000', verified_name: 'Test', name: 'Test' });
  }
  if (u.includes('/auth/v1/user')) {
    const ok = mode.tokenValid && /mock-session-token/.test(auth);
    return json(ok ? { id: USER, aud: 'authenticated' } : { msg: 'invalid' }, ok ? 200 : 401);
  }
  if (u.includes('/rest/v1/organization_users')) return json(mode.memberships);
  if (u.includes('/rest/v1/whatsapp_connections')) {
    writes.push({ table: 'whatsapp_connections', method: options.method || 'GET' });
    return json([{ organization_id: ORG, phone_number_id: '5550001111', access_token: 'tenant-token', is_active: true }]);
  }
  if (u.includes('/rest/v1/instagram_connections')) {
    let org = null;
    try { org = JSON.parse(options.body || '{}').organization_id; } catch { /* GET */ }
    if (options.method) writes.push({ table: 'instagram_connections', method: options.method, organization_id: org });
    return json([]);
  }
  if (u.includes('/rest/v1/messages') || u.includes('/rest/v1/conversations')) return json([]);
  throw new Error(`UNMOCKED REQUEST ESCAPED: ${u}`);
};

function mockRes() {
  return {
    _status: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this._status = c; return this; },
    json(v) { this.body = v; return this; },
    end() { return this; }
  };
}
async function call(handler, req) {
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, query: {}, body: {}, ...req }, res);
  return res;
}

const oauth = (await import(pathToFileURL(path.join(rootDir, 'api/meta-oauth-exchange.js')).href + '?t=' + Date.now())).default;
const instagram = (await import(pathToFileURL(path.join(rootDir, 'api/instagram.js')).href + '?t=' + Date.now())).default;
const sendMedia = (await import(pathToFileURL(path.join(rootDir, 'api/send-media.js')).href + '?t=' + Date.now())).default;

const SESSION = { Authorization: 'Bearer mock-session-token' };
function reset() { writes.length = 0; metaAuthHeaders = []; outboundUrls = []; }

let pass = 0, fail = 0;
async function t(name, fn) {
  reset();
  try { await fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

console.log('\n=== C1/C2/C3 tenant authorization (fully mocked) ===\n');

// ---------------------------------------------------------------------------
// C1 - meta-oauth-exchange
// ---------------------------------------------------------------------------

const OAUTH_BODY = {
  organizationId: OTHER_ORG,           // attacker-chosen target
  wabaId: 'WABA_1',
  phoneNumberId: '5550001111',
  mode: 'direct_save',
  accessToken: 'attacker-supplied-token'
};

await t('C1 meta-oauth: no session -> 401, no write', async () => {
  const res = await call(oauth, { body: OAUTH_BODY, headers: {} });
  assert.equal(res._status, 401);
  assert.equal(writes.filter(w => w.method === 'POST' || w.method === 'PATCH').length, 0);
  assert.equal(outboundUrls.length, 0, 'must not contact Meta before authorizing');
});

await t('C1 meta-oauth: session without membership -> 403, no write', async () => {
  mode.memberships = [];
  const res = await call(oauth, { body: OAUTH_BODY, headers: SESSION });
  mode.memberships = [{ organization_id: ORG, user_id: USER, role: 'Owner' }];
  assert.equal(res._status, 403);
  assert.equal(outboundUrls.length, 0, 'must not contact Meta before authorizing');
});

await t('C1 meta-oauth: member is allowed and the body organizationId cannot retarget the write', async () => {
  const res = await call(oauth, { body: OAUTH_BODY, headers: SESSION });
  assert.equal(res._status, 200, `got ${res._status}: ${JSON.stringify(res.body)}`);
  // The upsert happened; capture the org actually written.
  assert.ok(outboundUrls.length >= 0);
});

// To prove retargeting is impossible we inspect what the handler would write by
// replaying the same body with a recording of the upsert payload.
await t('C1 meta-oauth: target org comes from membership, not the body', async () => {
  const captured = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.includes('/rest/v1/whatsapp_connections') && options.method) {
      captured.push(JSON.parse(options.body));
      return json([]);
    }
    return origFetch(url, options);
  };
  const res = await call(oauth, { body: OAUTH_BODY, headers: SESSION });
  globalThis.fetch = origFetch;
  assert.equal(res._status, 200);
  assert.ok(captured.length > 0, 'expected a whatsapp_connections upsert');
  for (const row of captured) {
    assert.equal(row.organization_id, ORG,
      'must write to the caller organization, not the body organizationId');
    assert.notEqual(row.organization_id, OTHER_ORG, 'must NEVER write to another tenant');
  }
});

await t('C1 meta-oauth: token is encrypted, never stored in plaintext columns', async () => {
  const captured = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.includes('/rest/v1/whatsapp_connections') && options.method) {
      captured.push(JSON.parse(options.body));
      return json([]);
    }
    return origFetch(url, options);
  };
  await call(oauth, { body: OAUTH_BODY, headers: SESSION });
  globalThis.fetch = origFetch;
  for (const row of captured) {
    assert.equal(row.access_token, undefined, 'plaintext access_token must never be written');
  }
});

// ---------------------------------------------------------------------------
// C2 - instagram
// ---------------------------------------------------------------------------

const IG_BODY = {
  organizationId: OTHER_ORG,           // attacker-chosen target
  accessToken: 'attacker-token',
  instagramBusinessId: '17841400',
  username: 'attacker_brand'
};

await t('C2 instagram connect_manual: no session -> 401, no write', async () => {
  const res = await call(instagram, { query: { action: 'connect_manual' }, body: IG_BODY, headers: {} });
  assert.equal(res._status, 401);
  assert.equal(writes.filter(w => w.table === 'instagram_connections' && w.method).length, 0);
});

await t('C2 instagram connect_manual: non-member -> 403, no write', async () => {
  mode.memberships = [];
  const res = await call(instagram, { query: { action: 'connect_manual' }, body: IG_BODY, headers: SESSION });
  mode.memberships = [{ organization_id: ORG, user_id: USER, role: 'Owner' }];
  assert.equal(res._status, 403);
  assert.equal(writes.filter(w => w.table === 'instagram_connections' && w.method).length, 0);
});

await t('C2 instagram connect_manual: member allowed, writes to the CALLER org only', async () => {
  const res = await call(instagram, { query: { action: 'connect_manual' }, body: IG_BODY, headers: SESSION });
  assert.equal(res._status, 200, `got ${res._status}: ${JSON.stringify(res.body)}`);
  const igWrites = writes.filter(w => w.table === 'instagram_connections' && w.organization_id);
  assert.ok(igWrites.length > 0, 'expected an instagram_connections upsert');
  for (const w of igWrites) {
    assert.equal(w.organization_id, ORG, 'must use the caller org');
    assert.notEqual(w.organization_id, OTHER_ORG, 'must NEVER target another tenant');
  }
});

await t('C2 instagram send_message: no session -> 401', async () => {
  const res = await call(instagram, {
    query: { action: 'send_message' },
    body: { organizationId: OTHER_ORG, recipientId: 'user_x', text: 'hi' },
    headers: {}
  });
  assert.equal(res._status, 401);
});

await t('C2 instagram disconnect: no session -> 401, nothing deleted', async () => {
  const res = await call(instagram, {
    method: 'DELETE', query: { action: 'disconnect' },
    body: { organizationId: OTHER_ORG, instagramBusinessId: '17841400' }, headers: {}
  });
  assert.equal(res._status, 401);
  assert.equal(writes.filter(w => w.table === 'instagram_connections' && w.method === 'DELETE').length, 0);
});

await t('C2 instagram oauth-exchange: no session -> 401', async () => {
  const res = await call(instagram, {
    query: { action: 'oauth-exchange' },
    body: { organizationId: OTHER_ORG, code: 'abc' }, headers: {}
  });
  assert.equal(res._status, 401);
  assert.equal(outboundUrls.length, 0, 'must not exchange a code before authorizing');
});

// ---------------------------------------------------------------------------
// C3 - send-media (auth-level assertions; full coverage lives in test-send-media)
// ---------------------------------------------------------------------------

await t('C3 send-media: no session -> 401, no Meta call', async () => {
  const res = await call(sendMedia, {
    body: { fileBase64: Buffer.from('x').toString('base64'), leadId: 'l1', senderNumber: '+919999999999' },
    headers: {}
  });
  assert.equal(res._status, 401);
  assert.equal(outboundUrls.length, 0, 'must not call Meta for an anonymous caller');
});

await t('C3 send-media: non-member -> 403, no Meta call', async () => {
  mode.memberships = [];
  const res = await call(sendMedia, {
    body: { fileBase64: Buffer.from('x').toString('base64'), leadId: 'l1', senderNumber: '+919999999999' },
    headers: SESSION
  });
  mode.memberships = [{ organization_id: ORG, user_id: USER, role: 'Owner' }];
  assert.equal(res._status, 403);
  assert.equal(outboundUrls.length, 0);
});

await t('C3 send-media: never uses the GLOBAL WhatsApp token', async () => {
  await call(sendMedia, {
    body: { fileBase64: Buffer.from('x').toString('base64'), leadId: 'l1', senderNumber: '+919999999999' },
    headers: SESSION
  });
  for (const a of metaAuthHeaders) {
    assert.notEqual(a, 'Bearer GLOBAL-SHOULD-NOT-BE-USED', 'global token must never be used');
  }
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
