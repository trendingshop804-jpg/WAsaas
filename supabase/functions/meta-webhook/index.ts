// meta-webhook Edge Function (Supabase)
// Handles WhatsApp Cloud API webhook verification and incoming events
// Deploy under supabase/functions/meta-webhook/index.ts

import { createClient } from "@supabase/supabase-js";
import { json } from "@remix-run/node"; // for response helpers

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
  if (!mediaId) return null;

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) return null;

  try {
    // Step 1: Get the download URL from Meta
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}?access_token=${accessToken}`);
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    if (!meta.url) return null;

    // Step 2: Download the media binary
    const downloadRes = await fetch(meta.url);
    if (!downloadRes.ok) return null;
    const buffer = await downloadRes.arrayBuffer();
    const mimeType = meta.content_type || downloadRes.headers.get("content-type") || "application/octet-stream";
    const fileName = meta.filename || `${mediaId}`;

    // Step 3: Upload to Supabase Storage (private bucket)
    const cleanPhone = String(msg.from || "").replace(/[^0-9]/g, "").slice(-10);
    const ext = (mimeType.split("/")[1] || "bin").split(";")[0];
    const safeFileName = `${mediaId}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storagePath = `${cleanPhone}/${mediaId}/${safeFileName}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("whatsapp-media")
      .upload(storagePath, new Uint8Array(buffer), {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return null;
    }

    return { mediaUrl: storagePath, mediaMimeType: mimeType, fileName };
  } catch (err) {
    console.error("Media processing error:", err);
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
      // Typical WhatsApp message structure (simplified)
      const messages = payload?.entry?.[0]?.changes?.[0]?.value?.messages ?? [];

      // Use service-role client for storage uploads (anon client cannot write to buckets)
      const supabaseAdmin = createClient(
        supabaseUrl,
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
        { db: { schema: "public" }, auth: { persistSession: false } }
      );

      for (const msg of messages) {
        const sender = msg.from ?? "";
        const type = msg.type ?? "";
        const content = msg.text?.body ?? "";
        const isMedia = MEDIA_TYPES.includes(type);

        // Download and upload media if applicable
        let mediaInfo: { mediaUrl: string; mediaMimeType: string; fileName: string } | null = null;
        let caption = "";
        let displayContent = content;

        if (isMedia) {
          mediaInfo = await processInboundMedia(msg, type, supabaseAdmin);
          caption = msg[type]?.caption || "";
          displayContent = caption || (type === "audio" ? "🎤 Voice message" : `📎 ${type} message`);
        }

        // Store in messages table
        const { error } = await supabase.from("messages").insert({
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
        });
        if (error) {
          console.error("Supabase insert error:", error);
        } else {
          console.log(`Webhook message stored: type=${type}, sender=${sender}`);
        }
      }
      // Fast response to Meta
      return new Response(null, { status: 200 });
    } catch (err) {
      console.error("Webhook processing error:", err);
      return new Response("Server error", { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
};
