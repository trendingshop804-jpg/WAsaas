// scripts/test-webhook-media.mjs
// Comprehensive smoke test for api/meta-webhook.js and api/messages.js.
// Stubs global fetch — no real Meta / Supabase calls. Run with:
//   node scripts/test-webhook-media.mjs
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.WHATSAPP_ACCESS_TOKEN = 'test-wa-token';
process.env.META_VERIFY_TOKEN = 'verify-me';

const state = {
  mediaLookup: [],
  mediaDownload: [],
  storage: [],
  inserts: [],
  updates: [],
  selectResult: [],
  leadsInDb: [],
  conversationsInDb: [],
  connectionsInDb: [{ organization_id: 'org_1', phone_number_id: '1234567890', is_active: true, access_token: 'test-tenant-token' }],
  rows: [],
};

const realFetch = globalThis.fetch;

// Columns that actually exist on public.conversations.
const CONVERSATION_COLUMNS = new Set([
  'id', 'organization_id', 'lead_id', 'mode', 'unread_count',
  'last_message', 'last_timestamp', 'created_at', 'updated_at', 'channel',
]);
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : String(input.url || input);
  const method = (init.method || 'GET').toUpperCase();
  const rawHeaders = init.headers || {};
  // supabase-js passes a Headers object, not a plain object
  const getHeader = (name) => {
    if (typeof rawHeaders.get === 'function') return rawHeaders.get(name);
    return rawHeaders[name] || rawHeaders[name.toLowerCase()] || '';
  };
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const isSingle = () => String(getHeader('Accept')).includes('vnd.pgrst.object+json');

  // Apply PostgREST query-string filters to an in-memory table.
  //
  // Without this the mock ignored every .eq()/.in()/.gte() and returned the whole
  // table for any GET. That silently broke duplicate suppression: api/messages.js
  // asks for outbound rows with matching content inside a time window and then
  // narrows by phone in JS, so a filter-ignoring mock let an *inbound* row match
  // and the response carried messageId: undefined.
  //
  // PostgREST puts the operator in the VALUE (content=eq.hello), not the key.
  const applyQuery = (rows, queryString) => {
    const params = new URLSearchParams(queryString || '');
    let out = [...rows];

    for (const [key, value] of params.entries()) {
      if (key === 'select') continue;

      if (value.startsWith('eq.')) {
        const col = key, want = value.slice(3);
        out = out.filter(r => (want === 'null' ? r[col] == null : r[col] != null && String(r[col]) === want));
        continue;
      }
      if (value.startsWith('in.(') && value.endsWith(')')) {
        const col = key;
        const wanted = value.slice(4, -1).split(',');
        out = out.filter(r => wanted.includes(String(r[col])));
        continue;
      }
      if (value.startsWith('gte.')) {
        const col = key, want = value.slice(4);
        out = out.filter(r => {
          if (r[col] == null) return false;
          const a = new Date(r[col]).getTime();
          const b = new Date(want).getTime();
          if (Number.isNaN(a) || Number.isNaN(b)) return String(r[col]) >= want;
          return a >= b;
        });
        continue;
      }
      if (key === 'order') {
        const parts = value.split('.');
        const col = parts[0];
        const sign = parts[1] === 'desc' ? -1 : 1;
        out.sort((a, b) => {
          const av = a[col] == null, bv = b[col] == null;
          if (av && bv) return 0;
          if (av) return 1;   // nulls last
          if (bv) return -1;
          const an = new Date(a[col]).getTime(), bn = new Date(b[col]).getTime();
          if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * sign;
          return (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * sign;
        });
        continue;
      }
    }

    const limit = parseInt(params.get('limit') || '', 10);
    if (Number.isFinite(limit) && limit > 0) out = out.slice(0, limit);
    return out;
  };

  // Meta media metadata lookup
  if (/graph\.facebook\.com\/v\d+\.\d+\/MEDIA_\w+/.test(url)) {
    state.mediaLookup.push({ url, headers: rawHeaders });
    return json({
      url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=MEDIA_1',
      mime_type: 'application/pdf',
      filename: 'quote.pdf',
      file_size: 11,
    });
  }
  // Meta binary download
  if (url.includes('lookaside.fbsbx.com')) {
    state.mediaDownload.push({ url, headers: rawHeaders });
    if (!getHeader('Authorization')) {
      return new Response('Unauthorized', { status: 401 });
    }
    return new Response(Buffer.from('fake pdf!!!'), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    });
  }
  // Meta Cloud API messages sending
  if (/graph\.facebook\.com\/v\d+\.\d+\/\d+\/messages/.test(url)) {
    return json({
      messaging_product: 'whatsapp',
      contacts: [{ input: '918111986637', wa_id: '918111986637' }],
      messages: [{ id: 'wamid.OUTBOUND_123' }],
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
  if (url.includes('/auth/v1/user')) {
    const auth = getHeader('Authorization');
    if (!/test-session-token/.test(auth)) return json({ msg: 'invalid' }, 401);
    return json({ id: 'user_1', aud: 'authenticated' });
  }
  if (url.includes('/rest/v1/organization_users')) {
    return json([{ organization_id: 'org_1', user_id: 'user_1', role: 'Owner' }]);
  }
  if (url.includes('/rest/v1/organizations')) {
    return json([{ id: 'org_1', name: 'NextBright Solutions', product_description: 'CRM Services' }]);
  }
  if (url.includes('/rest/v1/whatsapp_connections')) {
    const pIdMatch = url.match(/phone_number_id=eq\.([^&]+)/);
    if (pIdMatch) {
      const pId = pIdMatch[1];
      const match = state.connectionsInDb.filter(c => c.phone_number_id === pId && c.is_active);
      return json(match);
    }
    return json(state.connectionsInDb);
  }
  if (url.includes('/rest/v1/leads')) {
    if (method === 'POST') {
      const body = JSON.parse(init.body);
      const newLead = { id: `lead_${Date.now()}`, ...body };
      state.leadsInDb.push(newLead);
      return json(isSingle() ? newLead : [newLead], 201);
    }
    if (method === 'PATCH') {
      const patchBody = JSON.parse(init.body);
      state.updates.push({ table: 'leads', body: patchBody });
      return json(isSingle() ? patchBody : [patchBody], 200);
    }
    return json(state.leadsInDb);
  }
  if (url.includes('/rest/v1/conversations')) {
    if (method === 'POST') {
      const body = JSON.parse(init.body);
      // Mirror PostgREST: an unknown column rejects the whole INSERT. Without
      // this the suite happily accepted name/status/ai_active, which do not
      // exist on public.conversations - the real insert failed, the caller
      // swallowed it, and every inbound message was silently skipped.
      const unknown = Object.keys(body).filter(k => !CONVERSATION_COLUMNS.has(k));
      if (unknown.length) {
        return json({
          code: 'PGRST204',
          message: `Could not find the '${unknown[0]}' column of 'conversations' in the schema cache`,
          details: null,
          hint: null,
        }, 400);
      }
      const newConv = { id: `conv_${Date.now()}`, ...body };
      state.conversationsInDb.push(newConv);
      return json(isSingle() ? newConv : [newConv], 201);
    }
    if (method === 'PATCH') {
      state.updates.push({ table: 'conversations', body: JSON.parse(init.body) });
      return json([], 200);
    }
    return json(state.conversationsInDb);
  }
  if (url.includes('/rest/v1/messages')) {
    if (method === 'POST') {
      const body = JSON.parse(init.body);
      const insertedRow = { id: `msg_${Date.now()}`, ...body };
      state.inserts.push(insertedRow);
      return json(isSingle() ? insertedRow : [insertedRow], 201);
    }
    if (method === 'PATCH') {
      const patchBody = JSON.parse(init.body);
      state.updates.push({ table: 'messages', body: patchBody });
      return json(isSingle() ? patchBody : [patchBody], 200);
    }
    return json(url.includes('wa_message_id=eq.') ? state.selectResult : applyQuery(state.rows, url.split('?')[1]));
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

function mediaPayload(type, mediaId, phone = '919999999999', phoneNumberId = '1234567890') {
  return {
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: phoneNumberId },
          messages: [{
            id: `wamid.${mediaId}`,
            from: phone,
            type,
            [type]: { id: mediaId, mime_type: 'application/pdf', filename: 'quote.pdf' },
          }],
        },
      }],
    }],
  };
}

function textPayload(text, msgId, phone = '918111986637', phoneNumberId = '1234567890') {
  return {
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: phoneNumberId },
          contacts: [{ wa_id: phone, profile: { name: 'Praveen' } }],
          messages: [{
            id: `wamid.${msgId}`,
            from: phone,
            type: 'text',
            text: { body: text },
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
  assert.equal(state.mediaDownload[0].headers.Authorization, 'Bearer test-tenant-token');
  assert.notEqual(
    state.mediaDownload[0].headers.Authorization,
    `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    'media download must not use the global WhatsApp token'
  );
});

await test('inbound media row stores a clean storage path and real size', async () => {
  state.storage.length = 0;
  state.inserts.length = 0;
  state.selectResult = [];
  const res = mockRes();
  await webhook({ method: 'POST', body: mediaPayload('document', 'MEDIA_2') }, res);
  const row = state.inserts.find(i => i.wa_message_id === 'wamid.MEDIA_2');
  assert.ok(row, 'expected message insert for MEDIA_2');
  assert.equal(row.direction, 'inbound');
  assert.equal(row.organization_id, 'org_1');
  assert.ok(row.media_url.endsWith('quote.pdf'), `unexpected path: ${row.media_url}`);
  assert.ok(!/quote\.pdf\.pdf/.test(row.media_url), `double extension: ${row.media_url}`);
  assert.equal(row.media_size, 11);
  assert.equal(row.media_mime_type, 'application/pdf');
});

await test('inbound webhook matches existing lead with formatted India phone (+91 81119 86637)', async () => {
  state.inserts.length = 0;
  state.selectResult = [];
  state.leadsInDb = [
    { id: 'lead_existing_1', organization_id: 'org_1', name: 'Existing Customer', contact_name: 'Existing Customer', phone: '+91 81119 86637' }
  ];
  state.conversationsInDb = [
    { id: 'conv_existing_1', organization_id: 'org_1', lead_id: 'lead_existing_1', channel: 'whatsapp' }
  ];

  const res = mockRes();
  await webhook({ method: 'POST', body: textPayload('Hello from existing lead', 'MSG_MATCH_1', '918111986637') }, res);
  assert.equal(res.statusCode, 200);

  const insertedMsg = state.inserts.find(i => i.wa_message_id === 'wamid.MSG_MATCH_1');
  assert.ok(insertedMsg, 'message should be inserted');
  assert.equal(insertedMsg.organization_id, 'org_1', 'organization_id must be stamped');
  assert.equal(insertedMsg.conversation_id, 'conv_existing_1', 'conversation_id must link to existing conversation');
  assert.equal(insertedMsg.sender_number, '918111986637');
});

await test('inbound webhook for unknown sender creates lead and conversation properly', async () => {
  state.inserts.length = 0;
  state.selectResult = [];
  state.leadsInDb = [];
  state.conversationsInDb = [];

  const res = mockRes();
  await webhook({ method: 'POST', body: textPayload('Hello from new customer', 'MSG_NEW_1', '918111986637') }, res);
  assert.equal(res.statusCode, 200);

  assert.equal(state.leadsInDb.length, 1, 'lead should be created for new sender');
  const createdLead = state.leadsInDb[0];
  assert.equal(createdLead.organization_id, 'org_1');
  assert.ok(createdLead.name, 'name must NOT be null');
  assert.equal(createdLead.phone, '918111986637');

  assert.equal(state.conversationsInDb.length, 1, 'conversation should be created');
  const createdConv = state.conversationsInDb[0];
  assert.equal(createdConv.organization_id, 'org_1');
  assert.equal(createdConv.lead_id, createdLead.id);

  const insertedMsg = state.inserts.find(i => i.wa_message_id === 'wamid.MSG_NEW_1');
  assert.ok(insertedMsg, 'message should be inserted');
  assert.equal(insertedMsg.organization_id, 'org_1');
  assert.equal(insertedMsg.conversation_id, createdConv.id);
});

await test('inbound webhook when tenant mapping is missing safely skips without inserting un-isolated rows', async () => {
  state.inserts.length = 0;
  state.selectResult = [];
  const res = mockRes();
  // Pass unknown phone_number_id '9999999999' which has no connection in DB
  await webhook({ method: 'POST', body: textPayload('Unmapped number message', 'MSG_UNMAPPED', '918111986637', '9999999999') }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(state.inserts.length, 0, 'must not insert un-isolated messages for unmapped phone_number_id');
});

await test('delivery receipts update outbound message statuses in database', async () => {
  state.updates.length = 0;
  const statusPayload = {
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: '1234567890' },
          statuses: [
            { id: 'wamid.OUTBOUND_1', status: 'delivered', timestamp: '1700000000' },
            { id: 'wamid.OUTBOUND_2', status: 'read', timestamp: '1700000005' },
          ],
        },
      }],
    }],
  };
  const res = mockRes();
  await webhook({ method: 'POST', body: statusPayload }, res);
  assert.equal(res.statusCode, 200);
  const msgUpdates = state.updates.filter(u => u.table === 'messages');
  assert.ok(msgUpdates.length >= 2, 'expected delivery updates for outbound messages');
  assert.equal(msgUpdates[0].body.status, 'delivered');
  assert.equal(msgUpdates[1].body.status, 'read');
});

await test('an inbound message after a receipt change in the same Meta delivery is stored', async () => {
  state.inserts.length = 0;
  state.updates.length = 0;
  state.selectResult = [];
  state.leadsInDb = [];
  state.conversationsInDb = [];
  state.connectionsInDb = [{ organization_id: 'org_1', phone_number_id: '1234567890', is_active: true, access_token: 'test-tenant-token' }];

  const batch = {
    entry: [{
      changes: [
        { value: { metadata: { phone_number_id: '1234567890' }, statuses: [{ id: 'wamid.OLD', status: 'delivered' }] } },
        textPayload('message after receipt', 'MSG_AFTER_RECEIPT').entry[0].changes[0],
      ],
    }],
  };
  const res = mockRes();
  await webhook({ method: 'POST', body: batch }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(state.inserts.some(i => i.wa_message_id === 'wamid.MSG_AFTER_RECEIPT'), 'inbound message in a later change must be stored');
  assert.ok(state.updates.some(u => u.table === 'messages' && u.body.status === 'delivered'), 'receipt in the first change must still be applied');
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

// ---------------------------------------------------------------------------
// Inbound flow regressions: tenant resolution, lead match, conversation link
// ---------------------------------------------------------------------------

await test('inbound message is linked to BOTH lead_id and conversation_id', async () => {
  state.inserts.length = 0;
  state.selectResult = [];
  state.leadsInDb = [
    { id: 'lead_link_1', organization_id: 'org_1', name: 'Linked Lead', contact_name: 'Linked Lead', phone: '+91 81119 86637' }
  ];
  state.conversationsInDb = [
    { id: 'conv_link_1', organization_id: 'org_1', lead_id: 'lead_link_1', channel: 'whatsapp' }
  ];

  const res = mockRes();
  await webhook({ method: 'POST', body: textPayload('link me', 'MSG_LINK_1') }, res);
  assert.equal(res.statusCode, 200);

  const row = state.inserts.find(i => i.wa_message_id === 'wamid.MSG_LINK_1');
  assert.ok(row, 'inbound message must be stored');
  assert.equal(row.organization_id, 'org_1', 'organization_id must be stamped');
  assert.equal(row.lead_id, 'lead_link_1', 'lead_id must be linked');
  assert.equal(row.conversation_id, 'conv_link_1', 'conversation_id must be linked');
});

await test('new conversation is created with only columns that exist', async () => {
  state.inserts.length = 0;
  state.selectResult = [];
  state.leadsInDb = [];
  state.conversationsInDb = [];

  const res = mockRes();
  await webhook({ method: 'POST', body: textPayload('brand new sender', 'MSG_CONV_1') }, res);
  assert.equal(res.statusCode, 200);

  const conv = state.conversationsInDb.at(-1);
  assert.ok(conv, 'a conversation must have been created for the unknown sender');
  assert.equal(conv.organization_id, 'org_1');
  assert.ok(conv.lead_id, 'conversation must reference the created lead');
  assert.equal(conv.channel, 'whatsapp');
  for (const bad of ['name', 'status', 'ai_active']) {
    assert.equal(conv[bad], undefined, `conversations has no ${bad} column`);
  }

  const row = state.inserts.find(i => i.wa_message_id === 'wamid.MSG_CONV_1');
  assert.ok(row, 'message must be stored even though the lead/conversation are new');
  assert.equal(row.conversation_id, conv.id);
});

await test('unknown phone_number_id is dropped and writes nothing (fail closed)', async () => {
  state.inserts.length = 0;
  state.selectResult = [];
  state.leadsInDb = [];
  state.conversationsInDb = [];
  state.connectionsInDb = [{ organization_id: 'org_1', phone_number_id: '1234567890', is_active: true, access_token: 'test-tenant-token' }];

  const res = mockRes();
  await webhook({ method: 'POST', body: textPayload('unmapped number', 'MSG_UNMAPPED_1', '918111986637', '9999999999') }, res);

  assert.equal(res.statusCode, 200, 'must still ack so Meta does not retry-storm');
  assert.equal(state.inserts.filter(i => i.direction === 'inbound').length, 0, 'no un-attributed row may be written');
  assert.equal(state.conversationsInDb.length, 0, 'no conversation for an unmapped tenant');
});

await test('phone_number_id resolves to its own org, never a guessed one', async () => {
  state.inserts.length = 0;
  state.selectResult = [];
  state.leadsInDb = [];
  state.conversationsInDb = [];
  state.connectionsInDb = [
    { organization_id: 'org_1', phone_number_id: '1234567890', is_active: true, access_token: 'test-tenant-token' },
    { organization_id: 'org_2', phone_number_id: '5555555555', is_active: true, access_token: 'other-tenant-token' },
  ];

  const res = mockRes();
  await webhook({ method: 'POST', body: textPayload('other tenant', 'MSG_ORG_2', '919999999999', '5555555555') }, res);
  assert.equal(res.statusCode, 200);

  const row = state.inserts.find(i => i.wa_message_id === 'wamid.MSG_ORG_2');
  assert.ok(row, 'message must be stored');
  assert.equal(row.organization_id, 'org_2', 'must use the org that owns this phone_number_id');
  assert.notEqual(row.organization_id, 'org_1');
});

await test('an inactive connection is not used to resolve a tenant', async () => {
  state.inserts.length = 0;
  state.selectResult = [];
  state.leadsInDb = [];
  state.conversationsInDb = [];
  state.connectionsInDb = [
    { organization_id: 'org_1', phone_number_id: '1234567890', is_active: false, access_token: 'test-tenant-token' },
  ];

  const res = mockRes();
  await webhook({ method: 'POST', body: textPayload('inactive conn', 'MSG_INACTIVE_1') }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(state.inserts.filter(i => i.direction === 'inbound').length, 0, 'inactive connection must not attribute messages');
});

await test('a lead stored with a leading 0 still matches the full international sender', async () => {
  state.inserts.length = 0;
  state.selectResult = [];
  state.leadsInDb = [
    { id: 'lead_zero_1', organization_id: 'org_1', name: 'Zero Prefixed', contact_name: 'Zero Prefixed', phone: '08111986637' }
  ];
  state.conversationsInDb = [
    { id: 'conv_zero_1', organization_id: 'org_1', lead_id: 'lead_zero_1', channel: 'whatsapp' }
  ];
  state.connectionsInDb = [{ organization_id: 'org_1', phone_number_id: '1234567890', is_active: true, access_token: 'test-tenant-token' }];

  const res = mockRes();
  await webhook({ method: 'POST', body: textPayload('zero prefixed', 'MSG_ZERO_1') }, res);
  assert.equal(res.statusCode, 200);

  const row = state.inserts.find(i => i.wa_message_id === 'wamid.MSG_ZERO_1');
  assert.ok(row, 'message must be stored');
  assert.equal(row.lead_id, 'lead_zero_1', 'must reuse the existing lead, not create a duplicate');
  assert.equal(state.inserts.filter(i => i.direction === 'inbound' && i.lead_id === undefined).length, 0);
});

await test('a non-Indian lead number is matched without a 91 prefix being invented', async () => {
  state.inserts.length = 0;
  state.selectResult = [];
  state.leadsInDb = [
    { id: 'lead_us_1', organization_id: 'org_1', name: 'US Customer', contact_name: 'US Customer', phone: '14155551234' }
  ];
  state.conversationsInDb = [
    { id: 'conv_us_1', organization_id: 'org_1', lead_id: 'lead_us_1', channel: 'whatsapp' }
  ];
  state.connectionsInDb = [{ organization_id: 'org_1', phone_number_id: '1234567890', is_active: true, access_token: 'test-tenant-token' }];

  const res = mockRes();
  await webhook({ method: 'POST', body: textPayload('hello from the US', 'MSG_US_1', '14155551234') }, res);
  assert.equal(res.statusCode, 200);

  const row = state.inserts.find(i => i.wa_message_id === 'wamid.MSG_US_1');
  assert.ok(row, 'message must be stored');
  assert.equal(row.lead_id, 'lead_us_1', 'full international number must match the stored lead');
  assert.equal(row.sender_number, '14155551234', 'sender_number is stored exactly as Meta sent it');
});

await test('distinct numbers sharing their last 7 digits are NOT treated as one lead', async () => {
  state.inserts.length = 0;
  state.selectResult = [];
  state.leadsInDb = [
    { id: 'lead_a', organization_id: 'org_1', name: 'A', contact_name: 'A', phone: '919999900001' },
  ];
  state.conversationsInDb = [
    { id: 'conv_a', organization_id: 'org_1', lead_id: 'lead_a', channel: 'whatsapp' },
  ];
  state.connectionsInDb = [{ organization_id: 'org_1', phone_number_id: '1234567890', is_active: true, access_token: 'test-tenant-token' }];

  // Different country prefix, same trailing 7 digits.
  const res = mockRes();
  await webhook({ method: 'POST', body: textPayload('not the same person', 'MSG_SUFFIX_1', '141119900001') }, res);
  assert.equal(res.statusCode, 200);

  const row = state.inserts.find(i => i.wa_message_id === 'wamid.MSG_SUFFIX_1');
  assert.ok(row, 'message must still be stored for the genuinely different number');
  assert.notEqual(row.lead_id, 'lead_a', 'suffix overlap must never reuse another lead');
});

await test('one bad message does not discard the rest of the batch', async () => {
  state.inserts.length = 0;
  state.selectResult = [];
  state.leadsInDb = [];
  state.conversationsInDb = [];
  state.connectionsInDb = [{ organization_id: 'org_1', phone_number_id: '1234567890', is_active: true, access_token: 'test-tenant-token' }];

  const batch = textPayload('first', 'MSG_BATCH_1');
  const v = batch.entry[0].changes[0].value;
  v.messages.push({ id: 'wamid.MSG_BATCH_2', from: '918111986637', type: 'text', text: { body: 'second' } });
  v.messages.push({ id: 'wamid.MSG_BATCH_3', from: '918111986637', type: 'text', text: { body: 'third' } });

  const res = mockRes();
  await webhook({ method: 'POST', body: batch }, res);
  assert.equal(res.statusCode, 200);

  for (const id of ['wamid.MSG_BATCH_1', 'wamid.MSG_BATCH_2', 'wamid.MSG_BATCH_3']) {
    assert.ok(state.inserts.some(i => i.wa_message_id === id), `${id} must be stored`);
  }
  assert.equal(res.payload.stored, 3, 'acknowledgement reports how many were stored');
});

await test('inbound text is still stored when the connection has no access token', async () => {
  state.inserts.length = 0;
  state.selectResult = [];
  state.leadsInDb = [];
  state.conversationsInDb = [];
  state.connectionsInDb = [{ organization_id: 'org_1', phone_number_id: '1234567890', is_active: true }];

  const res = mockRes();
  await webhook({ method: 'POST', body: textPayload('no token configured', 'MSG_NOTOKEN_1') }, res);
  assert.equal(res.statusCode, 200);

  const row = state.inserts.find(i => i.wa_message_id === 'wamid.MSG_NOTOKEN_1');
  assert.ok(row, 'a missing token must not discard real inbound text');
  assert.equal(row.organization_id, 'org_1');
  assert.equal(row.content, 'no token configured');
});

await test('a message already stored is not duplicated', async () => {
  state.selectResult = [{ id: 'already_here' }];
  state.inserts.length = 0;
  const res = mockRes();
  await webhook({ method: 'POST', body: textPayload('duplicate', 'MSG_DUP_1') }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(state.inserts.filter(i => i.wa_message_id === 'wamid.MSG_DUP_1').length, 0, 'replayed webhook must not duplicate the row');
  state.selectResult = [];
});

// restore the default connection for the api/messages.js section
  state.connectionsInDb = [{ organization_id: 'org_1', phone_number_id: '1234567890', is_active: true, access_token: 'test-tenant-token' }];

console.log('=== api/messages.js ===');
const SESSION = { headers: { Authorization: 'Bearer test-session-token' } };

await test('rejects an unauthenticated inbox read', async () => {
  const res = mockRes();
  await messages({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 401);
});

await test('outbound WhatsApp message links to existing conversation and updates last_message', async () => {
  state.inserts.length = 0;
  state.updates.length = 0;
  state.leadsInDb = [
    { id: 'lead_out_1', organization_id: 'org_1', name: 'Lead User', contact_name: 'Lead User', phone: '+91 81119 86637' }
  ];
  state.conversationsInDb = [
    { id: 'conv_out_1', organization_id: 'org_1', lead_id: 'lead_out_1', channel: 'whatsapp' }
  ];
  state.rows = [
    { id: 'msg_recent_in', organization_id: 'org_1', sender_number: '918111986637', direction: 'inbound', received_at: new Date().toISOString() }
  ];

  const res = mockRes();
  await messages({
    method: 'POST',
    ...SESSION,
    query: {},
    body: { phone: '918111986637', text: 'Hello, your appointment is confirmed!' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  assert.equal(res.payload.messageId, 'wamid.OUTBOUND_123');

  // Production writes in two phases: INSERT the row as status='sending' before
  // calling Meta, then UPDATE it with the returned wa_message_id. The id only
  // exists on the UPDATE, so the id assertion belongs there, not on the insert.
  const inserted = state.inserts.find(i => i.direction === 'outbound' && i.content === 'Hello, your appointment is confirmed!');
  assert.ok(inserted, 'outbound message must be saved to database');
  assert.equal(inserted.organization_id, 'org_1', 'organization_id must be stamped');
  assert.equal(inserted.conversation_id, 'conv_out_1', 'conversation_id must link to existing conversation');
  assert.equal(inserted.direction, 'outbound');
  assert.equal(inserted.status, 'sending', 'must be queued as sending before the Meta call');

  const sentUpdate = state.updates.find(u => u.table === 'messages' && u.body.wa_message_id === 'wamid.OUTBOUND_123');
  assert.ok(sentUpdate, 'the queued row must be updated with the Meta message id');
  assert.equal(sentUpdate.body.status, 'sent');

  const convUpdate = state.updates.find(u => u.table === 'conversations');
  assert.ok(convUpdate, 'conversation last_message should be updated');
  assert.equal(convUpdate.body.last_message, 'Hello, your appointment is confirmed!');
});

await test('storage paths are converted to signed URLs', async () => {
  state.rows = [{
    id: 1, wa_message_id: 'w1', organization_id: 'org_1', sender_number: '919999999999', content: 'x',
    message_type: 'image', direction: 'inbound', received_at: new Date().toISOString(),
    media_url: '9999999999/MEDIA_9/MEDIA_9_pic.png', media_mime_type: 'image/png',
    file_name: 'pic.png', media_caption: null, media_size: 5,
  }];
  const res = mockRes();
  await messages({ method: 'GET', ...SESSION }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(/^https?:\/\//.test(res.payload.messages[0].media_url), `not a URL: ${res.payload.messages[0].media_url}`);
});

await test('legacy rows holding a full URL are passed through untouched', async () => {
  const legacyUrl = 'https://test-project.supabase.co/storage/v1/object/public/whatsapp-media/legacy.png';
  state.rows = [{
    id: 2, wa_message_id: 'w2', organization_id: 'org_1', sender_number: '919999999999', content: 'x',
    message_type: 'image', direction: 'inbound', received_at: new Date().toISOString(),
    media_url: legacyUrl, media_mime_type: 'image/png',
    file_name: 'legacy.png', media_caption: null, media_size: 5,
  }];
  const res = mockRes();
  await messages({ method: 'GET', ...SESSION }, res);
  assert.equal(res.payload.messages[0].media_url, legacyUrl);
});

await test('text messages are returned unchanged with enriched lead display name', async () => {
  state.leadsInDb = [
    { id: 'lead_1', organization_id: 'org_1', name: 'John Doe', contact_name: 'John Doe', phone: '+91 99999 99999' }
  ];
  state.rows = [{
    id: 3, wa_message_id: 'w3', organization_id: 'org_1', sender_number: '919999999999', content: 'hello',
    message_type: 'text', direction: 'inbound', received_at: new Date().toISOString(),
    media_url: null, media_mime_type: null, file_name: null, media_caption: null, media_size: 0,
  }];
  const res = mockRes();
  await messages({ method: 'GET', ...SESSION }, res);
  assert.equal(res.payload.messages[0].content, 'hello');
  assert.equal(res.payload.messages[0].media_url, null);
  assert.equal(res.payload.conversations[0].name, 'John Doe', 'thread name should be enriched from lead');
});

globalThis.fetch = realFetch;
console.log(failures === 0 ? '\nAll webhook/messages tests passed.' : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
