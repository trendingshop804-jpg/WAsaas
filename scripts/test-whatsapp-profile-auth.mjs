import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'mock-publishable-key';
process.env.WHATSAPP_ACCESS_TOKEN = 'global-token-must-not-be-used';
process.env.PHONE_NUMBER_ID = 'global-phone-id-must-not-be-used';

const ORG_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const USER_A = 'user-a-0000-0000-0000-000000000001';
const outboundUrls = [];

function json(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

globalThis.fetch = async (input, options = {}) => {
  const url = String(input?.url || input);
  outboundUrls.push(url);

  if (url.includes('/auth/v1/user')) {
    const auth = String(options.headers?.Authorization || options.headers?.authorization || '');
    return /valid-session/.test(auth)
      ? json({ id: USER_A, email: 'owner-a@example.test' })
      : json({ msg: 'invalid token' }, 401);
  }
  if (url.includes('/rest/v1/organization_users')) {
    return json([{ user_id: USER_A, organization_id: ORG_A, role: 'Owner' }]);
  }
  if (url.includes('/rest/v1/whatsapp_connections')) {
    return json([]);
  }
  if (url.includes('graph.facebook.com')) {
    throw new Error(`Meta request must not run without a tenant connection: ${url}`);
  }
  throw new Error(`Unexpected request: ${url}`);
};

const { default: handler } = await import('../api/_update-whatsapp-profile.js');

function mockRes() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; }
  };
}

async function call(headers, body) {
  outboundUrls.length = 0;
  const res = mockRes();
  await handler({ method: 'POST', headers, body }, res);
  return res;
}

const unauthenticated = await call({}, { action: 'fetch_profile' });
assert.equal(unauthenticated.statusCode, 401);
assert.equal(unauthenticated.payload.code, 'AUTH_REQUIRED');
assert.equal(outboundUrls.length, 0, 'signed-out profile requests must not query Supabase or Meta');

const maliciousFallback = await call(
  { authorization: 'Bearer valid-session' },
  {
    action: 'fetch_profile',
    organizationId: ORG_B,
    accessToken: 'attacker-controlled-token',
    phoneNumberId: 'attacker-controlled-phone-id'
  }
);
assert.equal(maliciousFallback.statusCode, 409);
assert.equal(maliciousFallback.payload.code, 'NO_WHATSAPP_CONNECTION');
assert.ok(outboundUrls.some(url => url.includes('/rest/v1/whatsapp_connections')));
assert.ok(outboundUrls.some(url => decodeURIComponent(url).includes(`organization_id=eq.${ORG_A}`)));
assert.ok(!outboundUrls.some(url => decodeURIComponent(url).includes(ORG_B)));
assert.ok(!outboundUrls.some(url => url.includes('graph.facebook.com')));

const channelSource = fs.readFileSync(new URL('../nextbright-crm/js/wa-channels.js', import.meta.url), 'utf8');
assert.doesNotMatch(channelSource, /DOMContentLoaded['"],\s*init/);
assert.doesNotMatch(channelSource, /return fetch\(['"]\/api\/update-whatsapp-profile/);

const socialSource = fs.readFileSync(new URL('../nextbright-crm/js/social-integrations.js', import.meta.url), 'utf8');
assert.doesNotMatch(socialSource, /DOMContentLoaded[\s\S]{0,120}initSocialIntegrations/);

console.log('PASS WhatsApp profile auth gating and tenant isolation');
