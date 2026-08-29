import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
export const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WA_ACCESS_TOKEN;
export const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.WA_PHONE_NUMBER_ID;

export const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

export function authorizeCron(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export function hasRequiredConfig(res) {
  if (!supabase || !WHATSAPP_ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    res.status(500).json({ error: 'Lead follow-up service is not configured' });
    return false;
  }
  return true;
}

export async function sendTemplate(to, templateName) {
  const response = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to, type: 'template',
      template: { name: templateName, language: { code: 'en' } },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error?.message || `WhatsApp API error ${response.status}`);
  return data;
}

export async function updateLead(id, updates) {
  const { error } = await supabase.from('leads').update(updates).eq('id', id);
  if (error) throw new Error(`Lead update failed: ${error.message}`);
}

export function isUsablePhone(phone) {
  return typeof phone === 'string' && /^[1-9][0-9]{6,14}$/.test(phone.replace(/[^0-9]/g, ''));
}