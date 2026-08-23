// api/messages.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
      .select('id, sender_number, content, message_type, direction, payload, received_at')
      .order('received_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ count: data ? data.length : 0, messages: data || [] });
  } catch (err) {
    console.error('API Error in /api/messages:', err);
    return res.status(500).json({ error: err.message });
  }
}
