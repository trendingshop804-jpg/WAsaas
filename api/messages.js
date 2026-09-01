// api/messages.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
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
      // Deliberately fetch both inbound and outbound messages for the thread.
      .select('id, conversation_id, wa_message_id, sender_number, sender, body, message_body, content, message_type, direction, status, received_at, created_at, media_url, media_mime_type, file_name, media_caption, media_size')
      .order('received_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ error: error.message });
    }

    // For messages with media, resolve the stored storage path into a fetchable URL.
    const messages = await Promise.all((data || []).map(async (msg) => {
      if (!msg.media_url || msg.message_type === 'text') return msg;

      // Legacy rows (and the older Edge Function) stored a full URL rather than a
      // storage path. Passing that to createSignedUrl fails, so hand it back as-is.
      if (/^https?:\/\//i.test(msg.media_url)) return msg;

      const { data: urlData, error: urlError } = await supabase
        .storage
        .from('whatsapp-media')
        .createSignedUrl(msg.media_url, SIGNED_URL_TTL);

      if (urlError || !urlData?.signedUrl) {
        console.warn(`Failed to create signed URL for ${msg.media_url}:`, urlError?.message);
        // Bucket is public, so fall back to the public URL before giving up.
        const publicUrl = supabase.storage.from('whatsapp-media').getPublicUrl(msg.media_url).data?.publicUrl;
        return { ...msg, media_url: publicUrl || null };
      }

      return { ...msg, media_url: urlData.signedUrl };
    }));

    return res.status(200).json({ count: messages.length, messages });
  } catch (err) {
    console.error('API Error in /api/messages:', err);
    return res.status(500).json({ error: err.message });
  }
}
