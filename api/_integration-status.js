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

async function getWhatsAppTenantConfig(organizationId) {
  if (!organizationId || !supabase) return null;

  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select('phone_number_id, access_token_encrypted, waba_id, display_name, phone_number, is_active')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[integration-status] WhatsApp connection lookup failed:', error.message);
    return null;
  }

  if (!data?.access_token_encrypted || !data?.phone_number_id) {
    return null;
  }

  let accessToken = null;
  try {
    accessToken = await decryptToken(data.access_token_encrypted);
  } catch (err) {
    console.error('[integration-status] WhatsApp token decrypt failed:', err.message);
    return null;
  }

  if (!accessToken) return null;

  return {
    accessToken,
    phoneNumberId: data.phone_number_id,
    wabaId: data.waba_id || null,
    displayName: data.display_name || data.phone_number || null
  };
}

function isPlaceholderOrBlank(val) {
  if (!val || typeof val !== 'string') return true;
  const clean = val.trim().toLowerCase();
  if (!clean) return true;
  const placeholders = [
    'your_access_token', 'your_token', 'access_token_here', 'token_here',
    'your_phone_number_id', 'phone_number_id_here', 'your_waba_id', 'waba_id_here',
    '123456789', '1234567890', '12345', '123456', 'fake_token', 'test_token',
    'eaab...placeholder', 'eaag...placeholder', 'placeholder', 'dummy', 'test'
  ];
  return placeholders.some(p => clean === p || clean.includes('placeholder'));
}

function safeLog(stage, info) {
  const safeInfo = { ...info };
  if (safeInfo.accessToken) safeInfo.accessToken = safeInfo.accessToken.slice(0, 6) + '...';
  if (safeInfo.authToken) safeInfo.authToken = '***';
  console.log(`[WhatsApp Test][${stage}]`, JSON.stringify(safeInfo));
}

async function checkWhatsApp(customConfig = {}) {
  const isCandidateTest = customConfig.testingCandidate || Boolean(customConfig.accessToken || customConfig.phoneNumberId);

  let accessToken = customConfig.accessToken ? String(customConfig.accessToken).trim() : '';
  let phoneNumberId = customConfig.phoneNumberId ? String(customConfig.phoneNumberId).trim() : '';

  if (!isCandidateTest) {
    const tenantConfig = await getWhatsAppTenantConfig(customConfig.organizationId);
    accessToken = accessToken || tenantConfig?.accessToken || firstEnv(
      'WHATSAPP_ACCESS_TOKEN',
      'WA_ACCESS_TOKEN',
      'META_ACCESS_TOKEN'
    );
    phoneNumberId = phoneNumberId || tenantConfig?.phoneNumberId || firstEnv(
      'WHATSAPP_PHONE_NUMBER_ID',
      'PHONE_NUMBER_ID',
      'WA_PHONE_NUMBER_ID'
    );
  }

  safeLog('Validation', {
    isCandidateTest,
    hasToken: !isPlaceholderOrBlank(accessToken),
    hasPhoneId: !isPlaceholderOrBlank(phoneNumberId),
    phoneIdHint: phoneNumberId ? phoneNumberId.slice(0, 4) + '***' : 'none'
  });

  if (isPlaceholderOrBlank(accessToken) || isPlaceholderOrBlank(phoneNumberId)) {
    return result('not_configured', 'Enter the WhatsApp access token and Phone Number ID.', {
      code: 'MISSING_CREDENTIALS',
      message: 'Enter the WhatsApp access token and Phone Number ID.'
    });
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

    safeLog('ProviderResponse', {
      httpStatus: response.status,
      errorCode: payload?.error?.code,
      latencyMs
    });

    if (!response.ok || payload?.error) {
      const errCode = payload?.error?.code;
      const errMsg = errorMessage(payload, response);

      if (response.status === 401 || errCode === 190) {
        return result(
          'token_expired',
          'Invalid or expired access token',
          { latencyMs, code: 'INVALID_CREDENTIALS', httpStatus: response.status }
        );
      }

      if (response.status === 403 || errCode === 100 || errCode === 200 || errCode === 10) {
        return result(
          'permission_missing',
          'Required permissions are missing or invalid Phone Number ID.',
          { latencyMs, code: 'PERMISSION_ERROR', httpStatus: response.status }
        );
      }

      return result(
        'error',
        `WhatsApp connection failed: ${errMsg}`,
        { latencyMs, code: 'INVALID_CREDENTIALS', httpStatus: response.status }
      );
    }

    const verifiedName =
      payload.verified_name ||
      payload.display_phone_number ||
      'Meta WhatsApp Cloud API Verified';

    return result(
      'connected',
      'Connection verified successfully',
      {
        code: 'SUCCESS',
        latencyMs,
        provider: 'Meta WhatsApp Cloud API',
        displayName: verifiedName,
        verifiedName,
        phoneNumberId,
        qualityRating: payload.quality_rating || 'UNKNOWN'
      }
    );
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    safeLog('ProviderError', { error: error.message, code: error?.code, latencyMs });
    return result(
      error?.code === 'TIMEOUT' ? 'unavailable' : 'error',
      'Connection failed. Please try again',
      { latencyMs, code: 'CONNECTION_ERROR' }
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
  const cfg = customConfig || {};
  const startedAt = Date.now();
  const isCandidateTest = Boolean(cfg.testingCandidate);

  let tenantConfig = null;
  if (cfg.organizationId) {
    tenantConfig = await getInstagramTenantConfig(cfg.organizationId);
  }

  let accessToken = (cfg.accessToken || cfg.token || cfg['access-token']) ? String(cfg.accessToken || cfg.token || cfg['access-token']).trim() : '';
  let accountId = (cfg.accountId || cfg.businessId || cfg.instagramBusinessId || cfg['business-id']) ? String(cfg.accountId || cfg.businessId || cfg.instagramBusinessId || cfg['business-id']).trim() : '';
  const candidateUsername = cfg.username || cfg.instagramUsername || null;
  const candidatePageId = cfg.pageId || cfg['page-id'] || null;

  // If candidate test omitted accessToken (user left password field blank to use saved server token),
  // fall back to the tenant's stored decrypted token.
  if (!accessToken && tenantConfig?.accessToken) {
    accessToken = tenantConfig.accessToken;
  }
  if (!accountId && tenantConfig?.accountId) {
    accountId = tenantConfig.accountId;
  }

  // If not candidate test, also check environment variables as server defaults
  if (!isCandidateTest) {
    accessToken = accessToken || firstEnv(
      'INSTAGRAM_ACCESS_TOKEN',
      'META_INSTAGRAM_ACCESS_TOKEN',
      'META_ACCESS_TOKEN'
    );
    accountId = accountId || firstEnv(
      'INSTAGRAM_BUSINESS_ID',
      'INSTAGRAM_ACCOUNT_ID',
      'INSTAGRAM_ID',
      'INSTAGRAM_PAGE_ID'
    );
  }

  const attachConfig = (resObj) => {
    if (tenantConfig || accountId) {
      resObj.config = {
        businessId: tenantConfig?.accountId || accountId || null,
        username: tenantConfig?.username || candidateUsername || null,
        pageId: tenantConfig?.pageId || candidatePageId || null,
        hasToken: Boolean(accessToken && !isPlaceholderOrBlank(accessToken))
      };
    }
    return resObj;
  };

  if (!accountId || isPlaceholderOrBlank(accountId)) {
    return attachConfig(result('not_configured', 'Instagram Business Account ID is required.', {
      code: 'MISSING_CREDENTIALS',
      message: 'Instagram Business Account ID is required.'
    }));
  }

  if (!accessToken || isPlaceholderOrBlank(accessToken)) {
    return attachConfig(result('not_configured', 'Meta Access Token is required.', {
      code: 'MISSING_CREDENTIALS',
      message: 'Meta Access Token is required.'
    }));
  }

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

      if (response.status === 401 || errCode === 190) {
        return attachConfig(result(
          'token_expired',
          'Instagram connection failed: Meta Access Token has expired or is invalid.',
          {
            latencyMs,
            code: 'INVALID_CREDENTIALS',
            errorCode: 190,
            httpStatus: response.status
          }
        ));
      }

      if (errCode === 100 || errCode === 803) {
        return attachConfig(result(
          'error',
          `Instagram connection failed: Instagram Business Account ID was not found or is invalid (${errMsg}).`,
          {
            latencyMs,
            code: 'INVALID_ACCOUNT_ID',
            errorCode: errCode,
            httpStatus: response.status
          }
        ));
      }

      if (errCode === 200 || errCode === 10 || errCode === 298) {
        return attachConfig(result(
          'permission_missing',
          `Instagram connection failed: Missing required permissions (instagram_basic, instagram_manage_messages) or Page access (${errMsg}).`,
          {
            latencyMs,
            code: 'PERMISSION_ERROR',
            errorCode: errCode,
            httpStatus: response.status
          }
        ));
      }

      return attachConfig(result(
        'error',
        `Instagram connection failed: ${errMsg}`,
        {
          latencyMs,
          code: 'ERROR',
          errorCode: errCode || response.status,
          httpStatus: response.status
        }
      ));
    }

    const verifiedName = payload.username || payload.name || tenantConfig?.username || accountId;
    return attachConfig(result(
      'connected',
      `Instagram Business Account verified successfully (@${verifiedName})`,
      {
        latencyMs,
        provider: 'Meta Instagram Graph API',
        displayName: verifiedName,
        verifiedName,
        accountName: payload.name || verifiedName,
        businessId: payload.id || accountId,
        username: payload.username || null,
        accountId: payload.id || accountId,
        code: 'SUCCESS'
      }
    ));
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const isTimeout = error?.code === 'TIMEOUT' || error?.name === 'AbortError';
    return attachConfig(result(
      'unavailable',
      `Instagram connection unavailable: ${isTimeout ? 'Request timed out.' : error.message}`,
      {
        latencyMs,
        code: 'CONNECTION_ERROR'
      }
    ));
  }
}

/**
 * Read this organization's stored Twilio credentials.
 *
 * Scoped by organization_id on purpose. An earlier version of the tenant
 * resolvers fell back to "first row wins", which attributed one tenant's
 * provider account to another; a missing organizationId returns null rather
 * than guessing.
 */
async function getTwilioTenantConfig(organizationId) {
  if (!organizationId || !supabase) return null;

  const { data, error } = await supabase
    .from('twilio_connections')
    .select('account_sid, auth_token_encrypted, from_number, region')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[integration-status] Twilio connection lookup failed:', error.message);
    return null;
  }

  if (!data?.account_sid || !data?.auth_token_encrypted) return null;

  let authToken = null;
  try {
    authToken = await decryptToken(data.auth_token_encrypted);
  } catch (error) {
    console.error('[integration-status] Twilio token decrypt failed:', error.message);
    return null;
  }
  if (!authToken) return null;

  return {
    accountSid: data.account_sid,
    authToken,
    fromNumber: data.from_number || null
  };
}

// A Twilio Account SID is always "AC" followed by 32 hex characters. Catching a
// malformed value here turns an opaque HTTP 401 from Twilio into a clear message.
const TWILIO_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/;

async function checkTwilio(customConfig = {}) {
  // Credentials saved from the Integrations form take precedence; the
  // environment variables remain a valid deployment-level configuration.
  const tenantConfig = await getTwilioTenantConfig(customConfig.organizationId);
  const accountSid =
    customConfig.accountSid ||
    tenantConfig?.accountSid ||
    firstEnv('TWILIO_ACCOUNT_SID', 'TWILIO_SID');
  const authToken =
    customConfig.authToken ||
    tenantConfig?.authToken ||
    firstEnv('TWILIO_AUTH_TOKEN', 'TWILIO_TOKEN');

  const missing = [];

  if (!accountSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!authToken) missing.push('TWILIO_AUTH_TOKEN');

  if (missing.length) {
    // These can now be supplied either from the Integrations form (stored
    // encrypted per organization) or as deployment environment variables. Say
    // both, otherwise this status can never be turned green.
    return notConfigured('Twilio Voice', missing, {
      envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
      setupHint:
        'Open Settings > Integrations > Twilio Voice Calls and save your Account SID and Auth Token, ' +
        'or set them as Vercel environment variables (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN) and redeploy.',
      canSaveInApp: true
    });
  }

  if (!TWILIO_SID_PATTERN.test(accountSid)) {
    return result('error', 'TWILIO_ACCOUNT_SID is not a valid Twilio Account SID (expected "AC" + 32 hex characters).', {
      envVars: ['TWILIO_ACCOUNT_SID'],
      canSaveInApp: true
    });
  }

  // Not required to reach the API, but without a Twilio number no call can be
  // placed. Reported as a warning so a "connected" badge is never misleading.
  const fromNumber =
    customConfig.fromNumber ||
    tenantConfig?.fromNumber ||
    firstEnv('TWILIO_FROM_NUMBER', 'TWILIO_PHONE_NUMBER', 'TWILIO_CALLER_NUMBER');
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

async function checkAiProvider(customConfig = {}) {
  const apiKey =
    customConfig.apiKey ||
    firstEnv('OPENROUTER_API_KEY', 'OPENAI_API_KEY');

  if (!apiKey) {
    return notConfigured('AI Provider', ['OPENROUTER_API_KEY']);
  }

  const startedAt = Date.now();
  const isOpenRouter = apiKey.startsWith('sk-or-');
  const url = isOpenRouter ? 'https://openrouter.ai/api/v1/auth/key' : 'https://api.openai.com/v1/models';

  try {
    const { response, payload } = await requestJson(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok || payload?.error) {
      const errMsg = errorMessage(payload, response);
      return result(
        'error',
        `AI Provider authentication failed: ${errMsg}`,
        { latencyMs }
      );
    }

    return result(
      'connected',
      `AI Provider (${isOpenRouter ? 'OpenRouter AI' : 'OpenAI'}) verified successfully.`,
      {
        latencyMs,
        provider: isOpenRouter ? 'OpenRouter' : 'OpenAI',
        model: process.env.FOLLOWUP_AI_MODEL || 'openai/gpt-4o-mini'
      }
    );
  } catch (err) {
    return result(
      err?.code === 'TIMEOUT' ? 'unavailable' : 'error',
      `AI Provider check failed: ${err.message}`,
      { latencyMs: Date.now() - startedAt }
    );
  }
}

const CHECKERS = {
  whatsapp: checkWhatsApp,
  instagram: checkInstagram,
  twilio: checkTwilio,
  stripe: checkStripe,
  ai: checkAiProvider
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

  if (value === 'openai' || value === 'openrouter' || value === 'ai-agent') {
    return 'ai';
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

export { checkWhatsApp, checkInstagram, checkTwilio };
