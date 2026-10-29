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
let twilioAuthAccepted = true;
const twilioRows = [];
const whatsappRows = [];
const graphCalls = [];
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
    return twilioAuthAccepted
      ? jsonRes({ account_sid: VALID_SID, friendly_name: 'Test Account' })
      : jsonRes({ code: 20003, message: 'Authenticate' }, 401);
  }

  if (url.includes('/rest/v1/whatsapp_connections')) {
    if (method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      writes.push(body);
      const merged = { id: 'wa_1', is_active: true, updated_at: new Date().toISOString(), ...body };
      const i = whatsappRows.findIndex(r => r.organization_id === body.organization_id && r.phone_number_id === body.phone_number_id);
      if (i >= 0) whatsappRows[i] = merged; else whatsappRows.push(merged);
      const { access_token_encrypted, ...safe } = merged;
      return jsonRes(wantsSingle(options) ? safe : [safe], 201);
    }
    if (method === 'PATCH' || method === 'DELETE') {
      return jsonRes(wantsSingle(options) ? null : []);
    }
    lookups.push(url);
    const rows = filterRows(url, whatsappRows);
    return jsonRes(wantsSingle(options) ? (rows[0] ?? null) : rows);
  }

  // Live Meta validation: accept only a clean "EAA..." token that is not
  // marked expired/invalid. Anything else (including a mangled
  // "Bearer Bearer ..." header) gets Meta's real 401/190 shape so the mapping
  // under test matches production behaviour.
  if (/graph\.facebook\.com/.test(url)) {
    const auth = String(options?.headers?.Authorization || options?.headers?.authorization || '');
    graphCalls.push(auth);
    const token = auth.replace(/^Bearer\s+/i, '');
    const expiredOrInvalid = /EXPIRED|INVALID/i.test(token);
    return /^EAA[A-Za-z0-9._-]+$/.test(token) && !expiredOrInvalid
      ? jsonRes({ display_phone_number: '+91 98765 43210', verified_name: 'NextBright', quality_rating: 'HIGH' })
      : jsonRes({ error: { message: 'Invalid OAuth access token', type: 'OAuthException', code: 190 } }, 401);
  }

  throw new Error(`Unexpected fetch to ${url}`);
};

const { default: handler } = await import('../server/api/integration-status.js');
const { encryptToken, decryptToken } = await import('../server/api/_crypto.js');

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
  whatsappRows.length = 0;
  graphCalls.length = 0;
  writes.length = 0;
  lookups.length = 0;
  membershipRole = 'Owner';
  membershipError = false;
  twilioAuthAccepted = true;
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
await test('provider-rejected credentials are never saved', async () => {
  twilioAuthAccepted = false;
  const res = await post({ ...VALID, 'auth-token': 'wrong-token' });
  assert.equal(res.statusCode, 400, JSON.stringify(res.payload));
  assert.equal(res.payload.success, false);
  assert.match(res.payload.error, /rejected|failed|authenticate/i);
  assert.equal(writes.length, 0, 'invalid provider credentials must not reach the database');
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
  const { getIntegrationStatus } = await import('../server/api/_integration-status.js');
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
  const { getIntegrationStatus } = await import('../server/api/_integration-status.js');
  const res = await getIntegrationStatus('twilio', { organizationId: OTHER_ORG });
  assert.equal(res.status, 'not_configured', 'a tenant must never see another tenant provider account');
  assert.deepEqual(res.missing.sort(), ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']);
});

console.log('\n=== POST /api/integration-status (whatsapp) ===');

const WA_PHONE_ID = '123456789012345';

await test('a token pasted with a "Bearer " prefix is normalised before validation', async () => {
  const res = await post({ integration: 'whatsapp', accessToken: 'Bearer EAAnewtoken123', phoneNumberId: WA_PHONE_ID });
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.ok(graphCalls.length > 0, 'expected a live Meta validation call');
  assert.equal(graphCalls.at(-1), 'Bearer EAAnewtoken123', 'the header must not become "Bearer Bearer ..."');
  assert.equal(
    await decryptToken(writes[0].access_token_encrypted),
    'EAAnewtoken123',
    'the stored token must be the cleaned value'
  );
});

await test('quotes and whitespace around a pasted token are stripped', async () => {
  const res = await post({ integration: 'whatsapp', accessToken: '  "EAAquotedToken99"\n ', phoneNumberId: WA_PHONE_ID });
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.equal(await decryptToken(writes[0].access_token_encrypted), 'EAAquotedToken99');
});

await test('Meta rejecting the token -> 401 invalid-token message, nothing saved', async () => {
  const res = await post({ integration: 'whatsapp', accessToken: 'SOME_EXPIRED_TOKEN', phoneNumberId: WA_PHONE_ID });
  assert.equal(res.statusCode, 401, JSON.stringify(res.payload));
  assert.ok(String(res.payload.error).includes('Invalid or expired access token'), `got "${res.payload.error}"`);
  assert.equal(writes.length, 0, 'provider-rejected credentials must never be written');
});

await test('an undecryptable stored token fails fast without calling Meta', async () => {
  whatsappRows.push({
    id: 'wa_bad', organization_id: ORG, phone_number_id: WA_PHONE_ID,
    access_token_encrypted: Buffer.from('this-is-not-valid-ciphertext-xxxxxx').toString('base64'),
    is_active: true, updated_at: new Date().toISOString()
  });
  const before = graphCalls.length;
  const res = await post({ integration: 'whatsapp', phoneNumberId: WA_PHONE_ID });
  assert.equal(res.statusCode, 400, JSON.stringify(res.payload));
  assert.ok(String(res.payload.error).includes('could not be decrypted'), `got "${res.payload.error}"`);
  assert.equal(graphCalls.length, before, 'an undecryptable value must never be sent to Meta');
  assert.equal(writes.length, 0, 'nothing may be overwritten');
});

await test('the CRM modal payload (kebab-case access-token) delivers the PASTED token, not the stored one', async () => {
  // Reproduces the Settings modal exactly: input.name = field.id, so the body
  // carries 'access-token' / 'phone-number-id' / 'display-phone'. An older,
  // expired token is already stored for this org+phone — the bug re-validated
  // that stored token, so Meta's 401 on the OLD token was shown no matter what
  // the user pasted.
  whatsappRows.push({
    id: 'wa_old', organization_id: ORG, phone_number_id: WA_PHONE_ID,
    access_token_encrypted: await encryptToken('EAAOLD_EXPIRED_TOKEN'),
    is_active: true, updated_at: new Date().toISOString()
  });
  const res = await post({
    integration: 'whatsapp',
    'phone-number-id': WA_PHONE_ID,
    'waba-id': '1016931798166599',
    'display-phone': '+91 98401 23456',
    'access-token': 'EAABRANDNEWTOKEN456'
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.equal(
    graphCalls.at(-1),
    'Bearer EAABRANDNEWTOKEN456',
    'Meta must validate the token the user just pasted — never the stored one'
  );
  assert.equal(
    await decryptToken(writes[0].access_token_encrypted),
    'EAABRANDNEWTOKEN456',
    'the pasted token is what gets stored'
  );
  assert.equal(writes[0].phone_number, '+91 98401 23456', 'display phone must be stored');
});

await test('a token-only save falls back to the stored Phone Number ID', async () => {
  whatsappRows.push({
    id: 'wa_single', organization_id: ORG, phone_number_id: WA_PHONE_ID,
    access_token_encrypted: await encryptToken('EAAOLD_EXPIRED_TOKEN'),
    is_active: true, updated_at: new Date().toISOString()
  });
  const res = await post({ integration: 'whatsapp', 'access-token': 'EAASOLENEWTOKEN789' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.equal(graphCalls.at(-1), 'Bearer EAASOLENEWTOKEN789');
  assert.equal(await decryptToken(writes[0].access_token_encrypted), 'EAASOLENEWTOKEN789');
  assert.equal(writes[0].phone_number_id, WA_PHONE_ID, 'the stored row keeps its phone id');
});

await test('a token-only save with no stored connection -> 400 phone id required', async () => {
  const res = await post({ integration: 'whatsapp', 'access-token': 'EAANOSTOREROW123' });
  assert.equal(res.statusCode, 400, JSON.stringify(res.payload));
  assert.ok(String(res.payload.error).includes('Phone Number ID is required'), `got "${res.payload.error}"`);
  assert.equal(graphCalls.length, 0, 'nothing to validate against');
  assert.equal(writes.length, 0);
});

await test('a token-only save with two stored connections is ambiguous -> 400, nothing written', async () => {
  whatsappRows.push({
    id: 'wa_a', organization_id: ORG, phone_number_id: '111111111111111',
    access_token_encrypted: await encryptToken('EAAA1'), is_active: true, updated_at: new Date().toISOString()
  });
  whatsappRows.push({
    id: 'wa_b', organization_id: ORG, phone_number_id: '222222222222222',
    access_token_encrypted: await encryptToken('EAAA2'), is_active: true, updated_at: new Date().toISOString()
  });
  const res = await post({ integration: 'whatsapp', 'access-token': 'EAAB' });
  assert.equal(res.statusCode, 400, JSON.stringify(res.payload));
  assert.ok(String(res.payload.error).includes('Multiple WhatsApp connections'), `got "${res.payload.error}"`);
  assert.equal(writes.length, 0);
});

await test('a FAILED status check still returns config so the modal can prefill', async () => {
  whatsappRows.push({
    id: 'wa_expired', organization_id: ORG, phone_number_id: WA_PHONE_ID,
    access_token_encrypted: await encryptToken('EAA_EXPIRED_TOKEN'),
    waba_id: '1016931798166599', display_name: 'NextBright',
    is_active: true, updated_at: new Date().toISOString()
  });
  const { getIntegrationStatus } = await import('../server/api/_integration-status.js');
  const res = await getIntegrationStatus('whatsapp', { organizationId: ORG });
  assert.equal(res.status, 'token_expired', JSON.stringify(res));
  assert.ok(res.config, 'failed checks must still carry non-secret config');
  assert.equal(res.config.phoneNumberId, WA_PHONE_ID, 'phone id prefills the next modal open');
  assert.equal(res.config.wabaId, '1016931798166599');
  assert.equal(res.config.hasToken, true, 'the password field must show "saved" placeholder state');
});

await test('test-connection with a token only resolves the stored Phone Number ID', async () => {
  whatsappRows.push({
    id: 'wa_t', organization_id: ORG, phone_number_id: WA_PHONE_ID,
    access_token_encrypted: await encryptToken('EAAOLD_EXPIRED_TOKEN'),
    is_active: true, updated_at: new Date().toISOString()
  });
  const res = mockRes();
  await handler({
    method: 'POST', ...SESSION,
    query: { route: 'test-connection' },
    body: { integration: 'whatsapp', accessToken: 'EAATESTONLY123' }
  }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.equal(res.payload.success, true);
  assert.equal(graphCalls.at(-1), 'Bearer EAATESTONLY123');
});

console.log(`\n${failed ? failed + ' test(s) failed.' : passed + ' passed, 0 failed.'}`);
process.exit(failed ? 1 : 0);
