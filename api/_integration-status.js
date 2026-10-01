/**
 * Server-side integration health checks.
 *
 * Instagram uses the tenant-scoped connection stored in
 * instagram_connections. Global env credentials are only used as
 * a backwards-compatible fallback when no organization context exists.
 */

import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './_crypto.js';

const REQUEST_TIMEOUT_MS = 8_000;
const META_GRAPH_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

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

function notConfigured(integration, missing, extra = {}) {
  return result(
    'not_configured',
    `${integration} is not configured on the server. Missing: ${missing.join(', ')}.`,
    { missing, ...extra }
  );
}

function errorMessage(payload, response) {
  const message =
    payload?.error?.message ||
    payload?.message ||
    `Provider returned HTTP ${response.status}.`;

  return String(message).replace(/\s+/g, ' ').slice(0, 240);
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

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

async function checkWhatsApp(customConfig = {}) {
  const accessToken =
    customConfig.accessToken ||
    firstEnv(
      'WHATSAPP_ACCESS_TOKEN',
      'WA_ACCESS_TOKEN',
      'META_ACCESS_TOKEN'
    );

  const phoneNumberId =
    customConfig.phoneNumberId ||
    firstEnv(
      'WHATSAPP_PHONE_NUMBER_ID',
      'PHONE_NUMBER_ID',
      'WA_PHONE_NUMBER_ID'
    );

  const missing = [];

  if (!accessToken) missing.push('WHATSAPP_ACCESS_TOKEN');
  if (!phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');

  if (missing.length) {
    return notConfigured('WhatsApp Cloud API', missing);
  }

  const startedAt = Date.now();

  const url =
    `https://graph.facebook.com/${META_GRAPH_VERSION}/` +
    `${encodeURIComponent(phoneNumberId)}` +
    `?fields=display_phone_number,verified_name,quality_rating`;

  try {
    const { response, payload } = await requestJson(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok || payload?.error) {
      const errCode = payload?.error?.code;
      const errMsg = errorMessage(payload, response);

      if (errCode === 190) {
        return result(
          'token_expired',
          'WhatsApp connection failed: Meta Access Token has expired or been invalidated.',
          { latencyMs, code: 190 }
        );
      }

      if (errCode === 100 || errCode === 200 || errCode === 10) {
        return result(
          'permission_missing',
          `WhatsApp connection failed: Messaging permission or Phone ID configuration missing (${errMsg}).`,
          { latencyMs, code: errCode }
        );
      }

      return result(
        'error',
        `WhatsApp connection failed: ${errMsg}`,
        { latencyMs, code: errCode || response.status }
      );
    }

    const verifiedName =
      payload.verified_name ||
      payload.display_phone_number ||
      null;

    return result(
      'connected',
      'WhatsApp Cloud API responded successfully.',
      {
        latencyMs,
        provider: 'Meta WhatsApp Cloud API',
        displayName: verifiedName,
        verifiedName,
        phoneNumberId,
        qualityRating: payload.quality_rating || 'UNKNOWN'
      }
    );
  } catch (error) {
    return result(
      error?.code === 'TIMEOUT' ? 'unavailable' : 'error',
      `WhatsApp connection unavailable: ${error.message}`,
      {
        latencyMs: Date.now() - startedAt
      }
    );
  }
}

async function getInstagramTenantConfig(organizationId) {
  if (!organizationId || !supabase) return null;

  const { data, error } = await supabase
    .from('instagram_connections')
    .select(
      'instagram_business_id, instagram_username, page_id, access_token_encrypted, is_active'
    )
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      '[integration-status] Instagram connection lookup failed:',
      error.message
    );
    return null;
  }

  if (!data?.access_token_encrypted || !data?.instagram_business_id) {
    return null;
  }

  const accessToken = await decryptToken(data.access_token_encrypted);

  if (!accessToken) return null;

  return {
    accessToken,
    accountId: data.instagram_business_id,
    username: data.instagram_username || null,
    pageId: data.page_id || null
  };
}

async function checkInstagram(customConfig = {}) {
  const tenantConfig = await getInstagramTenantConfig(
    customConfig.organizationId
  );

  const accessToken =
    customConfig.accessToken ||
    tenantConfig?.accessToken ||
    firstEnv(
      'INSTAGRAM_ACCESS_TOKEN',
      'META_INSTAGRAM_ACCESS_TOKEN',
      'META_ACCESS_TOKEN'
    );

  const accountId =
    customConfig.accountId ||
    tenantConfig?.accountId ||
    firstEnv(
      'INSTAGRAM_BUSINESS_ID',
      'INSTAGRAM_ACCOUNT_ID',
      'INSTAGRAM_ID',
      'INSTAGRAM_PAGE_ID'
    );

  const missing = [];

  if (!accessToken) missing.push('INSTAGRAM_ACCESS_TOKEN');
  if (!accountId) missing.push('INSTAGRAM_BUSINESS_ID');

  if (missing.length) {
    return notConfigured('Instagram Graph API', missing);
  }

  const startedAt = Date.now();

  const url =
    `https://graph.facebook.com/${META_GRAPH_VERSION}/` +
    `${encodeURIComponent(accountId)}?fields=id,username,name`;

  try {
    const { response, payload } = await requestJson(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok || payload?.error) {
      const errCode = payload?.error?.code;
      const errMsg = errorMessage(payload, response);

      if (errCode === 190) {
        return result(
          'token_expired',
          'Instagram connection failed: Meta Access Token has expired or been invalidated.',
          {
            latencyMs,
            code: 190
          }
        );
      }

      if (errCode === 100 || errCode === 200 || errCode === 10) {
        return result(
          'permission_missing',
          `Instagram connection failed: Messaging permission or Page ID missing (${errMsg}).`,
          {
            latencyMs,
            code: errCode
          }
        );
      }

      return result(
        'error',
        `Instagram connection failed: ${errMsg}`,
        {
          latencyMs,
          code: errCode || response.status
        }
      );
    }

    return result(
      'connected',
      'Instagram Graph API responded successfully.',
      {
        latencyMs,
        provider: 'Meta Instagram Graph API',
        displayName:
          payload.username ||
          payload.name ||
          tenantConfig?.username ||
          null,
        accountId
      }
    );
  } catch (error) {
    return result(
      error?.code === 'TIMEOUT' ? 'unavailable' : 'error',
      `Instagram connection unavailable: ${error.message}`,
      {
        latencyMs: Date.now() - startedAt
      }
    );
  }
}

// A Twilio Account SID is always "AC" followed by 32 hex characters. Catching a
// malformed value here turns an opaque HTTP 401 from Twilio into a clear message.
const TWILIO_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/;

async function checkTwilio() {
  const accountSid = firstEnv('TWILIO_ACCOUNT_SID', 'TWILIO_SID');
  const authToken = firstEnv('TWILIO_AUTH_TOKEN', 'TWILIO_TOKEN');

  const missing = [];

  if (!accountSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!authToken) missing.push('TWILIO_AUTH_TOKEN');

  if (missing.length) {
    // These are deployment secrets and can only be supplied as server
    // environment variables - the in-app integration form stores its values in
    // this browser's localStorage and never reaches this process. Say exactly
    // where to set them, otherwise this status can never turn green.
    return notConfigured('Twilio Voice', missing, {
      envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
      setupHint:
        'Set these as Vercel environment variables for this project ' +
        '(Settings > Environment Variables), then redeploy. They cannot be set ' +
        'from the in-app Integrations form.',
    });
  }

  if (!TWILIO_SID_PATTERN.test(accountSid)) {
    return result('error', 'TWILIO_ACCOUNT_SID is not a valid Twilio Account SID (expected "AC" + 32 hex characters).', {
      envVars: ['TWILIO_ACCOUNT_SID'],
    });
  }

  // Not required to reach the API, but without a Twilio number no call can be
  // placed. Reported as a warning so a "connected" badge is never misleading.
  const fromNumber = firstEnv('TWILIO_FROM_NUMBER', 'TWILIO_PHONE_NUMBER', 'TWILIO_CALLER_NUMBER');
  const warnings = fromNumber
    ? []
    : ['No Twilio caller number configured (TWILIO_FROM_NUMBER); the account is reachable but outbound calls cannot be placed.'];

  const startedAt = Date.now();

  const url =
    `https://api.twilio.com/2010-04-01/Accounts/` +
    `${encodeURIComponent(accountSid)}.json`;

  try {
    const { response, payload } = await requestJson(url, {
      headers: {
        Authorization:
          `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
      }
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok || payload?.code) {
      const message =
        payload?.message ||
        `Twilio returned HTTP ${response.status}.`;

      // HTTP 401 here is almost always a bad Auth Token rather than a bad SID,
      // and it is the single most common misconfiguration. Name it.
      const hint =
        response.status === 401
          ? ' Twilio rejected the credentials - check that TWILIO_AUTH_TOKEN matches this TWILIO_ACCOUNT_SID.'
          : '';

      return result(
        'error',
        `Twilio connection failed: ${String(message).slice(0, 200)}${hint}`,
        { latencyMs, warnings }
      );
    }

    return result(
      'connected',
      'Twilio account responded successfully.',
      {
        latencyMs,
        warnings,
        provider: 'Twilio Voice',
        displayName:
          payload.friendly_name ||
          payload.account_sid ||
          null
      }
    );
  } catch (error) {
    return result(
      error?.code === 'TIMEOUT' ? 'unavailable' : 'error',
      `Twilio connection unavailable: ${error.message}`,
      {
        latencyMs: Date.now() - startedAt,
        warnings
      }
    );
  }
}

async function checkStripe() {
  const secretKey =
    firstEnv('STRIPE_SECRET_KEY', 'STRIPE_API_KEY');

  if (!secretKey) {
    return notConfigured(
      'Stripe Payments',
      ['STRIPE_SECRET_KEY']
    );
  }

  const startedAt = Date.now();

  try {
    const { response, payload } = await requestJson(
      'https://api.stripe.com/v1/account',
      {
        headers: {
          Authorization: `Bearer ${secretKey}`
        }
      }
    );

    const latencyMs = Date.now() - startedAt;

    if (!response.ok || payload?.error) {
      const message =
        payload?.error?.message ||
        `Stripe returned HTTP ${response.status}.`;

      return result(
        'error',
        `Stripe connection failed: ${String(message).slice(0, 240)}`,
        { latencyMs }
      );
    }

    const capabilities =
      payload.charges_enabled &&
      payload.payouts_enabled;

    return result(
      'connected',
      capabilities
        ? 'Stripe account responded successfully and payment capabilities are enabled.'
        : 'Stripe responded successfully, but payment capabilities are not fully enabled.',
      {
        latencyMs,
        provider: 'Stripe',
        displayName:
          payload.business_profile?.name ||
          payload.settings?.dashboard?.display_name ||
          null
      }
    );
  } catch (error) {
    return result(
      error?.code === 'TIMEOUT' ? 'unavailable' : 'error',
      `Stripe connection unavailable: ${error.message}`,
      {
        latencyMs: Date.now() - startedAt
      }
    );
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

  if (value === 'wa' || value === 'whatsapp-monitor') {
    return 'whatsapp';
  }

  if (
    value === 'ig' ||
    value === 'insta-mon' ||
    value === 'instagram-monitor'
  ) {
    return 'instagram';
  }

  if (value === 'calls' || value === 'calls-monitor') {
    return 'twilio';
  }

  return value;
}

export async function getIntegrationStatuses(
  keys = INTEGRATION_KEYS,
  customConfig = {}
) {
  const selected = [
    ...new Set(
      (keys || [])
        .map(normalizeIntegrationKey)
        .filter(key => CHECKERS[key])
    )
  ];

  const entries = await Promise.all(
    selected.map(async key => [
      key,
      await CHECKERS[key](customConfig)
    ])
  );

  return Object.fromEntries(entries);
}

export async function getIntegrationStatus(
  key,
  customConfig = {}
) {
  const normalized = normalizeIntegrationKey(key);
  const checker = CHECKERS[normalized];

  if (!checker) return null;

  return checker(customConfig);
}
