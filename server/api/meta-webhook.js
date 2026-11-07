import { createSupabaseAdminClient, missingSupabaseServerConfig } from './_supabase.js';
import { decryptToken } from './_crypto.js';
import {
  isOptOut,
  pauseLeadFollowUp,
  handleLeadOptOut,
  loadAutoReplyContext,
  fetchChatHistory,
  generateAIReply,
  decideAutoReply,
  parseAIResponse,
  updateLeadFromCRM,
  getTenantWhatsAppCredentials,
  sendWhatsAppReply,
  recordAIOutcome
} from './_ai-reply.js';

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
// 'voice' is a distinct Meta type (voice notes) — treated identically to audio for media download.
const MEDIA_TYPES = new Set(['image', 'document', 'audio', 'voice', 'video', 'sticker']);
const STATUS_MAP = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };
const MIME_TO_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/x-icon': 'ico',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov', 'video/x-msvideo': 'avi', 'video/webm': 'webm', 'video/x-matroska': 'mkv',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac', 'audio/opus': 'opus', 'audio/amr': 'amr',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt', 'text/csv': 'csv', 'text/html': 'html', 'text/css': 'css', 'application/json': 'json', 'application/xml': 'xml', 'text/xml': 'xml',
  'application/zip': 'zip', 'application/x-zip-compressed': 'zip', 'application/x-rar-compressed': 'rar', 'application/vnd.rar': 'rar',
  'application/x-7z-compressed': '7z', 'application/x-tar': 'tar', 'application/gzip': 'gz',
  'application/vnd.android.package-archive': 'apk', 'application/x-msdownload': 'exe', 'application/postscript': 'ai', 'image/vnd.adobe.photoshop': 'psd'
};

const digits = value => String(value || '').replace(/\D/g, '');

function extFromMime(mimeType) {
  const clean = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (MIME_TO_EXT[clean]) return MIME_TO_EXT[clean];
  const sub = clean.split('/')[1] || 'bin';
  return /^[a-z0-9]{1,8}$/.test(sub) ? sub : 'bin';
}

// In-memory bounded cache to prevent duplicate processing on rapid webhook retries
const seenInboundMessageIds = new Map();
function isDuplicateInbound(messageId) {
  if (!messageId) return false;
  const now = Date.now();
  for (const [id, timestamp] of seenInboundMessageIds.entries()) {
    if (now - timestamp > 10 * 60 * 1000) seenInboundMessageIds.delete(id);
  }
  if (seenInboundMessageIds.has(messageId)) return true;
  seenInboundMessageIds.set(messageId, now);
  return false;
}

export function readableContent(message) {
  const type = String(message?.type || 'unknown');
  if (type === 'text') {
    return typeof message.text?.body === 'string' && message.text.body.trim()
      ? message.text.body.trim()
      : '📩 WhatsApp message received';
  }
  if (type === 'interactive') {
    const br = message.interactive?.button_reply;
    const lr = message.interactive?.list_reply;
    if (br?.title) return br.title;
    if (lr?.title) return lr.title;
    if (br?.id) return `Button reply: ${br.id}`;
    if (lr?.id) return `List reply: ${lr.id}`;
    return 'Interactive WhatsApp reply without readable label.';
  }
  if (type === 'button') {
    return message.button?.text || message.button?.payload || 'WhatsApp button reply without readable label.';
  }
  if (type === 'location') {
    const loc = message.location;
    if (!loc) return 'WhatsApp location without readable details.';
    const label = loc.name || loc.address || '';
    const coords = `${loc.latitude}, ${loc.longitude}`;
    return label ? `📍 ${label} (${coords})` : `📍 Location: ${coords}`;
  }
  if (type === 'contacts') {
    const contacts = message.contacts;
    if (!Array.isArray(contacts) || !contacts.length) return 'WhatsApp contact card without readable name.';
    return contacts.map(c => {
      const name = c.name?.formatted_name || c.name?.first_name || '';
      const phone = c.phones?.[0]?.phone || '';
      return name && phone ? `👤 ${name} (${phone})` : name ? `👤 ${name}` : phone ? `👤 ${phone}` : '👤 Shared Contact';
    }).join(', ');
  }
  if (type === 'reaction') {
    const emoji = message.reaction?.emoji;
    return emoji ? `${emoji} Reaction` : 'WhatsApp reaction without an emoji.';
  }
  if (type === 'order') {
    const order = message.order;
    if (!order) return 'WhatsApp order received; item details were not included in the webhook.';
    const items = Array.isArray(order.product_items) ? order.product_items.length : 0;
    return order.catalog_id
      ? `🛒 Order from catalog ${order.catalog_id}${items ? ` (${items} item${items !== 1 ? 's' : ''})` : ''}.`
      : 'WhatsApp order received; item details were not included in the webhook.';
  }
  if (type === 'system') {
    return message.system?.body || `WhatsApp system notice${message.system?.type ? `: ${message.system.type}` : ''}.`;
  }
  if (type === 'referral') {
    return message.referral?.headline || message.referral?.body || message.referral?.source_url || 'WhatsApp referral received without readable details.';
  }
  if (MEDIA_TYPES.has(type)) {
    const mediaObj = message[type] || {};
    const caption = mediaObj.caption || '';
    if (type === 'audio' || type === 'voice') return caption || '🎤 Voice message';
    if (type === 'sticker') return caption || '💟 Sticker';
    if (type === 'image') return caption || '🖼️ Image';
    if (type === 'video') return caption || '🎬 Video';
    if (type === 'document') return caption || (mediaObj.filename ? `📄 ${mediaObj.filename}` : '📄 Document');
    return caption || `${type[0].toUpperCase()}${type.slice(1)} attachment.`;
  }
  if (type === 'unsupported') return '📩 WhatsApp message received';
  return '📩 WhatsApp message received';
}

async function downloadMediaFromMeta(mediaId, accessToken) {
  if (!accessToken || !mediaId) return null;
  const headers = { Authorization: `Bearer ${accessToken}` };
  const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, { headers });
  if (!metaRes.ok) {
    const err = await metaRes.text().catch(() => '');
    console.warn(`[meta-webhook] Meta media lookup failed ${metaRes.status}:`, err);
    return null;
  }
  const meta = await metaRes.json().catch(() => ({}));
  const downloadUrl = meta.url;
  if (!downloadUrl) return null;

  const downloadRes = await fetch(downloadUrl, { headers });
  if (!downloadRes.ok) {
    console.warn(`[meta-webhook] Meta media download failed ${downloadRes.status}`);
    return null;
  }
  const buffer = await downloadRes.arrayBuffer();
  const mimeType = meta.mime_type || meta.content_type || downloadRes.headers?.get?.('content-type') || 'application/octet-stream';
  const fileName = meta.filename || `${mediaId}`;
  return { buffer, mimeType, fileName };
}

async function uploadMediaToStorage(admin, senderNumber, mediaId, fileName, mimeType, buffer) {
  const cleanPhone = String(senderNumber || '').replace(/[^0-9]/g, '').slice(-10) || 'unknown';
  const safeName = String(fileName || `media_${mediaId}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const hasExt = /\.[a-zA-Z0-9]{1,8}$/.test(safeName);
  const ext = hasExt ? '' : `.${extFromMime(mimeType)}`;
  const storagePath = `${cleanPhone}/${mediaId}/${mediaId}_${safeName}${ext}`;

  const { data: uploadData, error: uploadError } = await admin
    .storage
    .from('whatsapp-media')
    .upload(storagePath, Buffer.from(buffer), {
      contentType: mimeType,
      upsert: true
    });

  if (uploadError) {
    console.warn('[meta-webhook] Storage upload error:', uploadError.message);
    return null;
  }
  return uploadData?.path || storagePath;
}

async function processInboundMedia(admin, msg, mediaType, senderNumber, accessToken) {
  const mediaObj = msg[mediaType];
  const mediaId = mediaObj?.id;
  if (!mediaId || !accessToken) return null;

  try {
    const downloaded = await downloadMediaFromMeta(mediaId, accessToken);
    if (!downloaded) return null;
    const storagePath = await uploadMediaToStorage(admin, senderNumber, mediaId, downloaded.fileName, downloaded.mimeType, downloaded.buffer);
    return {
      mediaUrl: storagePath,
      mediaMimeType: downloaded.mimeType,
      fileName: downloaded.fileName,
      mediaSize: downloaded.buffer.byteLength,
      caption: mediaObj?.caption || null
    };
  } catch (err) {
    console.warn('[meta-webhook] Media processing error:', err?.message || err);
    return null;
  }
}

async function findOrCreateLead(admin, organizationId, sender, contactName, source = 'WhatsApp') {
  const normalized = digits(sender);
  const { data: existing } = await admin
    .from('leads')
    .select('id, name, contact_name, phone, phone_normalized')
    .eq('organization_id', organizationId);

  // Exact normalized match, phone string match, or valid international formatting match
  const matched = (existing || []).find(lead => {
    if (lead.phone && lead.phone === sender) return true;
    const pDigits = digits(lead.phone_normalized || lead.phone);
    if (!pDigits || !normalized) return false;
    if (pDigits === normalized) return true;
    if (pDigits.length >= 10 && normalized.length >= 10) {
      const p10 = pDigits.slice(-10);
      const n10 = normalized.slice(-10);
      if (p10 === n10) {
        const pPrefix = pDigits.slice(0, -10);
        const nPrefix = normalized.slice(0, -10);
        if (pPrefix === nPrefix || pPrefix === '0' || nPrefix === '0' || (pPrefix === '91' && !nPrefix) || (nPrefix === '91' && !pPrefix)) {
          return true;
        }
      }
    }
    return false;
  });

  if (matched?.id) {
    if (contactName && (!matched.contact_name || matched.contact_name.includes('contact') || matched.contact_name.includes('Lead'))) {
      await admin.from('leads').update({ contact_name: contactName }).eq('id', matched.id);
    }
    return matched.id;
  }

  const name = contactName || `${source} contact (${sender})`;
  const { data, error } = await admin
    .from('leads')
    .insert({
      organization_id: organizationId,
      name,
      contact_name: name,
      phone: sender,
      phone_normalized: normalized || sender,
      source,
      status: 'Replied'
    })
    .select('id')
    .single();

  if (error?.code === '23505') {
    const retry = await admin
      .from('leads')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('phone_normalized', normalized || sender)
      .maybeSingle();
    return retry.data?.id || null;
  }
  if (error) throw error;
  return data?.id || null;
}

async function findOrCreateConversation(admin, organizationId, leadId, channel = 'whatsapp') {
  const { data: current } = await admin
    .from('conversations')
    .select('id, mode')
    .eq('organization_id', organizationId)
    .eq('lead_id', leadId)
    .eq('channel', channel)
    .maybeSingle();

  if (current?.id) return { id: current.id, mode: current.mode || 'AI' };

  const { data, error } = await admin
    .from('conversations')
    .insert({
      organization_id: organizationId,
      lead_id: leadId,
      channel,
      mode: 'AI',
      unread_count: 0
    })
    .select('id, mode')
    .single();

  if (error) throw error;
  return { id: data?.id || null, mode: data?.mode || 'AI' };
}

function matchesKeyword(text, keyword, matchType = 'contains') {
  if (!text || !keyword) return false;
  const t = String(text).toLowerCase().trim();
  const k = String(keyword).toLowerCase().trim();
  if (matchType === 'exact') return t === k;
  return t.includes(k);
}

async function getInstagramConnection(admin, entryId) {
  if (!entryId) return null;
  const { data: list } = await admin
    .from('instagram_connections')
    .select('*')
    .eq('is_active', true)
    .or(`instagram_business_id.eq.${entryId},page_id.eq.${entryId}`)
    .limit(1);
  return list?.[0] || null;
}

async function handleInstagramComment(admin, entry, change, igConnection) {
  const organizationId = igConnection.organization_id;
  const comment = change.value || {};
  const commentId = comment.id;
  const text = comment.text || '';
  const fromId = comment.from?.id;
  const fromUsername = comment.from?.username || '';
  const mediaId = comment.media?.id;

  if (!commentId) return;

  const { data: savedComment, error: commentErr } = await admin
    .from('instagram_comments')
    .upsert({
      organization_id: organizationId,
      ig_comment_id: commentId,
      ig_media_id: mediaId || 'unknown',
      from_id: fromId || 'unknown',
      from_username: fromUsername,
      text,
      created_at: new Date().toISOString(),
    }, { onConflict: 'ig_comment_id' })
    .select()
    .single();

  if (commentErr) {
    console.error('[Instagram Webhook] Error persisting comment:', commentErr.message);
  }

  const rawToken = await decryptToken(igConnection.access_token_encrypted);
  if (!rawToken) {
    console.error('[Instagram Webhook] Decrypted access token unavailable for org:', organizationId);
    return;
  }

  // 1. Check and Trigger Public Auto-Reply Rules
  if (!savedComment?.replied_publicly) {
    const { data: replyRules } = await admin
      .from('instagram_reply_rules')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    for (const rule of replyRules || []) {
      if (rule.media_id && mediaId && rule.media_id !== mediaId) continue;
      if (matchesKeyword(text, rule.trigger_keyword, rule.match_type)) {
        try {
          const replyRes = await fetch(`https://graph.facebook.com/v22.0/${commentId}/replies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: rule.reply_message,
              access_token: rawToken,
            }),
          });
          if (replyRes.ok) {
            await admin
              .from('instagram_comments')
              .update({ replied_publicly: true })
              .eq('ig_comment_id', commentId);

            await admin
              .from('instagram_reply_rules')
              .update({ reply_count: (rule.reply_count || 0) + 1 })
              .eq('id', rule.id);
          }
        } catch (err) {
          console.error('[Instagram Auto-Reply Fetch Error]:', err.message);
        }
        break;
      }
    }
  }

  // 2. Check and Queue Private Auto-DM Rules (Comment-to-DM)
  if (!savedComment?.replied_privately && fromId) {
    const { data: dmRules } = await admin
      .from('instagram_dm_rules')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    for (const rule of dmRules || []) {
      if (rule.media_id && mediaId && rule.media_id !== mediaId) continue;
      if (matchesKeyword(text, rule.trigger_keyword, rule.match_type)) {
        await admin
          .from('instagram_dm_queue')
          .insert({
            organization_id: organizationId,
            rule_id: rule.id,
            comment_id: commentId,
            recipient_id: fromId,
            recipient_username: fromUsername,
            message_text: rule.dm_message,
            status: 'pending',
            scheduled_at: new Date().toISOString(),
          });
        break;
      }
    }
  }
}

async function handleInstagramDirectMessage(admin, entry, messagingItem, igConnection) {
  const organizationId = igConnection.organization_id;
  const senderId = messagingItem.sender?.id;
  const recipientId = messagingItem.recipient?.id;
  const message = messagingItem.message || {};
  const messageId = message.mid;
  const isEcho = Boolean(message.is_echo || senderId === igConnection.instagram_business_id);
  const direction = isEcho ? 'outbound' : 'inbound';

  if (!messageId) return false;
  if (isDuplicateInbound(messageId)) return false;

  const leadContactId = direction === 'inbound' ? senderId : recipientId;
  const leadId = await findOrCreateLead(admin, organizationId, leadContactId, `Instagram User (${leadContactId})`, 'Instagram');
  if (!leadId) {
    console.error('[Instagram Webhook] Could not resolve lead for message:', messageId);
    return false;
  }

  const conv = await findOrCreateConversation(admin, organizationId, leadId, 'instagram');
  const conversationId = conv?.id;

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const hasAttachment = attachments.length > 0;
  let mediaUrl = null;
  let mediaMimeType = null;
  let fileName = null;
  let mediaSize = 0;
  let messageType = 'text';

  if (hasAttachment) {
    const att = attachments[0];
    messageType = att.type || 'image';
    const downloadUrl = att.payload?.url;
    if (downloadUrl) {
      try {
        const downloadRes = await fetch(downloadUrl);
        if (downloadRes.ok) {
          const buffer = await downloadRes.arrayBuffer();
          mediaMimeType = downloadRes.headers?.get?.('content-type') || (messageType === 'image' ? 'image/jpeg' : 'application/octet-stream');
          fileName = `${messageId}_ig.${extFromMime(mediaMimeType)}`;
          mediaSize = buffer.byteLength;
          mediaUrl = await uploadMediaToStorage(admin, leadContactId, messageId, fileName, mediaMimeType, buffer);
        }
      } catch (dlErr) {
        console.warn('[Instagram Webhook] Media download error:', dlErr.message);
      }
    }
  }

  const messageText = message.text || (hasAttachment ? (messageType === 'image' ? '🖼️ Photo' : '📎 Attachment') : '');
  const receivedAt = new Date(messagingItem.timestamp || Date.now()).toISOString();

  const insertRecord = {
    organization_id: organizationId,
    lead_id: leadId,
    conversation_id: conversationId,
    wa_message_id: messageId,
    sender_number: senderId,
    direction,
    channel: 'instagram',
    message_type: messageType,
    content: messageText,
    body: messageText,
    message_body: messageText,
    media_url: mediaUrl,
    media_mime_type: mediaMimeType,
    file_name: fileName,
    media_size: mediaSize,
    status: 'delivered',
    received_at: receivedAt
  };

  const { error: insertErr } = await admin.from('messages').insert(insertRecord);
  if (insertErr && insertErr.code !== '23505') {
    console.error('[Instagram Webhook] Message insert error:', insertErr);
  }

  if (conversationId) {
    await admin.from('conversations').update({
      last_message: messageText,
      last_timestamp: receivedAt
    }).eq('id', conversationId);
  }

  try {
    await admin.from('instagram_messages').upsert({
      organization_id: organizationId,
      ig_message_id: messageId,
      sender_id: senderId || 'unknown',
      recipient_id: recipientId || 'unknown',
      content: messageText,
      message_type: messageType,
      media_url: mediaUrl,
      direction,
      received_at: receivedAt,
    }, { onConflict: 'ig_message_id' });
  } catch (igErr) {
    // Non-fatal if instagram_messages table is not configured
  }

  return true;
}

async function applyStatuses(admin, statuses) {
  for (const receipt of statuses || []) {
    const status = STATUS_MAP[String(receipt?.status || '').toLowerCase()];
    if (!receipt?.id || !status) continue;
    const update = { status };
    if (status === 'failed') {
      update.error_code = String(receipt.errors?.[0]?.code || 'META_SEND_FAILED');
      update.error_message = receipt.errors?.[0]?.title || receipt.errors?.[0]?.message || 'Meta reported delivery failure.';
    }
    await admin.from('messages').update(update).eq('wa_message_id', receipt.id);
    await admin.from('follow_up_messages')
      .update({ status: status === 'sent' ? 'Sent' : status === 'delivered' ? 'Delivered' : status === 'read' ? 'Read' : 'Failed' })
      .eq('whatsapp_message_id', receipt.id);
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const expected = String(process.env.META_VERIFY_TOKEN || process.env.WEBHOOK_VERIFY_TOKEN || 'Wasaas@2026').trim();
    if (req.query?.['hub.mode'] === 'subscribe' && (req.query?.['hub.verify_token'] === expected || req.query?.['hub.verify_token'] === 'Wasaas@2026')) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return res.status(503).json({
      error: 'Server database configuration is unavailable.',
      missing: missingSupabaseServerConfig()
    });
  }

  const payload = req.body;

  // Instagram Webhook Payload (object === 'instagram' or page feed events)
  if (payload?.object === 'instagram' || payload?.object === 'page') {
    const entries = payload.entry || [];
    let igStored = 0;
    for (const entry of entries) {
      const igBusinessId = entry.id;
      const igConnection = await getInstagramConnection(admin, igBusinessId);
      if (!igConnection) {
        console.warn('[Instagram Webhook] No active connection found for ID:', igBusinessId);
        continue;
      }

      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          if (change.field === 'comments') {
            await handleInstagramComment(admin, entry, change, igConnection);
          }
        }
      }

      if (Array.isArray(entry.messaging)) {
        for (const item of entry.messaging) {
          const ok = await handleInstagramDirectMessage(admin, entry, item, igConnection);
          if (ok) igStored += 1;
        }
      }
    }
    return res.status(200).json({ received: true, stored: igStored });
  }

  const values = (req.body?.entry || []).flatMap(entry => (entry.changes || []).map(change => change.value)).filter(Boolean);
  await applyStatuses(admin, values.flatMap(value => Array.isArray(value.statuses) ? value.statuses : []));

  let stored = 0;
  for (const value of values) {
    const phoneNumberId = value.metadata?.phone_number_id;
    const messages = Array.isArray(value.messages) ? value.messages : [];
    if (!messages.length) continue;

    // Resolve tenant organization from active connection
    const { data: connection } = await admin
      .from('whatsapp_connections')
      .select('organization_id, phone_number_id, waba_id, access_token_encrypted, access_token')
      .eq('phone_number_id', phoneNumberId)
      .eq('is_active', true)
      .maybeSingle();

    if (!connection?.organization_id) {
      console.error('[meta-webhook] inbound payload ignored: no active tenant channel for phone_number_id', phoneNumberId);
      continue;
    }

    const organizationId = connection.organization_id;
    const tenantCreds = await getTenantWhatsAppCredentials(admin, organizationId, phoneNumberId);

    for (const message of messages) {
      if (!message?.id || !message?.from) continue;

      // 1. Deduplication guard (in-memory + database)
      if (isDuplicateInbound(message.id)) {
        console.log('[meta-webhook] In-memory duplicate detected, skipping:', message.id);
        continue;
      }

      const { data: duplicate } = await admin
        .from('messages')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('wa_message_id', message.id)
        .maybeSingle();

      if (duplicate?.id) {
        console.log('[meta-webhook] Duplicate message already stored:', message.id);
        continue;
      }

      try {
        const contactName = value.contacts?.find(item => item.wa_id === message.from)?.profile?.name || '';
        const leadId = await findOrCreateLead(admin, organizationId, message.from, contactName);
        if (!leadId) throw new Error('Unable to link inbound message to a lead.');

        const conv = await findOrCreateConversation(admin, organizationId, leadId);
        const conversationId = conv?.id;
        if (!conversationId) throw new Error('Unable to link inbound message to a conversation.');

        const type = String(message.type || 'unsupported');
        const content = readableContent(message);
        const isMedia = MEDIA_TYPES.has(type);

        let mediaInfo = null;
        if (isMedia && tenantCreds?.accessToken) {
          mediaInfo = await processInboundMedia(admin, message, type, message.from, tenantCreds.accessToken);
        }

        const supportedTypes = ['text', 'interactive', 'button', 'location', 'contacts', 'reaction', 'order', 'system', 'referral', 'unknown'];
        const messageType = isMedia || supportedTypes.includes(type) ? type : `unknown_${type}`;
        const receivedAt = new Date().toISOString();

        const insertRecord = {
          organization_id: organizationId,
          lead_id: leadId,
          conversation_id: conversationId,
          wa_message_id: message.id,
          sender_number: message.from,
          direction: 'inbound',
          channel: 'whatsapp',
          message_type: messageType,
          content,
          body: content,
          message_body: content,
          media_url: mediaInfo?.mediaUrl || null,
          media_mime_type: mediaInfo?.mediaMimeType || (isMedia ? message[type]?.mime_type : null),
          file_name: mediaInfo?.fileName || (isMedia ? message[type]?.filename : null),
          media_size: mediaInfo?.mediaSize || 0,
          media_caption: mediaInfo?.caption || (isMedia ? message[type]?.caption : null),
          status: 'delivered',
          received_at: receivedAt
        };

        const { error: insertErr } = await admin.from('messages').insert(insertRecord);
        if (insertErr) {
          // If concurrent insert beat us, skip duplicate
          if (insertErr.code === '23505') {
            console.log('[meta-webhook] Concurrent duplicate insert caught:', message.id);
            continue;
          }
          throw insertErr;
        }

        await admin.from('conversations').update({
          last_message: content,
          last_timestamp: receivedAt
        }).eq('id', conversationId);

        stored += 1;

        // 2. Pause scheduled follow-up sequence when customer sends ANY message
        await pauseLeadFollowUp(admin, leadId);

        // 3. Opt-out compliance
        const messageIsOptOut = isOptOut(content);
        if (messageIsOptOut) {
          await handleLeadOptOut(admin, leadId);
          await recordAIOutcome(admin, {
            organizationId,
            conversationId,
            inboundMessageId: message.id,
            incomingMessage: content,
            providerOutcome: 'not_called',
            fallbackReason: 'opt_out',
            sendResult: 'not_attempted'
          });
          continue;
        }

        // Check if lead was already opted out
        const { data: leadRecord } = await admin
          .from('leads')
          .select('id, opted_out')
          .eq('id', leadId)
          .maybeSingle();

        if (leadRecord?.opted_out) {
          await recordAIOutcome(admin, {
            organizationId,
            conversationId,
            inboundMessageId: message.id,
            incomingMessage: content,
            providerOutcome: 'not_called',
            fallbackReason: 'lead_opted_out',
            sendResult: 'not_attempted'
          });
          continue;
        }

        // 4. Respect manual mode
        if (conv?.mode === 'Manual') {
          await recordAIOutcome(admin, {
            organizationId,
            conversationId,
            inboundMessageId: message.id,
            incomingMessage: content,
            providerOutcome: 'not_called',
            fallbackReason: 'conversation_manual_mode',
            sendResult: 'not_attempted'
          });
          continue;
        }

        // 5. Only incoming text messages qualify for AI auto-reply
        if (type !== 'text' || !content.trim()) {
          continue;
        }

        // 6. Check if AI reply was already executed for this inbound message ID
        const { data: alreadyReplied } = await admin
          .from('ai_reply_logs')
          .select('id')
          .eq('organization_id', organizationId)
          .contains('api_result', { inbound_message_id: message.id })
          .maybeSingle();

        if (alreadyReplied?.id) {
          console.log('[meta-webhook] Duplicate reply prevented for message:', message.id);
          continue;
        }

        // 7. Load auto-reply context (active AI agent & knowledge base)
        const autoReplyContext = await loadAutoReplyContext(admin, organizationId);
        if (!autoReplyContext) {
          await recordAIOutcome(admin, {
            organizationId,
            conversationId,
            inboundMessageId: message.id,
            incomingMessage: content,
            providerOutcome: 'not_called',
            fallbackReason: 'agent_not_enabled_or_schema_unavailable',
            sendResult: 'not_attempted'
          });
          continue;
        }

        // 8. Fetch chronological conversation history
        const chatHistory = await fetchChatHistory(admin, organizationId, conversationId, 20);

        // 9. Grounded decision flow
        const decision = await decideAutoReply({
          agent: autoReplyContext.agent,
          knowledge: autoReplyContext.knowledge,
          history: chatHistory,
          userMessage: content,
          provider: ({ agent, sources, history, userMessage }) =>
            generateAIReply({ agent, sources, history, userMessage })
        });

        if (!decision.shouldSend) {
          await recordAIOutcome(admin, {
            organizationId,
            conversationId,
            inboundMessageId: message.id,
            incomingMessage: content,
            agentId: autoReplyContext.agent.id,
            providerOutcome: decision.providerOutcome,
            providerErrorCode: decision.providerErrorCode,
            fallbackReason: decision.fallbackReason,
            intent: decision.intent,
            sendResult: 'not_attempted',
            replyKind: decision.replyKind,
            sources: decision.sources
          });
          continue;
        }

        const parsed = parseAIResponse(decision.reply);
        const replyText = parsed.replyText;
        if (!replyText) {
          console.warn('[meta-webhook] AI response did not contain customer text');
          continue;
        }

        // 10. Verify tenant credentials before attempting send
        if (!tenantCreds?.accessToken || !tenantCreds?.phoneNumberId) {
          await recordAIOutcome(admin, {
            organizationId,
            conversationId,
            inboundMessageId: message.id,
            incomingMessage: content,
            agentId: autoReplyContext.agent.id,
            reply: replyText,
            replyKind: decision.replyKind,
            providerOutcome: decision.providerOutcome,
            providerErrorCode: decision.providerErrorCode,
            fallbackReason: 'tenant_credentials_missing',
            intent: decision.intent,
            sources: decision.sources,
            sendResult: 'failed'
          });
          console.error('[meta-webhook] WhatsApp tenant credentials missing for org', organizationId);
          continue;
        }

        // 11. Send WhatsApp reply via Meta Graph API using tenant credentials
        let sent;
        try {
          sent = await sendWhatsAppReply({
            phoneNumberId: tenantCreds.phoneNumberId,
            to: message.from,
            body: replyText,
            accessToken: tenantCreds.accessToken
          });
        } catch (sendError) {
          await recordAIOutcome(admin, {
            organizationId,
            conversationId,
            inboundMessageId: message.id,
            incomingMessage: content,
            agentId: autoReplyContext.agent.id,
            reply: replyText,
            replyKind: decision.replyKind,
            providerOutcome: decision.providerOutcome,
            providerErrorCode: decision.providerErrorCode,
            fallbackReason: decision.fallbackReason || 'meta_send_failed',
            intent: decision.intent,
            sources: decision.sources,
            sendResult: 'failed'
          });
          console.error('[meta-webhook] WhatsApp outbound send failed:', sendError?.message || sendError);
          continue;
        }

        // 12. Save sent outbound message
        const sentAt = new Date().toISOString();
        const outboundWaMessageId = sent.messages?.[0]?.id || null;
        await admin.from('messages').insert({
          organization_id: organizationId,
          conversation_id: conversationId,
          lead_id: leadId,
          wa_message_id: outboundWaMessageId,
          sender_number: message.from,
          sender: 'agent',
          body: replyText,
          message_body: replyText,
          content: replyText,
          message_type: 'text',
          direction: 'outbound',
          channel: 'whatsapp',
          received_at: sentAt,
          created_at: sentAt,
          is_ai: decision.replyKind === 'ai',
          status: 'sent'
        });

        // 13. Record successful outcome in ai_reply_logs
        await recordAIOutcome(admin, {
          organizationId,
          conversationId,
          inboundMessageId: message.id,
          incomingMessage: content,
          agentId: autoReplyContext.agent.id,
          reply: replyText,
          replyKind: decision.replyKind,
          providerOutcome: decision.providerOutcome,
          providerErrorCode: decision.providerErrorCode,
          fallbackReason: decision.fallbackReason,
          intent: decision.intent,
          sources: decision.sources,
          sendResult: 'sent',
          outboundMessageId: outboundWaMessageId
        });

        // 14. Update CRM captured fields and conversation thread
        await updateLeadFromCRM(admin, leadId, parsed.crmData);
        await admin.from('conversations').update({
          last_message: replyText,
          last_timestamp: sentAt
        }).eq('id', conversationId);

      } catch (error) {
        console.error('[meta-webhook] Inbound message processing failed:', message.id, error.message);
      }
    }
  }

  return res.status(200).json({ received: true, stored });
}
