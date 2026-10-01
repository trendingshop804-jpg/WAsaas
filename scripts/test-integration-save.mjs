// scripts/test-integration-save.mjs
// Covers POST /api/integration-status - the endpoint that lets an operator
// configure Twilio from inside the app.
//
// Until this existed, the Integrations form saved credentials to browser
// localStorage, the server never saw them, and the badge stayed
// "not configured" forever. These tests lock in that a save is authenticated,
// tenant-scoped, encrypted at rest, and never echoes the token back.
//
//   node scripts/test-integration-save.mjs

import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'mock-publishable-key';
process.env.INTEGRATION_ENCRYPT_SECRET = 'test-secret-0123456789abcdef0123456789';
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_SID;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.TWILIO_TOKEN;
delete process.env.TWILIO_FROM_NUMBER;
delete process.env.TWILIO_PHONE_NUMBER;
delete process.env.TWILIO_CALLER_NUMBER;

const VALID_SID = 'AC' + 'b'.repeat(32);
const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const SESSION_TOKEN = 'mock-session-token';

let membershipRole = 'Owner';
let membershipError = false;
const twilioRows = [];
const writes = [];
const lookups = [];

const jsonRes = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body,
  text: async () => JSON.stringify(body)
});

const wantsSingle = (options) =>
  String(options?.headers?.Accept || options?.headers?.accept || '').includes('pgrst.object');

function filterRows(url, rows) {
  const u = new URL(url);
  let out = [...rows];
  for (const [k, v] of u.searchParams.entries()) {
    if (k === 'select' || k === 'order' || k === 'limit') continue;
    const eq = /^eq\.(.*)$/.exec(v);
    // Compare as text: PostgREST filter values always arrive as strings, while
    // the row holds a real boolean. A strict === against 'true' would silently
    // drop every active row and make the status check look unconfigured.
    if (eq) { out = out.filter(r => String(r[k]) === eq[1]); continue; }
    const inList = /^in\.\((.*)\)$/.exec(v);
    if (inList) {
      const list = inList[1].split(',');
      out = out.filter(r => list.includes(String(r[k])));
    }
  }
  return out;
}

globalThis.fetch = async (input, options = {}) => {
  const url = String(input?.url || input);
  const method = (options?.method || 'GET').toUpperCase();

  if (url.includes('/auth/v1/user')) {
    const auth = String(options?.headers?.Authorization || options?.headers?.authorization || '');
    return /mock-session-token/.test(auth)
      ? jsonRes({ id: 'u1', aud: 'authenticated' })
      : jsonRes({ msg: 'invalid' }, 401);
  }

  if (url.includes('/rest/v1/organization_users')) {
    if (membershipError) return jsonRes({ message: 'simulated membership failure' }, 500);
    const rows = membershipRole ? [{ organization_id: ORG, user_id: 'u1', role: membershipRole }] : [];
    return jsonRes(wantsSingle(options) ? (rows[0] ?? null) : rows);
  }

  if (url.includes('/rest/v1/twilio_connections')) {
    if (method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      writes.push(body);
      const merged = { id: 'tw_1', is_active: true, updated_at: new Date().toISOString(), ...body };
      const i = twilioRows.findIndex(r => r.organization_id === body.organization_id && r.account_sid === body.account_sid);
      if (i >= 0) twilioRows[i] = merged; else twilioRows.push(merged);
      // select(...) is appended by the caller; the row is echoed minus secrets
      const { auth_token_encrypted, ...safe } = merged;
      return jsonRes(wantsSingle(options) ? safe : [safe], 201);
    }
    if (method === 'PATCH' || method === 'DELETE') {
      return jsonRes(wantsSingle(options) ? null : []);
    }
    lookups.push(url);
    const rows = filterRows(url, twilioRows);
    return jsonRes(wantsSingle(options) ? (rows[0] ?? null) : rows);
  }

  if (/api\.twilio\.com/.test(url)) {
    return jsonRes({ account_sid: VALID_SID, friendly_name: 'Test Account' });
  }

  throw new Error(`Unexpected fetch to ${url}`);
};

const { default: handler } = await import('../api/integration-status.js');
const { encryptToken, decryptToken } = await import('../api/_crypto.js');

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

const SESSION = { headers: { authorization: `Bearer ${SESSION_TOKEN}` } };
const post = async (body, extra = {}) => {
  const res = mockRes();
  await handler({ method: 'POST', ...SESSION, query: {}, body, ...extra }, res);
  return res;
};

let passed = 0, failed = 0;
const test = async (name, fn) => {
  twilioRows.length = 0;
  writes.length = 0;
  lookups.length = 0;
  membershipRole = 'Owner';
  membershipError = false;
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

const VALID = { integration: 'twilio', 'account-sid': VALID_SID, 'auth-token': 'super-secret-token' };

console.log('=== POST /api/integration-status (twilio) ===');

await test('unauthenticated save -> 401, nothing written', async () => {
  const res = await post(VALID, { headers: {} });
  assert.equal(res.statusCode, 401);
  assert.equal(writes.length, 0);
});

await test('invalid bearer token -> 401, nothing written', async () => {
  const res = await post(VALID, { headers: { authorization: 'Bearer not-the-token' } });
  assert.equal(res.statusCode, 401);
  assert.equal(writes.length, 0);
});

await test('a non-member -> 403, nothing written', async () => {
  membershipRole = '';
  const res = await post(VALID);
  assert.equal(res.statusCode, 403);
  assert.equal(writes.length, 0);
});

await test('a role that is not Owner/Admin -> 403, nothing written', async () => {
  membershipRole = 'Sales Agent';
  const res = await post(VALID);
  assert.equal(res.statusCode, 403, 'a Sales Agent must not be able to write credentials');
  assert.equal(writes.length, 0);
});

await test('a valid Owner saves the connection for their own org', async () => {
  const res = await post(VALID);
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.equal(res.payload.success, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].organization_id, ORG, 'org must come from membership, never the body');
  assert.equal(writes[0].account_sid, VALID_SID);
});

await test('the auth token is encrypted at rest, never stored in plain text', async () => {
  await post(VALID);
  const stored = writes[0].auth_token_encrypted;
  assert.notEqual(stored, 'super-secret-token');
  assert.ok(stored && stored.length > 20, 'expected ciphertext');
  assert.equal(await decryptToken(stored), 'super-secret-token', 'must be decryptable by the server');
});

await test('the response never contains the token or its ciphertext', async () => {
  const res = await post(VALID);
  const text = JSON.stringify(res.payload);
  assert.ok(!text.includes('super-secret-token'), 'plaintext token leaked to the client');
  assert.ok(!text.includes('auth_token_encrypted'), 'ciphertext leaked to the client');
});

await test('a client-supplied organizationId is ignored', async () => {
  const res = await post({ ...VALID, organizationId: OTHER_ORG, organization_id: OTHER_ORG });
  assert.equal(res.statusCode, 200);
  assert.equal(writes[0].organization_id, ORG);
  assert.notEqual(writes[0].organization_id, OTHER_ORG);
});

await test('a malformed Account SID -> 400, nothing written', async () => {
  const res = await post({ ...VALID, 'account-sid': 'nope' });
  assert.equal(res.statusCode, 400);
  assert.equal(writes.length, 0);
});

await test('a missing Account SID -> 400', async () => {
  const res = await post({ integration: 'twilio', 'auth-token': 'x' });
  assert.equal(res.statusCode, 400);
});

await test('a new connection with no auth token -> 400', async () => {
  const res = await post({ integration: 'twilio', 'account-sid': VALID_SID });
  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /Auth token/i);
});

await test('a bad caller number -> 400', async () => {
  const res = await post({ ...VALID, 'from-number': 'call-me-maybe' });
  assert.equal(res.statusCode, 400);
  assert.equal(writes.length, 0);
});

await test('an unsupported region -> 400', async () => {
  const res = await post({ ...VALID, region: 'MARS1' });
  assert.equal(res.statusCode, 400);
  assert.equal(writes.length, 0);
});

await test('a non-twilio integration -> 400', async () => {
  const res = await post({ integration: 'whatsapp', token: 'x' });
  assert.equal(res.statusCode, 400);
});

await test('the caller number is normalised to +digits', async () => {
  const res = await post({ ...VALID, 'from-number': '+1 (555) 123-4567' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.equal(writes[0].from_number, '+15551234567');
});

await test('an existing token is preserved when the field is left blank', async () => {
  twilioRows.push({
    id: 'tw_existing', organization_id: ORG, account_sid: VALID_SID,
    auth_token_encrypted: await encryptToken('original-token'),
    from_number: null, region: 'US1', is_active: true
  });
  const res = await post({ integration: 'twilio', 'account-sid': VALID_SID, 'from-number': '+15550001111' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.equal(
    await decryptToken(writes[0].auth_token_encrypted),
    'original-token',
    'a blank token field must not wipe the stored credential'
  );
});

await test('the pre-save lookup is scoped to the caller org and the SID', async () => {
  await post(VALID);
  assert.ok(lookups.length > 0, 'expected a pre-save lookup');
  const u = new URL(lookups[0]);
  assert.equal(u.searchParams.get('organization_id'), `eq.${ORG}`);
  assert.equal(u.searchParams.get('account_sid'), `eq.${VALID_SID}`);
});

await test('the response reports the live verified status', async () => {
  const res = await post(VALID);
  assert.ok(res.payload.status, 'expected a status object');
  assert.equal(res.payload.status.status, 'connected', `got ${JSON.stringify(res.payload.status)}`);
});

await test('a stored connection is then reported connected with no env vars', async () => {
  // Proves the status check reads the saved row, not just process.env.
  twilioRows.push({
    id: 'tw_live', organization_id: ORG, account_sid: VALID_SID,
    auth_token_encrypted: await encryptToken('stored-token'),
    from_number: '+15551234567', region: 'US1', is_active: true
  });
  const { getIntegrationStatus } = await import('../api/_integration-status.js');
  const res = await getIntegrationStatus('twilio', { organizationId: ORG });
  assert.equal(res.status, 'connected', `got ${JSON.stringify(res)}`);
  assert.deepEqual(res.warnings, [], 'a caller number is set, so no warning expected');
});

await test('a stored connection is NOT visible to another organization', async () => {
  twilioRows.push({
    id: 'tw_live', organization_id: ORG, account_sid: VALID_SID,
    auth_token_encrypted: await encryptToken('stored-token'),
    from_number: '+15551234567', region: 'US1', is_active: true
  });
  const { getIntegrationStatus } = await import('../api/_integration-status.js');
  const res = await getIntegrationStatus('twilio', { organizationId: OTHER_ORG });
  assert.equal(res.status, 'not_configured', 'a tenant must never see another tenant provider account');
  assert.deepEqual(res.missing.sort(), ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']);
});

console.log(`\n${failed ? failed + ' test(s) failed.' : passed + ' passed, 0 failed.'}`);
process.exit(failed ? 1 : 0);
