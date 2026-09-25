// scripts/test-send-media.mjs
// Offline smoke test for api/send-media.js. Stubs global fetch so no real
// Meta / Supabase calls are made. Run with: node scripts/test-send-media.mjs
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.WHATSAPP_ACCESS_TOKEN = 'test-wa-token';
process.env.PHONE_NUMBER_ID = '1234567890';

const calls = { mediaUpload: [], messages: [], storage: [], insert: [] };

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : String(input.url || input);
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  if (url.includes('/media') && url.includes('graph.facebook.com')) {
    calls.mediaUpload.push({ url, body: init.body });
    return json({ id: 'META_MEDIA_123' });
  }
  if (url.includes('/messages') && url.includes('graph.facebook.com')) {
    calls.messages.push({ url, body: JSON.parse(init.body) });
    return json({ messages: [{ id: 'wamid.TEST123' }] });
  }
  if (url.includes('/storage/v1/object/sign/')) {
    return json({ signedURL: '/object/sign/whatsapp-media/x?token=abc' });
  }
  if (url.includes('/storage/v1/object/')) {
    const path = decodeURIComponent(url.split('/storage/v1/object/')[1] || '');
    calls.storage.push(path);
    return json({ Key: path.replace(/^whatsapp-media\//, '') });
  }
  if (url.includes('/rest/v1/messages')) {
    calls.insert.push(JSON.parse(init.body));
    return json([], 201);
  }
  if (url.includes('/rest/v1/conversations')) {
    return json([{ id: 'conv_1' }]);
  }
  throw new Error(`Unexpected fetch to ${url}`);
};

const { default: handler } = await import('../api/send-media.js');

function mockRes() {
  const res = {
    statusCode: null,
    payload: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
    end() { return this; },
  };
  return res;
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

console.log('=== api/send-media.js ===');

await test('accepts the fileBase64 field the frontend actually sends', async () => {
  const res = mockRes();
  await handler({
    method: 'POST',
    body: {
      fileBase64: Buffer.from('hello world').toString('base64'),
      messageType: 'image',
      leadId: 'lead_1',
      senderNumber: '+919999999999',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      caption: 'look',
    },
  }, res);
  assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${JSON.stringify(res.payload)}`);
  assert.equal(res.payload.messageId, 'wamid.TEST123');
});

await test('rejects a request with no file', async () => {
  const res = mockRes();
  await handler({ method: 'POST', body: { leadId: 'l', senderNumber: '+91999' } }, res);
  assert.equal(res.statusCode, 400);
});

await test('storage path does not double the file extension', async () => {
  calls.storage.length = 0;
  const res = mockRes();
  await handler({
    method: 'POST',
    body: {
      fileBase64: Buffer.from('%PDF-1.4 fake').toString('base64'),
      leadId: 'lead_1',
      senderNumber: '+919999999999',
      fileName: 'quote.pdf',
      mimeType: 'application/pdf',
    },
  }, res);
  assert.equal(res.statusCode, 200);
  const path = calls.storage.at(-1) || '';
  assert.ok(path.endsWith('quote.pdf'), `path should end with quote.pdf, got ${path}`);
  assert.ok(!/quote\.pdf\.pdf/.test(path), `path double-extended: ${path}`);
});

await test('xlsx mime does not leak a vendor string into the path', async () => {
  calls.storage.length = 0;
  const res = mockRes();
  await handler({
    method: 'POST',
    body: {
      fileBase64: Buffer.from('fake xlsx').toString('base64'),
      leadId: 'lead_1',
      senderNumber: '+919999999999',
      fileName: 'report',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  }, res);
  const path = calls.storage.at(-1) || '';
  assert.ok(path.endsWith('report.xlsx'), `expected .xlsx suffix, got ${path}`);
  assert.ok(!path.includes('vnd.openxml'), `vendor mime leaked into path: ${path}`);
});

await test('documents are sent to Meta with a filename', async () => {
  calls.messages.length = 0;
  const res = mockRes();
  await handler({
    method: 'POST',
    body: {
      fileBase64: Buffer.from('%PDF-1.4 fake').toString('base64'),
      messageType: 'document',
      leadId: 'lead_1',
      senderNumber: '+919999999999',
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      caption: 'Your invoice',
    },
  }, res);
  const sent = calls.messages.at(-1).body;
  assert.equal(sent.type, 'document');
  assert.equal(sent.document.filename, 'invoice.pdf');
  assert.equal(sent.document.caption, 'Your invoice');
});

await test('DB row stores a storage path and the response carries a fetchable URL', async () => {
  calls.insert.length = 0;
  const res = mockRes();
  await handler({
    method: 'POST',
    body: {
      fileBase64: Buffer.from('hello').toString('base64'),
      messageType: 'image',
      leadId: 'lead_1',
      senderNumber: '+919999999999',
      fileName: 'pic.png',
      mimeType: 'image/png',
    },
  }, res);
  const row = calls.insert.at(-1);
  const inserted = Array.isArray(row) ? row[0] : row;
  assert.ok(!/^https?:\/\//.test(inserted.media_url), `media_url should be a path, got ${inserted.media_url}`);
  assert.equal(inserted.media_size, 5);
  assert.ok(/^https?:\/\//.test(res.payload.mediaPublicUrl || ''), 'response should include an http(s) media URL');
});

globalThis.fetch = realFetch;
console.log(failures === 0 ? '\nAll send-media tests passed.' : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
