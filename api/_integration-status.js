/**
 * Server-side integration health checks.
 *
 * This module deliberately reports only provider responses and non-sensitive
 * metadata. Credentials are read from server environment variables and are
 * never returned to the browser.
 */

const REQUEST_TIMEOUT_MS = 8_000;
const META_GRAPH_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

function firstEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

function result(status, message, extra = {}) {
  return {
    status,
    connected: status === 'connected',
    configured: status !== 'not_configured',
    source: 'live',
    message,
    checkedAt: new Date().toISOString(),
    ...extra
  };
}

function notConfigured(integration, missing) {
  return result(
    'not_configured',
    `${integration} is not configured on the server. Missing: ${missing.join(', ')}.`,
    { missing }
  );
}

function errorMessage(payload, response) {
  const message = payload?.error?.message || payload?.message || `Provider returned HTTP ${response.status}.`;
  return String(message).replace(/\s+/g, ' ').slice(0, 240);
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Provider request timed out.');
      timeoutError.code = 'TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function checkWhatsApp() {
  const accessToken = firstEnv('WHATSAPP_ACCESS_TOKEN', 'WA_ACCESS_TOKEN', 'META_ACCESS_TOKEN');
  const phoneNumberId = firstEnv('WHATSAPP_PHONE_NUMBER_ID', 'PHONE_NUMBER_ID', 'WA_PHONE_NUMBER_ID');
  const missing = [];
  if (!accessToken) missing.push('WHATSAPP_ACCESS_TOKEN');
  if (!phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
  if (missing.length) return notConfigured('WhatsApp Cloud API', missing);

  const startedAt = Date.now();
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`;
  try {
    const { response, payload } = await requestJson(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok || payload?.error) {
      return result('error', `WhatsApp connection failed: ${errorMessage(payload, response)}`, { latencyMs });
    }

    return result('connected', 'WhatsApp Cloud API responded successfully.', {
      latencyMs,
      provider: 'Meta WhatsApp Cloud API',
      displayName: payload.verified_name || payload.display_phone_number || null
    });
  } catch (error) {
    return result(error?.code === 'TIMEOUT' ? 'unavailable' : 'error', `WhatsApp connection unavailable: ${error.message}`, {
      latencyMs: Date.now() - startedAt
    });
  }
}

async function checkInstagram() {
  const accessToken = firstEnv('INSTAGRAM_ACCESS_TOKEN', 'META_INSTAGRAM_ACCESS_TOKEN', 'META_ACCESS_TOKEN');
  const accountId = firstEnv('INSTAGRAM_BUSINESS_ID', 'INSTAGRAM_ACCOUNT_ID', 'INSTAGRAM_ID', 'INSTAGRAM_PAGE_ID');
  const missing = [];
  if (!accessToken) missing.push('INSTAGRAM_ACCESS_TOKEN');
  if (!accountId) missing.push('INSTAGRAM_BUSINESS_ID');
  if (missing.length) return notConfigured('Instagram Graph API', missing);

  const startedAt = Date.now();
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(accountId)}?fields=id,username,name`;
  try {
    const { response, payload } = await requestJson(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok || payload?.error) {
      return result('error', `Instagram connection failed: ${errorMessage(payload, response)}`, { latencyMs });
    }

    return result('connected', 'Instagram Graph API responded successfully.', {
      latencyMs,
      provider: 'Meta Instagram Graph API',
      displayName: payload.username || payload.name || null
    });
  } catch (error) {
    return result(error?.code === 'TIMEOUT' ? 'unavailable' : 'error', `Instagram connection unavailable: ${error.message}`, {
      latencyMs: Date.now() - startedAt
    });
  }
}

async function checkTwilio() {
  const accountSid = firstEnv('TWILIO_ACCOUNT_SID', 'TWILIO_SID');
  const authToken = firstEnv('TWILIO_AUTH_TOKEN', 'TWILIO_TOKEN');
  const missing = [];
  if (!accountSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!authToken) missing.push('TWILIO_AUTH_TOKEN');
  if (missing.length) return notConfigured('Twilio Voice', missing);

  const startedAt = Date.now();
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`;
  try {
    const { response, payload } = await requestJson(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
      }
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok || payload?.code) {
      const message = payload?.message || `Twilio returned HTTP ${response.status}.`;
      return result('error', `Twilio connection failed: ${String(message).slice(0, 240)}`, { latencyMs });
    }

    return result('connected', 'Twilio account responded successfully.', {
      latencyMs,
      provider: 'Twilio Voice',
      displayName: payload.friendly_name || payload.account_sid || null
    });
  } catch (error) {
    return result(error?.code === 'TIMEOUT' ? 'unavailable' : 'error', `Twilio connection unavailable: ${error.message}`, {
      latencyMs: Date.now() - startedAt
    });
  }
}

async function checkStripe() {
  const secretKey = firstEnv('STRIPE_SECRET_KEY', 'STRIPE_API_KEY');
  if (!secretKey) return notConfigured('Stripe Payments', ['STRIPE_SECRET_KEY']);

  const startedAt = Date.now();
  try {
    const { response, payload } = await requestJson('https://api.stripe.com/v1/account', {
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok || payload?.error) {
      const message = payload?.error?.message || `Stripe returned HTTP ${response.status}.`;
      return result('error', `Stripe connection failed: ${String(message).slice(0, 240)}`, { latencyMs });
    }

    const capabilities = payload.charges_enabled && payload.payouts_enabled;
    return result('connected', capabilities
      ? 'Stripe account responded successfully and payment capabilities are enabled.'
      : 'Stripe responded successfully, but payment capabilities are not fully enabled.', {
      latencyMs,
      provider: 'Stripe',
      displayName: payload.business_profile?.name || payload.settings?.dashboard?.display_name || null
    });
  } catch (error) {
    return result(error?.code === 'TIMEOUT' ? 'unavailable' : 'error', `Stripe connection unavailable: ${error.message}`, {
      latencyMs: Date.now() - startedAt
    });
  }
}

const CHECKERS = {
  whatsapp: checkWhatsApp,
  instagram: checkInstagram,
  twilio: checkTwilio,
  stripe: checkStripe
};

export const INTEGRATION_KEYS = Object.keys(CHECKERS);

export function normalizeIntegrationKey(key) {
  const value = String(key || '').trim().toLowerCase();
  if (value === 'wa' || value === 'whatsapp-monitor') return 'whatsapp';
  if (value === 'ig' || value === 'insta-mon' || value === 'instagram-monitor') return 'instagram';
  if (value === 'calls' || value === 'calls-monitor') return 'twilio';
  return value;
}

export async function getIntegrationStatuses(keys = INTEGRATION_KEYS) {
  const selected = [...new Set((keys || []).map(normalizeIntegrationKey).filter(key => CHECKERS[key]))];
  const entries = await Promise.all(selected.map(async key => [key, await CHECKERS[key]()]));
  return Object.fromEntries(entries);
}
