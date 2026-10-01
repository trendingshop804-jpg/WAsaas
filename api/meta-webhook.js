// api/meta-webhook.js
import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './_crypto.js';
import { createSupabaseAdminClient, missingSupabaseServerConfig } from './_supabase.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createSupabaseAdminClient();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// NOTE: there is deliberately NO global WHATSAPP_ACCESS_TOKEN here.
// Every Meta call uses the token belonging to the exact whatsapp_connections
// row matched by phone_number_id. A shared/global token would let one tenant's
// webhook act on another tenant's WhatsApp number.

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker']);

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

function extFromMime(mimeType) {
  const clean = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (MIME_TO_EXT[clean]) return MIME_TO_EXT[clean];
  const sub = clean.split('/')[1] || 'bin';
  return /^[a-z0-9]{1,8}$/.test(sub) ? sub : 'bin';
}

async function downloadMediaFromMeta(mediaId, customToken) {
  const token = customToken;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers
  });
  if (!metaRes.ok) {
    const err = await metaRes.text();
    throw new Error(`Meta Media API error ${metaRes.status}: ${err}`);
  }
  const meta = await metaRes.json();
  const downloadUrl = meta.url;
  if (!downloadUrl) throw new Error(`No download URL returned for media ${mediaId}`);

  const downloadRes = await fetch(downloadUrl, {
    headers
  });
  if (!downloadRes.ok) {
    throw new Error(`Failed to download media ${mediaId}: ${downloadRes.status}`);
  }

  const buffer = await downloadRes.arrayBuffer();
  const mimeType = meta.mime_type || meta.content_type || downloadRes.headers.get('content-type') || 'application/octet-stream';
  const fileName = meta.filename || `${mediaId}`;

  return { buffer, mimeType, fileName };
}

async function uploadMediaToStorage(senderNumber, mediaId, fileName, mimeType, buffer) {
  const cleanPhone = String(senderNumber || '').replace(/[^0-9]/g, '').slice(-10) || 'unknown';
  const safeName = String(fileName || `media_${mediaId}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const hasExt = /\.[a-zA-Z0-9]{1,8}$/.test(safeName);
  const storagePath = `${cleanPhone}/${mediaId}/${mediaId}_${safeName}${hasExt ? '' : `.${extFromMime(mimeType)}`}`;

  const { data: uploadData, error: uploadError } = await supabase
    .storage
    .from('whatsapp-media')
    .upload(storagePath, Buffer.from(buffer), {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Supabase Storage upload error: ${uploadError.message}`);
  }

  return uploadData?.path || storagePath;
}

async function processInboundMedia(msg, mediaType, customToken) {
  const mediaId = msg[mediaType]?.id;
  if (!mediaId) {
    console.warn(`Media message ${msg.id} has no ${mediaType}.id — skipping media download`);
    return null;
  }

  try {
    const { buffer, mimeType, fileName } = await downloadMediaFromMeta(mediaId, customToken);
    const storagePath = await uploadMediaToStorage(msg.from, mediaId, fileName, mimeType, buffer);
    return {
      mediaUrl: storagePath,
      mediaMimeType: mimeType,
      fileName: fileName,
      mediaSize: buffer.byteLength,
    };
  } catch (err) {
    console.error(`Failed to download/store media for message ${msg.id}:`, err.message);
    return null;
  }
}

/**
 * Resolve the organization that owns a WhatsApp business phone number ID.
 *
 * The ONLY accepted source of truth is an active whatsapp_connections row whose
 * phone_number_id matches exactly.
 *
 * Three fallbacks used to sit below this and have all been removed, because
 * every one of them attributes a tenant's messages to somebody else:
 *   1. DEFAULT_ORGANIZATION_ID / ORGANIZATION_ID env vars - one org for all traffic
 *   2. `select organization_id from whatsapp_connections limit 1` - first row wins
 *   3. `select id from organizations limit 1` - first org wins
 * With more than one tenant those write another company's inbound messages,
 * leads and conversations into the wrong CRM. Returning null makes the caller
 * fail closed instead.
 */
async function getWhatsAppOrganizationId(phoneNumberId) {
  if (!phoneNumberId) return null;

  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select('organization_id')
    .eq('is_active', true)
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();

  if (error) {
    console.error('[Webhook] WhatsApp organization lookup failed:', error.message);
    return null;
  }

  return data?.organization_id || null;
}

async function getWhatsAppConnection(phoneNumberId) {
  if (!phoneNumberId) return null;

  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select('*')
    .eq('is_active', true)
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();

  if (error) {
    console.error('[Webhook] WhatsApp connection lookup failed:', error.message);
    return null;
  }

  return data || null;
}

/**
 * Resolve the Instagram connection for a business (or page) ID.
 *
 * Exact match on instagram_business_id or page_id only. The previous version
 * fell back to "any active connection" and then to a *synthetic* connection
 * built from an unrelated organization, which filed one tenant's comments and
 * DMs into another tenant's CRM. Unknown IDs must return null so the caller
 * skips the entry.
 */
async function getInstagramConnection(instagramBusinessId) {
  if (!instagramBusinessId) return null;

  const { data, error } = await supabase
    .from('instagram_connections')
    .select('*')
    .or(`instagram_business_id.eq.${instagramBusinessId},page_id.eq.${instagramBusinessId}`)
    .eq('is_active', true)
    .limit(1);

  if (error) {
    console.error('[Webhook] Instagram connection lookup failed:', error.message);
    return null;
  }

  return data?.[0] || null;
}

function phoneDigits(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

/**
 * Every equivalent spelling of one phone number, used only for *comparison*.
 *
 * The previous normalizePhone() rewrote a bare 10-digit number to "91" + digits.
 * That silently corrupted any non-Indian number (a stored US 4155551234 became
 * 91415551234 and could never match the 14155551234 Meta sends), which produced
 * a brand-new lead for a contact who already existed. Comparing a set of
 * equivalent forms is symmetric, so the same person cannot be duplicated no
 * matter which side of the comparison carries the country code.
 */
function phoneVariants(value) {
  const digits = phoneDigits(value);
  const forms = new Set();
  if (!digits) return forms;

  forms.add(digits);
  // International dialing prefix: 0091... == 91...
  if (digits.startsWith('00') && digits.length > 4) forms.add(digits.slice(2));
  // National trunk prefix: 08111986637 == 918111986637
  if (digits.startsWith('0') && digits.length > 10) forms.add(digits.slice(1));
  // India: local 10-digit form == 91 + local form
  if (digits.length === 10) forms.add('91' + digits);
  if (digits.length === 12 && digits.startsWith('91')) forms.add(digits.slice(2));

  return forms;
}

/** True when two phone values denote the same subscriber. */
function phoneMatches(a, b) {
  const left = phoneVariants(a);
  if (left.size === 0) return false;
  for (const form of phoneVariants(b)) {
    if (left.has(form)) return true;
  }
  return false;
}

async function findOrCreateLead(organizationId, phoneNumber, contactName = '', source = 'WhatsApp') {
  if (!organizationId) {
    throw new Error('Organization ID is required to find or create lead');
  }

  const targetDigits = phoneDigits(phoneNumber);

  // 1. Query leads for this tenant organization
  const { data: orgLeads, error: searchError } = await supabase
    .from('leads')
    .select('id, name, contact_name, company, company_name, phone')
    .eq('organization_id', organizationId);

  if (searchError) {
    console.error('[Webhook] Lead lookup query error:', searchError.message);
  }

  // 2. Match on equivalent full phone numbers (never on a guessed country code)
  let matchedLead = null;
  if (orgLeads && orgLeads.length > 0 && phoneDigits(phoneNumber)) {
    matchedLead = orgLeads.find(l => l.phone && phoneMatches(l.phone, phoneNumber));
  }

  if (matchedLead) {
    const currentName = matchedLead.name || matchedLead.contact_name || '';
    if (contactName && (!currentName || currentName.includes('WhatsApp Lead') || currentName.includes('WhatsApp Contact'))) {
      await supabase
        .from('leads')
        .update({
          contact_name: contactName,
          name: contactName,
        })
        .eq('id', matchedLead.id);
    }
    return matchedLead.id;
  }

  // 3. If not found, insert a new lead
  const defaultName = source === 'Instagram'
    ? (contactName ? `@${contactName}` : 'Instagram Lead')
    : (contactName || (phoneNumber ? `WhatsApp Contact (+${phoneNumber})` : 'WhatsApp Lead'));

  const insertPayload = {
    organization_id: organizationId,
    name: defaultName,
    contact_name: defaultName,
    company: 'Inbound WhatsApp',
    company_name: 'Inbound WhatsApp',
    phone: phoneNumber || null,
    source: source || 'WhatsApp',
    status: 'REPLIED',
  };

  const { data: newLead, error } = await supabase
    .from('leads')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error) {
    console.error('Lead creation error:', error);
    throw new Error(`Failed to create lead: ${error.message}`);
  }

  return newLead.id;
}

async function findOrCreateConversation(organizationId, leadId, channel = 'whatsapp', contactName = '') {
  if (!organizationId || !leadId) {
    throw new Error('organizationId and leadId are required to find or create conversation');
  }

  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('lead_id', leadId)
    .eq('channel', channel)
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0].id;
  }

  const { data: fallbackExisting } = await supabase
    .from('conversations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('lead_id', leadId)
    .limit(1);

  if (fallbackExisting && fallbackExisting.length > 0) {
    return fallbackExisting[0].id;
  }

  // Only columns that actually exist on public.conversations:
  //   id, organization_id, lead_id, mode, unread_count, last_message,
  //   last_timestamp, created_at, updated_at, channel
  // There is NO name / status / ai_active column. Inserting them made PostgREST
  // reject the whole INSERT, findOrCreateConversation threw, the caller caught
  // it, conversationId stayed null and the inbound message was skipped - which
  // is why conversations had 0 rows and every message had a NULL conversation_id.
  // The contact's display name lives on the lead, not on the conversation.
  const { data: newConv, error } = await supabase
    .from('conversations')
    .insert({
      organization_id: organizationId,
      lead_id: leadId,
      channel: channel,
      mode: 'AI',
      unread_count: 0,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Webhook] Conversation creation error for lead', leadId, ':', error);
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  if (!newConv || !newConv.id) {
    throw new Error('Failed to create conversation: no id returned');
  }

  if (contactName) {
    // Best-effort only: the column is absent, so this must never fail the flow.
    console.warn('[Webhook] conversation has no name column; contact name kept on lead', leadId);
  }

  return newConv.id;
}

async function fetchChatHistory(conversationId, limit = 20) {
  const { data } = await supabase
    .from('messages')
    .select('direction, body, message_type, received_at')
    .eq('conversation_id', conversationId)
    .order('received_at', { ascending: true })
    .limit(limit);

  return data || [];
}

function buildSystemPrompt(organization) {
  const businessName = organization?.name || 'our business';
  const productDescription = organization?.product_description || 'our services';
  const pricingSummary = organization?.pricing_summary || 'contact us for pricing details';
  const bookingLink = organization?.booking_link || '';

  return `You are ${businessName}'s WhatsApp assistant. Your job is to greet inbound leads, qualify them, and either book them in or hand them off to a human — all inside a normal WhatsApp chat.

## Voice & format
- Sound like a helpful person on WhatsApp, not a form. Short messages (1-3 lines max).
- One question at a time. Never dump multiple questions in one message.
- Use the lead's name once you have it. Light emoji is fine, don't overdo it.
- Reply in the language the lead writes in (English, Tamil, Malayalam, or mixed).

## Conversation flow
1. **Greet + discover intent** — Ask what brought them here in one friendly line.
2. **Qualify** — Naturally collect, over the course of the chat (not as a checklist):
   - Name
   - Business/industry
   - What problem they're trying to solve / what they're interested in
   - Budget range (ask softly, e.g. "roughly what budget are you working with?")
   - Timeline (immediate / this month / just exploring)
3. **Score the lead** internally as HOT (ready to buy, has budget + timeline), WARM (interested, needs nurturing), or COLD (just browsing/no fit).
4. **Route**:
   - HOT → offer to book a call/demo right away, share ${bookingLink}, and flag for human follow-up.
   - WARM → answer their questions, share relevant info/pricing, ask if they'd like a callback.
   - COLD → answer politely, add to nurture list, don't push for a call.
5. **Handoff** — If the lead asks something you're unsure of, asks for a human, or gets frustrated, say so plainly and tag for human takeover. Never pretend to be human if directly asked.

## Hard rules
- Never invent pricing, features, or timelines you weren't given — say you'll confirm and get back to them.
- Never ask for sensitive info (passwords, OTPs, card numbers) over chat.
- Don't repeat a question the lead already answered earlier in the chat.
- If the lead goes silent, don't follow up more than twice.

## Output for the CRM (structured, not shown to the lead)
After each exchange, also produce:
{
  "lead_status": "HOT | WARM | COLD",
  "captured_fields": { "name": "", "industry": "", "need": "", "budget": "", "timeline": "" },
  "next_action": "book_call | send_info | human_handoff | nurture",
  "notes": ""
}

## Context
- Business: ${businessName}
- Product/Service: ${productDescription}
- Pricing: ${pricingSummary}
- Booking link: ${bookingLink}`;
}

function parseAIResponse(rawContent) {
  const text = (rawContent || '').trim();

  const jsonMatch = text.match(/(\{[\s\S]*\})\s*$/);
  let replyText = text;
  let crmData = null;

  if (jsonMatch) {
    try {
      crmData = JSON.parse(jsonMatch[1]);
      replyText = text.slice(0, jsonMatch.index).trim();
    } catch (e) {
      console.warn('Failed to parse AI CRM JSON:', e.message);
    }
  }

  return { replyText, crmData };
}

async function updateLeadFromCRM(leadId, crmData) {
  if (!crmData || !leadId) return;

  const updates = {};

  if (crmData.captured_fields) {
    const fields = crmData.captured_fields;
    if (fields.name && !updates.contact_name) updates.contact_name = fields.name;
    if (fields.industry && !updates.industry) updates.industry = fields.industry;
    if (fields.need && !updates.ai_summary) updates.ai_summary = fields.need;
  }

  if (crmData.lead_status) {
    const statusMap = {
      'HOT': 'QUALIFIED',
      'WARM': 'REPLIED',
      'COLD': 'NEW'
    };
    updates.status = statusMap[crmData.lead_status] || updates.status;
    updates.score_category = crmData.lead_status;
  }

  if (crmData.notes) {
    updates.notes = crmData.notes;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', leadId);

    if (error) {
      console.error('Lead CRM update error:', error);
    }
  }
}

async function generateAIReply(organization, history, userMessage) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  const systemPrompt = buildSystemPrompt(organization);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.body || ''
    })),
    { role: 'user', content: userMessage }
  ];

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://nexuslead.ai',
      'X-Title': 'NexusLead AI Agent',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 600
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[OpenRouter API Error]:', response.status, errText);
    throw new Error(`OpenRouter API error ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (content) {
    return content;
  }
  throw new Error('Empty completion returned');
}

async function sendWhatsAppMessage(phoneNumberId, toNumber, text, accessToken) {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toNumber,
        type: 'text',
        text: { body: text },
      }),
    }
  );
  const data = await response.json();
  if (!response.ok) {
    console.error('WhatsApp send error:', data);
  } else {
    console.log('WhatsApp reply sent:', data);
  }
  return data;
}

function isOptOut(messageText = '') {
  const normalized = String(messageText || '').trim().toLowerCase();
  return /\b(stop|unsubscribe|remove me|not interested|do not contact|don't contact)\b/i.test(normalized);
}

// ---------------------------------------------------------------------------
// Instagram Webhook Helpers: Comments, Auto-Reply, Auto-DM Rules
// ---------------------------------------------------------------------------
function matchesKeyword(text, keyword, matchType = 'contains') {
  if (!text || !keyword) return false;
  const t = text.trim().toLowerCase();
  const keywords = keyword.toLowerCase().split(',').map(k => k.trim()).filter(Boolean);

  if (matchType === 'exact') {
    return keywords.some(k => t === k);
  }
  // Default: contains
  return keywords.some(k => t.includes(k));
}

async function handleInstagramComment(entry, change, igConnection) {
  const organizationId = igConnection.organization_id;
  const value = change.value;
  const commentId = value.id || value.comment_id;
  const mediaId = value.media?.id || value.media_id;
  const from = value.from || {};
  const fromId = from.id;
  const fromUsername = from.username || 'user';
  const text = value.text || '';
  const parentId = value.parent_id || null;

  if (!commentId || !text) {
    console.warn('[Instagram Webhook] Missing commentId or text');
    return;
  }

  // 1. Persist comment event
  const { data: savedComment, error: commentErr } = await supabase
    .from('instagram_comments')
    .upsert({
      organization_id: organizationId,
      ig_comment_id: commentId,
      ig_media_id: mediaId || 'unknown',
      from_id: fromId || 'unknown',
      from_username: fromUsername,
      text: text,
      parent_id: parentId,
      comment_timestamp: new Date().toISOString(),
      raw_payload: value,
    }, { onConflict: 'ig_comment_id' })
    .select('id, replied_publicly, replied_privately')
    .single();

  if (commentErr) {
    console.error('[Instagram Webhook] Error persisting comment:', commentErr.message);
  }

  const rawToken = await decryptToken(igConnection.access_token_encrypted);
  if (!rawToken) {
    console.error('[Instagram Webhook] Decrypted access token unavailable for org:', organizationId);
    return;
  }

  // 2. Check and Trigger Public Auto-Reply Rules
  if (!savedComment?.replied_publicly) {
    const { data: replyRules } = await supabase
      .from('instagram_reply_rules')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    for (const rule of replyRules || []) {
      if (rule.media_id && mediaId && rule.media_id !== mediaId) continue;
      if (matchesKeyword(text, rule.trigger_keyword, rule.match_type)) {
        try {
          console.log(`[Instagram Auto-Reply] Match rule "${rule.name}" for comment ${commentId}`);
          const replyRes = await fetch(`https://graph.facebook.com/v22.0/${commentId}/replies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: rule.reply_message,
              access_token: rawToken,
            }),
          });
          const replyJson = await replyRes.json();
          if (!replyRes.ok) {
            console.error('[Instagram Auto-Reply Error]:', replyJson);
          } else {
            console.log('[Instagram Auto-Reply Success]:', replyJson);
            await supabase
              .from('instagram_comments')
              .update({ replied_publicly: true })
              .eq('ig_comment_id', commentId);

            await supabase
              .from('instagram_reply_rules')
              .update({ reply_count: (rule.reply_count || 0) + 1 })
              .eq('id', rule.id);
          }
        } catch (err) {
          console.error('[Instagram Auto-Reply Fetch Error]:', err.message);
        }
        break; // matched first active rule
      }
    }
  }

  // 3. Check and Queue Private Auto-DM Rules (Comment-to-DM)
  if (!savedComment?.replied_privately && fromId) {
    const { data: dmRules } = await supabase
      .from('instagram_dm_rules')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    for (const rule of dmRules || []) {
      if (rule.media_id && mediaId && rule.media_id !== mediaId) continue;
      if (matchesKeyword(text, rule.trigger_keyword, rule.match_type)) {
        console.log(`[Instagram Auto-DM] Enqueuing comment-to-DM job for comment ${commentId}`);
        const { error: queueErr } = await supabase
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

        if (queueErr) {
          console.warn('[Instagram Auto-DM] Queue insert error (maybe already queued):', queueErr.message);
        }
        break;
      }
    }
  }
}

async function handleInstagramDirectMessage(entry, messagingItem, igConnection) {
  const organizationId = igConnection.organization_id;
  const senderId = messagingItem.sender?.id;
  const recipientId = messagingItem.recipient?.id;
  const message = messagingItem.message || {};
  const messageId = message.mid;
  const messageText = message.text || '';
  const isEcho = message.is_echo || senderId === igConnection.instagram_business_id;

  if (!messageId) return;

  // 1. Deduplication check
  const { data: existing } = await supabase
    .from('messages')
    .select('id')
    .eq('wa_message_id', messageId)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log('[Instagram Webhook] Duplicate message, skipping:', messageId);
    return;
  }

  // 2. Handle attachments (images, video, audio, files)
  let mediaInfo = null;
  let msgType = 'text';
  const attachments = message.attachments || [];
  if (attachments.length > 0) {
    const att = attachments[0];
    const attType = att.type || 'image';
    msgType = attType === 'file' ? 'document' : attType;
    const mediaUrl = att.payload?.url;
    if (mediaUrl) {
      try {
        const rawToken = await decryptToken(igConnection.access_token_encrypted);
        const downloadRes = await fetch(mediaUrl, {
          headers: rawToken ? { Authorization: `Bearer ${rawToken}` } : {}
        });
        if (downloadRes.ok) {
          const buffer = await downloadRes.arrayBuffer();
          const mimeType = downloadRes.headers.get('content-type') || 'application/octet-stream';
          const safeId = String(messageId).replace(/[^a-zA-Z0-9_-]/g, '_');
          const ext = extFromMime(mimeType);
          const fileName = `ig_${safeId}.${ext}`;
          const storagePath = await uploadMediaToStorage(senderId, safeId, fileName, mimeType, buffer);
          mediaInfo = {
            mediaUrl: storagePath,
            mediaMimeType: mimeType,
            fileName: fileName,
            mediaSize: buffer.byteLength,
          };
        }
      } catch (err) {
        console.error('[Instagram Media] Download/Upload failed:', err.message);
      }
    }
  }

  // 3. Lead & Conversation setup
  let leadId = null;
  let conversationId = null;
  try {
    leadId = await findOrCreateLead(organizationId, senderId, senderId, 'Instagram');
    conversationId = await findOrCreateConversation(organizationId, leadId, 'instagram', senderId);
  } catch (err) {
    console.error('[Instagram Webhook] Lead/Conversation error:', err);
  }

  if (!conversationId) {
    console.warn('[Instagram Webhook] Storing Instagram message without conversation_id:', messageId);
  }

  const caption = message.caption || '';
  const displayContent = messageText || (mediaInfo ? (msgType === 'audio' ? 'Voice message' : `${msgType} message`) : '');

  // 4. Save message in messages table
  const messageRecord = {
    organization_id: organizationId,
    conversation_id: conversationId,
    wa_message_id: messageId,
    sender_number: senderId,
    content: displayContent,
    body: displayContent,
    message_body: displayContent,
    message_type: msgType,
    direction: isEcho ? 'outbound' : 'inbound',
    channel: 'instagram',
    received_at: new Date(messagingItem.timestamp || Date.now()).toISOString(),
    media_url: mediaInfo?.mediaUrl || null,
    media_mime_type: mediaInfo?.mediaMimeType || null,
    file_name: mediaInfo?.fileName || null,
    media_caption: caption || null,
    media_size: mediaInfo?.mediaSize || 0,
    status: 'sent',
  };

  const { error: msgErr } = await supabase.from('messages').insert(messageRecord);
  if (msgErr) {
    console.error('[Instagram Message] Supabase insert error:', msgErr);
  }

  // 5. Update conversation
  await supabase
    .from('conversations')
    .update({
      last_message: displayContent,
      last_timestamp: new Date(messagingItem.timestamp || Date.now()).toISOString(),
      channel: 'instagram',
    })
    .eq('id', conversationId);

  // 6. Also upsert in instagram_messages for compatibility
  await supabase
    .from('instagram_messages')
    .upsert({
      organization_id: organizationId,
      ig_message_id: messageId,
      sender_id: senderId || 'unknown',
      recipient_id: recipientId || 'unknown',
      content: messageText,
      message_type: msgType,
      direction: isEcho ? 'outbound' : 'inbound',
      received_at: new Date(messagingItem.timestamp || Date.now()).toISOString(),
    }, { onConflict: 'ig_message_id' });
}

// ---------------------------------------------------------------------------
// WhatsApp delivery receipts: update outbound rows by wa_message_id
// ---------------------------------------------------------------------------
const META_STATUS_TO_DB = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
};

async function applyDeliveryStatuses(statuses) {
  for (const status of statuses) {
    const waMessageId = status?.id;
    if (!waMessageId) continue;

    const mapped = META_STATUS_TO_DB[String(status.status || '').toLowerCase()];
    if (!mapped) continue;

    const patch = { status: mapped };
    if (mapped === 'failed') {
      patch.error_code = status.errors?.[0]?.code ?? null;
      patch.error_message = status.errors?.[0]?.title ?? 'Delivery failed';
    }

    const { error } = await supabase
      .from('messages')
      .update(patch)
      .eq('wa_message_id', waMessageId);

    if (error) {
      console.error(`[Webhook] status update failed for ${waMessageId}:`, error.message);
    } else {
      console.log(`[Webhook] message ${waMessageId} -> ${mapped}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const expectedToken = String(
      process.env.META_VERIFY_TOKEN || process.env.WEBHOOK_VERIFY_TOKEN || ''
    ).trim();

    // Fail closed, and compare exactly.
    //
    // A previous version accepted the handshake when META_VERIFY_TOKEN was
    // unset and also short-circuited on `|| token`, so ANY non-empty
    // hub.verify_token completed verification. That hands the endpoint to
    // whoever asks first. There is deliberately no built-in default secret
    // either: an unset variable must disable verification, not weaken it.
    if (!expectedToken) {
      console.error('[Webhook] META_VERIFY_TOKEN is not set; refusing the verification handshake.');
      return res.status(403).send('Forbidden');
    }

    if (mode === 'subscribe' && token && token === expectedToken) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method === 'POST') {
    const payload = req.body;
    // Declared outside the try so the acknowledgement below can always report
    // how many inbound messages were actually stored, even after a throw.
    let storedCount = 0;
    let expectedCount = 0;

    try {
      if (!supabase) {
        const missing = missingSupabaseServerConfig();
        console.error('[Webhook] Supabase configuration missing:', missing.join(', '));
        return res.status(503).json({ error: 'Server database configuration is unavailable.', missing });
      }

      // ---------------------------------------------------------------------
      // Branch A: Instagram Webhook Payload (object === 'instagram' or page feed events)
      // ---------------------------------------------------------------------
      if (payload?.object === 'instagram' || payload?.object === 'page') {
        const entries = payload.entry || [];
        for (const entry of entries) {
          const igBusinessId = entry.id; // Either IG business account ID or Page ID
          const igConnection = await getInstagramConnection(igBusinessId) ||
                               (await supabase
                                  .from('instagram_connections')
                                  .select('*')
                                  .or(`instagram_business_id.eq.${igBusinessId},page_id.eq.${igBusinessId}`)
                                  .eq('is_active', true)
                                  .limit(1))?.data?.[0];

          if (!igConnection) {
            console.warn('[Instagram Webhook] No active connection found for ID:', igBusinessId);
            continue;
          }

          // Handle changes (e.g. comments, mentions)
          if (Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              if (change.field === 'comments') {
                await handleInstagramComment(entry, change, igConnection);
              }
            }
          }

          // Handle messaging (DMs)
          if (Array.isArray(entry.messaging)) {
            for (const item of entry.messaging) {
              await handleInstagramDirectMessage(entry, item, igConnection);
            }
          }
        }

        return res.status(200).json({ received: true });
      }

      // ---------------------------------------------------------------------
      // Branch B: WhatsApp Webhook Payload (entry[0].changes[0].value.messages)
      // ---------------------------------------------------------------------
      const entry = payload?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const messages = value?.messages;
      const statuses = value?.statuses;
      const phoneNumberId = value?.metadata?.phone_number_id;

      // Delivery / read receipts for outbound messages.
      // Processed BEFORE the inbound early-return so status webhooks aren't dropped.
      if (Array.isArray(statuses) && statuses.length > 0) {
        try {
          await applyDeliveryStatuses(statuses);
        } catch (e) {
          console.error('[Webhook] Failed to apply delivery statuses:', e.message);
        }
      }

      if (!messages || messages.length === 0) {
        return res.status(200).json({ received: true });
      }
      expectedCount = messages.length;

      const waConnection = await getWhatsAppConnection(phoneNumberId);
      const organizationId = waConnection?.organization_id || (await getWhatsAppOrganizationId(phoneNumberId));
      if (!organizationId) {
        // Fail closed: without a tenant we must not write rows, or they would
        // land with a NULL organization_id and be invisible in every CRM inbox.
        // Answering 200 stops Meta retry-storming a payload we cannot place.
        console.error(
          '[Webhook] DROP: no active whatsapp_connections row for phone_number_id',
          phoneNumberId,
          '- connect WhatsApp in the app (Settings > Integrations > WhatsApp) so inbound can be attributed'
        );
        return res.status(200).json({ received: true, stored: 0, reason: 'no_tenant_for_phone_number_id' });
      }

      let decryptedToken = null;
      if (waConnection?.access_token_encrypted) {
        try {
          decryptedToken = await decryptToken(waConnection.access_token_encrypted);
        } catch (e) {
          console.warn('[Webhook] Could not decrypt org WhatsApp token:', e.message);
        }
      }
      if (!decryptedToken && waConnection?.access_token) {
        decryptedToken = waConnection.access_token;
      }
      if (!decryptedToken) {
        // The tenant IS resolved, so the message can still be stored. Only media
        // download and the AI reply need the token; dropping here lost real
        // inbound text purely because a credential was missing.
        console.warn(
          '[Webhook] No WhatsApp access token for phone_number_id', phoneNumberId,
          '- storing message without media download or auto-reply'
        );
      }

      let orgSettings = {};
      try {
        const { data } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', organizationId)
          .limit(1);
        orgSettings = data?.[0] || {};
      } catch (err) {
        console.warn('[Webhook] Could not fetch organization settings:', err.message);
      }

      for (const msg of messages) {
       try {
        const msgType = msg.type || 'text';
        const isMedia = MEDIA_TYPES.has(msgType);
        const sender = msg.from || '';

        if (msg.id) {
          const { data: existing } = await supabase
            .from('messages')
            .select('id')
            .eq('wa_message_id', msg.id)
            .limit(1);

          if (existing && existing.length > 0) {
            console.log('Duplicate message, skipping:', msg.id);
            continue;
          }
        }

        let mediaInfo = null;
        if (isMedia) {
          if (!decryptedToken) {
            console.warn(`[Webhook] No token to download media for ${msg.id} (${msgType}) - metadata only`);
          } else {
            mediaInfo = await processInboundMedia(msg, msgType, decryptedToken);
            if (!mediaInfo) {
              console.warn(`Media download failed for ${msg.id} (${msgType}) — saving message metadata only`);
            }
          }
        }

          const caption = msg[msgType]?.caption || msg.caption || '';
          let userText = '';
          if (msgType === 'text') {
            userText = msg.text?.body || '';
          } else if (msgType === 'interactive') {
            userText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || msg.interactive?.button_reply?.id || 'Interactive Reply';
          } else if (msgType === 'button') {
            userText = msg.button?.text || msg.button?.payload || 'Button Reply';
          } else if (msgType === 'location') {
            const loc = msg.location;
            userText = loc ? `📍 Location: ${loc.name || loc.address || (loc.latitude + ', ' + loc.longitude)}` : '📍 Location';
          } else if (msgType === 'contacts') {
            const c = msg.contacts?.[0];
            userText = c ? `👤 Contact: ${c.name?.formatted_name || c.phones?.[0]?.phone || 'Shared Contact'}` : '👤 Shared Contact';
          } else if (msgType === 'reaction') {
            userText = msg.reaction?.emoji ? `Reaction: ${msg.reaction.emoji}` : 'Reaction';
          } else if (isMedia) {
            userText = caption || (msgType === 'audio' || msgType === 'voice' ? '🎤 Voice message' : msgType === 'sticker' ? '🩷 Sticker' : `📎 ${msgType} message`);
          } else {
            userText = msg.text?.body || '📩 Inbound message';
          }

          let leadId = null;
          let conversationId = null;
          let chatHistory = [];

          try {
            const contactObj = value?.contacts?.find(c => c.wa_id === sender) || value?.contacts?.[0];
            const rawContactName = contactObj?.profile?.name || '';
            const formattedSender = sender && sender.length >= 10
              ? (sender.startsWith('91') && sender.length === 12 ? `+${sender.slice(0, 2)} ${sender.slice(2, 7)} ${sender.slice(7)}` : `+${sender}`)
              : sender;
            const contactName = rawContactName || (formattedSender ? `WhatsApp Contact (${formattedSender})` : 'WhatsApp Contact');
            leadId = await findOrCreateLead(organizationId, sender, contactName, 'WhatsApp');
            conversationId = await findOrCreateConversation(organizationId, leadId, 'whatsapp', contactName);

            if (isOptOut(userText) && leadId) {
              await supabase
                .from('leads')
                .update({
                  opted_out: true,
                  opted_out_at: new Date().toISOString(),
                  score: 0,
                  next_followup_at: null,
                  followup_count: 0,
                })
                .eq('id', leadId);
            } else {
              await supabase
                .from('leads')
                .update({
                  status: 'REPLIED',
                  follow_up_status: 'Paused',
                  next_followup_at: null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', leadId);
            }

            if (userText && msgType === 'text') {
              chatHistory = await fetchChatHistory(conversationId);
            }
          } catch (err) {
            console.error('[Webhook] Lead/Conversation setup error:', err);
          }

          if (!conversationId) {
            console.warn('[Webhook] Storing inbound message without conversation_id:', msg.id);
          }

          const messageRecord = {
            organization_id: organizationId,
            lead_id: leadId,
            conversation_id: conversationId,
            wa_message_id: msg.id,
            sender_number: sender,
            content: userText || '📩 Inbound message',
            body: userText || '📩 Inbound message',
            message_body: userText || '📩 Inbound message',
            message_type: msgType,
            direction: 'inbound',
            channel: 'whatsapp',
            received_at: new Date().toISOString(),
            media_url: mediaInfo?.mediaUrl || null,
            media_mime_type: mediaInfo?.mediaMimeType || null,
            file_name: mediaInfo?.fileName || null,
            media_caption: isMedia ? caption : null,
            media_size: mediaInfo?.mediaSize || 0,
            status: 'delivered',
          };

          const { error: msgError } = await supabase.from('messages').insert(messageRecord);
          if (msgError) {
            console.error('[Webhook] Supabase insert error:', msgError);
          } else {
            storedCount += 1;
          }

          await supabase
            .from('conversations')
            .update({
              last_message: messageRecord.content,
              last_timestamp: messageRecord.received_at,
              channel: 'whatsapp',
            })
            .eq('id', conversationId);

          if (userText && msgType === 'text' && leadId && !isOptOut(userText)) {
            let aiRaw = null;
            let replyText = "Hi there! I'd love to help you. Could you tell me a bit more about what you're looking for?";
            let crmData = null;

            try {
              aiRaw = await generateAIReply(orgSettings, chatHistory, userText);
              const parsed = parseAIResponse(aiRaw);
              replyText = parsed.replyText || replyText;
              crmData = parsed.crmData;
            } catch (err) {
              console.error('[AI Agent Webhook Fallback]:', err.message);
              const msgLower = userText.toLowerCase();
              if (msgLower.includes('price') || msgLower.includes('cost') || msgLower.includes('rate') || msgLower.includes('how much')) {
                replyText = "Hi! Our offerings are tailored to your needs — I can share details and pricing on a quick call. Shall we hop on a 10-min chat?";
              }
            }

            const sendResult = await sendWhatsAppMessage(phoneNumberId, sender, replyText, decryptedToken);

            const sentAt = new Date().toISOString();
            const { error: outboundError } = await supabase.from('messages').insert({
              organization_id: organizationId,
              conversation_id: conversationId,
              lead_id: leadId,
              wa_message_id: sendResult.messages?.[0]?.id,
              sender_number: sender,
              sender: 'agent',
              body: replyText,
              message_body: replyText,
              content: replyText,
              message_type: 'text',
              direction: 'outbound',
              received_at: sentAt,
              created_at: sentAt,
              is_ai: true,
              status: 'sent',
            });
            if (outboundError) {
              console.error('[Webhook] AI reply send/insert error:', outboundError.message);
            }

            await updateLeadFromCRM(leadId, crmData);

            await supabase
              .from('conversations')
              .update({
                last_message: replyText,
                last_timestamp: new Date().toISOString()
              })
              .eq('id', conversationId);
          }
       } catch (err) {
         // One bad message must not discard the rest of the batch: Meta can
         // deliver many messages per webhook call.
         console.error('[Webhook] Failed to process inbound message', msg && msg.id, ':', err.message);
       }
      }
    } catch (err) {
      console.error('Error processing webhook payload:', err);
    }

    if (expectedCount && storedCount !== expectedCount) {
      console.warn('[Webhook] stored', storedCount, 'of', expectedCount, 'inbound messages');
    }

    return res.status(200).json({ received: true, stored: storedCount });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}
