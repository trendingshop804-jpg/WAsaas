// scripts/test-auth-contract.mjs
// The authentication contract for tenant-scoped APIs, covering the six cases
// required for /api/messages and every endpoint behind requireOrgAccess().
//
//   CASE 1  no Authorization header        -> 401
//   CASE 2  invalid token                  -> 401
//   CASE 3  expired token                  -> 401 with a distinguishable code
//   CASE 4  valid user                      -> 200, tenant-scoped rows only
//   CASE 5  Tenant A asks for Tenant B      -> 403, Tenant B data never returned
//   CASE 6  valid user, zero messages       -> 200 with empty collections
//
//   node scripts/test-auth-contract.mjs

import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'mock-publishable-key';
delete process.env.ALLOW_DEV_AUTH;

const ORG_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const USER_A = 'user-a-0000-0000-0000-000000000001';
const USER_B = 'user-b-0000-0000-0000-000000000002';
const VALID_TOKEN = 'good-session-token';
const EXPIRED_TOKEN = 'expired-session-token';

// A tiny in-memory dataset, one table per tenant so isolation is observable.
const TABLES = {
  messages: [
    { id: 'a1', organization_id: ORG_A, sender_number: '919000000001', direction: 'inbound', content: 'tenant A message 1', received_at: '2026-10-01T10:00:00Z' },
    { id: 'a2', organization_id: ORG_A, sender_number: '919000000001', direction: 'outbound', content: 'tenant A reply', received_at: '2026-10-01T10:01:00Z' },
    { id: 'b1', organization_id: ORG_B, sender_number: '919000000002', direction: 'inbound', content: 'tenant B secret message', received_at: '2026-10-01T10:02:00Z' }
  ],
  organization_users: [
    { user_id: USER_A, organization_id: ORG_A, role: 'Owner' },
    { user_id: USER_B, organization_id: ORG_B, role: 'Owner' }
  ],
  organizations: [
    { id: ORG_A, name: 'Tenant A' },
    { id: ORG_B, name: 'Tenant B' }
  ]
};

const seenQueries = [];

function filterRows(url, rows) {
  const u = new URL(url);
  let out = [...rows];
  for (const [k, v] of u.searchParams.entries()) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    const eq = /^eq\.(.*)$/.exec(v);
    if (eq) { out = out.filter(r => String(r[k]) === eq[1]); continue; }
    const inList = /^in\.\((.*)\)$/.exec(v);
    if (inList) { out = out.filter(r => inList[1].split(',').includes(String(r[k]))); }
  }
  return out;
}

globalThis.fetch = async (input, options = {}) => {
  const url = String(input?.url || input);
  const method = (options?.method || 'GET').toUpperCase();
  const auth = String(options?.headers?.Authorization || options?.headers?.authorization || '');

  if (url.includes('/auth/v1/user')) {
    const token = auth.replace(/^Bearer\s+/i, '');
    if (token === VALID_TOKEN) {
      return { ok: true, status: 200, headers: { get: () => 'application/json' },
        json: async () => ({ id: USER_A, aud: 'authenticated' }), text: async () => '{}' };
    }
    if (token === EXPIRED_TOKEN) {
      // Mirrors GoTrue: a real expired JWT fails signature/expiry validation.
      return { ok: false, status: 401, headers: { get: () => 'application/json' },
        json: async () => ({ code: 403, error_code: 'invalid_jwt', msg: 'JWT expired' }), text: async () => '{}' };
    }
    if (token === 'good-session-token-b') {
      return { ok: true, status: 200, headers: { get: () => 'application/json' },
        json: async () => ({ id: USER_B, aud: 'authenticated' }), text: async () => '{}' };
    }
    return { ok: false, status: 401, headers: { get: () => 'application/json' },
      json: async () => ({ msg: 'invalid' }), text: async () => '{}' };
  }

  const table = url.split('/rest/v1/')[1]?.split('?')[0];
  if (!table || !TABLES[table]) {
    return { ok: false, status: 404, headers: { get: () => 'application/json' },
      json: async () => ({ message: `unexpected table ${table}` }), text: async () => '{}' };
  }
  seenQueries.push({ table, url: decodeURIComponent(url) });
  if (method !== 'GET') {
    return { ok: true, status: 201, headers: { get: () => 'application/json' },
      json: async () => ({ id: 'new' }), text: async () => '{}' };
  }
  const rows = filterRows(url, TABLES[table]);
  const wantsSingle = String(options.headers?.Accept || '').includes('pgrst.object');
  return { ok: true, status: 200, headers: { get: () => 'application/json' },
    json: async () => (wantsSingle ? (rows[0] ?? null) : rows),
    text: async () => JSON.stringify(wantsSingle ? (rows[0] ?? null) : rows) };
};

const { default: messages } = await import('../api/messages.js');

function mockRes() {
  return {
    statusCode: null, payload: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.payload = b; return this; },
    send(b) { this.payload = b; return this; },
    end() { return this; }
  };
}

const call = async (headers, query = {}) => {
  seenQueries.length = 0;
  const res = mockRes();
  await messages({ method: 'GET', headers, query }, res);
  return { res, queries: [...seenQueries] };
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

const auth = (t) => ({ authorization: `Bearer ${t}` });

console.log('=== /api/messages authentication contract ===');

await test('CASE 1: no Authorization header -> 401', async () => {
  const { res } = await call({});
  assert.equal(res.statusCode, 401);
  assert.ok(res.payload.error, 'expected an error field');
  assert.ok(!JSON.stringify(res.payload).toLowerCase().includes('tenant a message'));
});

await test('CASE 1b: the 401 distinguishes "no session" with code AUTH_REQUIRED', async () => {
  const { res } = await call({});
  assert.equal(res.payload.code, 'AUTH_REQUIRED');
  assert.match(res.payload.message, /signed-in session is required/i);
});

await test('CASE 2: invalid token -> 401', async () => {
  const { res, queries } = await call(auth('totally-made-up-token'));
  assert.equal(res.statusCode, 401);
  assert.equal(queries.filter(q => q.table === 'messages').length, 0,
    'no tenant data may be read before authentication succeeds');
});

await test('CASE 3: expired token -> 401 with code UNAUTHORIZED', async () => {
  // Distinct from CASE 1 so the client can say "sign in again" rather than
  // treating it as a first-time sign-in.
  const { res } = await call(auth(EXPIRED_TOKEN));
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.code, 'UNAUTHORIZED');
  assert.match(res.payload.message, /session has expired/i);
});

await test('CASE 4: valid user -> 200 with that tenant rows only', async () => {
  const { res, queries } = await call(auth(VALID_TOKEN));
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload).slice(0, 200));
  assert.ok(Array.isArray(res.payload.conversations));
  const blob = JSON.stringify(res.payload);
  assert.ok(blob.includes('tenant A message 1'), 'the caller should see its own messages');
  assert.ok(!blob.includes('tenant B secret message'), 'LEAK: another tenant message in the payload');
});

await test('CASE 4b: the messages query is filtered by organization_id', async () => {
  const { queries } = await call(auth(VALID_TOKEN));
  const q = queries.find(x => x.table === 'messages');
  assert.ok(q, 'expected a messages query');
  assert.match(q.url, /organization_id=eq\./, `messages query is not tenant-scoped: ${q.url}`);
  assert.ok(q.url.includes(ORG_A), `expected a filter on ${ORG_A}, got ${q.url}`);
});

await test('CASE 5: Tenant A asking for Tenant B -> 403, no B data', async () => {
  const { res } = await call(auth(VALID_TOKEN), { organization_id: ORG_B });
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'CROSS_TENANT_DENIED');
  assert.ok(!JSON.stringify(res.payload).includes('tenant B secret message'),
    'LEAK: cross-tenant payload returned');
});

await test('CASE 5b: a Tenant B member sees only Tenant B rows', async () => {
  const { res } = await call(auth('good-session-token-b'), { organization_id: ORG_B });
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload).slice(0, 200));
  const blob = JSON.stringify(res.payload);
  assert.ok(blob.includes('tenant B secret message'), 'B should see its own message');
  assert.ok(!blob.includes('tenant A message 1'), 'LEAK: tenant A message visible to B');
});

await test('CASE 6: a tenant with no messages -> 200 with empty collections', async () => {
  const saved = TABLES.messages.splice(0, TABLES.messages.length);
  try {
    const { res } = await call(auth(VALID_TOKEN));
    assert.equal(res.statusCode, 200, 'an empty inbox is not an error');
    assert.deepEqual(res.payload.conversations, []);
    assert.deepEqual(res.payload.messages, []);
  } finally {
    TABLES.messages.push(...saved);
  }
});

await test('tenant identity is never taken from a query parameter', async () => {
  // A user_id in the query must not influence who is authenticated.
  const { res } = await call(auth(VALID_TOKEN), { user_id: USER_B, userId: USER_B });
  assert.equal(res.statusCode, 200);
  const blob = JSON.stringify(res.payload);
  assert.ok(blob.includes('tenant A message 1'), 'identity must come from the token');
  assert.ok(!blob.includes('tenant B secret message'), 'LEAK: user_id query param was trusted');
});

console.log(`\n${failed ? failed + ' test(s) failed.' : passed + ' passed, 0 failed.'}`);
process.exit(failed ? 1 : 0);
