import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Environment Variables — read at startup so misconfiguration is caught early.
// WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set in Vercel
// Environment Variables (Settings → Environment Variables in the dashboard).
// NEVER hardcode these values in source code.
// ---------------------------------------------------------------------------
export const SUPABASE_URL              = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
export const WHATSAPP_ACCESS_TOKEN     = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WA_ACCESS_TOKEN;
export const PHONE_NUMBER_ID           = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID || process.env.WA_PHONE_NUMBER_ID;
export const WABA_ID                   = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WABA_ID;
export const WHATSAPP_API_VERSION      = process.env.WHATSAPP_API_VERSION || 'v21.0';

export const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// ---------------------------------------------------------------------------
// Authorization guard for cron endpoints
// ---------------------------------------------------------------------------
export function authorizeCron(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // No secret configured → allow (dev/test mode)
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized — invalid CRON_SECRET' });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Configuration check — returns false and writes a clear error if secrets
// are missing. NEVER exposes the actual token values in the response.
// ---------------------------------------------------------------------------
export function hasRequiredConfig(res = null) {
  const missing = [];
  if (!supabase)                 missing.push('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  if (!WHATSAPP_ACCESS_TOKEN)    missing.push('WHATSAPP_ACCESS_TOKEN');
  if (!PHONE_NUMBER_ID)          missing.push('WHATSAPP_PHONE_NUMBER_ID');

  const isConfigured = missing.length === 0;

  if (!isConfigured && res) {
    res.status(400).json({
      error: 'WhatsApp integration is not configured.',
      missing,
      hint: 'Add the missing environment variables in Vercel → Settings → Environment Variables (never in source code).'
    });
  }
  return isConfigured;
}

// ---------------------------------------------------------------------------
// Phone normalization
// ---------------------------------------------------------------------------
export function normalizeInternationalPhone(phone) {
  if (!phone) return null;
  const cleaned = String(phone).replace(/[^0-9]/g, '');
  if (cleaned.length < 7 || cleaned.length > 15) return null;
  // 10-digit Indian number → prepend 91
  if (cleaned.length === 10) return `91${cleaned}`;
  return cleaned;
}

export function isUsablePhone(phone) {
  const normalized = normalizeInternationalPhone(phone);
  return Boolean(normalized && normalized.length >= 10 && normalized.length <= 15);
}

// ---------------------------------------------------------------------------
// sendMetaWhatsAppTemplate
// Executes a REAL Meta WhatsApp Cloud API message request using an approved
// message template. Only returns success when Meta confirms acceptance.
// Never fakes a message ID — throws instead.
// ---------------------------------------------------------------------------
export async function sendMetaWhatsAppTemplate({
  to,
  templateName = 'followup_message',
  languageCode  = 'en',
  parameters    = [],
}) {
  if (!WHATSAPP_ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    throw new Error('WhatsApp integration is not configured. Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID.');
  }

  const cleanPhone = normalizeInternationalPhone(to);
  if (!cleanPhone) {
    throw new Error(`Invalid phone number: "${to}". Must be a valid international number (7–15 digits).`);
  }

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                cleanPhone,
    type:              'template',
    template: {
      name:     templateName,
      language: { code: languageCode },
    },
  };

  if (parameters.length > 0) {
    payload.template.components = [
      {
        type:       'body',
        parameters: parameters.map(val => ({ type: 'text', text: String(val || '') })),
      },
    ];
  }

  const response = await fetch(url, {
    method:  'POST',
    headers: {
      // Authorization header uses WHATSAPP_ACCESS_TOKEN from env — never logged
      'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.error) {
    // Safe error: expose Meta's error message but NOT the token
    const errCode    = data.error?.code || response.status;
    const errMsg     = data.error?.message || `Meta WhatsApp API error HTTP ${response.status}`;
    const errSubcode = data.error?.error_subcode;
    const errType    = data.error?.type || '';

    // Provide actionable hints for common error codes
    let hint = '';
    if (errCode === 190)  hint = 'Access token is expired or invalid. Regenerate in Meta Business Manager.';
    if (errCode === 100)  hint = 'Phone Number ID is incorrect or the number is not registered.';
    if (errCode === 132001) hint = `Template "${templateName}" was not found. Verify the template name and language code in Meta Business Manager.`;
    if (errCode === 132015) hint = 'Template is paused or rejected. Check template status in Meta Business Manager.';
    if (errCode === 131026) hint = 'Recipient phone number is not a valid WhatsApp number.';
    if (errCode === 131047) hint = 'Message failed due to 24-hour window. Use a template message (not free-form text) for re-engagement.';

    console.error('[Meta Cloud API Error] code:', errCode, 'type:', errType, 'subcode:', errSubcode, 'message:', errMsg);
    throw new Error(`[Meta API ${errCode}] ${errMsg}${hint ? ' — Hint: ' + hint : ''}`);
  }

  // Verify Meta returned a real message ID — never generate a fake one
  const waMsgId = data.messages?.[0]?.id;
  if (!waMsgId) {
    console.error('[Meta Cloud API] Unexpected response shape — no messages[0].id:', JSON.stringify(data));
    throw new Error('Meta WhatsApp API returned success but did not include a message ID. Check Meta API version compatibility.');
  }

  return {
    success:           true,
    whatsappMessageId: waMsgId,
    data,
  };
}

// ---------------------------------------------------------------------------
// Duplicate-Send Protection
// Atomically acquires a processing lock on a lead using a conditional UPDATE.
// Returns true only if this process successfully claimed the lock.
// ---------------------------------------------------------------------------
export async function claimDueLead(leadId) {
  if (!supabase) return true; // Dev mode without DB — allow
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('leads')
    .update({ is_locked_for_sending: true, locked_at: now })
    .eq('id', leadId)
    .eq('is_locked_for_sending', false)   // Only claim if NOT already locked
    .select('id')
    .single();

  if (error || !data) {
    console.warn(`[DuplicateProtection] Lead ${leadId} is already locked — skipping.`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Release the duplicate-send lock after processing completes or fails.
// ---------------------------------------------------------------------------
export async function releaseLeadLock(leadId) {
  if (!supabase) return;
  await supabase
    .from('leads')
    .update({ is_locked_for_sending: false, locked_at: null })
    .eq('id', leadId);
}

// ---------------------------------------------------------------------------
// Update lead state in database after a send attempt.
// ---------------------------------------------------------------------------
export async function updateLeadState(id, updates) {
  if (!supabase) return;
  const { error } = await supabase.from('leads').update(updates).eq('id', id);
  if (error) throw new Error(`Lead state update failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Log a scheduler execution event to whatsapp_automation_logs.
// Tokens and secrets must NEVER be passed as details.
// ---------------------------------------------------------------------------
export async function logAutomationEvent(runId, event, leadId = null, details = '') {
  if (!supabase) return;
  try {
    await supabase.from('whatsapp_automation_logs').insert({
      run_id:     runId,
      event,
      lead_id:    leadId || null,
      details:    String(details).slice(0, 1000), // Truncate — never log secrets
    });
  } catch (err) {
    // Non-fatal — logging failure must not affect message delivery
    console.warn('[AutomationLog] Failed to write log entry:', err.message);
  }
}