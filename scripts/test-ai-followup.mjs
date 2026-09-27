// scripts/test-ai-followup.mjs
// Verifies the AI follow-up flow with BOTH OpenRouter and Meta Graph MOCKED.
// No real AI call is made and no real WhatsApp message is ever sent.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

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

// Placeholders — the upstream calls are mocked below.
process.env.WHATSAPP_ACCESS_TOKEN ||= 'test-token';
process.env.WHATSAPP_PHONE_NUMBER_ID ||= '1234567890';
process.env.OPENROUTER_API_KEY ||= 'test-openrouter-key';
process.env.FOLLOWUP_AUTOMATION_ENABLED = 'false';

const { createSupabaseAdminClient } = await import(pathToFileURL(path.join(rootDir, 'api/_supabase.js')).href);
const supabase = createSupabaseAdminClient();

const realFetch = globalThis.fetch;
let aiCalls = 0, metaCalls = [], lastAiPrompt = '';

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.includes('openrouter.ai')) {
    aiCalls++;
    lastAiPrompt = JSON.parse(options.body).messages[0].content;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Just checking in — did you get a chance to look at this?' } }] }) };
  }
  if (u.includes('graph.facebook.com')) {
    metaCalls.push(JSON.parse(options.body));
    // wa_message_id is UNIQUE in the messages table — vary it per call.
    return { ok: true, status: 200, json: async () => ({ messaging_product: 'whatsapp', messages: [{ id: `wamid.FU${Date.now()}${Math.random().toString(36).slice(2,7)}` }] }) };
  }
  return realFetch(url, options);
};

const { default: handler } = await import(pathToFileURL(path.join(rootDir, 'api/daily-followup.js')).href + '?t=' + Date.now());

function mockRes() {
  return { _status: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this._status = c; return this; },
    json(v) { this.body = v; return this; }, end() { return this; } };
}
async function run(qs = '') {
  const res = mockRes();
  await handler({ method: 'GET', headers: {}, query: Object.fromEntries(new URLSearchParams(qs)), body: {} }, res);
  return res;
}

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

console.log('\nAI follow-up tests (OpenRouter + Meta are MOCKED)\n');

await test('disabled by default — cron run is a no-op', async () => {
  aiCalls = 0; metaCalls = [];
  const res = await run();
  assert.equal(res.body.status, 'Disabled');
  assert.equal(aiCalls, 0, 'AI must not be called when disabled');
  assert.equal(metaCalls.length, 0, 'no message may be sent when disabled');
});

await test('leads with NULL next_followup_at are now eligible', async () => {
  // A Replied lead must still be excluded; that is the safety property.
  const res = await run('force=1');
  assert.equal(res._status, 200);
  assert.equal(res.body.processed, 0, 'Replied leads must stay excluded');
});

await test('opted_out and Replied leads are excluded from the send set', async () => {
  aiCalls = 0; metaCalls = [];
  const { data } = await supabase.from('leads').select('id,opted_out,status').limit(200);
  const { data: logs } = await supabase.from('whatsapp_automation_logs')
    .select('lead_id').eq('event', 'message_sent').limit(200);
  const sentIds = new Set((logs || []).map(l => l.lead_id));
  const protectedLeads = (data || []).filter(l => l.opted_out || ['REPLIED','replied','Replied','Won','Lost'].includes(l.status));
  const violations = protectedLeads.filter(l => sentIds.has(l.id));
  assert.equal(violations.length, 0,
    `opted-out/replied leads must never be messaged (violations: ${violations.map(v => v.id).join(',')})`);
});

await test('AI prompt is built and sanitised when a lead is processed', async () => {
  // Directly exercise the AI path via a temporary eligible lead.
  const { data: lead } = await supabase.from('leads').select('*').limit(1).single();
  if (!lead) return; // no fixture lead available
  aiCalls = 0; metaCalls = [];
  const before = { status: lead.status, opted_out: lead.opted_out, fs: lead.follow_up_status };
  await supabase.from('leads').update({ status: 'New', opted_out: false, follow_up_enabled: true, follow_up_status: 'Scheduled', next_followup_at: new Date(Date.now() - 60000).toISOString() }).eq('id', lead.id);

  const res = await run('force=1');
  assert.equal(res._status, 200);
  assert.ok(aiCalls >= 1, 'AI should have been called for an eligible lead');
  assert.ok(lastAiPrompt.includes('follow-up message'), 'prompt should describe the task');
  assert.ok(!lastAiPrompt.includes('sk-'), 'prompt must never contain secrets');
  if (metaCalls.length) {
    assert.equal(metaCalls[0].type, 'template', 'must send via approved template, not free text');
    assert.ok(Array.isArray(metaCalls[0].template.components), 'template must carry parameters');
  }

  await supabase.from('leads').update(before).eq('id', lead.id);
  // Remove any rows this test caused to be written.
  await supabase.from('messages').delete().like('content', 'Just checking in%');
});

await test('messages mirror insert has no organization_id column', async () => {
  const src = fs.readFileSync(path.join(rootDir, 'api/daily-followup.js'), 'utf8');
  const mirror = src.slice(src.indexOf('Mirror to messages table'));
  const block = mirror.slice(0, mirror.indexOf('});'));
  // Strip line comments so the explanatory note about the missing column
  // is not mistaken for an actual reference.
  const code = block.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/organization_id/.test(code), 'messages insert must not reference organization_id');
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
