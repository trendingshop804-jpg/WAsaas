// api/meta-webhook.js
import { createSupabaseAdminClient, missingSupabaseServerConfig } from './_supabase.js';
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
const MEDIA_TYPES = new Set(['image', 'document', 'audio', 'video', 'sticker']);
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
  if (type === 'text') return typeof message.text?.body === 'string' && message.text.body.trim() ? message.text.body.trim() : 'WhatsApp text message did not include readable content.';
  if (type === 'interactive') return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || 'Interactive WhatsApp reply without readable label.';
  if (type === 'button') return message.button?.text || 'WhatsApp button reply without readable label.';
  if (type === 'location') return message.location?.name || message.location?.address || (message.location ? `Location: ${message.location.latitude}, ${message.location.longitude}` : 'WhatsApp location without readable details.');
  if (type === 'contacts') return message.contacts?.[0]?.name?.formatted_name || 'WhatsApp contact card without readable name.';
  if (type === 'reaction') return message.reaction?.emoji ? `Reaction: ${message.reaction.emoji}` : 'WhatsApp reaction without an emoji.';
  if (type === 'order') return message.order?.catalog_id ? `WhatsApp order from catalog ${message.order.catalog_id}.` : 'WhatsApp order received; item details were not included in the webhook.';
  if (type === 'system') return message.system?.body || `WhatsApp system notice${message.system?.type ? `: ${message.system.type}` : ''}.`;
  if (type === 'referral') return message.referral?.headline || message.referral?.body || message.referral?.source_url || 'WhatsApp referral received without readable details.';
  if (MEDIA_TYPES.has(type)) return message[type]?.caption || `${type[0].toUpperCase()}${type.slice(1)} attachment (no caption).`;
  return `Meta delivered a WhatsApp ${type} event, but no supported readable content was included.`;
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

async function findOrCreateLead(admin, organizationId, sender, contactName) {
  const normalized = digits(sender);
  const { data: existing } = await admin
    .from('leads')
    .select('id, name, contact_name, phone, phone_normalized')
    .eq('organization_id', organizationId);

  // Exact normalized match or valid international formatting match
  const matched = (existing || []).find(lead => {
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
    if (contactName && (!matched.contact_name || matched.contact_name.includes('WhatsApp contact') || matched.contact_name.includes('WhatsApp Lead'))) {
      await admin.from('leads').update({ contact_name: contactName }).eq('id', matched.id);
    }
    return matched.id;
  }

  const name = contactName || `WhatsApp contact (+${sender})`;
  const { data, error } = await admin
    .from('leads')
    .insert({
      organization_id: organizationId,
      name,
      contact_name: name,
      phone: sender,
      phone_normalized: normalized,
      source: 'WhatsApp',
      status: 'Replied'
    })
    .select('id')
    .single();

  if (error?.code === '23505') {
    const retry = await admin
      .from('leads')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('phone_normalized', normalized)
      .maybeSingle();
    return retry.data?.id || null;
  }
  if (error) throw error;
  return data?.id || null;
}

async function findOrCreateConversation(admin, organizationId, leadId) {
  const { data: current } = await admin
    .from('conversations')
    .select('id, mode')
    .eq('organization_id', organizationId)
    .eq('lead_id', leadId)
    .eq('channel', 'whatsapp')
    .maybeSingle();

  if (current?.id) return { id: current.id, mode: current.mode || 'AI' };

  const { data, error } = await admin
    .from('conversations')
    .insert({
      organization_id: organizationId,
      lead_id: leadId,
      channel: 'whatsapp',
      mode: 'AI',
      unread_count: 0
    })
    .select('id, mode')
    .single();

  if (error) throw error;
  return { id: data?.id || null, mode: data?.mode || 'AI' };
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
    const expected = String(process.env.META_VERIFY_TOKEN || process.env.WEBHOOK_VERIFY_TOKEN || '').trim();
    if (req.query?.['hub.mode'] === 'subscribe' && expected && req.query?.['hub.verify_token'] === expected) {
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

        const supportedTypes = ['text', 'interactive', 'button', 'location', 'contacts', 'reaction', 'order', 'system', 'referral'];
        const messageType = isMedia || supportedTypes.includes(type) ? type : 'unsupported';
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
