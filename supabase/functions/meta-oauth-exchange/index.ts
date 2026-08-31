// ==========================================================================
// Supabase Edge Function: meta-oauth-exchange
// Handles:
//   POST /meta-oauth-exchange
//   1. Accepts Meta OAuth User Code or Short-Lived Access Token
//   2. Exchanges for Long-Lived System / User Token via Graph API
//   3. Queries Meta Graph API for:
//      - WhatsApp Business Accounts (WABAs) & Phone Numbers
//      - Facebook Pages & Linked Instagram Professional Accounts
//   4. Encrypts resulting tokens using AES-GCM (SubtleCrypto)
//   5. Persists connections into public.whatsapp_connections & public.instagram_connections
// ==========================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_APP_ID         = Deno.env.get("META_APP_ID") || "";
const META_APP_SECRET     = Deno.env.get("META_APP_SECRET") || "";
const ENCRYPT_SECRET      = Deno.env.get("INTEGRATION_ENCRYPT_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Helper: AES-GCM Token Encryption via SubtleCrypto
// ---------------------------------------------------------------------------
async function encryptToken(plaintext: string): Promise<string> {
  if (!ENCRYPT_SECRET || ENCRYPT_SECRET.length < 32) {
    throw new Error("INTEGRATION_ENCRYPT_SECRET must be set to a strong secret of at least 32 characters");
  }
  const enc = new TextEncoder();
  const keyData = enc.encode(ENCRYPT_SECRET.padEnd(32, "0").slice(0, 32));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    enc.encode(plaintext)
  );

  const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function subscribeToWebhook(wabaId: string, accessToken: string): Promise<void> {
  const subscribeRes = await fetch(
    `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );

  if (!subscribeRes.ok) {
    const err = await subscribeRes.json();
    throw new Error(err.error?.message || `Webhook subscription failed with status ${subscribeRes.status}`);
  }

  const checkRes = await fetch(
    `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  const checkData = await checkRes.json();

  if (!checkRes.ok) {
    throw new Error(`Webhook verification failed with status ${checkRes.status}`);
  }

  console.log('[Webhook] Subscribed apps:', JSON.stringify(checkData.data));

  if (!checkData.data || !Array.isArray(checkData.data) || !checkData.data.some((app: any) => app.id === META_APP_ID)) {
    console.warn('[Webhook] App not found in subscribed apps list after subscription');
  }
}

async function subscribeToInstagramWebhook(pageId: string, accessToken: string): Promise<void> {
  try {
    const subscribeRes = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?subscribed_fields=feed,comments,messages,messaging_postbacks,message_reactions&access_token=${accessToken}`,
      { method: 'POST' }
    );
    if (!subscribeRes.ok) {
      const err = await subscribeRes.json();
      console.warn(`[Instagram Webhook] Page ${pageId} subscription notice:`, err.error?.message || subscribeRes.status);
    } else {
      console.log(`[Instagram Webhook] Successfully subscribed page ${pageId} to Instagram/Page events`);
    }
  } catch (e) {
    console.warn('[Instagram Webhook] Error subscribing page:', e);
  }
}

interface DiscoveryResult {
  wabas: Array<{
    wabaId: string;
    wabaName: string;
    phoneNumbers: Array<{ id: string; display_phone_number: string; verified_name?: string }>;
  }>;
  instagram: Array<{
    instagramBusinessId: string;
    username: string;
    pageId: string;
    pageName: string;
  }>;
}

async function discoverAccounts(longLivedToken: string): Promise<DiscoveryResult> {
  const discoveredWABAs: DiscoveryResult["wabas"] = [];
  const discoveredInstagram: DiscoveryResult["instagram"] = [];

  try {
    const bizRes = await fetch(`https://graph.facebook.com/v21.0/me/businesses?access_token=${longLivedToken}`);
    const bizData = await bizRes.json();

    if (bizData.data && Array.isArray(bizData.data)) {
      for (const biz of bizData.data) {
        const wabaRes = await fetch(`https://graph.facebook.com/v21.0/${biz.id}/client_whatsapp_business_accounts?access_token=${longLivedToken}`);
        const wabaData = await wabaRes.json();

        if (wabaData.data && Array.isArray(wabaData.data)) {
          for (const waba of wabaData.data) {
            const phoneRes = await fetch(`https://graph.facebook.com/v21.0/${waba.id}/phone_numbers?access_token=${longLivedToken}`);
            const phoneData = await phoneRes.json();

            discoveredWABAs.push({
              wabaId: waba.id,
              wabaName: waba.name || biz.name,
              phoneNumbers: phoneData.data || []
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[Graph API WABA Discovery]:", err);
  }

  try {
    const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${longLivedToken}`);
    const pagesData = await pagesRes.json();

    if (pagesData.data && Array.isArray(pagesData.data)) {
      for (const page of pagesData.data) {
        if (page.instagram_business_account?.id) {
          discoveredInstagram.push({
            instagramBusinessId: page.instagram_business_account.id,
            username: page.instagram_business_account.username || page.name,
            pageId: page.id,
            pageName: page.name
          });
        }
      }
    }
  } catch (err) {
    console.error("[Graph API Instagram Discovery]:", err);
  }

  return { wabas: discoveredWABAs, instagram: discoveredInstagram };
}

async function saveSelectedAccounts(
  supabaseAdmin: ReturnType<typeof createClient>,
  organizationId: string,
  longLivedToken: string,
  encryptedToken: string,
  discovery: DiscoveryResult,
  wabaIndex: number,
  phoneIndex: number,
  instagramIndices: number[]
): Promise<{ whatsapp: boolean; instagram: number; wabaId?: string }> {
  let whatsappSaved = false;
  let instagramSaved = 0;
  let savedWabaId: string | undefined;

  if (discovery.wabas[wabaIndex] && discovery.wabas[wabaIndex].phoneNumbers[phoneIndex]) {
    const waba = discovery.wabas[wabaIndex];
    const phone = waba.phoneNumbers[phoneIndex];

    await supabaseAdmin.from("whatsapp_connections").upsert({
      organization_id: organizationId,
      provider: "META_CLOUD_API",
      phone_number: phone.display_phone_number,
      display_name: phone.verified_name || waba.wabaName,
      waba_id: waba.wabaId,
      phone_number_id: phone.id,
      access_token_encrypted: encryptedToken,
      is_active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "organization_id, phone_number_id" });
    whatsappSaved = true;
    savedWabaId = waba.wabaId;

    await subscribeToWebhook(waba.wabaId, longLivedToken);
  }

  for (const idx of instagramIndices) {
    if (discovery.instagram[idx]) {
      const ig = discovery.instagram[idx];
      await supabaseAdmin.from("instagram_connections").upsert({
        organization_id: organizationId,
        instagram_business_id: ig.instagramBusinessId,
        instagram_username: ig.username,
        page_id: ig.pageId,
        access_token_encrypted: encryptedToken,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: "organization_id, instagram_business_id" });
      instagramSaved++;

      if (ig.pageId) {
        await subscribeToInstagramWebhook(ig.pageId, longLivedToken);
      }
    }
  }

  return { whatsapp: whatsappSaved, instagram: instagramSaved, wabaId: savedWabaId };
}

async function savePrimaryAccounts(
  supabaseAdmin: ReturnType<typeof createClient>,
  organizationId: string,
  longLivedToken: string,
  encryptedToken: string,
  discovery: DiscoveryResult
): Promise<{ whatsapp: boolean; instagram: number; wabaId?: string }> {
  const wabaIndex = discovery.wabas.findIndex(w => w.phoneNumbers.length > 0);
  const phoneIndex = wabaIndex >= 0 ? 0 : -1;
  const instagramIndices = discovery.instagram.map((_, i) => i);
  return saveSelectedAccounts(supabaseAdmin, organizationId, longLivedToken, encryptedToken, discovery, wabaIndex, phoneIndex, instagramIndices);
}

async function autoConnectAccounts(
  supabaseAdmin: ReturnType<typeof createClient>,
  organizationId: string,
  longLivedToken: string,
  encryptedToken: string,
  discovery: DiscoveryResult
): Promise<{ autoConnected: boolean; needsPicker: boolean; whatsapp: boolean; instagram: number; wabaId?: string }> {
  const totalPhones = discovery.wabas.reduce((sum, w) => sum + w.phoneNumbers.length, 0);
  const totalIg = discovery.instagram.length;

  if (totalPhones <= 1 && totalIg <= 1) {
    const result = await savePrimaryAccounts(supabaseAdmin, organizationId, longLivedToken, encryptedToken, discovery);
    return { autoConnected: true, needsPicker: false, ...result };
  }

  return { autoConnected: false, needsPicker: true, whatsapp: false, instagram: 0 };
}

async function handleEmbeddedSignup(
  supabaseAdmin: ReturnType<typeof createClient>,
  organizationId: string,
  code: string,
  wabaId: string,
  phoneNumberId: string
): Promise<{ success: boolean; phone_number: string; waba_id: string }> {
  // 1. Exchange code for long-lived token
  let accessToken = '';
  if (META_APP_ID && META_APP_SECRET) {
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (tokenData.access_token) {
      accessToken = tokenData.access_token;
    } else {
      throw new Error(tokenData.error?.message || 'Failed to exchange code for token');
    }
  } else {
    throw new Error('META_APP_ID and META_APP_SECRET must be configured');
  }

  // 2. Exchange for long-lived token
  let longLivedToken = accessToken;
  try {
    const exchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${accessToken}`;
    const exRes = await fetch(exchangeUrl);
    const exData = await exRes.json();
    if (exData.access_token) {
      longLivedToken = exData.access_token;
    }
  } catch (e) {
    console.warn("[Embedded Signup]: long-lived exchange failed, using short-lived", e);
  }

  // 3. Verify WABA details
  const wabaRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}?fields=name,timezone_id&access_token=${longLivedToken}`);
  const wabaData = await wabaRes.json();
  if (wabaData.error) {
    throw new Error(wabaData.error.message || 'Failed to verify WABA');
  }

  // 4. Verify phone number details
  const phoneRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}?fields=verified_name,display_phone_number&access_token=${longLivedToken}`);
  const phoneData = await phoneRes.json();
  if (phoneData.error) {
    throw new Error(phoneData.error.message || 'Failed to verify phone number');
  }

  // 5. Encrypt and store token
  const encryptedToken = await encryptToken(longLivedToken);

  await supabaseAdmin.from("whatsapp_connections").upsert({
    organization_id: organizationId,
    provider: "META_EMBEDDED_SIGNUP",
    phone_number: phoneData.display_phone_number,
    display_name: phoneData.verified_name || wabaData.name,
    waba_id: wabaId,
    phone_number_id: phoneNumberId,
    access_token_encrypted: encryptedToken,
    is_active: true,
    updated_at: new Date().toISOString()
  }, { onConflict: "organization_id, phone_number_id" });

  // 6. Subscribe to webhooks
  await subscribeToWebhook(wabaId, longLivedToken);

  return {
    success: true,
    phone_number: phoneData.display_phone_number,
    waba_id: wabaId
  };
}

async function handleCodeExchange(
  supabaseAdmin: ReturnType<typeof createClient>,
  organizationId: string,
  code: string
): Promise<{ success: boolean; phone_number: string; waba_id: string }> {
  // 1. Exchange code for token
  let accessToken = '';
  if (META_APP_ID && META_APP_SECRET) {
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (tokenData.access_token) {
      accessToken = tokenData.access_token;
    } else {
      throw new Error(tokenData.error?.message || 'Failed to exchange code for token');
    }
  } else {
    throw new Error('META_APP_ID and META_APP_SECRET must be configured');
  }

  // 2. Exchange for long-lived token
  let longLivedToken = accessToken;
  try {
    const exchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${accessToken}`;
    const exRes = await fetch(exchangeUrl);
    const exData = await exRes.json();
    if (exData.access_token) {
      longLivedToken = exData.access_token;
    }
  } catch (e) {
    console.warn("[Code Exchange]: long-lived exchange failed, using short-lived", e);
  }

  // 3. Discover accounts and save primary
  const discovery = await discoverAccounts(longLivedToken);
  const encryptedToken = await encryptToken(longLivedToken);
  const result = await savePrimaryAccounts(supabaseAdmin, organizationId, longLivedToken, encryptedToken, discovery);

  if (result.whatsapp && result.wabaId) {
    await subscribeToWebhook(result.wabaId, longLivedToken);
  }

  if (!result.whatsapp) {
    throw new Error('No WhatsApp Business Account found');
  }

  const waba = discovery.wabas.find(w => w.wabaId === result.wabaId);
  const phone = waba?.phoneNumbers[0];

  return {
    success: true,
    phone_number: phone?.display_phone_number || 'WhatsApp Connected',
    waba_id: result.wabaId || ''
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: "Unauthorized user session" }, 401);
    }

    const body = await req.json();
    const { accessToken, organizationId, wabaIndex = 0, phoneIndex = 0, instagramIndices = [], code, wabaId, phoneNumberId } = body;
    const mode = body.mode || (code && !accessToken ? "code_exchange" : "save");

    // Handle code-only exchange (new WhatsApp Embedded Signup flow)
    if (mode === "code_exchange") {
      if (!organizationId) {
        return jsonResponse({ error: "organizationId is required" }, 400);
      }
      try {
        const result = await handleCodeExchange(supabaseAdmin, organizationId, code);
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse({ error: (err as Error).message }, 400);
      }
    }

    if (!organizationId) {
      return jsonResponse({ error: "organizationId is required" }, 400);
    }

    // Handle embedded signup mode
    if (mode === "embedded_signup") {
      if (!code || !wabaId || !phoneNumberId) {
        return jsonResponse({ error: "code, wabaId, and phoneNumberId are required for embedded_signup" }, 400);
      }
      try {
        const result = await handleEmbeddedSignup(supabaseAdmin, organizationId, code, wabaId, phoneNumberId);
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse({ error: (err as Error).message }, 400);
      }
    }

    if (!accessToken) {
      return jsonResponse({ error: "accessToken is required" }, 400);
    }

    // 1. Verify user belongs to the organization
    const { data: userProfile, error: profileErr } = await supabaseAdmin
      .from("users")
      .select("id, organization_id, role")
      .eq("id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (profileErr || !userProfile || !["OWNER", "ADMIN"].includes(userProfile.role)) {
      return jsonResponse({ error: "Forbidden: Organization access denied" }, 403);
    }

    // 2. Exchange for long-lived User Access Token if App Secret is configured
    let longLivedToken = accessToken;
    if (META_APP_ID && META_APP_SECRET) {
      try {
        const exchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${accessToken}`;
        const exRes = await fetch(exchangeUrl);
        const exData = await exRes.json();
        if (exData.access_token) {
          longLivedToken = exData.access_token;
        }
      } catch (e) {
        console.warn("[Meta Token Exchange]: using provided token fallback", e);
      }
    }

    // 3. Discover accounts
    const discovery = await discoverAccounts(longLivedToken);

    // 4. Handle modes
    if (mode === "discover") {
      const encryptedToken = await encryptToken(longLivedToken);
      return jsonResponse({
        success: true,
        long_lived_token: encryptedToken,
        wabas: discovery.wabas,
        instagram: discovery.instagram,
        message: "Accounts discovered. Use save_selected to persist chosen accounts."
      });
    }

    if (mode === "auto") {
      const encryptedToken = await encryptToken(longLivedToken);
      const autoResult = await autoConnectAccounts(supabaseAdmin, organizationId, longLivedToken, encryptedToken, discovery);

      if (autoResult.whatsapp && autoResult.wabaId) {
        await subscribeToWebhook(autoResult.wabaId, longLivedToken);
      }

      return jsonResponse({
        success: true,
        autoConnected: autoResult.autoConnected,
        needsPicker: autoResult.needsPicker,
        wabas: discovery.wabas,
        instagram: discovery.instagram,
        saved: { whatsapp: autoResult.whatsapp, instagram: autoResult.instagram },
        message: autoResult.autoConnected
          ? "Accounts auto-connected successfully."
          : "Multiple accounts found — picker required."
      });
    }

    // 5. Encrypt token for save operations
    const encryptedToken = await encryptToken(longLivedToken);

    let result;
    if (mode === "save_selected") {
      result = await saveSelectedAccounts(
        supabaseAdmin,
        organizationId,
        longLivedToken,
        encryptedToken,
        discovery,
        wabaIndex,
        phoneIndex,
        instagramIndices
      );
    } else {
      // Default: save mode (backward compatible)
      result = await savePrimaryAccounts(supabaseAdmin, organizationId, longLivedToken, encryptedToken, discovery);
    }

    if (result.whatsapp && result.wabaId) {
      await subscribeToWebhook(result.wabaId, longLivedToken);
    }

    return jsonResponse({
      success: true,
      wabas: discovery.wabas,
      instagram: discovery.instagram,
      saved: result,
      message: "Meta credentials exchanged and stored securely with AES-GCM encryption."
    });
  } catch (err) {
    console.error("[meta-oauth-exchange Error]:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
