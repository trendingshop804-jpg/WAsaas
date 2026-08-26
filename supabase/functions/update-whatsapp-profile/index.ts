// ==========================================================================
// Supabase Edge Function: update-whatsapp-profile
// Handles:
//   POST /update-whatsapp-profile
//   1. Verifies user session (Bearer JWT from Frontend)
//   2. Decrypts the encrypted WhatsApp access token from whatsapp_connections
//   3. Based on `action`:
//      - "update_profile_picture": 2-step Meta API (upload image → set handle)
//      - "update_about": 1-step Meta API (set about field, max 139 chars)
//      - "fetch_profile": GET current profile picture + about from Meta
//
// Meta API Reference (v21.0):
//   Step 1: POST /{phone-number-id}/media?image_url={PUBLIC_URL} → { "id": "{media-id}" }
//   Step 2: POST /{waba-id}/whatsapp_business_profile?profile_picture_handle={media-id} → { "success": true }
//   About:  POST /{waba-id}/whatsapp_business_profile?about={text} → { "success": true }
//   Fetch:  GET /{waba-id}/whatsapp_business_profile
// ==========================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENCRYPT_SECRET      = Deno.env.get("INTEGRATION_ENCRYPT_SECRET");
const GRAPH_API_VERSION   = "v21.0";

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
// Helper: AES-GCM Token Decryption (inverse of meta-oauth-exchange encryptToken)
// ---------------------------------------------------------------------------
async function decryptToken(ciphertext: string): Promise<string> {
  if (!ENCRYPT_SECRET || ENCRYPT_SECRET.length < 32) {
    throw new Error("INTEGRATION_ENCRYPT_SECRET must be set to a strong secret of at least 32 characters");
  }
  const enc = new TextDecoder();
  const keyData = new TextEncoder().encode(ENCRYPT_SECRET.padEnd(32, "0").slice(0, 32));
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

  const iv = combined.slice(0, 12);
  const cipherBuf = combined.slice(12);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    cipherBuf
  );

  return enc.decode(decrypted);
}

// ---------------------------------------------------------------------------
// Helper: Validate image file
// Returns { valid: boolean, error?: string, extension?: string }
// ---------------------------------------------------------------------------
function validateImage(fileExt: string, mimeType: string, byteSize: number): { valid: boolean; error?: string } {
  const validExts = ["jpeg", "jpg", "png"];
  const validMimes = ["image/jpeg", "image/png"];
  const normalizedExt = fileExt.toLowerCase().replace(".", "");

  if (!validExts.includes(normalizedExt)) {
    return { valid: false, error: "Image must be JPEG or PNG format." };
  }
  if (!validMimes.includes(mimeType)) {
    return { valid: false, error: "Invalid MIME type. Only JPEG and PNG are accepted." };
  }
  if (byteSize > 5 * 1024 * 1024) {
    return { valid: false, error: "Image exceeds 5MB limit. Meta recommends under 5MB." };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Helper: Call Meta Graph API
// ---------------------------------------------------------------------------
async function metaApi(endpoint: string, accessToken: string, options: {
  method?: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
} = {}) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${endpoint}`);

  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  url.searchParams.set("access_token", accessToken);

  const headers: Record<string, string> = {};
  const fetchOpts: RequestInit = {
    method: options.method || "GET",
    headers,
  };

  if (options.body) {
    if (options.method === "POST" || !options.method) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      const formData = new URLSearchParams();
      Object.entries(options.body).forEach(([k, v]) => formData.append(k, String(v)));
      fetchOpts.body = formData;
    }
  }

  const res = await fetch(url.toString(), fetchOpts);
  const data = await res.json().catch(() => ({}));

  return { status: res.status, data, ok: res.ok };
}

// ---------------------------------------------------------------------------
// Helper: Map Meta API errors to user-friendly messages
// ---------------------------------------------------------------------------
function mapMetaError(data: any): string {
  if (data.error?.code === 4) {
    return "Permission denied: WhatsApp Business Management permission is required in your Meta App Review. Enable it in https://developers.facebook.com/apps/ → App Review.";
  }
  if (data.error?.code === 100) {
    return data.error?.message || "Invalid request to Meta API. Check your phone number ID and WABA ID.";
  }
  if (data.error?.error_user_title) {
    return `${data.error.error_user_title}: ${data.error.error_user_msg || ""}`;
  }
  if (data.error?.message) {
    return `Meta API error: ${data.error.message}`;
  }
  return "Unknown Meta API error. Please check your connection and try again.";
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // 1. Verify user session
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: "Unauthorized user session" }, 401);
    }

    // 2. Get user's organization
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("users")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile || !["OWNER", "ADMIN"].includes(profile.role)) {
      return jsonResponse({ error: "Forbidden: Organization access denied" }, 403);
    }

    // 3. Get the organization's WhatsApp connection with encrypted token
    const { data: connection, error: connErr } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("access_token_encrypted, phone_number_id, waba_id, phone_number, is_active")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (connErr || !connection || !connection.access_token_encrypted) {
      return jsonResponse({
        error: "No active WhatsApp connection found. Please connect WhatsApp Business first.",
      }, 400);
    }

    // 4. Decrypt the access token
    const accessToken = await decryptToken(connection.access_token_encrypted);
    const { phone_number_id, waba_id } = connection;

    // 5. Parse request body
    const { action, imageBase64, fileName, about } = await req.json();

    if (!action) {
      return jsonResponse({ error: "Missing required 'action' field" }, 400);
    }

    // ─── Action: update_profile_picture ─────────────────────────────────
    if (action === "update_profile_picture") {
      if (!imageBase64) {
        return jsonResponse({ error: "Missing imageBase64 data" }, 400);
      }

      // Strip data URL prefix if present
      let base64Data = imageBase64;
      let mimeType = "image/jpeg";
      let fileExt = "jpg";

      if (imageBase64.startsWith("data:")) {
        const match = imageBase64.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Data = match[2];
          fileExt = mimeType.split("/")[1].replace("jpeg", "jpg");
        }
      }

      const byteChars = atob(base64Data);
      const byteSize = byteChars.length;
      const validation = validateImage(fileExt, mimeType, byteSize);
      if (!validation.valid) {
        return jsonResponse({ error: validation.error }, 400);
      }

      // Upload image to public bucket for Meta to fetch
      const binaryStr = new Uint8Array(byteSize);
      for (let i = 0; i < byteSize; i++) {
        binaryStr[i] = byteChars.charCodeAt(i);
      }

      const uploadName = `profile-${user.id}-${Date.now()}.${fileExt}`;
      const uploadPath = `${user.id}/${uploadName}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("profile-photos-public")
        .upload(uploadPath, binaryStr, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        return jsonResponse({ error: "Failed to upload image to storage." }, 500);
      }

      // Get public URL
      const { data: publicUrlData } = supabaseAdmin.storage
        .from("profile-photos-public")
        .getPublicUrl(uploadPath);

      const publicUrl = publicUrlData?.publicUrl;
      if (!publicUrl) {
        return jsonResponse({ error: "Failed to get public URL for image." }, 500);
      }

      // ── Meta API Step 1: Upload to Media API ──
      const mediaRes = await metaApi(`${phone_number_id}/media`, accessToken, {
        method: "POST",
        body: { image_url: publicUrl },
      });

      if (!mediaRes.ok) {
        // Cleanup uploaded image
        await supabaseAdmin.storage.from("profile-photos-public").remove([uploadPath]);
        return jsonResponse({
          error: mapMetaError(mediaRes.data),
          meta_response: mediaRes.data,
        }, 400);
      }

      const mediaId = mediaRes.data.id;
      if (!mediaId) {
        await supabaseAdmin.storage.from("profile-photos-public").remove([uploadPath]);
        return jsonResponse({
          error: "Meta Media API did not return a media ID.",
          meta_response: mediaRes.data,
        }, 500);
      }

      // ── Meta API Step 2: Set as profile picture ──
      const profileRes = await metaApi(`${waba_id}/whatsapp_business_profile`, accessToken, {
        method: "POST",
        body: { profile_picture_handle: mediaId },
      });

      // Cleanup: delete temp image from bucket
      await supabaseAdmin.storage.from("profile-photos-public").remove([uploadPath]);

      if (!profileRes.ok) {
        return jsonResponse({
          error: mapMetaError(profileRes.data),
          meta_response: profileRes.data,
        }, 400);
      }

      // Update local about/profile_picture_url cache in whatsapp_connections
      await supabaseAdmin
        .from("whatsapp_connections")
        .update({
          profile_picture_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", profile.organization_id);

      // Log to audit
      await supabaseAdmin.from("users").select("id, organization_id, role")
        .eq("id", user.id).eq("organization_id", profile.organization_id).single()
        try {
          await supabaseAdmin.from("audit_logs").insert({
            organization_id: profile.organization_id,
            action: "WhatsApp Profile Picture Updated",
            entity: connection.phone_number || phone_number_id,
            actor: user.email,
            details: `Profile picture updated via Meta Business Profile API. Media ID: ${mediaId}`,
            status: "Success",
          });
        } catch { /* audit log is best-effort */ }

      return jsonResponse({
        success: true,
        message: "Profile picture updated successfully on WhatsApp Business.",
        media_id: mediaId,
        profile_picture_url: publicUrl,
      });
    }

    // ─── Action: update_about ─────────────────────────────────────────────
    if (action === "update_about") {
      if (!about || typeof about !== "string") {
        return jsonResponse({ error: "Missing 'about' field" }, 400);
      }

      const trimmed = about.trim();
      if (trimmed.length > 139) {
        return jsonResponse({
          error: `About text exceeds 139 character limit (${trimmed.length}/139).`,
        }, 400);
      }

      const res = await metaApi(`${waba_id}/whatsapp_business_profile`, accessToken, {
        method: "POST",
        body: { about: trimmed },
      });

      if (!res.ok) {
        return jsonResponse({
          error: mapMetaError(res.data),
          meta_response: res.data,
        }, 400);
      }

      // Cache in whatsapp_connections
      await supabaseAdmin
        .from("whatsapp_connections")
        .update({
          about: trimmed,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", profile.organization_id);

      return jsonResponse({
        success: true,
        message: "About text updated successfully on WhatsApp Business.",
        about: trimmed,
      });
    }

    // ─── Action: fetch_profile ───────────────────────────────────────────
    if (action === "fetch_profile") {
      const res = await metaApi(`${waba_id}/whatsapp_business_profile`, accessToken, {
        method: "GET",
        params: {
          access_token: accessToken,
          fields: "profile_picture_url,about,address,description,name,websites",
        },
      });

      if (!res.ok) {
        return jsonResponse({
          error: mapMetaError(res.data),
          meta_response: res.data,
        }, 400);
      }

      return jsonResponse({
        success: true,
        profile: res.data,
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("update-whatsapp-profile Error:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
