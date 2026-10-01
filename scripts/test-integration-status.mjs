// scripts/test-integration-status.mjs
// Covers the server-side integration configuration checks, with focus on the
// Twilio path that reported "Twilio Voice is not configured on the server".
//
//   node scripts/test-integration-status.mjs

import assert from 'node:assert/strict';

const ENV_KEYS = [
  'TWILIO_ACCOUNT_SID', 'TWILIO_SID',
  'TWILIO_AUTH_TOKEN', 'TWILIO_TOKEN',
  'TWILIO_FROM_NUMBER', 'TWILIO_PHONE_NUMBER', 'TWILIO_CALLER_NUMBER'
];
const saved = {};
for (const key of ENV_KEYS) {
  saved[key] = process.env[key];
  delete process.env[key];
}

const realFetch = globalThis.fetch;
let fetchCalls = [];
globalThis.fetch = async (input) => {
  const url = String(input?.url || input);
  fetchCalls.push(url);
  if (/api\.twilio\.com/.test(url)) {
    return new Response(JSON.stringify({
      account_sid: 'AC' + 'a'.repeat(32),
      friendly_name: 'Test Account',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`Unexpected fetch to ${url}`);
};

const { getIntegrationStatus, normalizeIntegrationKey } = await import('../api/_integration-status.js');

let passed = 0;
let failed = 0;
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

const twilio = () => getIntegrationStatus('twilio');
const VALID_SID = 'AC' + 'a'.repeat(32);

console.log('=== Twilio integration configuration ===');

await test('no credentials -> not_configured naming both variables', async () => {
  fetchCalls = [];
  const r = await twilio();
  assert.equal(r.status, 'not_configured');
  assert.equal(r.connected, false);
  assert.deepEqual(r.missing.sort(), ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']);
  assert.match(r.message, /TWILIO_ACCOUNT_SID/);
  assert.match(r.message, /TWILIO_AUTH_TOKEN/);
  assert.equal(fetchCalls.length, 0, 'must not call Twilio without credentials');
});

await test('the not_configured result says where the secrets belong', async () => {
  // The in-app form stores values in browser localStorage and never reaches the
  // server, so the status can only be cleared through the deployment env.
  const r = await twilio();
  assert.ok(Array.isArray(r.envVars), 'envVars must be returned so the UI can name them');
  assert.ok(r.envVars.includes('TWILIO_ACCOUNT_SID'));
  assert.ok(r.envVars.includes('TWILIO_AUTH_TOKEN'));
  assert.ok(r.setupHint, 'a setup hint is required or this status is unactionable');
  assert.match(r.setupHint, /environment variable/i);
});

await test('a token with no SID is still not_configured', async () => {
  process.env.TWILIO_AUTH_TOKEN = 'token-only';
  try {
    const r = await twilio();
    assert.equal(r.status, 'not_configured');
    assert.deepEqual(r.missing, ['TWILIO_ACCOUNT_SID']);
  } finally {
    delete process.env.TWILIO_AUTH_TOKEN;
  }
});

await test('legacy TWILIO_SID / TWILIO_TOKEN names are still honoured', async () => {
  fetchCalls = [];
  process.env.TWILIO_SID = VALID_SID;
  process.env.TWILIO_TOKEN = 'legacy-token';
  process.env.TWILIO_FROM_NUMBER = '+15551234567';
  try {
    const r = await twilio();
    assert.equal(r.status, 'connected', `expected connected, got ${r.status}: ${r.message}`);
    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0], /api\.twilio\.com/);
  } finally {
    delete process.env.TWILIO_SID;
    delete process.env.TWILIO_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
  }
});

await test('a malformed Account SID fails fast with a clear message', async () => {
  fetchCalls = [];
  process.env.TWILIO_ACCOUNT_SID = 'not-a-real-sid';
  process.env.TWILIO_AUTH_TOKEN = 'token';
  try {
    const r = await twilio();
    assert.equal(r.status, 'error');
    assert.match(r.message, /not a valid Twilio Account SID/i);
    assert.equal(fetchCalls.length, 0, 'a bad SID must not be sent to Twilio');
  } finally {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
  }
});

await test('valid credentials report connected', async () => {
  process.env.TWILIO_ACCOUNT_SID = VALID_SID;
  process.env.TWILIO_AUTH_TOKEN = 'token';
  process.env.TWILIO_FROM_NUMBER = '+15551234567';
  try {
    const r = await twilio();
    assert.equal(r.status, 'connected', `got ${r.status}: ${r.message}`);
    assert.equal(r.connected, true);
    assert.equal(r.provider, 'Twilio Voice');
  } finally {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
  }
});

await test('a reachable account with no caller number warns instead of failing', async () => {
  // Without a Twilio number no call can be placed, so a bare "connected" badge
  // would be misleading.
  process.env.TWILIO_ACCOUNT_SID = VALID_SID;
  process.env.TWILIO_AUTH_TOKEN = 'token';
  try {
    const r = await twilio();
    assert.equal(r.status, 'connected');
    assert.ok(Array.isArray(r.warnings) && r.warnings.length, 'expected a caller-number warning');
    assert.match(r.warnings.join(' '), /caller number/i);
  } finally {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
  }
});

await test('a 401 from Twilio names the credential that is wrong', async () => {
  globalThis.fetch = async (input) => {
    const url = String(input?.url || input);
    fetchCalls.push(url);
    if (/api\.twilio\.com/.test(url)) {
      return new Response(JSON.stringify({ code: 20003, message: 'Authenticate' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch to ${url}`);
  };
  process.env.TWILIO_ACCOUNT_SID = VALID_SID;
  process.env.TWILIO_AUTH_TOKEN = 'wrong-token';
  try {
    const r = await twilio();
    assert.equal(r.status, 'error');
    assert.match(r.message, /TWILIO_AUTH_TOKEN/);
  } finally {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    globalThis.fetch = realFetch;
  }
});

console.log('=== key normalization ===');

await test('"calls" and "Twilio Voice" both resolve to the twilio checker', async () => {
  assert.equal(normalizeIntegrationKey('calls'), 'twilio');
  assert.equal(normalizeIntegrationKey('twilio'), 'twilio');
  assert.equal(normalizeIntegrationKey('TWILIO'), 'twilio');
});

globalThis.fetch = realFetch;
for (const [key, value] of Object.entries(saved)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

console.log(`\n${failed ? failed + ' test(s) failed.' : passed + ' passed, 0 failed.'}`);
process.exit(failed ? 1 : 0);
