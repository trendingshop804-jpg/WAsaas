// scripts/test-webhook-media.mjs
// Offline smoke test for api/meta-webhook.js and api/messages.js.
// Stubs global fetch — no real Meta / Supabase calls. Run with:
//   node scripts/test-webhook-media.mjs
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.WHATSAPP_ACCESS_TOKEN = 'test-wa-token';
process.env.META_VERIFY_TOKEN = 'verify-me';

const state = {
  mediaLookup: [],
  mediaDownload: [],
  storage: [],
  inserts: [],
  selectResult: [],
  rows: [],
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : String(input.url || input);
  const headers = init.headers || {};
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  // Meta media metadata lookup
  if (/graph\.facebook\.com\/v\d+\.\d+\/MEDIA_\w+/.test(url)) {
    state.mediaLookup.push({ url, headers });
    return json({
      url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=MEDIA_1',
      mime_type: 'application/pdf',
      filename: 'quote.pdf',
      file_size: 11,
    });
  }
  // Meta binary download
  if (url.includes('lookaside.fbsbx.com')) {
    state.mediaDownload.push({ url, headers });
    if (!headers.Authorization) {
      return new Response('Unauthorized', { status: 401 });
    }
    return new Response(Buffer.from('fake pdf!!!'), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    });
  }
  if (url.includes('/storage/v1/object/sign/')) {
    return json({ signedURL: '/object/sign/whatsapp-media/x?token=abc' });
  }
  if (url.includes('/storage/v1/object/')) {
    const path = decodeURIComponent(url.split('/storage/v1/object/')[1] || '');
    state.storage.push(path);
    return json({ Key: path.replace(/^whatsapp-media\//, '') });
  }
  if (url.includes('/rest/v1/messages')) {
    if ((init.method || 'GET').toUpperCase() === 'POST') {
      state.inserts.push(JSON.parse(init.body));
      return json([], 201);
    }
    // The webhook's duplicate check filters on wa_message_id; the messages API
    // does a plain ordered select.
    return json(url.includes('wa_message_id=eq.') ? state.selectResult : state.rows);
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

const { default: webhook } = await import('../api/meta-webhook.js');
const { default: messages } = await import('../api/messages.js');

function mediaPayload(type, mediaId) {
  return {
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: '1234567890' },
          messages: [{
            id: `wamid.${mediaId}`,
            from: '919999999999',
            type,
            [type]: { id: mediaId, mime_type: 'application/pdf', filename: 'quote.pdf' },
          }],
        },
      }],
    }],
  };
}

console.log('=== api/meta-webhook.js ===');

await test('GET verifies with the correct token', async () => {
  const res = mockRes();
  await webhook({ method: 'GET', query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': 'CH123' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, 'CH123');
});

await test('GET rejects a wrong token', async () => {
  const res = mockRes();
  await webhook({ method: 'GET', query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': 'CH' } }, res);
  assert.equal(res.statusCode, 403);
});

await test('media download sends the bearer token to lookaside', async () => {
  state.mediaDownload.length = 0;
  state.selectResult = [];
  const res = mockRes();
  await webhook({ method: 'POST', body: mediaPayload('document', 'MEDIA_1') }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(state.mediaDownload.length, 1, 'expected one binary download');
  assert.equal(state.mediaDownload[0].headers.Authorization, 'Bearer test-wa-token');
});

await test('inbound media row stores a clean storage path and real size', async () => {
  state.storage.length = 0;
  state.inserts.length = 0;
  state.selectResult = [];
  const res = mockRes();
  await webhook({ method: 'POST', body: mediaPayload('document', 'MEDIA_2') }, res);
  const row = state.inserts.at(-1);
  const inserted = Array.isArray(row) ? row[0] : row;
  assert.equal(inserted.direction, 'inbound');
  assert.ok(inserted.media_url.endsWith('quote.pdf'), `unexpected path: ${inserted.media_url}`);
  assert.ok(!/quote\.pdf\.pdf/.test(inserted.media_url), `double extension: ${inserted.media_url}`);
  assert.equal(inserted.media_size, 11);
  assert.equal(inserted.media_mime_type, 'application/pdf');
});

await test('duplicate delivery is skipped without re-downloading media', async () => {
  state.mediaDownload.length = 0;
  state.inserts.length = 0;
  state.selectResult = [{ id: 'existing-row' }];
  const res = mockRes();
  await webhook({ method: 'POST', body: mediaPayload('document', 'MEDIA_3') }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(state.inserts.length, 0, 'duplicate should not insert');
  assert.equal(state.mediaDownload.length, 0, 'duplicate should not download media');
});

console.log('=== api/messages.js ===');

await test('storage paths are converted to signed URLs', async () => {
  state.rows = [{
    id: 1, wa_message_id: 'w1', sender_number: '919999999999', content: 'x',
    message_type: 'image', direction: 'inbound', received_at: new Date().toISOString(),
    media_url: '9999999999/MEDIA_9/MEDIA_9_pic.png', media_mime_type: 'image/png',
    file_name: 'pic.png', media_caption: null, media_size: 5,
  }];
  const res = mockRes();
  await messages({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(/^https?:\/\//.test(res.payload.messages[0].media_url), `not a URL: ${res.payload.messages[0].media_url}`);
});

await test('legacy rows holding a full URL are passed through untouched', async () => {
  const legacyUrl = 'https://test-project.supabase.co/storage/v1/object/public/whatsapp-media/legacy.png';
  state.rows = [{
    id: 2, wa_message_id: 'w2', sender_number: '919999999999', content: 'x',
    message_type: 'image', direction: 'inbound', received_at: new Date().toISOString(),
    media_url: legacyUrl, media_mime_type: 'image/png',
    file_name: 'legacy.png', media_caption: null, media_size: 5,
  }];
  const res = mockRes();
  await messages({ method: 'GET' }, res);
  assert.equal(res.payload.messages[0].media_url, legacyUrl);
});

await test('text messages are returned unchanged', async () => {
  state.rows = [{
    id: 3, wa_message_id: 'w3', sender_number: '919999999999', content: 'hello',
    message_type: 'text', direction: 'inbound', received_at: new Date().toISOString(),
    media_url: null, media_mime_type: null, file_name: null, media_caption: null, media_size: 0,
  }];
  const res = mockRes();
  await messages({ method: 'GET' }, res);
  assert.equal(res.payload.messages[0].content, 'hello');
  assert.equal(res.payload.messages[0].media_url, null);
});

globalThis.fetch = realFetch;
console.log(failures === 0 ? '\nAll webhook/messages tests passed.' : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
