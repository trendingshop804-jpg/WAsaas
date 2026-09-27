// scripts/test-whatsapp-outbound.mjs
// ---------------------------------------------------------------------------
// Outbound WhatsApp send logic against a MOCKED Graph API.
// No real message is ever sent.
//
// !! THIS SUITE WRITES TO THE REAL DATABASE !!
// It seeds and deletes message rows for TEST_PHONE, so it is opt-in:
//
//   RUN_LIVE_DB_TESTS=1 TEST_SESSION_TOKEN=<real user JWT> node scripts/test-whatsapp-outbound.mjs
//
// It is skipped by default so it can never be run by accident against
// production. It also requires the tenant migration to have been applied,
// because api/messages.js now stamps organization_id on every write and
// scopes every read to the caller's organization.
//
// The offline, no-database equivalent of the auth + send behaviour lives in
// scripts/test-messages-auth.mjs — prefer that one.
// ---------------------------------------------------------------------------
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Minimal .env loader so the handler sees Supabase + WhatsApp config.
for (const file of ['.env', '.env.local']) {
  const p = path.join(rootDir, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}

const TEST_PHONE = '919999000001';
const TEST_TEXT = 'automated outbound test';

// The real WhatsApp credentials are Vercel "Sensitive" env vars and cannot be
// pulled locally. The Graph API is mocked in this suite, so placeholders are
// enough to exercise every code path.
process.env.WHATSAPP_ACCESS_TOKEN ||= 'test-access-token';
process.env.WHATSAPP_PHONE_NUMBER_ID ||= '1234567890';

const realFetch = globalThis.fetch;
let lastGraphCall = null;
let graphMode = 'ok';

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.includes('graph.facebook.com')) {
    lastGraphCall = { url: u, body: JSON.parse(options.body) };
    if (graphMode === 'error') {
      return { ok: false, status: 400, json: async () => ({ error: { message: 'Invalid parameter', code: 131009 } }) };
    }
    if (graphMode === 'network') throw new Error('simulated network failure');
    return {
      ok: true,
      status: 200,
      json: async () => ({ messaging_product: 'whatsapp', contacts: [{ wa_id: TEST_PHONE }], messages: [{ id: 'wamid.TEST123' }] })
    };
  }
  return realFetch(url, options);
};

const { default: handler } = await import(pathToFileURL(path.join(rootDir, 'api/messages.js')).href + '?t=' + Date.now());
const { createSupabaseAdminClient } = await import(pathToFileURL(path.join(rootDir, 'api/_supabase.js')).href);
const supabase = createSupabaseAdminClient();

function mockRes() {
  return {
    _status: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this._status = c; return this; },
    json(v) { this.body = v; return this; },
    end() { return this; }
  };
}

// api/messages.js requires a real signed-in session; the anon key is not a session.
const AUTH_HEADERS = { Authorization: `Bearer ${process.env.TEST_SESSION_TOKEN || ''}` };

async function post(extra = {}) {
  const res = mockRes();
  await handler({
    method: 'POST',
    headers: AUTH_HEADERS,
    query: {},
    body: { phone: TEST_PHONE, text: TEST_TEXT, ...extra }
  }, res);
  return res;
}

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

async function cleanup() {
  // Remove every row for the test number so the 24h window state is deterministic.
  await supabase.from('messages').delete().eq('sender_number', TEST_PHONE);
}

async function seedInbound() {
  const now = new Date().toISOString();
  await supabase.from('messages').insert({
    sender_number: TEST_PHONE, direction: 'inbound', message_type: 'text',
    content: 'hello inbound', received_at: now, created_at: now
  });
}

console.log('\nWhatsApp outbound send tests (Graph API is MOCKED)\n');

if (process.env.RUN_LIVE_DB_TESTS !== '1') {
  console.log('SKIPPED: this suite writes to the real database.');
  console.log('  Re-run with:  RUN_LIVE_DB_TESTS=1 TEST_SESSION_TOKEN=<user JWT> node scripts/test-whatsapp-outbound.mjs');
  console.log('  Offline equivalent (no DB, no network): node scripts/test-messages-auth.mjs\n');
  process.exit(0);
}
if (!process.env.TEST_SESSION_TOKEN) {
  console.error('ABORTED: TEST_SESSION_TOKEN is required — api/messages.js rejects unauthenticated sends.\n');
  process.exit(1);
}

await test('rejects missing phone', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: AUTH_HEADERS, query: {}, body: { text: 'x' } }, res);
  assert.equal(res._status, 400);
});

await test('rejects empty text', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: AUTH_HEADERS, query: {}, body: { phone: TEST_PHONE, text: '  ' } }, res);
  assert.equal(res._status, 400);
});

await test('outside 24h window without template is blocked (422)', async () => {
  await cleanup();
  const res = await post();
  // No inbound message exists for this number -> outside the window.
  assert.equal(res._status, 422);
  assert.equal(res.body.code, 'TEMPLATE_REQUIRED');
});

await test('outside 24h window sends approved template when configured', async () => {
  await cleanup();
  process.env.WHATSAPP_TEMPLATE_NAME = 'hello_world';
  graphMode = 'ok';
  const res = await post();
  assert.equal(res._status, 200, `expected 200, got ${res._status} ${JSON.stringify(res.body)}`);
  assert.equal(lastGraphCall.body.type, 'template');
  assert.equal(lastGraphCall.body.template.name, 'hello_world');
  assert.equal(res.body.usedTemplate, true);
  assert.equal(res.body.message.wa_message_id, 'wamid.TEST123');
  assert.equal(res.body.message.status, 'sent');
  delete process.env.WHATSAPP_TEMPLATE_NAME;
});

await test('inside 24h window sends free-form text', async () => {
  await cleanup();
  await seedInbound();
  graphMode = 'ok';
  const res = await post();
  assert.equal(res._status, 200, `expected 200, got ${res._status} ${JSON.stringify(res.body)}`);
  assert.equal(lastGraphCall.body.type, 'text');
  assert.equal(lastGraphCall.body.text.body, TEST_TEXT);
  assert.equal(lastGraphCall.body.to, TEST_PHONE);
  assert.equal(res.body.usedTemplate, false);
  assert.equal(res.body.message.status, 'sent');
  assert.equal(res.body.message.wa_message_id, 'wamid.TEST123');
});

await test('duplicate send within 60s is de-duplicated', async () => {
  await cleanup();
  await seedInbound();
  const first = await post({ clientMessageId: 'dedupe-key-1' });
  assert.equal(first._status, 200);
  const before = lastGraphCall;
  const second = await post({ clientMessageId: 'dedupe-key-1' });
  assert.equal(second.body.duplicate, true, 'second call should be flagged duplicate');
  assert.equal(lastGraphCall, before, 'Graph API must NOT be called twice');
});

await test('Meta rejection marks message failed, never sent', async () => {
  await cleanup();
  await seedInbound();
  graphMode = 'error';
  const res = await post();
  assert.equal(res._status, 502);
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /Invalid parameter/);

  const { data } = await supabase.from('messages').select('status, wa_message_id')
    .eq('sender_number', TEST_PHONE).eq('content', TEST_TEXT);
  assert.ok(data.length >= 1);
  assert.ok(data.every(r => r.status === 'failed'), `all rows should be failed: ${JSON.stringify(data)}`);
  assert.ok(data.every(r => !r.wa_message_id), 'failed rows must not carry a wa_message_id');
  graphMode = 'ok';
});

await test('network failure marks message failed', async () => {
  await cleanup();
  await seedInbound();
  graphMode = 'network';
  const res = await post();
  assert.equal(res._status, 502);
  assert.equal(res.body.status, 'failed');
  graphMode = 'ok';
});

await cleanup();
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
