// api/messages.js
import { createSupabaseAdminClient, missingSupabaseServerConfig } from './_supabase.js';


const SIGNED_URL_TTL = 60 * 60 * 24; // 24 hours

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ['https://yourdomain.com', 'https://app.yourdomain.com', 'http://localhost:3000']);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    const missing = missingSupabaseServerConfig();
    console.error('[messages] Supabase configuration missing:', missing.join(', '));
    return res.status(503).json({ error: 'Server database configuration is unavailable.', missing, messages: [] });
  }

  const organizationId = req.query?.organization_id;
  if (!organizationId) return res.status(400).json({ error: 'organization_id is required.', messages: [] });

  try {
    let query = supabase.from('messages').select('*').eq('organization_id', organizationId);

    if (req.query?.conversation_id) {
      query = query.eq('conversation_id', req.query.conversation_id);
    }
    if (req.query?.organization_id) {
      query = query.eq('organization_id', req.query.organization_id);
    }

    let { data, error } = await query
      .order('received_at', { ascending: false, nullsFirst: false })
      .limit(100);

    if (error) {
      const fallbackRes = await supabase
        .from('messages')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(100);
      data = fallbackRes.data;
      error = fallbackRes.error;
    }

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ error: error.message, messages: [] });
    }

    // For messages with media, resolve the stored storage path into a fetchable URL.
    const messages = await Promise.all((data || []).map(async (msg) => {
      if (!msg.media_url || msg.message_type === 'text') return msg;

      // Legacy rows (and older Edge Functions) stored a full URL rather than a
      // storage path. Passing that to createSignedUrl fails, so hand it back as-is.
      if (/^https?:\/\//i.test(msg.media_url)) {
        return { ...msg, mediaUrl: msg.media_url };
      }

      let cleanPath = msg.media_url;
      if (cleanPath.startsWith('whatsapp-media/')) {
        cleanPath = cleanPath.replace(/^whatsapp-media\//, '');
      }

      const { data: urlData, error: urlError } = await supabase
        .storage
        .from('whatsapp-media')
        .createSignedUrl(cleanPath, SIGNED_URL_TTL);

      if (urlError || !urlData?.signedUrl) {
        console.warn(`Failed to create signed URL for ${msg.media_url}:`, urlError?.message);
        // Bucket fallback if signed URL creation fails
        const publicUrl = supabase.storage.from('whatsapp-media').getPublicUrl(cleanPath).data?.publicUrl;
        const finalUrl = publicUrl || null;
        return { ...msg, media_url: finalUrl, mediaUrl: finalUrl };
      }

      return { ...msg, media_url: urlData.signedUrl, mediaUrl: urlData.signedUrl };
    }));

    return res.status(200).json({ count: messages.length, messages });
  } catch (err) {
    console.error('API Error in /api/messages:', err);
    return res.status(500).json({ error: err.message, messages: [] });
  }
}
