import assert from 'node:assert/strict';
import {
  chronologicalHistory,
  decideAutoReply,
  detectIntent,
  selectKnowledge
} from '../supabase/functions/meta-webhook/ai-reply.mjs';

const agent = {
  id: 'agent-a',
  business_name: 'Example Business',
  system_instructions: 'Answer directly from verified business information.',
  tone: 'Professional'
};

const knowledge = [
  {
    id: 'kb-company',
    title: 'Company introduction',
    category: 'company',
    keywords: ['hello', 'services'],
    content: 'Example Business provides website development, SEO, and digital marketing services.'
  },
  {
    id: 'kb-website-price',
    title: 'Website packages and verified prices',
    category: 'pricing',
    keywords: ['website', 'web', 'price', 'cost', 'package'],
    content: 'The verified Business Website package starts at INR 25,000.'
  },
  {
    id: 'kb-website',
    title: 'Website development',
    category: 'product',
    keywords: ['website', 'landing page', 'ecommerce'],
    content: 'Website projects can include responsive pages, contact forms, and ecommerce.'
  },
  {
    id: 'kb-seo',
    title: 'SEO services',
    category: 'product',
    keywords: ['seo', 'google', 'ranking'],
    content: 'SEO services include technical audits, on-page SEO, and keyword tracking.'
  },
  {
    id: 'kb-marketing',
    title: 'Digital marketing',
    category: 'product',
    keywords: ['digital marketing', 'ads', 'campaign'],
    content: 'Digital marketing services include campaign planning and paid ads management.'
  }
];

const successProvider = reply => async context => ({
  ok: true,
  outcome: 'success',
  text: typeof reply === 'function' ? reply(context) : reply
});

async function caseTest(name, run) {
  await run();
  console.log(`PASS ${name}`);
}

await caseTest('greeting uses tenant company knowledge', async () => {
  const result = await decideAutoReply({
    agent,
    knowledge,
    history: [],
    userMessage: 'Hi',
    provider: successProvider('Hello! How can we help with your business today?')
  });
  assert.equal(result.shouldSend, true);
  assert.equal(result.intent, 'greeting');
  assert.ok(result.sources.some(source => source.id === 'kb-company'));
});

await caseTest('website pricing selects verified website price', async () => {
  const result = await decideAutoReply({
    agent,
    knowledge,
    history: [],
    userMessage: 'What is your website price?',
    provider: successProvider(context => {
      assert.ok(context.sources.some(source => source.id === 'kb-website-price'));
      return 'The verified Business Website package starts at INR 25,000.';
    })
  });
  assert.equal(result.intent, 'website_pricing');
  assert.equal(result.reply, 'The verified Business Website package starts at INR 25,000.');
});

await caseTest('SEO inquiry selects SEO knowledge', async () => {
  const result = await decideAutoReply({
    agent,
    knowledge,
    history: [],
    userMessage: 'Do you provide SEO?',
    provider: successProvider(context => {
      assert.equal(context.sources[0].id, 'kb-seo');
      return 'Yes. Our verified SEO services include technical audits, on-page SEO, and keyword tracking.';
    })
  });
  assert.equal(result.intent, 'seo');
  assert.match(result.reply, /technical audits/i);
});

await caseTest('digital marketing selects marketing knowledge', async () => {
  const result = await decideAutoReply({
    agent,
    knowledge,
    history: [],
    userMessage: 'Tell me about digital marketing',
    provider: successProvider(context => {
      assert.equal(context.sources[0].id, 'kb-marketing');
      return 'Our verified digital marketing services include campaign planning and paid ads management.';
    })
  });
  assert.equal(result.intent, 'digital_marketing');
});

await caseTest('How much uses chronological website context', async () => {
  const history = [
    { direction: 'outbound', content: 'What kind of project do you need?', received_at: '2026-10-16T10:02:00Z' },
    { direction: 'inbound', content: 'I need a website', received_at: '2026-10-16T10:01:00Z' }
  ];
  const ordered = chronologicalHistory(history);
  assert.equal(ordered[0].content, 'I need a website');
  assert.equal(detectIntent('How much?', history), 'website_pricing');

  const result = await decideAutoReply({
    agent,
    knowledge,
    history,
    userMessage: 'How much?',
    provider: successProvider(context => {
      assert.equal(context.history[0].content, 'I need a website');
      assert.ok(context.sources.some(source => source.id === 'kb-website-price'));
      return 'For the website we discussed, the verified Business Website package starts at INR 25,000.';
    })
  });
  assert.equal(result.shouldSend, true);
  assert.match(result.reply, /INR 25,000/);
});

await caseTest('unknown information asks one honest clarification', async () => {
  const result = await decideAutoReply({
    agent,
    knowledge,
    history: [],
    userMessage: 'Do you offer drone filming?',
    provider: async () => assert.fail('provider must not be called without relevant knowledge')
  });
  assert.equal(result.replyKind, 'clarification');
  assert.equal(result.providerOutcome, 'not_called');
  assert.equal(result.fallbackReason, 'knowledge_not_found');
  assert.match(result.reply, /don't have verified information/i);
  assert.equal((result.reply.match(/\?/g) || []).length, 1);
});

await caseTest('provider failure sends no generic fallback', async () => {
  const result = await decideAutoReply({
    agent,
    knowledge,
    history: [],
    userMessage: 'Tell me about SEO',
    provider: async () => ({ ok: false, outcome: 'http_error', errorCode: '429' })
  });
  assert.equal(result.shouldSend, false);
  assert.equal(result.reply, '');
  assert.equal(result.fallbackReason, 'provider_failed');
  assert.equal(result.providerErrorCode, '429');
});

await caseTest('repetitive generic provider reply is blocked', async () => {
  const result = await decideAutoReply({
    agent,
    knowledge,
    history: [],
    userMessage: 'Tell me about SEO',
    provider: successProvider('Hi! Thanks for getting in touch. How can I help you today?')
  });
  assert.equal(result.shouldSend, false);
  assert.equal(result.fallbackReason, 'unsafe_or_repeated_reply');
});

await caseTest('duplicate webhook delivery produces one reply decision', async () => {
  const seenMessageIds = new Set();
  let providerCalls = 0;
  const mockWebhook = async messageId => {
    if (seenMessageIds.has(messageId)) return { duplicate: true, decision: null };
    seenMessageIds.add(messageId);
    const decision = await decideAutoReply({
      agent,
      knowledge,
      history: [],
      userMessage: 'What is your website price?',
      provider: async () => {
        providerCalls += 1;
        return { ok: true, outcome: 'success', text: 'The verified Business Website package starts at INR 25,000.' };
      }
    });
    return { duplicate: false, decision };
  };

  const first = await mockWebhook('wamid.same-message');
  const second = await mockWebhook('wamid.same-message');
  assert.equal(first.decision.shouldSend, true);
  assert.equal(second.duplicate, true);
  assert.equal(providerCalls, 1);
});

assert.ok(selectKnowledge(knowledge, 'website price').some(source => source.id === 'kb-website-price'));
console.log('PASS mocked Meta webhook AI scenarios: 9/9');
