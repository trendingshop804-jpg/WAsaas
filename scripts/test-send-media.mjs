// scripts/test-send-media.mjs
// Offline smoke test for api/send-media.js. Stubs global fetch so no real
// Meta / Supabase calls are made. Run with: node scripts/test-send-media.mjs
//
// Also covers the tenant-isolation guarantees added when the endpoint was
// authenticated: the caller must be a signed-in organization member, the
// conversation must belong to that organization, and WhatsApp credentials must
// come from that tenant's own whatsapp_connections row.
//
// NOTE: the GLOBAL WhatsApp env vars are deliberately still set below. The
// tests assert they are NOT used, proving there is no global-token fallback.
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.WHATSAPP_ACCESS_TOKEN = 'test-wa-token';       // global - must NOT be used
process.env.PHONE_NUMBER_ID = '9999999999';                  // global - must NOT be used
process.env.WHATSAPP_PHONE_NUMBER_ID = '9999999999';         // global - must NOT be used

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const USER = '764e9eab-26e5-4cdd-b554-25a41a25ea35';
const TENANT_PHONE_NUMBER_ID = '5550001111';
const TENANT_TOKEN = 'tenant-scoped-token';

const calls = { mediaUpload: [], messages: [], storage: [], insert: [], metaAuth: [] };

// auth state is mutated per-test
const mode = {
  tokenValid: true,
  memberships: [{ organization_id: ORG, user_id: USER, role: 'Owner' }],
  hasTenantConnection: true,
  tenantToken: TENANT_TOKEN
};

// lead -> owning organization
const CONVERSATIONS = [
  { id: 'conv_1', lead_id: 'lead_1', organization_id: ORG },
  { id: 'conv_other', lead_id: 'lead_other', organization_id: OTHER_ORG }
];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : String(input.url || input);
  const method = (init.method || 'GET').toUpperCase();
  const authHeader = String((init.headers && (init.headers.Authorization || init.headers.authorization)) || '');

  // ---- Supabase session validation
  if (url.includes('/auth/v1/user')) {
    const ok = mode.tokenValid && /test-session-token/.test(authHeader);
    return json(ok ? { id: USER, aud: 'authenticated' } : { msg: 'invalid' }, ok ? 200 : 401);
  }

  // ---- Membership lookup
  if (url.includes('/rest/v1/organization_users')) {
    return json(mode.memberships);
  }

  // ---- Tenant WhatsApp connection (credentials)
  if (url.includes('/rest/v1/whatsapp_connections')) {
    if (!mode.hasTenantConnection) return json([]);
    return json([{
      organization_id: ORG,
      phone_number_id: TENANT_PHONE_NUMBER_ID,
      access_token: mode.tenantToken,      // plaintext branch, avoids crypto setup
      is_active: true
    }]);
  }

  // ---- Conversation, scoped by the caller's organization
  if (url.includes('/rest/v1/conversations')) {
    const leadId = /lead_id=eq\.([^&]+)/.exec(url)?.[1];
    const orgId = /organization_id=eq\.([^&]+)/.exec(url)?.[1];
    const row = CONVERSATIONS.find(c => c.lead_id === leadId && c.organization_id === orgId);
    return json(row ? [row] : []);
  }

  // ---- Message insert
  if (url.includes('/rest/v1/messages')) {
    calls.insert.push(JSON.parse(init.body));
    return json([], 201);
  }

  if (url.includes('/storage/v1/object/sign/')) {
    return json({ signedURL: '/object/sign/whatsapp-media/x?token=abc' });
  }
  if (url.includes('/storage/v1/object/')) {
    const path = decodeURIComponent(url.split('/storage/v1/object/')[1] || '');
    calls.storage.push(path);
    return json({ Key: path.replace(/^whatsapp-media\//, '') });
  }

  if (url.includes('graph.facebook.com')) {
    calls.metaAuth.push({ url, auth: authHeader });
    if (url.includes('/media')) {
      calls.mediaUpload.push({ url, body: init.body });
      return json({ id: 'META_MEDIA_123' });
    }
    if (url.includes('/messages')) {
      calls.messages.push({ url, body: JSON.parse(init.body) });
      return json({ messages: [{ id: 'wamid.TEST123' }] });
    }
  }

  throw new Error(`Unexpected fetch to ${url}`);
};

const { default: handler } = await import('../api/send-media.js');

function mockRes() {
  return {
    statusCode: null,
    payload: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
    end() { return this; },
  };
}

const SESSION = { Authorization: 'Bearer test-session-token' };
const post = async (body, headers = SESSION) => {
  const res = mockRes();
  await handler({ method: 'POST', headers, body }, res);
  return res;
};

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL  ${name}\n        ${err.message}`);
  }
}

console.log('=== api/send-media.js ===');

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

await test('unauthenticated request is rejected with 401', async () => {
  const res = await post({ fileBase64: 'aGk=', leadId: 'lead_1', senderNumber: '+919999999999' }, {});
  assert.equal(res.statusCode, 401);
  assert.equal(calls.insert.length, 0, 'nothing may be written for an anonymous caller');
});

await test('valid session without organization membership is rejected with 403', async () => {
  mode.memberships = [];
  const res = await post({ fileBase64: 'aGk=', leadId: 'lead_1', senderNumber: '+919999999999' });
  mode.memberships = [{ organization_id: ORG, user_id: USER, role: 'Owner' }];
  assert.equal(res.statusCode, 403);
  assert.equal(calls.insert.length, 0);
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

await test('cross-tenant lead is rejected and nothing is sent to Meta', async () => {
  calls.metaAuth.length = 0;
  const res = await post({ fileBase64: 'aGk=', leadId: 'lead_other', senderNumber: '+919999999999' });
  assert.equal(res.statusCode, 404, `expected 404, got ${res.statusCode}: ${JSON.stringify(res.payload)}`);
  assert.equal(calls.mediaUpload.length, 0, 'must not upload media for another tenant');
  assert.equal(calls.messages.length, 0, 'must not send for another tenant');
  assert.equal(calls.insert.length, 0, 'must not insert into another tenant');
});

await test('same-tenant conversation is allowed', async () => {
  const res = await post({
    fileBase64: Buffer.from('hello world').toString('base64'),
    messageType: 'image',
    leadId: 'lead_1',
    senderNumber: '+919999999999',
    fileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    caption: 'look',
  });
  assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${JSON.stringify(res.payload)}`);
  assert.equal(res.payload.messageId, 'wamid.TEST123');
});

// ---------------------------------------------------------------------------
// Credentials: tenant only, never global
// ---------------------------------------------------------------------------

await test('Meta calls use the TENANT token and phone number id, not the global ones', async () => {
  calls.metaAuth.length = 0;
  const res = await post({
    fileBase64: Buffer.from('cred check').toString('base64'),
    messageType: 'image',
    leadId: 'lead_1',
    senderNumber: '+919999999999',
    fileName: 'x.png',
    mimeType: 'image/png',
  });
  assert.equal(res.statusCode, 200);
  assert.ok(calls.metaAuth.length > 0, 'Meta should have been called');
  for (const c of calls.metaAuth) {
    assert.equal(c.auth, `Bearer ${TENANT_TOKEN}`, 'must use the tenant token');
    assert.notEqual(c.auth, 'Bearer test-wa-token', 'must NOT use the global WHATSAPP_ACCESS_TOKEN');
    assert.ok(c.url.includes(TENANT_PHONE_NUMBER_ID), 'must use the tenant phone_number_id');
    assert.ok(!c.url.includes('9999999999'), 'must NOT use the global PHONE_NUMBER_ID');
  }
});

await test('tenant with no active WhatsApp connection fails safely (no global fallback)', async () => {
  mode.hasTenantConnection = false;
  calls.metaAuth.length = 0;
  const res = await post({
    fileBase64: Buffer.from('no conn').toString('base64'),
    leadId: 'lead_1',
    senderNumber: '+919999999999',
    fileName: 'x.png',
    mimeType: 'image/png',
  });
  mode.hasTenantConnection = true;
  assert.equal(res.statusCode, 409, `expected 409, got ${res.statusCode}: ${JSON.stringify(res.payload)}`);
  assert.equal(calls.metaAuth.length, 0, 'must not call Meta without a tenant connection');
});

// ---------------------------------------------------------------------------
// Original behaviour (unchanged)
// ---------------------------------------------------------------------------

await test('rejects a request with no file', async () => {
  const res = await post({ leadId: 'lead_1', senderNumber: '+91999' });
  assert.equal(res.statusCode, 400);
});

await test('storage path does not double the file extension', async () => {
  calls.storage.length = 0;
  const res = await post({
    fileBase64: Buffer.from('%PDF-1.4 fake').toString('base64'),
    leadId: 'lead_1',
    senderNumber: '+919999999999',
    fileName: 'quote.pdf',
    mimeType: 'application/pdf',
  });
  assert.equal(res.statusCode, 200);
  const path = calls.storage.at(-1) || '';
  assert.ok(path.endsWith('quote.pdf'), `path should end with quote.pdf, got ${path}`);
  assert.ok(!/quote\.pdf\.pdf/.test(path), `path double-extended: ${path}`);
});

await test('xlsx mime does not leak a vendor string into the path', async () => {
  calls.storage.length = 0;
  const res = await post({
    fileBase64: Buffer.from('fake xlsx').toString('base64'),
    leadId: 'lead_1',
    senderNumber: '+919999999999',
    fileName: 'report',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const path = calls.storage.at(-1) || '';
  assert.ok(path.endsWith('report.xlsx'), `expected .xlsx suffix, got ${path}`);
  assert.ok(!path.includes('vnd.openxml'), `vendor mime leaked into path: ${path}`);
});

await test('documents are sent to Meta with a filename', async () => {
  calls.messages.length = 0;
  const res = await post({
    fileBase64: Buffer.from('%PDF-1.4 fake').toString('base64'),
    messageType: 'document',
    leadId: 'lead_1',
    senderNumber: '+919999999999',
    fileName: 'invoice.pdf',
    mimeType: 'application/pdf',
    caption: 'Your invoice',
  });
  const sent = calls.messages.at(-1).body;
  assert.equal(sent.type, 'document');
  assert.equal(sent.document.filename, 'invoice.pdf');
  assert.equal(sent.document.caption, 'Your invoice');
});

await test('DB row stores a storage path and the response carries a fetchable URL', async () => {
  calls.insert.length = 0;
  const res = await post({
    fileBase64: Buffer.from('hello').toString('base64'),
    messageType: 'image',
    leadId: 'lead_1',
    senderNumber: '+919999999999',
    fileName: 'pic.png',
    mimeType: 'image/png',
  });
  const row = calls.insert.at(-1);
  const inserted = Array.isArray(row) ? row[0] : row;
  assert.ok(!/^https?:\/\//.test(inserted.media_url), `media_url should be a path, got ${inserted.media_url}`);
  assert.equal(inserted.media_size, 5);
  assert.ok(/^https?:\/\//.test(res.payload.mediaPublicUrl || ''), 'response should include an http(s) media URL');
  assert.equal(inserted.organization_id, ORG, 'the inserted row must be stamped with the caller tenant');
});

globalThis.fetch = realFetch;
console.log(failures === 0 ? '\nAll send-media tests passed.' : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
