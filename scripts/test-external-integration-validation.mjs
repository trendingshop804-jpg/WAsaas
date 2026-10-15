import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'mock-publishable-key';
process.env.INTEGRATION_ENCRYPT_SECRET = 'test-secret-0123456789abcdef0123456789';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = 'user-integration-test';
const TOKEN = 'session-token';
let providerStatus = 200;
let writes = [];

const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body,
  text: async () => JSON.stringify(body)
});

const wantsSingle = options => String(options?.headers?.Accept || options?.headers?.accept || '').includes('pgrst.object');

globalThis.fetch = async (input, options = {}) => {
  const url = String(input?.url || input);
  const auth = String(options?.headers?.Authorization || options?.headers?.authorization || '');
  if (url.includes('/auth/v1/user')) return /session-token/.test(auth) ? json({ id: USER }) : json({ message: 'invalid' }, 401);
  if (url.includes('/rest/v1/organization_users')) return json([{ organization_id: ORG, user_id: USER, role: 'Owner' }]);
  if (url.includes('/rest/v1/external_integrations')) {
    if ((options.method || 'GET').toUpperCase() === 'POST') {
      const body = JSON.parse(options.body || '{}');
      writes.push(body);
      const safe = { id: 'connection-1', name: body.name, base_url: body.base_url, api_key_hint: body.api_key_hint };
      return json(wantsSingle(options) ? safe : [safe], 201);
    }
    return json([]);
  }
  if (url.startsWith('https://provider.example.test/')) {
    return providerStatus === 200 ? json({ ok: true }) : json({ error: 'unauthorized' }, providerStatus);
  }
  throw new Error(`Unexpected request: ${url}`);
};

const { default: handler } = await import('../api/integration-keys.js');
const { decryptToken } = await import('../api/_crypto.js');

function response() {
  return {
    statusCode: 200,
    payload: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; }
  };
}

async function save(body) {
  const res = response();
  await handler({ method: 'POST', query: {}, headers: { authorization: `Bearer ${TOKEN}` }, body: { action: 'save-connection', ...body } }, res);
  return res;
}

let passed = 0;
let failed = 0;
async function test(name, fn) {
  writes = [];
  providerStatus = 200;
  try { await fn(); passed++; console.log('  PASS ', name); }
  catch (error) { failed++; console.log('  FAIL ', name); console.log('        ', error.message); }
}

console.log('=== External API key validation-before-save ===');

await test('provider-rejected key is not saved', async () => {
  providerStatus = 401;
  const res = await save({ name: 'CRM', baseUrl: 'https://provider.example.test/ping', apiKey: 'wrong-key' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.success, undefined);
  assert.match(res.payload.error, /rejected/i);
  assert.equal(writes.length, 0);
});

await test('valid key is encrypted and saved after provider confirmation', async () => {
  const res = await save({ name: 'CRM', baseUrl: 'https://provider.example.test/ping', apiKey: 'valid-secret-key' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.equal(res.payload.success, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].organization_id, ORG);
  assert.notEqual(writes[0].api_key_encrypted, 'valid-secret-key');
  assert.equal(await decryptToken(writes[0].api_key_encrypted), 'valid-secret-key');
});

await test('missing or private endpoint is rejected without saving', async () => {
  for (const baseUrl of ['', 'http://provider.example.test', 'https://127.0.0.1/internal']) {
    const res = await save({ name: 'CRM', baseUrl, apiKey: 'key' });
    assert.equal(res.statusCode, 400);
  }
  assert.equal(writes.length, 0);
});

console.log(`\n${failed ? `${failed} test(s) failed.` : `${passed} passed, 0 failed.`}`);
process.exit(failed ? 1 : 0);