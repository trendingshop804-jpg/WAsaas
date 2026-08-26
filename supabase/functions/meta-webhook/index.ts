// meta-webhook Edge Function (Supabase)
// Handles WhatsApp Cloud API webhook verification and incoming events
// Deploy under supabase/functions/meta-webhook/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Initialize Supabase client – the URL and ANON_KEY are injected as env vars by Supabase Edge Runtime
const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// WhatsApp media message types
const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker"];

/**
 * Download media from Meta's Graph API and upload to Supabase Storage.
 * Returns { mediaUrl, mediaMimeType, fileName } or null on failure.
 */
async function processInboundMedia(msg: any, mediaType: string, supabaseAdmin: any) {
  const mediaId = msg[mediaType]?.id;
  if (!mediaId) {
    console.log("[Media] No mediaId found for type:", mediaType);
    return null;
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    console.error("[Media] WHATSAPP_ACCESS_TOKEN not configured");
    return null;
  }

  console.log("[Media] Starting media processing for type:", mediaType, "media id:", mediaId);

  let metaRes;
  let downloadRes;
  let uploadResult;

  try {
    // Step 1: Get the download URL from Meta
    console.log("[Media] Calling Graph API for media ID:", mediaId);
    metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}?access_token=${accessToken}`);
    console.log("[Media] Graph API response status:", metaRes.status);

    if (!metaRes.ok) {
      console.error("[Media] Failed to get media info:", metaRes.status);
      return null;
    }
    const meta = await metaRes.json();
    if (!meta.url) {
      console.error("[Media] No download URL in response:", JSON.stringify(meta));
      return null;
    }

    console.log("[Media] Got download URL for", mediaId);

    // Step 2: Download the media binary
    console.log("[Media] Downloading media from URL:", meta.url.substring(0, 100) + "...");
    downloadRes = await fetch(meta.url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    console.log("[Media] Download status:", downloadRes.status);

    if (!downloadRes.ok) {
      console.error("[Media] Download failed:", downloadRes.status);
      return null;
    }
    const buffer = await downloadRes.arrayBuffer();
    const mimeType = meta.content_type || downloadRes.headers.get("content-type") || "application/octet-stream";
    const fileName = meta.filename || `${mediaId}`;

    console.log("[Media] Downloaded", buffer.byteLength, "bytes, type:", mimeType);

    // Step 3: Upload to Supabase Storage
    const cleanPhone = String(msg.from || "").replace(/[^0-9]/g, "").slice(-10);
    const ext = (mimeType.split("/")[1] || "bin").split(";")[0];
    const safeFileName = `${mediaId}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storagePath = `${cleanPhone}/${mediaId}/${safeFileName}.${ext}`;

    console.log("[Media] Uploading to storage:", storagePath);

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("whatsapp-media")
      .upload(storagePath, new Uint8Array(buffer), {
        contentType: mimeType,
        upsert: true,
      });

    uploadResult = uploadData;
    console.log("[Media] Upload result:", JSON.stringify(uploadResult), "Error:", JSON.stringify(uploadError));

    if (uploadError) {
      console.error("[Media] Storage upload error:", uploadError);
      return null;
    }

    console.log("[Media] Upload successful");

    // Step 4: Get public URL from Supabase Storage
    const { data: publicUrlData } = supabaseAdmin.storage
      .from("whatsapp-media")
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData?.publicUrl;
    if (!publicUrl) {
      console.error("[Media] Failed to get public URL for:", storagePath);
      return null;
    }

    console.log("[Media] Public URL:", publicUrl);

    return { mediaUrl: publicUrl, mediaMimeType: mimeType, fileName };
  } catch (err) {
    console.error("[Media] Processing error:", err);
    console.error("[Media] Graph API status:", metaRes?.status);
    console.error("[Media] Download status:", downloadRes?.status);
    console.error("[Media] Upload result:", JSON.stringify(uploadResult));
    return null;
  }
}

export const handler = async (event: any) => {
  const { request } = event;
  const method = request.method;

  // GET verification
  if (method === "GET") {
    const url = new URL(request.url);
    const hubMode = url.searchParams.get("hub.mode");
    const hubVerifyToken = url.searchParams.get("hub.verify_token");
    const hubChallenge = url.searchParams.get("hub.challenge");

    const expectedToken = process.env.META_VERIFY_TOKEN;
    if (hubMode === "subscribe" && hubVerifyToken === expectedToken && hubChallenge) {
      return new Response(hubChallenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Verification token mismatch", { status: 403 });
  }

  // POST incoming webhook events
  if (method === "POST") {
    try {
      const payload = await request.json();
      console.log("[Webhook] Received payload:", JSON.stringify(payload).slice(0, 500));

      // Typical WhatsApp message structure
      const messages = payload?.entry?.[0]?.changes?.[0]?.value?.messages ?? [];

      // Use service-role client for storage uploads (anon client cannot write to buckets)
      const supabaseAdmin = createClient(
        supabaseUrl,
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
        { db: { schema: "public" }, auth: { persistSession: false } }
      );

      for (const msg of messages) {
        console.log("Webhook invoked, message type:", msg.type);

        const sender = msg.from ?? "";
        const type = msg.type ?? "";
        const content = msg.text?.body ?? "";
        const isMedia = MEDIA_TYPES.includes(type);

        console.log(`[Webhook] Processing message: type=${type}, from=${sender}, isMedia=${isMedia}`);

        // Download and upload media if applicable
        let mediaInfo: { mediaUrl: string; mediaMimeType: string; fileName: string } | null = null;
        let caption = "";
        let displayContent = content;

        if (isMedia) {
          console.log("[Webhook] Starting media processing for type:", type, "media id:", msg[type]?.id);
          mediaInfo = await processInboundMedia(msg, type, supabaseAdmin);
          console.log("[Webhook] Media processing completed, result:", mediaInfo ? "SUCCESS" : "FAILED");
          caption = msg[type]?.caption || "";
          displayContent = caption || (type === "audio" ? "🎤 Voice message" : `📎 ${type} message`);
          console.log(`[Webhook] Media processing result:`, mediaInfo ? "SUCCESS" : "FAILED");
        }

        // Store in messages table
        const messageRecord = {
          wa_message_id: msg.id,
          sender_number: sender,
          content: displayContent,
          message_type: type,
          direction: "inbound",
          received_at: new Date().toISOString(),
          media_url: mediaInfo?.mediaUrl ?? null,
          media_mime_type: mediaInfo?.mediaMimeType ?? null,
          file_name: mediaInfo?.fileName ?? null,
          media_caption: isMedia ? caption : null,
        };

        console.log(`[Webhook] Inserting message:`, JSON.stringify(messageRecord));

        const { error } = await supabase.from("messages").insert(messageRecord);
        if (error) {
          console.error("[Webhook] Supabase insert error:", error);
        } else {
          console.log(`[Webhook] Message stored: type=${type}, sender=${sender}, media_url=${mediaInfo?.mediaUrl ?? 'null'}`);
        }
      }

      // Fast response to Meta
      return new Response(null, { status: 200 });
    } catch (err) {
      console.error("[Webhook] Processing error:", err);
      return new Response("Server error", { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
};
