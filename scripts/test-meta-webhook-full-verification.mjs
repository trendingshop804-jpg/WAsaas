// scripts/test-meta-webhook-full-verification.mjs
// Verification suite for WhatsApp AI auto-replies in server/api/meta-webhook.js
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.META_VERIFY_TOKEN = 'verify-me';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

const tenantOrgId = 'org_tenant_1';
const tenantPhoneNumberId = '1234567890';
const tenantAccessToken = 'EAATestTenantSpecificEncryptedTokenXYZ';

// In-memory mock database
const db = {
  connections: [
    {
      organization_id: tenantOrgId,
      phone_number_id: tenantPhoneNumberId,
      is_active: true,
      access_token_encrypted: tenantAccessToken,
      waba_id: 'waba_1'
    }
  ],
  agents: [
    {
      id: 'agent_1',
      organization_id: tenantOrgId,
      business_name: 'NexusLead Tech',
      system_instructions: 'Answer customer questions accurately and concisely.',
      tone: 'professional and helpful',
      status: 'active',
      auto_reply_enabled: true,
      updated_at: new Date().toISOString()
    }
  ],
  knowledge: [
    {
      id: 'kb-company',
      organization_id: tenantOrgId,
      title: 'Company introduction',
      category: 'company',
      keywords: ['hello', 'services', 'hi', 'hey'],
      content: 'NexusLead Tech provides website development, SEO, and digital marketing services.',
      is_active: true
    },
    {
      id: 'kb-website-price',
      organization_id: tenantOrgId,
      title: 'Website packages and verified prices',
      category: 'pricing',
      keywords: ['website', 'web', 'price', 'cost', 'package', 'pricing'],
      content: 'The verified Business Website package starts at INR 25,000.',
      is_active: true
    },
    {
      id: 'kb-seo',
      organization_id: tenantOrgId,
      title: 'SEO services',
      category: 'product',
      keywords: ['seo', 'google', 'ranking'],
      content: 'SEO services include technical audits, on-page SEO, and keyword tracking.',
      is_active: true
    }
  ],
  leads: [],
  conversations: [],
  messages: [],
  ai_reply_logs: []
};

// Spies and outbound captures
const metaOutboundCalls = [];
let openRouterCalls = [];
let providerMockHandler = null;

const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : String(input.url || input);
  const method = (init.method || 'GET').toUpperCase();
  const rawHeaders = init.headers || {};
  const getHeader = (name) => {
    if (typeof rawHeaders.get === 'function') return rawHeaders.get(name);
    return rawHeaders[name] || rawHeaders[name.toLowerCase()] || '';
  };
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const isSingle = () => String(getHeader('Accept')).includes('vnd.pgrst.object+json');

  // 1. Meta Graph API Outbound Message
  if (/graph\.facebook\.com\/v\d+\.\d+\/\d+\/messages/.test(url)) {
    const body = JSON.parse(init.body || '{}');
    metaOutboundCalls.push({
      url,
      headers: { Authorization: getHeader('Authorization') },
      body
    });
    return json({
      messaging_product: 'whatsapp',
      contacts: [{ input: body.to, wa_id: body.to }],
      messages: [{ id: `wamid.OUT_${Date.now()}` }]
    });
  }

  // 2. OpenRouter API
  if (url.includes('openrouter.ai/api/v1/chat/completions')) {
    const body = JSON.parse(init.body || '{}');
    openRouterCalls.push({ url, body, headers: rawHeaders });
    if (providerMockHandler) {
      return providerMockHandler(body);
    }
    return json({
      choices: [{ message: { content: 'This is a default AI response.' } }]
    });
  }

  // 3. Supabase REST API
  if (url.includes('/rest/v1/whatsapp_connections')) {
    return json(db.connections);
  }

  if (url.includes('/rest/v1/ai_agents')) {
    return json(db.agents);
  }

  if (url.includes('/rest/v1/ai_knowledge_base')) {
    return json(db.knowledge);
  }

  if (url.includes('/rest/v1/ai_reply_logs')) {
    if (method === 'POST') {
      const row = { id: `log_${Date.now()}`, ...JSON.parse(init.body) };
      db.ai_reply_logs.push(row);
      return json(isSingle() ? row : [row], 201);
    }
    if (url.includes('api_result') || url.includes('inbound_message_id')) {
      const match = url.match(/inbound_message_id%22%3A%22([^%"]+)/) ||
                    url.match(/inbound_message_id":\s*"([^"]+)/) ||
                    url.match(/inbound_message_id=eq\.([^&]+)/);
      const wanted = match ? match[1] : '';
      const found = db.ai_reply_logs.filter(l => l.api_result?.inbound_message_id === wanted || l.inbound_message_id === wanted);
      return json(found);
    }
    return json(db.ai_reply_logs);
  }

  if (url.includes('/rest/v1/leads')) {
    if (method === 'POST') {
      const row = { id: `lead_${Date.now()}`, score: 50, opted_out: false, ...JSON.parse(init.body) };
      db.leads.push(row);
      return json(isSingle() ? row : [row], 201);
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(init.body);
      const match = url.match(/id=eq\.([^&]+)/);
      const leadId = match ? match[1] : null;
      if (leadId) {
        const lead = db.leads.find(l => l.id === leadId);
        if (lead) Object.assign(lead, patch);
      }
      return json(isSingle() ? patch : [patch], 200);
    }
    return json(db.leads);
  }

  if (url.includes('/rest/v1/conversations')) {
    if (method === 'POST') {
      const row = { id: `conv_${Date.now()}`, mode: 'AI', unread_count: 0, ...JSON.parse(init.body) };
      db.conversations.push(row);
      return json(isSingle() ? row : [row], 201);
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(init.body);
      const match = url.match(/id=eq\.([^&]+)/);
      const convId = match ? match[1] : null;
      if (convId) {
        const conv = db.conversations.find(c => c.id === convId);
        if (conv) Object.assign(conv, patch);
      }
      return json(isSingle() ? patch : [patch], 200);
    }
    return json(db.conversations);
  }

  if (url.includes('/rest/v1/messages')) {
    if (method === 'POST') {
      const row = { id: `msg_${Date.now()}`, ...JSON.parse(init.body) };
      db.messages.push(row);
      return json(isSingle() ? row : [row], 201);
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(init.body);
      return json(isSingle() ? patch : [patch], 200);
    }
    if (url.includes('wa_message_id=eq.')) {
      const match = url.match(/wa_message_id=eq\.([^&]+)/);
      const waId = match ? match[1] : '';
      const found = db.messages.filter(m => m.wa_message_id === waId);
      return json(found);
    }
    if (url.includes('conversation_id=eq.')) {
      const match = url.match(/conversation_id=eq\.([^&]+)/);
      const convId = match ? match[1] : '';
      const found = db.messages.filter(m => m.conversation_id === convId);
      return json(found);
    }
    return json(db.messages);
  }

  if (url.includes('/rest/v1/follow_up_messages')) {
    return json([], 200);
  }

  throw new Error(`Unexpected fetch to ${url}`);
};

const { default: webhookHandler } = await import('../server/api/meta-webhook.js');
const {
  isOptOut,
  pauseLeadFollowUp,
  handleLeadOptOut,
  sanitizeSecretString,
  sanitizeErrorDetails
} = await import('../server/api/_ai-reply.js');

function mockRes() {
  return {
    statusCode: null,
    payload: null,
    body: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(b) { this.payload = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; }
  };
}

function buildMetaPayload(text, messageId, from = '919876543210', phoneNumberId = tenantPhoneNumberId) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ wa_id: from, profile: { name: 'Customer' } }],
              messages: [
                {
                  id: messageId,
                  from,
                  type: 'text',
                  text: { body: text }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

function resetDb() {
  db.leads = [];
  db.conversations = [];
  db.messages = [];
  db.ai_reply_logs = [];
  db.agents[0].status = 'active';
  db.agents[0].auto_reply_enabled = true;
  metaOutboundCalls.length = 0;
  openRouterCalls.length = 0;
  providerMockHandler = null;
}

const getReplyLog = (id) =>
  db.ai_reply_logs.find(l => l.api_result?.inbound_message_id === id || l.inbound_message_id === id);

let passed = 0;
let total = 0;

async function runTestCase(description, fn) {
  total++;
  resetDb();
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${description}`);
  } catch (err) {
    console.error(`  FAIL: ${description}`);
    console.error(err);
  }
}

console.log('=== WhatsApp AI Auto-Replies Verification Suite ===\n');

// 1. Greeting Test
await runTestCase('greeting: uses tenant company knowledge and replies with greeting/intro', async () => {
  providerMockHandler = () =>
    new Response(JSON.stringify({
      choices: [{ message: { content: 'Hello! Welcome to NexusLead Tech. How can we help you today?' } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const res = mockRes();
  const payload = buildMetaPayload('Hi', 'wamid.GREETING_1');
  await webhookHandler({ method: 'POST', body: payload }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(metaOutboundCalls.length, 1, 'Expected exactly one outbound WhatsApp message');
  assert.match(metaOutboundCalls[0].body.text.body, /Welcome to NexusLead Tech/i);
  assert.equal(metaOutboundCalls[0].headers.Authorization, `Bearer ${tenantAccessToken}`);

  const log = getReplyLog('wamid.GREETING_1');
  assert.ok(log, 'Outcome must be persisted to ai_reply_logs');
  assert.equal(log.status, 'sent');
  assert.equal(log.api_result.intent, 'greeting');
  assert.ok(log.api_result.selected_knowledge.some(s => s.id === 'kb-company'));
});

// 2. Website Price Test
await runTestCase('website price: answers directly using verified website pricing knowledge', async () => {
  providerMockHandler = (body) => {
    // Assert knowledge base passed into prompt contains verified price
    const systemPrompt = body.messages.find(m => m.role === 'system')?.content || '';
    assert.match(systemPrompt, /INR 25,000/);
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'Our verified Business Website package starts at INR 25,000.' } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const res = mockRes();
  const payload = buildMetaPayload('What is your website price?', 'wamid.PRICE_1');
  await webhookHandler({ method: 'POST', body: payload }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(metaOutboundCalls.length, 1);
  assert.match(metaOutboundCalls[0].body.text.body, /INR 25,000/);

  const log = getReplyLog('wamid.PRICE_1');
  assert.ok(log);
  assert.equal(log.api_result.intent, 'website_pricing');
  assert.ok(log.api_result.selected_knowledge.some(s => s.id === 'kb-website-price'));
});

// 3. SEO Inquiry Test
await runTestCase('SEO: grounds reply in verified SEO services knowledge', async () => {
  providerMockHandler = () =>
    new Response(JSON.stringify({
      choices: [{ message: { content: 'Our verified SEO services include technical audits, on-page SEO, and keyword tracking.' } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const res = mockRes();
  const payload = buildMetaPayload('Do you provide SEO services?', 'wamid.SEO_1');
  await webhookHandler({ method: 'POST', body: payload }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(metaOutboundCalls.length, 1);
  assert.match(metaOutboundCalls[0].body.text.body, /technical audits/i);

  const log = getReplyLog('wamid.SEO_1');
  assert.ok(log);
  assert.equal(log.api_result.intent, 'seo');
  assert.ok(log.api_result.selected_knowledge.some(s => s.id === 'kb-seo'));
});

// 4. Contextual Follow-up Test
await runTestCase('contextual follow-up: "How much?" resolves to website pricing using chat history', async () => {
  // Pre-seed conversation and earlier message
  const leadId = 'lead_context_1';
  const convId = 'conv_context_1';
  db.leads.push({ id: leadId, organization_id: tenantOrgId, phone: '919876543210' });
  db.conversations.push({ id: convId, organization_id: tenantOrgId, lead_id: leadId, channel: 'whatsapp', mode: 'AI' });
  db.messages.push({
    organization_id: tenantOrgId,
    conversation_id: convId,
    direction: 'inbound',
    content: 'I need a website for my business',
    body: 'I need a website for my business',
    received_at: new Date(Date.now() - 60000).toISOString()
  });

  providerMockHandler = (body) => {
    // Verify history was passed to LLM
    const hasPriorContext = body.messages.some(m => m.content.includes('I need a website'));
    assert.ok(hasPriorContext, 'Prior user context must be present in history');
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'For a business website, our verified package starts at INR 25,000.' } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const res = mockRes();
  const payload = buildMetaPayload('How much?', 'wamid.FOLLOWUP_1');
  await webhookHandler({ method: 'POST', body: payload }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(metaOutboundCalls.length, 1);
  assert.match(metaOutboundCalls[0].body.text.body, /INR 25,000/);

  const log = getReplyLog('wamid.FOLLOWUP_1');
  assert.ok(log);
  assert.equal(log.api_result.intent, 'website_pricing');
  assert.ok(log.api_result.selected_knowledge.some(s => s.id === 'kb-website-price'));
});

// 5. Missing Knowledge Clarification Test
await runTestCase('missing knowledge: asks honest clarification without generic greeting or hallucination', async () => {
  providerMockHandler = () => {
    assert.fail('Provider should not be called when no knowledge matches');
  };

  const res = mockRes();
  const payload = buildMetaPayload('Do you offer drone filming for weddings?', 'wamid.MISSING_1');
  await webhookHandler({ method: 'POST', body: payload }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(metaOutboundCalls.length, 1);
  const sentText = metaOutboundCalls[0].body.text.body;
  assert.match(sentText, /don't have verified information/i);
  assert.doesNotMatch(sentText, /Hi thanks for getting in touch/i);

  const log = getReplyLog('wamid.MISSING_1');
  assert.ok(log);
  assert.equal(log.api_result.fallback_reason, 'knowledge_not_found');
  assert.equal(log.api_result.provider_outcome, 'not_called');
});

// 6. Provider Failure Test
await runTestCase('provider failure: sends no message and logs provider_failed safely', async () => {
  providerMockHandler = () =>
    new Response(JSON.stringify({ error: { message: 'Rate limit exceeded', code: 429 } }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    });

  const res = mockRes();
  const payload = buildMetaPayload('Tell me about your SEO', 'wamid.PROV_FAIL_1');
  await webhookHandler({ method: 'POST', body: payload }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(metaOutboundCalls.length, 0, 'Must NOT send any WhatsApp message on provider failure');

  const log = getReplyLog('wamid.PROV_FAIL_1');
  assert.ok(log);
  assert.equal(log.api_result.send_result, 'not_attempted');
  assert.equal(log.api_result.fallback_reason, 'provider_failed');
  assert.equal(log.api_result.provider_error_code, '429');
});

// 7. Duplicate Webhook Events Test
await runTestCase('duplicate webhook events: processes first delivery and drops second without double send', async () => {
  providerMockHandler = () =>
    new Response(JSON.stringify({
      choices: [{ message: { content: 'Our verified Business Website package starts at INR 25,000.' } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const payload = buildMetaPayload('What is your website price?', 'wamid.DUPE_EVENT_1');

  // First delivery
  const res1 = mockRes();
  await webhookHandler({ method: 'POST', body: payload }, res1);
  assert.equal(res1.statusCode, 200);
  assert.equal(metaOutboundCalls.length, 1, 'First delivery sends one reply');

  // Immediate redelivery with same wamid
  const res2 = mockRes();
  await webhookHandler({ method: 'POST', body: payload }, res2);
  assert.equal(res2.statusCode, 200);
  assert.equal(metaOutboundCalls.length, 1, 'Duplicate delivery MUST NOT trigger a second send');
  assert.equal(openRouterCalls.length, 1, 'Duplicate delivery MUST NOT call AI provider again');
});

// 8. Manual Mode Test
await runTestCase('manual mode: conversation marked Manual skips AI auto-reply', async () => {
  // Pre-seed manual conversation
  const leadId = 'lead_manual_1';
  db.leads.push({ id: leadId, organization_id: tenantOrgId, phone: '919876543210' });
  db.conversations.push({ id: 'conv_manual_1', organization_id: tenantOrgId, lead_id: leadId, channel: 'whatsapp', mode: 'Manual' });

  const res = mockRes();
  const payload = buildMetaPayload('What is your website price?', 'wamid.MANUAL_1');
  await webhookHandler({ method: 'POST', body: payload }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(metaOutboundCalls.length, 0, 'No message sent in manual mode');

  const log = getReplyLog('wamid.MANUAL_1');
  assert.ok(log);
  assert.equal(log.api_result.fallback_reason, 'conversation_manual_mode');
});

// 9. Disabled Auto-Reply Test
await runTestCase('disabled auto-reply: inactive or disabled AI agent skips reply', async () => {
  db.agents[0].auto_reply_enabled = false;

  const res = mockRes();
  const payload = buildMetaPayload('What is your website price?', 'wamid.DISABLED_1');
  await webhookHandler({ method: 'POST', body: payload }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(metaOutboundCalls.length, 0, 'No message sent when auto-reply is disabled');

  const log = getReplyLog('wamid.DISABLED_1');
  assert.ok(log);
  assert.equal(log.api_result.fallback_reason, 'agent_not_enabled_or_schema_unavailable');
});

// 10. Opt-Out Test
await runTestCase('opt-out: "stop" marks lead opted out, pauses follow-ups, and skips AI reply', async () => {
  const res = mockRes();
  const payload = buildMetaPayload('Stop please, do not contact me', 'wamid.OPTOUT_1');
  await webhookHandler({ method: 'POST', body: payload }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(metaOutboundCalls.length, 0, 'No AI reply sent on opt-out');

  const lead = db.leads[0];
  assert.ok(lead);
  assert.equal(lead.opted_out, true, 'Lead must be marked as opted_out: true');
  assert.equal(lead.follow_up_status, 'Paused', 'Lead follow-up must be paused');

  const log = getReplyLog('wamid.OPTOUT_1');
  assert.ok(log);
  assert.equal(log.api_result.fallback_reason, 'opt_out');
});

// 11. Tenant-Specific Credentials Test
await runTestCase('tenant credentials: outbound reply strictly uses tenant token from whatsapp_connections', async () => {
  providerMockHandler = () =>
    new Response(JSON.stringify({
      choices: [{ message: { content: 'The verified Business Website package starts at INR 25,000.' } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const res = mockRes();
  const payload = buildMetaPayload('What is your website price?', 'wamid.CREDS_1');
  await webhookHandler({ method: 'POST', body: payload }, res);

  assert.equal(metaOutboundCalls.length, 1);
  assert.equal(metaOutboundCalls[0].headers.Authorization, `Bearer ${tenantAccessToken}`);
  assert.notEqual(metaOutboundCalls[0].headers.Authorization, 'Bearer global-fallback-token');
});

// 12. Secret Redaction Test
await runTestCase('secret safety: sanitizeSecretString strips Meta tokens and Bearer credentials', async () => {
  const dirty = `Send failed: Bearer EAAVmysecrettoken1234567890123456 with access_token=EAAVsecret!`;
  const clean = sanitizeSecretString(dirty);
  assert.ok(!clean.includes('EAAVmysecrettoken1234567890123456'));
  assert.ok(!clean.includes('EAAVsecret!'));
  assert.match(clean, /\[REDACTED\]|\[REDACTED_META_TOKEN\]/);

  const errorObj = sanitizeErrorDetails(new Error(dirty));
  assert.ok(!errorObj.message.includes('EAAVmysecrettoken'));
});

// 13. Follow-Up Pause Test
await runTestCase('prevent double sends: pauseLeadFollowUp pauses active scheduled follow-ups', async () => {
  const leadId = 'lead_fup_1';
  db.leads.push({ id: leadId, organization_id: tenantOrgId, phone: '919876543210', follow_up_status: 'Scheduled' });

  // Simulate admin client
  const admin = {
    from: (table) => ({
      update: (patch) => ({
        eq: (col, val) => ({
          in: (statusCol, statuses) => {
            const lead = db.leads.find(l => l.id === val);
            if (lead && statuses.includes(lead[statusCol])) Object.assign(lead, patch);
            return Promise.resolve({ error: null });
          }
        })
      })
    })
  };

  await pauseLeadFollowUp(admin, leadId);
  const lead = db.leads.find(l => l.id === leadId);
  assert.equal(lead.follow_up_status, 'Paused');
  assert.equal(lead.status, 'Replied');
});

globalThis.fetch = realFetch;

console.log(`\nVerification Complete: ${passed}/${total} test cases passed.`);
assert.equal(passed, total, `Expected all ${total} tests to pass, but only ${passed} passed.`);
