// api/meta-webhook.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const SUPABASE_URL = process.env.SUPABASE_URL;

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker']);

const MIME_TO_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
  'application/pdf': 'pdf', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt', 'text/csv': 'csv', 'application/zip': 'zip'
};

function extFromMime(mimeType) {
  const clean = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (MIME_TO_EXT[clean]) return MIME_TO_EXT[clean];
  const sub = clean.split('/')[1] || 'bin';
  return /^[a-z0-9]{1,8}$/.test(sub) ? sub : 'bin';
}

async function downloadMediaFromMeta(mediaId) {
  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
  });
  if (!metaRes.ok) {
    const err = await metaRes.text();
    throw new Error(`Meta Media API error ${metaRes.status}: ${err}`);
  }
  const meta = await metaRes.json();
  const downloadUrl = meta.url;
  if (!downloadUrl) throw new Error(`No download URL returned for media ${mediaId}`);

  const downloadRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
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

async function processInboundMedia(msg, mediaType) {
  const mediaId = msg[mediaType]?.id;
  if (!mediaId) {
    console.warn(`Media message ${msg.id} has no ${mediaType}.id — skipping media download`);
    return null;
  }

  try {
    const { buffer, mimeType, fileName } = await downloadMediaFromMeta(mediaId);
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

async function getOrganizationId(phoneNumberId) {
  const { data } = await supabase
    .from('whatsapp_connections')
    .select('organization_id')
    .eq('phone_number_id', phoneNumberId)
    .eq('is_active', true)
    .limit(1);

  return data?.[0]?.organization_id || null;
}

async function findOrCreateLead(organizationId, phoneNumber) {
  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('phone', phoneNumber)
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0].id;
  }

  const { data: newLead, error } = await supabase
    .from('leads')
    .insert({
      organization_id: organizationId,
      company_name: 'WhatsApp Lead',
      contact_name: '',
      phone: phoneNumber,
      source: 'WhatsApp',
      status: 'NEW',
      score: 50,
      score_category: 'WARM',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Lead creation error:', error);
    throw new Error(`Failed to create lead: ${error.message}`);
  }

  return newLead.id;
}

async function findOrCreateConversation(organizationId, leadId) {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('lead_id', leadId)
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0].id;
  }

  const { data: newConv, error } = await supabase
    .from('conversations')
    .insert({
      organization_id: organizationId,
      lead_id: leadId,
      mode: 'AI',
      unread_count: 0,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Conversation creation error:', error);
    throw new Error(`Failed to create conversation: ${error.message}`);
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

async function sendWhatsAppMessage(phoneNumberId, toNumber, text) {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
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

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method === 'POST') {
    const payload = req.body;

    try {
      const entry = payload?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const messages = value?.messages;
      const phoneNumberId = value?.metadata?.phone_number_id;

      if (!messages || messages.length === 0) {
        return res.status(200).json({ received: true });
      }

      const organizationId = await getOrganizationId(phoneNumberId);
      if (!organizationId) {
        console.error('[Webhook] No active WhatsApp connection found for phone_number_id:', phoneNumberId);
        return res.status(200).json({ received: true });
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
          mediaInfo = await processInboundMedia(msg, msgType);
          if (!mediaInfo) {
            console.warn(`Media download failed for ${msg.id} (${msgType}) — saving message metadata only`);
          }
        }

        const caption = msg[msgType]?.caption || msg.caption || '';
        const userText = isMedia ? caption : (msg.text?.body || '');

        let leadId = null;
        let conversationId = null;
        let chatHistory = [];

        try {
          leadId = await findOrCreateLead(organizationId, sender);
          conversationId = await findOrCreateConversation(organizationId, leadId);

          // Any inbound WhatsApp message stops the scheduled follow-up sequence.
          await supabase
            .from('leads')
            .update({ status: 'REPLIED', next_followup_at: null })
            .eq('id', leadId);

          if (userText && msgType === 'text') {
            chatHistory = await fetchChatHistory(conversationId);
          }
        } catch (err) {
          console.error('[Webhook] Lead/Conversation setup error:', err);
        }

        if (!conversationId) {
          console.error('[Webhook] Skipping message — no conversation_id available');
          continue;
        }

        const messageRecord = {
          conversation_id: conversationId,
          wa_message_id: msg.id,
          sender_number: sender,
          content: userText || (isMedia ? (msgType === 'audio' ? 'Voice message' : `${msgType} message`) : ''),
          message_type: msgType,
          direction: 'inbound',
          received_at: new Date().toISOString(),
          media_url: mediaInfo?.mediaUrl || null,
          media_mime_type: mediaInfo?.mediaMimeType || null,
          file_name: mediaInfo?.fileName || null,
          media_caption: isMedia ? caption : null,
          media_size: mediaInfo?.mediaSize || 0,
          status: 'SENT',
        };

        const { error: msgError } = await supabase.from('messages').insert(messageRecord);
        if (msgError) {
          console.error('[Webhook] Supabase insert error:', msgError);
        }

        if (userText && msgType === 'text' && leadId) {
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

          const sendResult = await sendWhatsAppMessage(phoneNumberId, sender, replyText);

          const sentAt = new Date().toISOString();
          const { error: outboundError } = await supabase.from('messages').insert({
            conversation_id: conversationId,
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
          if (outboundError) throw outboundError;

          await updateLeadFromCRM(leadId, crmData);

          await supabase
            .from('conversations')
            .update({
              last_message: replyText,
              last_timestamp: new Date().toISOString()
            })
            .eq('id', conversationId);
        }
      }
    } catch (err) {
      console.error('Error processing webhook payload:', err);
    }

    return res.status(200).json({ received: true });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}
