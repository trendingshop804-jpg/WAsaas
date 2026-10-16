import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'mock-publishable-key';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = 'audit-user';
const TOKEN = 'audit-session';

const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body,
  text: async () => JSON.stringify(body)
});

globalThis.fetch = async (input, options = {}) => {
  const url = String(input?.url || input);
  const auth = String(options?.headers?.Authorization || options?.headers?.authorization || '');
  if (url.includes('/auth/v1/user')) return auth.includes(TOKEN) ? json({ id: USER, email: 'audit@example.test' }) : json({ message: 'invalid' }, 401);
  if (url.includes('/rest/v1/organization_users')) return json([{ user_id: USER, organization_id: ORG, role: 'Owner' }]);
  if (['external_integrations', 'organization_api_keys', 'ai_agents', 'ai_knowledge_base', 'ai_reply_logs'].some(table => url.includes(`/rest/v1/${table}`))) {
    return json({ code: 'PGRST205', message: 'table missing from schema cache' }, 404);
  }
  throw new Error(`Unexpected request: ${url}`);
};

const integrationKeys = (await import('../api/integration-keys.js')).default;
const aiChat = (await import('../api/ai-chat.js')).default;
const { readableContent } = await import('../api/meta-webhook.js');

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

async function call(handler, request) {
  const res = response();
  await handler({ method: 'GET', query: {}, headers: {}, body: {}, ...request }, res);
  return res;
}

const integrationResult = await call(integrationKeys, { headers: { authorization: `Bearer ${TOKEN}` } });
assert.equal(integrationResult.statusCode, 200);
assert.equal(integrationResult.payload.code, 'INTEGRATION_SCHEMA_MISSING');
assert.deepEqual(integrationResult.payload.connections, []);
assert.deepEqual(integrationResult.payload.apiKeys, []);

const unauthenticatedAi = await call(aiChat, { query: { route: 'ai-agents', action: 'list' } });
assert.equal(unauthenticatedAi.statusCode, 401);
assert.equal(unauthenticatedAi.payload.code, 'AUTH_REQUIRED');

const missingAiSchema = await call(aiChat, {
  query: { route: 'ai-agents', action: 'list' },
  headers: { authorization: `Bearer ${TOKEN}` }
});
assert.equal(missingAiSchema.statusCode, 503);
assert.equal(missingAiSchema.payload.code, 'AI_SCHEMA_MISSING');

assert.equal(readableContent({ type: 'reaction', reaction: { emoji: '👍' } }), 'Reaction: 👍');
assert.match(readableContent({ type: 'system', system: { type: 'user_changed_number' } }), /system notice/i);
assert.match(readableContent({ type: 'unknown_future_type' }), /unknown_future_type/);
assert.doesNotMatch(readableContent({ type: 'unknown_future_type' }), /^\[unsupported/i);

const aiSource = fs.readFileSync(new URL('../api/ai-chat.js', import.meta.url), 'utf8');
assert.doesNotMatch(aiSource, /source:\s*['"]default['"]/);
assert.doesNotMatch(aiSource, /Starter Plan is \$49/);
assert.doesNotMatch(aiSource, /Hi! Thanks for contacting \$\{agent\.business_name\}/);

const agentUi = fs.readFileSync(new URL('../nextbright-crm/js/ai-agents.js', import.meta.url), 'utf8');
assert.doesNotMatch(agentUi, /Default reply logs active/);
assert.doesNotMatch(agentUi, /Grounded fallback using local Knowledge Base/);

const edgeWebhook = fs.readFileSync(new URL('../supabase/functions/meta-webhook/index.ts', import.meta.url), 'utf8');
assert.doesNotMatch(edgeWebhook, /Thanks for asking! I can share the right pricing/);
assert.doesNotMatch(edgeWebhook, /Hi! Thanks for getting in touch\. How can I help you today\?/);
assert.match(edgeWebhook, /\.eq\("auto_reply_enabled", true\)/);
assert.match(edgeWebhook, /No verified knowledge matched; message left for human review/);
assert.match(edgeWebhook, /If the answer is not explicitly present, return an empty response instead of guessing/);

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.ok(vercel.rewrites.some(rule => rule.source === '/api/ai-agents' && rule.destination.includes('/api/ai-chat')));
assert.ok(vercel.rewrites.some(rule => rule.source === '/api/knowledge-base' && rule.destination.includes('/api/ai-chat')));

const migration = fs.readFileSync(new URL('../supabase/migrations/20261016154255_install_integration_ai_storage.sql', import.meta.url), 'utf8');
assert.match(migration, /auto_reply_enabled boolean not null default false/i);
assert.match(migration, /public\.organization_users/i);
assert.doesNotMatch(migration, /select organization_id from public\.profiles/i);

console.log('PASS live-audit regressions: honest schema state, authenticated AI, and no demo replies');
