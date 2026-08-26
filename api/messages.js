// api/messages.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SIGNED_URL_TTL = 60 * 60 * 24; // 24 hours

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id, wa_message_id, sender_number, content, message_type, direction, received_at, media_url, media_mime_type, file_name, media_caption, media_size')
      .order('received_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ error: error.message });
    }

    // For messages with media, generate a signed URL from private storage
    const messages = await Promise.all((data || []).map(async (msg) => {
      if (msg.media_url && msg.message_type !== 'text') {
        const { data: urlData, error: urlError } = await supabase
          .storage
          .from('whatsapp-media')
          .createSignedUrl(msg.media_url, SIGNED_URL_TTL);

        if (urlError) {
          console.warn(`Failed to create signed URL for ${msg.media_url}:`, urlError.message);
          return { ...msg, media_url: null };
        }

        return { ...msg, media_url: urlData?.signedUrl || null };
      }
      return msg;
    }));

    return res.status(200).json({ count: messages.length, messages });
  } catch (err) {
    console.error('API Error in /api/messages:', err);
    return res.status(500).json({ error: err.message });
  }
}
