// api/meta-webhook.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const SUPABASE_URL = process.env.SUPABASE_URL;

// WhatsApp media message types that carry a media_id (Meta returns media_id, not URL)
const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker']);

/**
 * Download media from Meta's Graph API.
 * Step 1: GET /{media_id}?access_token=… → returns { url, content_type?, ... }
 * Step 2: GET {url} → returns binary data
 */
async function downloadMediaFromMeta(mediaId) {
  const metaUrl = `https://graph.facebook.com/v21.0/${mediaId}?access_token=${WHATSAPP_ACCESS_TOKEN}`;
  const metaRes = await fetch(metaUrl);
  if (!metaRes.ok) {
    const err = await metaRes.text();
    throw new Error(`Meta Media API error ${metaRes.status}: ${err}`);
  }
  const meta = await metaRes.json();

  const downloadUrl = meta.url;
  if (!downloadUrl) throw new Error(`No download URL returned for media ${mediaId}`);

  const downloadRes = await fetch(downloadUrl);
  if (!downloadRes.ok) {
    throw new Error(`Failed to download media from ${downloadUrl}: ${downloadRes.status}`);
  }

  const buffer = await downloadRes.arrayBuffer();
  const mimeType = meta.content_type || downloadRes.headers.get('content-type') || 'application/octet-stream';
  const fileName = meta.filename || `${mediaId}`;

  return { buffer, mimeType, fileName };
}

/**
 * Upload media buffer to Supabase Storage (private bucket 'whatsapp-media').
 * Returns the storage path for later signed-URL generation.
 */
async function uploadMediaToStorage(senderNumber, mediaId, fileName, mimeType, buffer) {
  const cleanPhone = String(senderNumber || '').replace(/[^0-9]/g, '').slice(-10);
  const ext = (mimeType.split('/')[1] || 'bin').split(';')[0];
  const safeFileName = `${mediaId}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storagePath = `${cleanPhone}/${mediaId}/${safeFileName}.${ext}`;

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

  return uploadData.path;
}

/**
 * Download media from Meta, upload to Supabase Storage.
 * Returns { mediaUrl, mediaMimeType, fileName } or null on failure.
 */
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


const SYSTEM_PROMPT = `=== 1. ROLE & IDENTITY ===
You are a World-Class Sales Executive specializing in Websites, Custom SaaS, and Enterprise Software solutions.
Your sole mission is to understand client requirements, demonstrate maximum business value, handle objections with precision, and CLOSE the deal fast on WhatsApp.

OUR SERVICES & OFFERINGS:
- High-Converting Business Websites (React, Next.js, WordPress): Starts at ₹10,000 / $150
- Custom SaaS & Web Application Development: Starts at ₹45,000 / $600
- Custom AI Agents & Automation Software: Starts at ₹15,000 / $200

=== 2. THINKING FRAMEWORK (INTERNAL EXECUTION) ===
For every inbound customer message, process your response internally through these 3 steps:

STEP A: UNDERSTAND
- Identify client needs (Website, SaaS, Software, or Custom AI Agent).
- Detect the customer's language (Tanglish, Tamil, or English) and reply in the same language naturally.

STEP B: HANDLE OBJECTIONS
- If "Costly": Position software as a 24/7 asset that generates revenue and cuts operational costs, not an expense.
- If "Need Time": Offer a free demo / quick 5-min video, or create urgency with a limited-time bonus/discount.

STEP C: CLOSE
- Always push for a concrete next step: Google Meet Call, Demo Link, or Advance Payment.

=== 3. SELF-CORRECTION & REFINEMENT (CONSTRAINTS) ===
Before outputting the message, enforce these strict criteria:
- Is it short? (MUST be under 3 sentences / 50 words max).
- Is it high-converting? (No fluff, clear ROI value proposition).
- Does it end with a closing CTA? (ALWAYS end with a direct question like "Shall I send the payment link?" or "Can we hop on a quick 10-min Google Meet call?").

OUTPUT ONLY THE FINAL WHATSAPP MESSAGE TO THE CLIENT.`;

async function generateAIReply(userMessage) {
  try {
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
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 150
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
  } catch (err) {
    console.error('[AI Agent Webhook Fallback]:', err.message);
    const msgLower = userMessage.toLowerCase();
    if (msgLower.includes('price') || msgLower.includes('cost') || msgLower.includes('rate') || msgLower.includes('how much')) {
      return "Hi! Our high-converting business websites start at ₹10,000 and custom SaaS starts at ₹45,000—built to scale your revenue 24/7. Shall we jump on a quick 10-min Google Meet call to discuss your project?";
    }
    return "Hi there! I'd love to help you build your website, custom SaaS, or AI automation. Could you tell me a bit more about your project goals, or shall I book a quick 15-min Google Meet demo call for us?";
  }
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

      if (messages && messages.length > 0) {
        for (const msg of messages) {
          const msgType = msg.type || 'text';
          const isMedia = MEDIA_TYPES.has(msgType);

          // ---- Media messages: download from Meta, upload to Supabase Storage ----
          let mediaInfo = null;
          if (isMedia) {
            mediaInfo = await processInboundMedia(msg, msgType);
            if (!mediaInfo) {
              console.warn(`Media download failed for ${msg.id} (${msgType}) — saving message metadata only`);
            }
          }

          // ---- Extract content/caption for display ----
          const caption = msg[msgType]?.caption || msg.caption || '';
          const userText = isMedia ? caption : (msg.text?.body || '');

          // ---- Duplicate check ----
          const { data: existing } = await supabase
            .from('messages')
            .select('id')
            .eq('wa_message_id', msg.id)
            .limit(1);

          if (existing && existing.length > 0) {
            console.log('Duplicate message, skipping:', msg.id);
            continue;
          }

          // ---- Save inbound message (with media fields if applicable) ----
          const { error } = await supabase.from('messages').insert({
            wa_message_id: msg.id,
            sender_number: msg.from,
            content: userText || (isMedia ? (msgType === 'audio' ? '🎤 Voice message' : `📎 ${msgType} message`) : ''),
            message_type: msgType,
            direction: 'inbound',
            received_at: new Date().toISOString(),
            media_url: mediaInfo?.mediaUrl || null,
            media_mime_type: mediaInfo?.mediaMimeType || null,
            file_name: mediaInfo?.fileName || null,
            media_caption: isMedia ? caption : null,
            media_size: mediaInfo?.mediaSize || 0,
          });

          if (error) {
            console.error('Supabase insert error:', error);
          }

          // AI reply via OpenRouter (text messages only)
          if (userText && msgType === 'text') {
            const aiReply = await generateAIReply(userText);
            await sendWhatsAppMessage(phoneNumberId, msg.from, aiReply);

            await supabase.from('messages').insert({
              sender_number: msg.from,
              content: aiReply,
              message_type: 'text',
              direction: 'outbound',
              received_at: new Date().toISOString(),
            });
          }
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
