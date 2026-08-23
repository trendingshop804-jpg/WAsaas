// api/meta-webhook.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    console.log('Meta webhook received payload:', JSON.stringify(payload));

    try {
      const entry = payload?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const messages = value?.messages;

      if (messages && messages.length > 0) {
        for (const msg of messages) {
          const { error } = await supabase.from('messages').insert({
            sender_number: msg.from,
            content: msg.text?.body || null,
            message_type: msg.type || 'text',
            direction: 'inbound',
            payload: payload,
            received_at: new Date().toISOString(),
          });

          if (error) {
            console.error('Supabase insert error:', error);
          } else {
            console.log('Message saved to Supabase:', msg.id);
          }
        }
      } else {
        console.log('No messages array in payload (likely a status update)');
      }
    } catch (err) {
      console.error('Error processing webhook payload:', err);
    }

    return res.status(200).json({ received: true });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}
