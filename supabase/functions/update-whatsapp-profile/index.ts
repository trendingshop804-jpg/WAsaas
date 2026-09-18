// ==========================================================================
// Supabase Edge Function: update-whatsapp-profile
// Handles:
//   POST /update-whatsapp-profile
//   1. Verifies user session (Bearer JWT from Frontend)
//   2. Verifies OWNER or ADMIN role in user's organization
//   3. Decrypts the encrypted WhatsApp access token from whatsapp_connections
//   4. Validates image (JPEG/PNG only, valid MIME, <= 5MB)
//   5. Meta WhatsApp Business Profile API execution:
//      - "update_profile_picture": 2-step Meta API (upload media → set handle)
//      - "update_about": 1-step Meta API (set about field, max 139 chars)
//      - "fetch_profile": GET current profile picture + about from Meta
//   6. Confirms Meta response, cleans up temp storage, updates DB & audit log
// ==========================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENCRYPT_SECRET       = Deno.env.get("INTEGRATION_ENCRYPT_SECRET");
const GRAPH_API_VERSION    = "v21.0";

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
// Helper: AES-GCM Token Decryption
// ---------------------------------------------------------------------------
async function decryptToken(ciphertext: string): Promise<string> {
  if (!ciphertext) return "";
  if (ciphertext.startsWith("EAA") || ciphertext.startsWith("EAAV") || ciphertext.startsWith("IGQ")) {
    return ciphertext;
  }

  const secret = ENCRYPT_SECRET || Deno.env.get("META_APP_SECRET") || "change-me-to-32-char-secret!!!!!";
  try {
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const keyData = enc.encode(secret.padEnd(32, "0").slice(0, 32));
    const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));

    if (combined.length < 13) return ciphertext;

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

    return dec.decode(decrypted);
  } catch (err) {
    console.warn("Token decrypt failed, falling back to raw token:", (err as Error).message);
    return ciphertext;
  }
}

// ---------------------------------------------------------------------------
// Helper: Validate image file
// ---------------------------------------------------------------------------
function validateImage(fileExt: string, mimeType: string, byteSize: number): { valid: boolean; error?: string } {
  const validExts = ["jpeg", "jpg", "png"];
  const validMimes = ["image/jpeg", "image/png"];
  const normalizedExt = fileExt.toLowerCase().replace(".", "");

  if (!validExts.includes(normalizedExt)) {
    return { valid: false, error: "Image must be JPEG or PNG format." };
  }
  if (!validMimes.includes(mimeType)) {
    return { valid: false, error: "Invalid MIME type. Only image/jpeg and image/png are accepted." };
  }
  if (byteSize > 5 * 1024 * 1024) {
    return { valid: false, error: "Image exceeds 5MB limit. Please upload an image under 5MB." };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Helper: Call Meta Graph API
// ---------------------------------------------------------------------------
async function metaApi(endpoint: string, accessToken: string, options: {
  method?: string;
  params?: Record<string, string>;
  body?: Record<string, unknown> | FormData;
} = {}) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${endpoint}`);

  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };

  const fetchOpts: RequestInit = {
    method: options.method || "GET",
    headers,
  };

  if (options.body) {
    if (options.body instanceof FormData) {
      fetchOpts.body = options.body;
      // Do not set Content-Type header so fetch boundary is set automatically
    } else {
      headers["Content-Type"] = "application/json";
      fetchOpts.body = JSON.stringify(options.body);
    }
  }

  const res = await fetch(url.toString(), fetchOpts);
  const data = await res.json().catch(() => ({}));

  return { status: res.status, data, ok: res.ok };
}

// ---------------------------------------------------------------------------
// Helper: Map Meta API errors to user-friendly messages without exposing secrets
// ---------------------------------------------------------------------------
function mapMetaError(data: any): string {
  if (!data || !data.error) {
    return "Meta API did not confirm the profile update.";
  }
  const err = data.error;
  if (err.code === 4) {
    return "Permission denied: WhatsApp Business Management permission (whatsapp_business_management) is required in your Meta App Review.";
  }
  if (err.code === 190) {
    return "WhatsApp access token expired or invalid. Please reconnect your WhatsApp Business account.";
  }
  if (err.code === 100) {
    return err.error_user_msg || err.message || "Invalid parameters sent to Meta WhatsApp Business API.";
  }
  if (err.error_user_title) {
    return `${err.error_user_title}: ${err.error_user_msg || err.message || ""}`;
  }
  if (err.message) {
    return `Meta API error: ${err.message}`;
  }
  return "Meta API encountered an error processing your WhatsApp Business profile update.";
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

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: "Unauthorized user session" }, 401);
    }

    // 2. Get user's organization and verify OWNER/ADMIN role
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("users")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile || !["OWNER", "ADMIN"].includes(profile.role)) {
      return jsonResponse({ error: "Forbidden: OWNER or ADMIN permissions required" }, 403);
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

    if (!phone_number_id && !waba_id) {
      return jsonResponse({ error: "Missing phone_number_id and waba_id in connection record." }, 400);
    }

    // 5. Parse request body
    const { action, imageBase64, fileName, about } = await req.json();

    if (!action) {
      return jsonResponse({ error: "Missing required 'action' field" }, 400);
    }

    // ─── Action: update_profile_picture ─────────────────────────────────
    if (action === "update_profile_picture") {
      if (!imageBase64 || typeof imageBase64 !== "string") {
        return jsonResponse({ error: "Missing imageBase64 data" }, 400);
      }

      // Parse data URL prefix if present
      let base64Data = imageBase64;
      let mimeType = "image/jpeg";
      let fileExt = "jpg";

      if (imageBase64.startsWith("data:")) {
        const match = imageBase64.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1].toLowerCase();
          base64Data = match[2];
          fileExt = mimeType.split("/")[1].replace("jpeg", "jpg");
        }
      }

      let byteChars: string;
      try {
        byteChars = atob(base64Data);
      } catch {
        return jsonResponse({ error: "Invalid base64 encoded image data." }, 400);
      }

      const byteSize = byteChars.length;
      const validation = validateImage(fileExt, mimeType, byteSize);
      if (!validation.valid) {
        return jsonResponse({ error: validation.error }, 400);
      }

      const binaryData = new Uint8Array(byteSize);
      for (let i = 0; i < byteSize; i++) {
        binaryData[i] = byteChars.charCodeAt(i);
      }

      // Upload temporary file to profile-photos-public for Meta lookaside fetch if needed
      const safeFileName = fileName || `profile_${Date.now()}.${fileExt}`;
      const uploadName = `profile-${user.id}-${Date.now()}.${fileExt}`;
      const uploadPath = `${user.id}/${uploadName}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("profile-photos-public")
        .upload(uploadPath, binaryData, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        console.warn("Storage temporary upload error:", uploadError.message);
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from("profile-photos-public")
        .getPublicUrl(uploadPath);
      const publicUrl = publicUrlData?.publicUrl || "";

      // ── Step 1: Upload Image to Meta Media API ──
      const targetPhoneId = phone_number_id || waba_id;
      const formData = new FormData();
      formData.append("messaging_product", "whatsapp");
      formData.append("file", new Blob([binaryData], { type: mimeType }), safeFileName);
      formData.append("type", mimeType);

      let mediaRes = await metaApi(`${targetPhoneId}/media`, accessToken, {
        method: "POST",
        body: formData,
      });

      // If direct binary multipart failed and publicUrl is available, try image_url parameter
      if ((!mediaRes.ok || !mediaRes.data?.id) && publicUrl) {
        mediaRes = await metaApi(`${targetPhoneId}/media`, accessToken, {
          method: "POST",
          params: {
            messaging_product: "whatsapp",
            image_url: publicUrl,
          },
        });
      }

      if (!mediaRes.ok || !mediaRes.data?.id) {
        // Cleanup temp storage image
        if (uploadPath) {
          await supabaseAdmin.storage.from("profile-photos-public").remove([uploadPath]);
        }
        return jsonResponse({
          error: mapMetaError(mediaRes.data) || "Meta Media API did not accept the uploaded image.",
          meta_response: mediaRes.data,
        }, 400);
      }

      const mediaId = mediaRes.data.id;

      // ── Step 2: Set profile picture handle via WhatsApp Business Profile API ──
      let profileRes = await metaApi(`${targetPhoneId}/whatsapp_business_profile`, accessToken, {
        method: "POST",
        body: {
          messaging_product: "whatsapp",
          profile_picture_handle: mediaId,
        },
      });

      // Fallback to WABA ID if phone_number_id endpoint returned 404/not supported
      if (!profileRes.ok && waba_id && waba_id !== targetPhoneId) {
        profileRes = await metaApi(`${waba_id}/whatsapp_business_profile`, accessToken, {
          method: "POST",
          body: {
            messaging_product: "whatsapp",
            profile_picture_handle: mediaId,
          },
        });
      }

      // Cleanup: Delete temporary file from storage bucket
      if (uploadPath) {
        await supabaseAdmin.storage.from("profile-photos-public").remove([uploadPath]);
      }

      // Check Meta confirmation
      if (!profileRes.ok || (profileRes.data?.success !== true && !profileRes.data?.id)) {
        return jsonResponse({
          error: mapMetaError(profileRes.data),
          meta_response: profileRes.data,
        }, 400);
      }

      // ── Step 3: Fetch confirmed profile picture from Meta to cache CDN URL ──
      let confirmedPictureUrl = "";
      const fetchProfileRes = await metaApi(`${targetPhoneId}/whatsapp_business_profile`, accessToken, {
        method: "GET",
        params: { fields: "profile_picture_url,about" },
      });

      if (fetchProfileRes.ok && fetchProfileRes.data) {
        const item = Array.isArray(fetchProfileRes.data.data) ? fetchProfileRes.data.data[0] : fetchProfileRes.data;
        confirmedPictureUrl = item?.profile_picture_url || "";
      }

      // Update whatsapp_connections table with confirmed profile picture
      if (confirmedPictureUrl) {
        await supabaseAdmin
          .from("whatsapp_connections")
          .update({
            profile_picture_url: confirmedPictureUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", profile.organization_id);
      }

      // Insert audit log only on confirmed success
      try {
        await supabaseAdmin.from("audit_logs").insert({
          organization_id: profile.organization_id,
          action: "WhatsApp Profile Picture Updated",
          entity: connection.phone_number || phone_number_id || waba_id,
          actor: user.email || "Admin",
          details: `Profile picture updated via Meta Business Profile API. Media ID: ${mediaId}`,
          status: "Success",
        });
      } catch (auditErr) {
        console.warn("Audit log insert error (non-fatal):", auditErr);
      }

      return jsonResponse({
        success: true,
        message: "Profile picture updated successfully on WhatsApp Business.",
        media_id: mediaId,
        profile_picture_url: confirmedPictureUrl || null,
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

      const targetPhoneId = phone_number_id || waba_id;
      let res = await metaApi(`${targetPhoneId}/whatsapp_business_profile`, accessToken, {
        method: "POST",
        body: {
          messaging_product: "whatsapp",
          about: trimmed,
        },
      });

      if (!res.ok && waba_id && waba_id !== targetPhoneId) {
        res = await metaApi(`${waba_id}/whatsapp_business_profile`, accessToken, {
          method: "POST",
          body: {
            messaging_product: "whatsapp",
            about: trimmed,
          },
        });
      }

      if (!res.ok || (res.data?.success !== true && !res.data?.id)) {
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

      // Audit log
      try {
        await supabaseAdmin.from("audit_logs").insert({
          organization_id: profile.organization_id,
          action: "WhatsApp About Text Updated",
          entity: connection.phone_number || phone_number_id || waba_id,
          actor: user.email || "Admin",
          details: `About text set to: "${trimmed}"`,
          status: "Success",
        });
      } catch (auditErr) {
        console.warn("Audit log insert error (non-fatal):", auditErr);
      }

      return jsonResponse({
        success: true,
        message: "About text updated successfully on WhatsApp Business.",
        about: trimmed,
      });
    }

    // ─── Action: fetch_profile ───────────────────────────────────────────
    if (action === "fetch_profile") {
      const targetPhoneId = phone_number_id || waba_id;
      let res = await metaApi(`${targetPhoneId}/whatsapp_business_profile`, accessToken, {
        method: "GET",
        params: {
          fields: "profile_picture_url,about,address,description,name,websites,vertical",
        },
      });

      if (!res.ok && waba_id && waba_id !== targetPhoneId) {
        res = await metaApi(`${waba_id}/whatsapp_business_profile`, accessToken, {
          method: "GET",
          params: {
            fields: "profile_picture_url,about,address,description,name,websites,vertical",
          },
        });
      }

      if (!res.ok) {
        return jsonResponse({
          error: mapMetaError(res.data),
          meta_response: res.data,
        }, 400);
      }

      const profileData = Array.isArray(res.data?.data) ? res.data.data[0] : res.data;

      // Also update local cache if profile_picture_url is present
      if (profileData?.profile_picture_url || profileData?.about) {
        const updateFields: Record<string, any> = { updated_at: new Date().toISOString() };
        if (profileData.profile_picture_url) updateFields.profile_picture_url = profileData.profile_picture_url;
        if (profileData.about) updateFields.about = profileData.about;

        await supabaseAdmin
          .from("whatsapp_connections")
          .update(updateFields)
          .eq("organization_id", profile.organization_id);
      }

      return jsonResponse({
        success: true,
        profile: profileData,
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("update-whatsapp-profile Error:", err);
    return jsonResponse({ error: (err as Error).message || "Internal server error" }, 500);
  }
});
