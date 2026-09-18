// scripts/test-instagram-integration.mjs
// Offline unit test for Instagram API routes and Webhook DM ingestion.
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.INTEGRATION_ENCRYPT_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.META_VERIFY_TOKEN = 'verify-me';

const state = {
  graphPost: [],
  inserts: [],
  updates: [],
  storage: [],
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : String(input.url || input);
  const headers = init.headers || {};
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  // Instagram Graph API send
  if (url.includes('graph.facebook.com') && url.includes('/messages')) {
    state.graphPost.push({ url, body: JSON.parse(init.body || '{}'), headers });
    return json({ recipient_id: 'ig_user_1', message_id: 'mid.ig_test_123' });
  }

  // Instagram Media Download
  if (url.includes('cdninstagram.com') || url.includes('fbcdn.net')) {
    return new Response(Buffer.from('fake image content'), {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' },
    });
  }

  // Supabase Storage
  if (url.includes('/storage/v1/object/')) {
    const path = decodeURIComponent(url.split('/storage/v1/object/')[1] || '');
    state.storage.push(path);
    return json({ Key: path.replace(/^whatsapp-media\//, '') });
  }

  // Supabase Database queries
  if (url.includes('/rest/v1/instagram_connections')) {
    return json([{
      organization_id: 'org_1',
      page_id: 'page_123',
      instagram_business_id: 'ig_biz_456',
      instagram_username: 'test_brand',
      access_token_encrypted: 'mock_enc_token',
      is_active: true
    }]);
  }

  if (url.includes('/rest/v1/messages')) {
    if ((init.method || 'GET').toUpperCase() === 'POST') {
      const payload = JSON.parse(init.body);
      state.inserts.push({ table: 'messages', data: payload });
      return json([], 201);
    }
    return json([]);
  }

  if (url.includes('/rest/v1/instagram_messages')) {
    return json([], 201);
  }

  if (url.includes('/rest/v1/conversations')) {
    if ((init.method || 'GET').toUpperCase() === 'PATCH') {
      state.updates.push({ table: 'conversations', data: JSON.parse(init.body) });
      return json([], 200);
    }
    return json([{ id: 'conv_ig_1' }]);
  }

  if (url.includes('/rest/v1/leads')) {
    if ((init.method || 'GET').toUpperCase() === 'POST') {
      state.inserts.push({ table: 'leads', data: JSON.parse(init.body) });
      return json([{ id: 'lead_ig_1' }]);
    }
    return json([]);
  }

  throw new Error(`Unexpected fetch to ${url}`);
};

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
    end() { return this; },
  };
}

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL  ${name}\n        ${err.message}`);
  }
}

console.log('=== Instagram Integration Tests ===');

const { default: webhook } = await import('../api/meta-webhook.js');

await test('Instagram DM webhook ingests inbound text message and creates lead/conversation with channel=instagram', async () => {
  state.inserts.length = 0;
  state.updates.length = 0;

  const res = mockRes();
  const igPayload = {
    object: 'instagram',
    entry: [{
      id: 'ig_biz_456',
      time: Date.now(),
      messaging: [{
        sender: { id: 'customer_ig_999' },
        recipient: { id: 'ig_biz_456' },
        timestamp: Date.now(),
        message: {
          mid: 'mid.inbound_ig_1',
          text: 'Hello from Instagram DM!'
        }
      }]
    }]
  };

  await webhook({ method: 'POST', body: igPayload }, res);
  assert.equal(res.statusCode, 200);

  const insertedMsg = state.inserts.find(i => i.table === 'messages');
  assert.ok(insertedMsg, 'Message row was inserted');
  assert.equal(insertedMsg.data.channel, 'instagram');
  assert.equal(insertedMsg.data.content, 'Hello from Instagram DM!');
  assert.equal(insertedMsg.data.direction, 'inbound');
  assert.equal(insertedMsg.data.sender_number, 'customer_ig_999');
});

await test('Instagram DM webhook processes photo attachment and uploads to storage', async () => {
  state.inserts.length = 0;
  state.storage.length = 0;

  const res = mockRes();
  const igMediaPayload = {
    object: 'instagram',
    entry: [{
      id: 'ig_biz_456',
      time: Date.now(),
      messaging: [{
        sender: { id: 'customer_ig_999' },
        recipient: { id: 'ig_biz_456' },
        timestamp: Date.now(),
        message: {
          mid: 'mid.inbound_ig_photo',
          attachments: [{
            type: 'image',
            payload: { url: 'https://cdninstagram.com/v/t51/photo.jpg' }
          }]
        }
      }]
    }]
  };

  await webhook({ method: 'POST', body: igMediaPayload }, res);
  assert.equal(res.statusCode, 200);

  const insertedMsg = state.inserts.find(i => i.table === 'messages');
  assert.ok(insertedMsg, 'Media message row was inserted');
  assert.equal(insertedMsg.data.channel, 'instagram');
  assert.equal(insertedMsg.data.message_type, 'image');
  assert.ok(insertedMsg.data.media_url, 'Media url stored');
});

globalThis.fetch = realFetch;
console.log(failures === 0 ? '\nAll Instagram integration tests passed.' : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
