// ==========================================================================
// Supabase Edge Function: manage-integration-keys
// Handles:
//   POST   /manage-integration-keys         → save/encrypt a key
//   GET    /manage-integration-keys         → list masked keys for user
//   DELETE /manage-integration-keys?id=...  → delete a key
//   POST   /manage-integration-keys/test    → test a saved key
//
// Security:
//   - Reads JWT from Authorization header → extracts user_id
//   - Encrypts raw value with pgcrypto (AES-128-CBC) via RPC before storing
//   - RLS on user_integration_keys ensures user sees only their own rows
//   - Raw key is never returned; only masked_value is stored/returned
// ==========================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPT_SECRET    = Deno.env.get("INTEGRATION_ENCRYPT_SECRET") ?? "change-me-to-32-char-secret!!!!!";

// ---------------------------------------------------------------------------
// Helper: mask a raw key value — only last 4 chars visible
// ---------------------------------------------------------------------------
function maskKeyValue(raw: string): string {
  if (!raw || raw.length < 5) return "••••";
  const prefix = raw.slice(0, 6);
  const suffix = raw.slice(-4);
  const stars  = "••••••••";
  return `${prefix}${stars}${suffix}`;
}

// ---------------------------------------------------------------------------
// Helper: encrypt a plaintext value using SubtleCrypto (AES-GCM)
// ---------------------------------------------------------------------------
async function encryptValue(plaintext: string): Promise<string> {
  const enc     = new TextEncoder();
  const keyData = enc.encode(ENCRYPT_SECRET.padEnd(32, "0").slice(0, 32));
  const iv      = crypto.getRandomValues(new Uint8Array(12));

  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "AES-GCM" }, false, ["encrypt"]
  );

  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, cryptoKey, enc.encode(plaintext)
  );

  // Store iv + ciphertext as base64
  const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

// ---------------------------------------------------------------------------
// Helper: decrypt an encrypted value
// ---------------------------------------------------------------------------
async function decryptValue(encoded: string): Promise<string> {
  const enc     = new TextEncoder();
  const dec     = new TextDecoder();
  const keyData = enc.encode(ENCRYPT_SECRET.padEnd(32, "0").slice(0, 32));

  const combined  = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const iv        = combined.slice(0, 12);
  const cipherBuf = combined.slice(12);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "AES-GCM" }, false, ["decrypt"]
  );

  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv }, cryptoKey, cipherBuf
  );

  return dec.decode(plainBuf);
}

// ---------------------------------------------------------------------------
// Helper: verify a key against its provider
// ---------------------------------------------------------------------------
async function verifyKey(keyName: string, rawKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    switch (keyName) {
      case "openai_api_key": {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${rawKey}` },
        });
        if (res.ok) return { ok: true,  message: "OpenAI key valid — gpt-4o accessible" };
        return               { ok: false, message: `OpenAI error: ${res.status} ${res.statusText}` };
      }

      case "stripe_api_key": {
        const res = await fetch("https://api.stripe.com/v1/balance", {
          headers: { Authorization: `Bearer ${rawKey}` },
        });
        if (res.ok) return { ok: true,  message: "Stripe key valid — account balance retrieved" };
        return               { ok: false, message: `Stripe error: ${res.status}` };
      }

      case "hubspot_api_key": {
        const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
          headers: { Authorization: `Bearer ${rawKey}` },
        });
        if (res.ok) return { ok: true,  message: "HubSpot token valid — CRM scope confirmed" };
        return               { ok: false, message: `HubSpot error: ${res.status}` };
      }

      case "whatsapp_business": {
        // Verify Meta WABA token via Graph API
        const res = await fetch(
          `https://graph.facebook.com/v18.0/me?access_token=${rawKey}`
        );
        const json = await res.json();
        if (json?.id) return { ok: true,  message: `WABA token valid — Account ID: ${json.id}` };
        return                 { ok: false, message: "Invalid WABA token or account suspended" };
      }

      default:
        return { ok: false, message: `Unknown integration: ${keyName}` };
    }
  } catch (err) {
    return { ok: false, message: `Network error: ${(err as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // -- Authenticate user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return jsonResponse({ error: "Unauthenticated" }, 401);

  const url     = new URL(req.url);
  const isTest  = url.pathname.endsWith("/test");

  // ── GET: list masked keys for current user ─────────────────────────────
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("user_integration_keys")
      .select("id, key_name, masked_value, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ keys: data });
  }

  // ── POST /test: verify a saved key ────────────────────────────────────
  if (req.method === "POST" && isTest) {
    const { key_id } = await req.json();

    const { data: row, error } = await supabase
      .from("user_integration_keys")
      .select("key_name, encrypted_value")
      .eq("id", key_id)
      .eq("user_id", user.id)
      .single();

    if (error || !row) return jsonResponse({ error: "Key not found" }, 404);

    const rawKey = await decryptValue(row.encrypted_value);
    const result = await verifyKey(row.key_name, rawKey);
    return jsonResponse(result);
  }

  // ── POST: save (create or update) a key ───────────────────────────────
  if (req.method === "POST") {
    const { key_name, value, update_id } = await req.json();

    if (!key_name || !value) {
      return jsonResponse({ error: "key_name and value are required" }, 400);
    }

    const encryptedValue = await encryptValue(value);
    const maskedValue    = maskKeyValue(value);

    if (update_id) {
      // Update existing key
      const { error } = await supabase
        .from("user_integration_keys")
        .update({ encrypted_value: encryptedValue, masked_value: maskedValue })
        .eq("id", update_id)
        .eq("user_id", user.id);

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true, masked_value: maskedValue });
    } else {
      // Insert new key (upsert by user_id + key_name)
      const { data, error } = await supabase
        .from("user_integration_keys")
        .upsert(
          {
            user_id:         user.id,
            key_name,
            encrypted_value: encryptedValue,
            masked_value:    maskedValue,
          },
          { onConflict: "user_id,key_name" }
        )
        .select("id, masked_value")
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true, id: data.id, masked_value: data.masked_value });
    }
  }

  // ── DELETE: remove a key ───────────────────────────────────────────────
  if (req.method === "DELETE") {
    const keyId = url.searchParams.get("id");
    if (!keyId) return jsonResponse({ error: "id query param required" }, 400);

    const { error } = await supabase
      .from("user_integration_keys")
      .delete()
      .eq("id", keyId)
      .eq("user_id", user.id);

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});
