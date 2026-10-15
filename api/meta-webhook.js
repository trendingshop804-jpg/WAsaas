import { createSupabaseAdminClient, missingSupabaseServerConfig } from './_supabase.js';

const MEDIA_TYPES = new Set(['image', 'document', 'audio', 'video', 'sticker']);
const STATUS_MAP = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };
const digits = value => String(value || '').replace(/\D/g, '');
function readableContent(message) {
  const type = String(message?.type || 'unknown');
  if (type === 'text') return typeof message.text?.body === 'string' && message.text.body.trim() ? message.text.body.trim() : 'WhatsApp text message did not include readable content.';
  if (type === 'interactive') return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || 'Interactive WhatsApp reply without readable label.';
  if (type === 'button') return message.button?.text || 'WhatsApp button reply without readable label.';
  if (type === 'location') return message.location?.name || message.location?.address || (message.location ? `Location: ${message.location.latitude}, ${message.location.longitude}` : 'WhatsApp location without readable details.');
  if (type === 'contacts') return message.contacts?.[0]?.name?.formatted_name || 'WhatsApp contact card without readable name.';
  if (MEDIA_TYPES.has(type)) return message[type]?.caption || `${type[0].toUpperCase()}${type.slice(1)} attachment (no caption).`;
  return `Unsupported WhatsApp message type: ${type}`;
}
async function findOrCreateLead(admin, organizationId, sender, contactName) {
  const normalized = digits(sender);
  const { data: existing } = await admin.from('leads').select('id').eq('organization_id', organizationId).eq('phone_normalized', normalized).maybeSingle();
  if (existing?.id) return existing.id;
  const name = contactName || `WhatsApp contact (+${sender})`;
  const { data, error } = await admin.from('leads').insert({ organization_id: organizationId, name, contact_name: name, phone: sender, phone_normalized: normalized, source: 'WhatsApp', status: 'Replied' }).select('id').single();
  if (error?.code === '23505') { const retry = await admin.from('leads').select('id').eq('organization_id', organizationId).eq('phone_normalized', normalized).maybeSingle(); return retry.data?.id || null; }
  if (error) throw error;
  return data?.id || null;
}
async function findOrCreateConversation(admin, organizationId, leadId) {
  const { data: current } = await admin.from('conversations').select('id').eq('organization_id', organizationId).eq('lead_id', leadId).eq('channel', 'whatsapp').maybeSingle();
  if (current?.id) return current.id;
  const { data, error } = await admin.from('conversations').insert({ organization_id: organizationId, lead_id: leadId, channel: 'whatsapp', mode: 'Manual', unread_count: 0 }).select('id').single();
  if (error) throw error;
  return data?.id || null;
}
async function applyStatuses(admin, statuses) {
  for (const receipt of statuses || []) {
    const status = STATUS_MAP[String(receipt?.status || '').toLowerCase()];
    if (!receipt?.id || !status) continue;
    const update = { status };
    if (status === 'failed') { update.error_code = String(receipt.errors?.[0]?.code || 'META_SEND_FAILED'); update.error_message = receipt.errors?.[0]?.title || receipt.errors?.[0]?.message || 'Meta reported delivery failure.'; }
    await admin.from('messages').update(update).eq('wa_message_id', receipt.id);
  }
}
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const expected = String(process.env.META_VERIFY_TOKEN || process.env.WEBHOOK_VERIFY_TOKEN || '').trim();
    if (req.query?.['hub.mode'] === 'subscribe' && expected && req.query?.['hub.verify_token'] === expected) return res.status(200).send(req.query['hub.challenge']);
    return res.status(403).send('Forbidden');
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const admin = createSupabaseAdminClient();
  if (!admin) return res.status(503).json({ error: 'Server database configuration is unavailable.', missing: missingSupabaseServerConfig() });
  const values = (req.body?.entry || []).flatMap(entry => (entry.changes || []).map(change => change.value)).filter(Boolean);
  await applyStatuses(admin, values.flatMap(value => Array.isArray(value.statuses) ? value.statuses : []));
  let stored = 0;
  for (const value of values) {
    const phoneNumberId = value.metadata?.phone_number_id;
    const messages = Array.isArray(value.messages) ? value.messages : [];
    if (!messages.length) continue;
    const { data: connection } = await admin.from('whatsapp_connections').select('organization_id').eq('phone_number_id', phoneNumberId).eq('is_active', true).maybeSingle();
    if (!connection?.organization_id) { console.error('[meta-webhook] inbound payload ignored: no active tenant channel for phone_number_id', phoneNumberId); continue; }
    for (const message of messages) {
      if (!message?.id || !message?.from) continue;
      const { data: duplicate } = await admin.from('messages').select('id').eq('wa_message_id', message.id).maybeSingle();
      if (duplicate?.id) continue;
      try {
        const contact = value.contacts?.find(item => item.wa_id === message.from)?.profile?.name || '';
        const leadId = await findOrCreateLead(admin, connection.organization_id, message.from, contact);
        if (!leadId) throw new Error('Unable to link inbound message to a lead.');
        const conversationId = await findOrCreateConversation(admin, connection.organization_id, leadId);
        if (!conversationId) throw new Error('Unable to link inbound message to a conversation.');
        const type = String(message.type || 'unsupported');
        const content = readableContent(message);
        const media = MEDIA_TYPES.has(type) ? message[type] : null;
        const { error } = await admin.from('messages').insert({ organization_id: connection.organization_id, lead_id: leadId, conversation_id: conversationId, wa_message_id: message.id, sender_number: message.from, direction: 'inbound', channel: 'whatsapp', message_type: MEDIA_TYPES.has(type) || ['text','interactive','button','location','contacts'].includes(type) ? type : 'unsupported', content, body: content, message_body: content, media_caption: media?.caption || null, file_name: media?.filename || null, status: 'delivered', received_at: new Date().toISOString() });
        if (error) throw error;
        await admin.from('conversations').update({ last_message: content, last_timestamp: new Date().toISOString() }).eq('id', conversationId);
        stored += 1;
      } catch (error) { console.error('[meta-webhook] inbound message failed', message.id, error.message); }
    }
  }
  return res.status(200).json({ received: true, stored });
}

