// scripts/test-messages-auth.mjs
// ---------------------------------------------------------------------------
// Verifies the tenant auth gate on api/messages.js.
//
// This suite is FULLY MOCKED: every HTTP call (Supabase auth, PostgREST and the
// Meta Graph API) is intercepted. It never touches the real database, never
// sends a real WhatsApp message, and needs no credentials.
//
// What it proves:
//   1. No Authorization header            -> 401, and NO database call at all
//   2. Invalid/expired token               -> 401
//   3. Valid user with no org membership   -> 403
//   4. Valid user asking for someone
//      else's organization_id              -> 403 (client org ids are not trusted)
//   5. Valid member GET                    -> only that org's messages;
//                                             NULL-org and other-tenant rows excluded
//   6. Valid member POST to an unknown
//      phone                              -> 403 and ZERO Graph API calls
//   7. Valid member POST to a phone their org owns -> reaches Graph, and the
//                                             persisted row carries organization_id
// ---------------------------------------------------------------------------
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Force a fake backend. These are set AFTER any .env so real credentials can
// never be picked up and no request can escape to the real project.
process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'mock-publishable-key';
process.env.WHATSAPP_ACCESS_TOKEN = 'mock-whatsapp-token';
process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const USER = '764e9eab-26e5-4cdd-b554-25a41a25ea35';
const OWN_PHONE = '919999000001';
const STALE_PHONE = '919777666555';
const UNKNOWN_PHONE = '919888777777';
const CROSS_TENANT_PHONE = '919666555444';

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

// --- Fixture data -----------------------------------------------------------
const ORGANIZATION_USERS = [{ organization_id: ORG, user_id: USER, role: 'Owner' }];

const MESSAGES = [
  // Recent inbound -> inside the 24h customer service window.
  { id: 'm1', organization_id: ORG, sender_number: OWN_PHONE, direction: 'inbound', content: 'org one a', received_at: minutesAgo(5) },
  { id: 'm2', organization_id: ORG, sender_number: OWN_PHONE, direction: 'outbound', content: 'org one b', received_at: minutesAgo(4) },
  // Stale inbound -> outside the 24h window, so an approved template is required.
  { id: 'm5', organization_id: ORG, sender_number: STALE_PHONE, direction: 'inbound', content: 'long ago', received_at: minutesAgo(60 * 24 * 40) },
  // Ownership unknown -> must never be surfaced to any tenant.
  { id: 'm3', organization_id: null, sender_number: '919555000000', direction: 'inbound', content: 'legacy null org', received_at: minutesAgo(600) },
  // A different tenant -> must never leak.
  { id: 'm4', organization_id: OTHER_ORG, sender_number: '919444000000', direction: 'inbound', content: 'other tenant', received_at: minutesAgo(600) },
  // Recent inbound for the "+91 99990 00002" contact so the 24h window is open.
  { id: 'm10', organization_id: ORG, sender_number: '919999000002', direction: 'inbound', content: 'formatted contact', received_at: minutesAgo(5) }
];

// NOTE: the two OTHER_ORG leads are listed FIRST on purpose. An unscoped
// enrichment query would return them first and attach "LEAKED OTHER TENANT
// NAME" to this organization's inbox thread, which is exactly the bug the
// organization_id filter prevents.
const LEADS = [
  { id: 'l4', organization_id: OTHER_ORG, phone: OWN_PHONE, name: 'LEAKED OTHER TENANT NAME' },
  { id: 'l3', organization_id: OTHER_ORG, phone: CROSS_TENANT_PHONE, name: 'Other Tenant Lead' },
  { id: 'l1', organization_id: ORG, phone: OWN_PHONE, name: 'Owned Lead' },
  { id: 'l2', organization_id: ORG, phone: STALE_PHONE, name: 'Stale Lead' },
  // Stored with a + prefix and spaces: normalizes to 919999000002
  { id: 'l5', organization_id: ORG, phone: '+91 99990 00002', name: 'Formatted Owned Lead' },
  // Exists ONLY in another tenant: 919999000009
  { id: 'l6', organization_id: OTHER_ORG, phone: '+91 99990 00009', name: 'Foreign Only Lead' }
];

// --- Network recorder -------------------------------------------------------
let calls = [];
let graphCalls = [];
// Recorder for row writes (INSERT). Tests reset it when they assert on writes.
calls.inserts = [];
let mode = { tokenValid: true, memberships: ORGANIZATION_USERS, membershipError: false };

function reset() {
  // Re-attach the INSERT recorder: reset() replaces the array, which would
  // otherwise drop the non-index property.
  calls = [];
  calls.inserts = [];
  graphCalls = [];
}

function jsonRes(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

/**
 * PostgREST emulator: honours column=eq.X, column=in.(a,b), order= and limit=.
 *
 * eq-only was not enough. The 24-hour service-window lookup filters with
 * .in('sender_number', [...]) and orders by received_at desc limit 1, so an
 * emulator that ignored those returned the newest inbound row for ANY contact
 * and the window looked open for a customer last seen 40 days ago - which made
 * the test assert the wrong thing about production behaviour.
 */
function fakePostgrest(url, options = {}) {
  const u = new URL(url);
  const table = u.pathname.split('/').pop();
  const filters = {};
  const inFilters = {};
  let orderCol = null;
  let orderDesc = false;
  let rowLimit = 0;
  for (const [k, v] of u.searchParams.entries()) {
    // PostgREST encodes equality filters as  ?<column>=eq.<value>
    const m = /^eq\.(.*)$/.exec(v);
    if (m) { filters[k] = m[1]; continue; }
    // membership: ?<column>=in.(a,b,c)
    const mi = /^in\.\((.*)\)$/.exec(v);
    if (mi) { inFilters[k] = mi[1].split(','); continue; }
    if (k === 'order') {
      const parts = String(v).split('.');
      orderCol = parts[0];
      orderDesc = parts[1] === 'desc';
      continue;
    }
    if (k === 'limit') { rowLimit = parseInt(v, 10) || 0; continue; }
  }
  const method = (options.method || 'GET').toUpperCase();
  let requestBody = null;
  if (options.body) { try { requestBody = JSON.parse(options.body); } catch { /* not json */ } }
  calls.push({ table, method, filters, url: String(url), body: requestBody });

const WHATSAPP_CONNECTIONS = [
  { organization_id: ORG, phone_number_id: '1234567890', is_active: true, access_token: 'mock-whatsapp-token' }
];

  let rows = { organization_users: ORGANIZATION_USERS, messages: MESSAGES, leads: LEADS, whatsapp_connections: WHATSAPP_CONNECTIONS }[table];
  if (rows === undefined) return jsonRes({ message: `unknown table ${table}` }, 400);
  if (table === 'organization_users' && mode.membershipError) {
    return jsonRes({ message: 'simulated membership lookup failure' }, 500);
  }
  if (mode.memberships && table === 'organization_users') rows = mode.memberships;

  // PostgREST returns a bare object (not an array) when the client asks for
  // the pgrst.object media type, which is what .single() does.
  const wantsSingle = String(options.headers?.Accept || options.headers?.accept || '').includes('pgrst.object');
  const wrap = (list, status) => jsonRes(wantsSingle ? (list[0] ?? null) : list, status);

  if (method === 'GET') {
    let out = [...rows];
    for (const [col, val] of Object.entries(filters)) {
      // SQL semantics: col = NULL never matches, exactly like Postgres.
      out = out.filter(r => r[col] != null && String(r[col]) === String(val));
    }
    for (const [col, list] of Object.entries(inFilters)) {
      out = out.filter(r => r[col] != null && list.includes(String(r[col])));
    }
    if (orderCol) {
      const sign = orderDesc ? -1 : 1;
      out.sort((a, b) => {
        const av = a[orderCol] == null, bv = b[orderCol] == null;
        if (av && bv) return 0;
        if (av) return 1;              // nulls last, like nullslast
        if (bv) return -1;
        const an = new Date(a[orderCol]).getTime();
        const bn = new Date(b[orderCol]).getTime();
        if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * sign;
        return (a[orderCol] > b[orderCol] ? 1 : a[orderCol] < b[orderCol] ? -1 : 0) * sign;
      });
    }
    if (rowLimit > 0) out = out.slice(0, rowLimit);
    return wrap(out, 200);
  }
  if (method === 'POST') {
    const body = JSON.parse(options.body || '[]');
    const arr = Array.isArray(body) ? body : [body];
    const inserted = arr.map((r, i) => ({ id: `new-${table}-${i}`, ...r }));
    rows.push(...inserted);
    // Record writes so tests can assert exactly what reached the table.
    if (Array.isArray(calls.inserts)) {
      for (const row of inserted) calls.inserts.push({ table, data: row });
    }
    return wrap(inserted, 201);
  }
  if (method === 'PATCH') {
    const body = JSON.parse(options.body || '{}');
    let out = [...rows];
    for (const [col, val] of Object.entries(filters)) out = out.filter(r => String(r[col]) === String(val));
    out.forEach(r => Object.assign(r, body));
    return wrap(out, 200);
  }
  return jsonRes([], 200);
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const u = String(url);

  if (u.includes('/auth/v1/user')) {
    calls.push({ table: 'auth', method: 'GET', url: u });
    const auth = String(options.headers?.Authorization || options.headers?.authorization || '');
    if (!mode.tokenValid || !/mock-session-token/.test(auth)) {
      return jsonRes({ msg: 'invalid claim: missing sub claim' }, 401);
    }
    return jsonRes({ id: USER, email: 'owner@example.com', aud: 'authenticated' });
  }

  if (u.includes('/rest/v1/')) return fakePostgrest(u, options);

  if (u.includes('graph.facebook.com')) {
    graphCalls.push({ url: u, body: JSON.parse(options.body) });
    return jsonRes({ messaging_product: 'whatsapp', contacts: [{ wa_id: OWN_PHONE }], messages: [{ id: 'wamid.MOCK' }] });
  }

  throw new Error(`UNMOCKED REQUEST ESCAPED: ${u}`);
};

const { default: handler } = await import(pathToFileURL(path.join(rootDir, 'api/messages.js')).href + '?t=' + Date.now());

// --- Harness ----------------------------------------------------------------
function mockRes() {
  return {
    _status: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this._status = c; return this; },
    json(v) { this.body = v; return this; },
    end() { return this; }
  };
}
async function call(req) {
  reset();
  const res = mockRes();
  await handler({ headers: {}, query: {}, body: {}, ...req }, res);
  return { res, calls, graphCalls };
}
const authed = (extra = {}) => ({ headers: { Authorization: 'Bearer mock-session-token' }, ...extra });

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

console.log('\n=== api/messages.js tenant auth gate (fully mocked) ===\n');

await t('GET without Authorization header -> 401 and zero DB calls', async () => {
  const { res, calls } = await call({ method: 'GET' });
  assert.equal(res._status, 401);
  assert.equal(calls.length, 0, `expected no calls before auth, got ${JSON.stringify(calls)}`);
});

await t('GET with an invalid token -> 401', async () => {
  mode.tokenValid = false;
  const { res, calls } = await call({ method: 'GET', headers: { Authorization: 'Bearer nope' } });
  mode.tokenValid = true;
  assert.equal(res._status, 401);
  assert.ok(!calls.some(c => c.table === 'messages'), 'must not query messages');
});

await t('GET with a valid user who has no org membership -> 403', async () => {
  mode.memberships = [];
  const { res, calls } = await call(authed({ method: 'GET' }));
  mode.memberships = ORGANIZATION_USERS;
  assert.equal(res._status, 403);
  assert.ok(!calls.some(c => c.table === 'messages'), 'must not query messages');
});

await t('GET asking for another tenant organization_id -> 403', async () => {
  const { res, calls } = await call(authed({ method: 'GET', query: { organization_id: OTHER_ORG } }));
  assert.equal(res._status, 403);
  assert.ok(!calls.some(c => c.table === 'messages'), 'must not query messages');
});

await t('GET for own org returns only that org (NULL-org + other tenant excluded)', async () => {
  const { res, calls } = await call(authed({ method: 'GET' }));
  assert.equal(res._status, 200);

  const q = calls.find(c => c.table === 'messages');
  assert.ok(q, 'messages table was queried');
  assert.equal(q.filters.organization_id, ORG, 'GET must be filtered by the resolved org');

  const ids = (res.body.messages || []).map(m => m.id).sort();
  // m10 is a legitimate ORG row (the "+91 99990 00002" contact), so it belongs
  // here. The point of the test is that m3 (NULL org) and m4 (OTHER_ORG) are
  // absent - those assertions are separate and unchanged.
  assert.deepEqual(ids, ['m1', 'm10', 'm2', 'm5'], 'only this org rows may be returned');
  assert.ok(!res.body.messages.some(m => m.organization_id === null), 'no NULL-org message may leak');
  assert.ok(!res.body.messages.some(m => m.organization_id === OTHER_ORG), 'no cross-tenant message may leak');
});

await t('POST to a phone outside the organization -> 403 and no Graph call', async () => {
  const { res, graphCalls } = await call(authed({
    method: 'POST', body: { phone: UNKNOWN_PHONE, text: 'should never send' }
  }));
  assert.equal(res._status, 403);
  assert.equal(graphCalls.length, 0, 'Meta Graph API must never be reached');
});

await t('POST to an org-owned phone -> sends, and persists organization_id', async () => {
  const { res, calls, graphCalls } = await call(authed({
    method: 'POST', body: { phone: OWN_PHONE, text: 'authenticated send test' }
  }));
  assert.equal(res._status, 200);
  assert.equal(graphCalls.length, 1, 'exactly one Graph send');
  assert.equal(graphCalls[0].body.to, OWN_PHONE);

  const insert = calls.find(c => c.table === 'messages' && c.method === 'POST');
  assert.ok(insert, 'outbound message row was persisted');
  const row = Array.isArray(insert.body) ? insert.body[0] : insert.body;
  assert.equal(row.organization_id, ORG, 'persisted row must be tenant stamped');
  assert.equal(row.channel, 'whatsapp');
  assert.equal(row.status, 'sending', 'row is written as sending before the API call');
  assert.equal(row.direction, 'outbound');
});

await t('POST to a phone that only ANOTHER tenant owns -> 403', async () => {
  const { res, graphCalls } = await call(authed({
    method: 'POST', body: { phone: CROSS_TENANT_PHONE, text: 'not my customer' }
  }));
  assert.equal(res._status, 403, 'a lead in another org must not authorise the send');
  assert.equal(graphCalls.length, 0);
});

await t('POST without a session -> 401 and no Graph call', async () => {
  const { res, graphCalls } = await call({ method: 'POST', body: { phone: OWN_PHONE, text: 'anon' } });
  assert.equal(res._status, 401);
  assert.equal(graphCalls.length, 0);
});

await t('POST outside the 24h window with no template -> 422, nothing sent', async () => {
  delete process.env.WHATSAPP_TEMPLATE_NAME;
  const { res, graphCalls } = await call(authed({
    method: 'POST', body: { phone: STALE_PHONE, text: 'too late for free text' }
  }));
  assert.equal(res._status, 422);
  assert.equal(res.body.code, 'TEMPLATE_REQUIRED');
  assert.equal(graphCalls.length, 0, 'must not send free-form text outside the window');
});

await t('POST outside the 24h window with a template -> approved-template send', async () => {
  process.env.WHATSAPP_TEMPLATE_NAME = 'nb_followup';
  const { res, graphCalls } = await call(authed({
    method: 'POST', body: { phone: STALE_PHONE, text: 'following up', templateParams: ['Ada'] }
  }));
  delete process.env.WHATSAPP_TEMPLATE_NAME;
  assert.equal(res._status, 200);
  assert.equal(res.body.usedTemplate, true);
  assert.equal(graphCalls.length, 1);
  assert.equal(graphCalls[0].body.type, 'template');
  assert.equal(graphCalls[0].body.template.name, 'nb_followup');
});

// ---------------------------------------------------------------------------
// Organization isolation
// ---------------------------------------------------------------------------

await t('GET lead-name enrichment query is scoped to the organization', async () => {
  const { calls } = await call(authed({ method: 'GET' }));
  const leadQ = calls.find(c => c.table === 'leads');
  assert.ok(leadQ, 'leads were queried for name enrichment');
  assert.equal(leadQ.filters.organization_id, ORG,
    'lead-name enrichment MUST be filtered by organization_id');
});

await t('GET never shows another tenant lead name on a thread', async () => {
  const { res } = await call(authed({ method: 'GET' }));
  const conv = (res.body.conversations || []).find(c => c.phone === OWN_PHONE);
  assert.ok(conv, 'thread for the owned number exists');
  assert.equal(conv.name, 'Owned Lead',
    'name must come from this org lead, not the other tenant lead with the same phone');
  const asText = JSON.stringify(res.body);
  assert.ok(!asText.includes('LEAKED OTHER TENANT NAME'),
    'another tenant lead name leaked into the response');
});

// ---------------------------------------------------------------------------
// Idempotency / duplicate suppression
// ---------------------------------------------------------------------------

await t('identical resend is de-duplicated and only one Graph call is made', async () => {
  const body = { phone: OWN_PHONE, text: 'duplicate suppression probe', clientMessageId: 'abc-123' };
  const first = await call(authed({ method: 'POST', body }));
  assert.equal(first.res._status, 200);
  assert.notEqual(first.res.body.duplicate, true, 'first send is not a duplicate');

  const second = await call(authed({ method: 'POST', body }));
  assert.equal(second.res._status, 200);
  assert.equal(second.res.body.duplicate, true, 'second identical send is suppressed');
  assert.equal(second.res.body.idempotencyKeyHonoured, false,
    'clientMessageId cannot be honoured without a storage column, and must not be claimed');
  assert.equal(second.graphCalls.length, 0, 'no second Graph call');
});

await t('a different text to the same number is NOT de-duplicated', async () => {
  const a = await call(authed({ method: 'POST', body: { phone: OWN_PHONE, text: 'variant one probe' } }));
  const b = await call(authed({ method: 'POST', body: { phone: OWN_PHONE, text: 'variant two probe' } }));
  assert.equal(a.res._status, 200);
  assert.equal(b.res._status, 200);
  assert.notEqual(b.res.body.duplicate, true, 'different content must still send');
  assert.equal(b.graphCalls.length, 1);
});

// ---------------------------------------------------------------------------
// Membership lookup failure must be 503, not 403
// ---------------------------------------------------------------------------

await t('membership lookup failure -> 503 (not a misleading 403)', async () => {
  mode.membershipError = true;
  const { res } = await call(authed({ method: 'GET' }));
  mode.membershipError = false;
  assert.equal(res._status, 503,
    'a DB failure must not be reported as "you are not a member"');
});

// ---------------------------------------------------------------------------
// POST authorization: exact normalized phone matching
// ---------------------------------------------------------------------------

await t('POST: stored phone with + prefix and spaces is accepted after normalization', async () => {
  // stored as "+91 99990 00002" -> normalizes to 919999000002
  const { res, graphCalls } = await call(authed({
    method: 'POST', body: { phone: '919999000002', text: 'normalization probe stored' }
  }));
  assert.notEqual(res._status, 403, `must not be rejected: ${JSON.stringify(res.body)}`);
  assert.equal(res._status, 200, `expected 200, got ${res._status}: ${JSON.stringify(res.body)}`);
  assert.equal(graphCalls.length, 1, 'should actually send');
});

await t('POST: request phone with + prefix and spaces is accepted after normalization', async () => {
  // stored as 919999000001 -> request "+91 99990 00001" normalizes to the same
  const { res, graphCalls } = await call(authed({
    method: 'POST', body: { phone: '+91 99990 00001', text: 'normalization probe request' }
  }));
  assert.equal(res._status, 200, `expected 200, got ${res._status}: ${JSON.stringify(res.body)}`);
  assert.equal(graphCalls.length, 1);
  assert.equal(graphCalls[0].body.to, '919999000001', 'must send to the normalized number');
});

await t('POST: a DIFFERENT number sharing the last 7 digits is rejected', async () => {
  // 447999900001 and 919999000001 share the last 7 digits (9990001) but are
  // different numbers. Loose suffix matching would have authorized this.
  const { res, graphCalls } = await call(authed({
    method: 'POST', body: { phone: '447999900001', text: 'suffix collision probe' }
  }));
  assert.equal(res._status, 403, `suffix collision must be rejected, got ${res._status}`);
  assert.equal(graphCalls.length, 0, 'must never send to a number we do not own');
});

await t('POST: a contact that exists only in ANOTHER organization is rejected', async () => {
  // "+91 99990 00009" -> 919999000009 exists in OTHER_ORG, not in ORG.
  const { res, graphCalls } = await call(authed({
    method: 'POST', body: { phone: '919999000009', text: 'cross tenant probe' }
  }));
  assert.equal(res._status, 403, `another org's contact must be rejected, got ${res._status}`);
  assert.equal(graphCalls.length, 0);
});

await t('POST: exact matching contact in the caller organization is accepted', async () => {
  const { res, graphCalls } = await call(authed({
    method: 'POST', body: { phone: '919999000001', text: 'exact match probe' }
  }));
  assert.equal(res._status, 200, `expected 200, got ${res._status}: ${JSON.stringify(res.body)}`);
  assert.equal(graphCalls.length, 1);
  assert.equal(graphCalls[0].body.to, '919999000001');
});

// ---------------------------------------------------------------------------
// POST action=create-lead  (tenant-scoped lead creation)
// ---------------------------------------------------------------------------

const createLead = (body, headers = { Authorization: 'Bearer mock-session-token' }, query = { action: 'create-lead' }) =>
  call({ method: 'POST', headers, query, body });

await t('create-lead: unauthenticated request -> 401, no lead written', async () => {
  calls.inserts = [];
  const { res } = await createLead({ phone: '919555000123', contactName: 'No Auth' }, {});
  assert.equal(res._status, 401);
  assert.equal(calls.inserts.filter(i => i.table === 'leads').length, 0);
});

await t('create-lead: valid member without membership -> 403, no lead written', async () => {
  mode.memberships = [];
  calls.inserts = [];
  const { res } = await createLead({ phone: '919555000124', contactName: 'No Member' });
  mode.memberships = ORGANIZATION_USERS;
  assert.equal(res._status, 403);
  assert.equal(calls.inserts.filter(i => i.table === 'leads').length, 0);
});

await t('create-lead: valid member creates a lead stamped with the caller org', async () => {
  calls.inserts = [];
  const { res } = await createLead({ phone: '+91 98765 43210', contactName: 'New Person', companyName: 'Acme' });
  assert.equal(res._status, 201, `expected 201, got ${res._status}: ${JSON.stringify(res.body)}`);
  const row = calls.inserts.filter(i => i.table === 'leads').at(-1);
  assert.equal(row.data.organization_id, ORG, 'must use the caller org, never a client value');
  assert.equal(row.data.phone, '919876543210', 'phone must be normalized to digits');
  assert.equal(row.data.status, 'NEW');
  // Real PostgREST returns a bare object for .single(); tolerate a 1-element
  // array too so the assertion is about content, not client internals.
  const lead = Array.isArray(res.body.lead) ? res.body.lead[0] : res.body.lead;
  assert.ok(lead, 'response must include the created lead');
  assert.equal(lead.organization_id, ORG);
});

await t('create-lead: invalid phone -> 400, nothing written', async () => {
  for (const bad of ['', '   ', '12345', 'not-a-phone', '1234567890123456789']) {
    calls.inserts = [];
    const { res } = await createLead({ phone: bad, contactName: 'Bad Phone' });
    assert.equal(res._status, 400, `"${bad}" should be rejected, got ${res._status}`);
    assert.equal(calls.inserts.filter(i => i.table === 'leads').length, 0);
  }
});

await t('create-lead: missing name/company and bad email -> 400', async () => {
  let r = await createLead({ phone: '919555000125' });
  assert.equal(r.res._status, 400, 'needs a contact or company name');
  r = await createLead({ phone: '919555000126', contactName: 'X', email: 'not-an-email' });
  assert.equal(r.res._status, 400, 'invalid email must be rejected');
});

await t('create-lead: duplicate phone in the SAME org -> 409, no second row', async () => {
  calls.inserts = [];
  // 919999000001 already exists as an ORG lead (l1).
  const { res } = await createLead({ phone: '+91 99990 00001', contactName: 'Duplicate Person' });
  assert.equal(res._status, 409, `expected 409, got ${res._status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.code, 'DUPLICATE_LEAD');
  assert.equal(calls.inserts.filter(i => i.table === 'leads').length, 0, 'no duplicate row may be written');
});

await t('create-lead: duplicate check is scoped to the caller org only', async () => {
  // 919999000009 exists ONLY in OTHER_ORG. The caller must be able to create it
  // in their own org, and the other tenant's row must not be touched/reported.
  calls.inserts = [];
  const { res } = await createLead({ phone: '919999000009', contactName: 'Mine Now' });
  assert.equal(res._status, 201, `expected 201, got ${res._status}: ${JSON.stringify(res.body)}`);
  const row = calls.inserts.filter(i => i.table === 'leads').at(-1);
  assert.equal(row.data.organization_id, ORG);
  assert.equal(row.data.phone, '919999000009');
});

await t('create-lead: a client-supplied organizationId is ignored', async () => {
  calls.inserts = [];
  const { res } = await createLead({
    phone: '919555000130', contactName: 'Spoof Attempt', organizationId: OTHER_ORG
  });
  assert.equal(res._status, 201);
  const row = calls.inserts.filter(i => i.table === 'leads').at(-1);
  assert.equal(row.data.organization_id, ORG, 'body organizationId must be ignored');
  assert.notEqual(row.data.organization_id, OTHER_ORG);
});

await t('POST: the 24h window is read from THIS number, not another contact in the org', async () => {
  // ORG also has m1/m2 (inbound 5 min ago) for 919999000001 and m10 for
  // 919999000002. A limit that truncated the result set previously produced a
  // false "outside the window" answer. Both must be inside the window.
  for (const p of ['919999000001', '919999000002']) {
    const { res } = await call(authed({ method: 'POST', body: { phone: p, text: 'window probe ' + p } }));
    assert.equal(res._status, 200, `${p} expected 200, got ${res._status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.usedTemplate, false, `${p} should be inside the 24h window`);
  }
});

await t('CORS reflects the production origin exactly', async () => {
  const { res } = await call(authed({
    method: 'GET', headers: { Authorization: 'Bearer mock-session-token', Origin: 'https://w-asaas.vercel.app' }
  }));
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://w-asaas.vercel.app');
  assert.equal(res.headers.Vary, 'Origin');
});

await t('CORS does NOT reflect an unknown origin', async () => {
  const { res } = await call(authed({
    method: 'GET', headers: { Authorization: 'Bearer mock-session-token', Origin: 'https://evil.example.com' }
  }));
  assert.equal(res.headers['Access-Control-Allow-Origin'], undefined,
    'an unlisted origin must get no Allow-Origin header at all');
  assert.ok(!String(res.headers['Access-Control-Allow-Origin'] || '').includes('*'),
    'must never be a wildcard');
});

await t('CORS allows a local dev origin', async () => {
  const { res } = await call(authed({
    method: 'GET', headers: { Authorization: 'Bearer mock-session-token', Origin: 'http://localhost:3001' }
  }));
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'http://localhost:3001');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
