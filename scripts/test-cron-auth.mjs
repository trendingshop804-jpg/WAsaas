// scripts/test-cron-auth.mjs
// ---------------------------------------------------------------------------
// Verifies that the follow-up cron endpoint fails CLOSED.
//
// api/daily-followup.js can send REAL WhatsApp messages, so it must never be
// reachable by an anonymous visitor. It used to return `true` (allow) whenever
// CRON_SECRET was unset, which meant anyone could trigger real sends with
// ?force=1.
//
// Fully mocked: intercepts Supabase auth only. No database, no network.
// ---------------------------------------------------------------------------
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'mock-publishable-key';
delete process.env.CRON_SECRET;

// Reachable endpoints for this guard:
//   /auth/v1/user               -> session validation (getAuthenticatedUser)
//   /rest/v1/organization_users -> membership lookup (getUserOrganizationIds)
// Anything else escaping means the guard let a request through it should not have.
let membershipRole = 'Owner';   // mutated by the non-Owner test
let membershipError = false;    // simulates a membership-lookup failure

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.includes('/auth/v1/user')) {
    const auth = String(options.headers?.Authorization || options.headers?.authorization || '');
    const ok = /mock-session-token/.test(auth);
    return {
      ok, status: ok ? 200 : 401,
      headers: { get: () => 'application/json' },
      json: async () => (ok ? { id: 'u1', aud: 'authenticated' } : { msg: 'invalid' }),
      text: async () => '{}'
    };
  }
  if (u.includes('/rest/v1/organization_users')) {
    if (membershipError) {
      return {
        ok: false, status: 500,
        headers: { get: () => 'application/json' },
        json: async () => ({ message: 'simulated membership lookup failure' }),
        text: async () => JSON.stringify({ message: 'simulated membership lookup failure' })
      };
    }
    // Shape mirrors what getUserOrganizationIds() selects: organization_id, role.
    // NOTE: the PostgREST client reads response.text() and JSON.parses it, so
    // text() must return the serialised body, not a placeholder.
    const payload = membershipRole ? [{ organization_id: 'org_1', role: membershipRole }] : [];
    return {
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      json: async () => payload,
      text: async () => JSON.stringify(payload)
    };
  }
  throw new Error(`UNMOCKED REQUEST ESCAPED: ${u}`);
};

const { authorizeCron } = await import(pathToFileURL(path.join(rootDir, 'api/_lead-followups.js')).href + '?t=' + Date.now());

function mockRes() {
  return {
    _status: 200, body: null,
    setHeader() {}, status(c) { this._status = c; return this; },
    json(v) { this.body = v; return this; }, end() { return this; }
  };
}

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

console.log('\n=== follow-up cron authorization (fully mocked) ===\n');

await t('anonymous request is rejected (401) even with no CRON_SECRET set', async () => {
  const res = mockRes();
  const allowed = await authorizeCron({ headers: {} }, res);
  assert.equal(allowed, false);
  assert.equal(res._status, 401);
  assert.match(res.body.error, /CRON_SECRET|session/i);
});

await t('wrong bearer token is rejected (401)', async () => {
  const res = mockRes();
  const allowed = await authorizeCron({ headers: { Authorization: 'Bearer wrong-token' } }, res);
  assert.equal(allowed, false);
  assert.equal(res._status, 401);
});

await t('valid signed-in session with an Owner membership is allowed', async () => {
  membershipRole = 'Owner';
  const res = mockRes();
  const allowed = await authorizeCron({ headers: { Authorization: 'Bearer mock-session-token' } }, res);
  assert.equal(allowed, true);
  assert.equal(res._status, 200);
});

await t('valid signed-in session with an Admin membership is allowed', async () => {
  membershipRole = 'Admin';
  const res = mockRes();
  const allowed = await authorizeCron({ headers: { Authorization: 'Bearer mock-session-token' } }, res);
  membershipRole = 'Owner';
  assert.equal(allowed, true);
  assert.equal(res._status, 200);
});

await t('valid signed-in session with a non-Owner/Admin role is rejected (403)', async () => {
  membershipRole = 'Sales Agent';
  const res = mockRes();
  const allowed = await authorizeCron({ headers: { Authorization: 'Bearer mock-session-token' } }, res);
  membershipRole = 'Owner';
  assert.equal(allowed, false, 'a non-Owner/Admin member must NOT be allowed to trigger sends');
  assert.equal(res._status, 403);
});

await t('valid signed-in session with no membership at all is rejected (403)', async () => {
  membershipRole = null;
  const res = mockRes();
  const allowed = await authorizeCron({ headers: { Authorization: 'Bearer mock-session-token' } }, res);
  membershipRole = 'Owner';
  assert.equal(allowed, false);
  assert.equal(res._status, 403);
});

await t('membership lookup failure is 503, not a silent allow or a 403', async () => {
  membershipError = true;
  const res = mockRes();
  const allowed = await authorizeCron({ headers: { Authorization: 'Bearer mock-session-token' } }, res);
  membershipError = false;
  assert.equal(allowed, false);
  assert.equal(res._status, 503);
});

await t('a CRON_SECRET bypasses the membership check entirely', async () => {
  membershipRole = 'Sales Agent';           // deliberately not Owner/Admin
  process.env.CRON_SECRET = 'super-secret-cron';
  const res = mockRes();
  const allowed = await authorizeCron({ headers: { Authorization: 'Bearer super-secret-cron' } }, res);
  delete process.env.CRON_SECRET;
  membershipRole = 'Owner';
  assert.equal(allowed, true, 'the cron secret is a valid independent path');
});

await t('the correct CRON_SECRET is allowed', async () => {
  process.env.CRON_SECRET = 'super-secret-cron';
  const res = mockRes();
  const allowed = await authorizeCron({ headers: { Authorization: 'Bearer super-secret-cron' } }, res);
  delete process.env.CRON_SECRET;
  assert.equal(allowed, true);
});

await t('with CRON_SECRET set, an invalid secret is rejected (401)', async () => {
  process.env.CRON_SECRET = 'super-secret-cron';
  const res = mockRes();
  const allowed = await authorizeCron({ headers: { Authorization: 'Bearer nope' } }, res);
  delete process.env.CRON_SECRET;
  assert.equal(allowed, false);
  assert.equal(res._status, 401);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
