// api/meta-webhook.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generateAIReply(userMessage) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are a helpful WhatsApp business assistant for NextBright Solutions. Keep replies short, friendly, and professional (under 40 words). Customer message: "${userMessage}"`,
              },
            ],
          },
        ],
      }),
    }
  );
  const data = await response.json();
  if (!response.ok) {
    console.error('Gemini API error:', data);
    return "Thanks for your message! Our team will get back to you shortly. 🙏";
  }
  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text ||
    "Thanks for your message! Our team will get back to you shortly. 🙏"
  );
}

async function sendWhatsAppMessage(phoneNumberId, toNumber, text) {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
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
          const userText = msg.text?.body || '';

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

          // Save inbound message
          const { error } = await supabase.from('messages').insert({
            wa_message_id: msg.id,
            sender_number: msg.from,
            content: userText,
            message_type: msg.type || 'text',
            direction: 'inbound',
            received_at: new Date().toISOString(),
          });

          if (error) {
            console.error('Supabase insert error:', error);
          }

          // AI reply via Gemini
          if (userText && msg.type === 'text') {
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
