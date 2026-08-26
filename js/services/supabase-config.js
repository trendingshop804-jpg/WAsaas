/* ==========================================================================
   NexusLead AI — Supabase Client Configuration
   Provides a lightweight wrapper around the Supabase edge-function URL and
   the anon key so that front-end components can make authenticated requests
   without bundling the full Supabase SDK.

   ┌──────────────────────────────────────────────────────────────────────┐
   │  IMPORTANT: Replace the placeholder values below with your real      │
   │  Supabase project URL and anon key before deploying to production.   │
   │  These are the public anon credentials — safe to ship to the client. │
   └──────────────────────────────────────────────────────────────────────┘
   ========================================================================== */

const SUPABASE_CONFIG = {
  /**
   * Your Supabase project URL.
   * Example: "https://abcdefghij.supabase.co"
   */
  projectUrl: '',

  /**
   * Your Supabase anon (public) key.
   * Safe to expose in front-end code — Row-Level Security enforces auth.
   */
  anonKey: '',

  /**
   * Meta App ID for Facebook Login OAuth.
   * Set META_APP_ID in your environment to enable pre-configured OAuth.
   */
  metaAppId: '',

  /**
   * Meta Graph API version for OAuth flows.
   */
  metaApiVersion: 'v21.0',

  /**
   * WhatsApp Embedded Signup Config ID from Meta App Dashboard.
   * Found at: Meta App Dashboard → WhatsApp → Configuration → Embedded Signup
   */
  whatsappConfigId: '1530177935103547',

  /**
   * The Edge Function name that handles integration-key CRUD.
   * Deployed at: <projectUrl>/functions/v1/<functionName>
   */
  integrationsFunctionName: 'manage-integration-keys',
};
/**
 * Static sites do not receive Vercel environment variables directly. Fetch
 * only the public Supabase URL and anon key at runtime; never expose a
 * service-role key to the browser.
 */
async function loadPublicSupabaseConfig() {
  try {
    const response = await fetch('/api/public-config', { credentials: 'same-origin' });
    if (!response.ok) return;
    const config = await response.json();
    if (config.projectUrl && config.anonKey) {
      SUPABASE_CONFIG.projectUrl = config.projectUrl;
      SUPABASE_CONFIG.anonKey = config.anonKey;
      if (config.metaAppId) SUPABASE_CONFIG.metaAppId = config.metaAppId;
      if (config.metaApiVersion) SUPABASE_CONFIG.metaApiVersion = config.metaApiVersion;
      if (config.whatsappConfigId) SUPABASE_CONFIG.whatsappConfigId = config.whatsappConfigId;
      Object.assign(window.supabaseConfig, {
        projectUrl: config.projectUrl,
        anonKey: config.anonKey,
        metaAppId: SUPABASE_CONFIG.metaAppId,
        metaApiVersion: SUPABASE_CONFIG.metaApiVersion,
        whatsappConfigId: SUPABASE_CONFIG.whatsappConfigId,
      });
    }
  } catch (error) {
    console.warn('[Supabase] Public configuration could not be loaded.', error);
  }
}

/**
 * Returns the base URL for a named Edge Function.
 * @param {string} fnName
 * @returns {string}
 */
function getEdgeFunctionUrl(fnName) {
  if (!SUPABASE_CONFIG.projectUrl) return null;
  return `${SUPABASE_CONFIG.projectUrl}/functions/v1/${fnName}`;
}

/**
 * Returns default Authorization headers using the currently cached JWT.
 * Falls back to anon key if no user session is found.
 * @returns {Object}
 */
function getAuthHeaders() {
  const session = (() => {
    try {
      // Look for a Supabase session stored by the official JS client
      const raw = localStorage.getItem('sb-session') ||
                  Object.keys(localStorage)
                    .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
                    .map(k => localStorage.getItem(k))[0];
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  })();

  const token = session?.access_token || SUPABASE_CONFIG.anonKey || '';
  return {
    'Authorization': token ? `Bearer ${token}` : '',
    'Content-Type':  'application/json',
    'apikey':        SUPABASE_CONFIG.anonKey || '',
  };
}

/**
 * Returns true when both project URL and anon key are configured.
 */
function isSupabaseConfigured() {
  return Boolean(SUPABASE_CONFIG.projectUrl && SUPABASE_CONFIG.anonKey);
}

window.supabaseConfig = {
  ...SUPABASE_CONFIG,
  getEdgeFunctionUrl,
  getAuthHeaders,
  isSupabaseConfigured,
};

window.supabaseConfig.ready = loadPublicSupabaseConfig();
