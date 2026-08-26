// meta-webhook Edge Function (Supabase)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker"];

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
  "video/mp4": "mp4", "video/3gpp": "3gp", "video/quicktime": "mov",
  "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mp4": "m4a", "audio/aac": "aac",
  "application/pdf": "pdf", "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt", "text/csv": "csv", "application/zip": "zip",
};

function extFromMime(mimeType: string): string {
  const clean = String(mimeType || "").split(";")[0].trim().toLowerCase();
  if (MIME_TO_EXT[clean]) return MIME_TO_EXT[clean];
  const sub = clean.split("/")[1] || "bin";
  return /^[a-z0-9]{1,8}$/.test(sub) ? sub : "bin";
}

function buildStoragePath(cleanPhone: string, mediaId: string, fileName: string, mimeType: string): string {
  const safeName = String(fileName || `media_${mediaId}`).replace(/[^a-zA-Z0-9._-]/g, "_");
  const hasExt = /\.[a-zA-Z0-9]{1,8}$/.test(safeName);
  const suffix = hasExt ? "" : `.${extFromMime(mimeType)}`;
  return `${cleanPhone}/${mediaId}/${mediaId}_${safeName}${suffix}`;
}

async function processInboundMedia(msg: any, mediaType: string, supabaseAdmin: any) {
  const mediaId = msg[mediaType]?.id;
  if (!mediaId) return null;

  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  if (!accessToken) {
    console.error("[Media] WHATSAPP_ACCESS_TOKEN not configured");
    return null;
  }

  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!metaRes.ok) {
      console.error(`[Media] Meta lookup failed ${metaRes.status}:`, await metaRes.text());
      return null;
    }
    const meta = await metaRes.json();
    if (!meta.url) return null;

    const downloadRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!downloadRes.ok) {
      console.error(`[Media] Download failed ${downloadRes.status}`);
      return null;
    }
    const buffer = await downloadRes.arrayBuffer();
    const mimeType = meta.mime_type || meta.content_type || downloadRes.headers.get("content-type") ||
      "application/octet-stream";
    const fileName = meta.filename || msg[mediaType]?.filename || `${mediaId}`;

    const cleanPhone = String(msg.from || "").replace(/[^0-9]/g, "").slice(-10) || "unknown";
    const storagePath = buildStoragePath(cleanPhone, mediaId, fileName, mimeType);

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("whatsapp-media")
      .upload(storagePath, new Uint8Array(buffer), { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.error("[Media] Storage upload error:", uploadError);
      return null;
    }

    // Store the storage PATH (not a URL) so it matches what api/meta-webhook.js
    // writes and what api/messages.js expects when it mints signed URLs.
    return {
      mediaUrl: uploadData?.path || storagePath,
      mediaMimeType: mimeType,
      fileName,
      mediaSize: buffer.byteLength,
    };
  } catch (err) {
    console.error("[Media] Processing error:", err);
    return null;
  }
}

async function handler(request: Request): Promise<Response> {
  const method = request.method;

  if (method === "GET") {
    const url = new URL(request.url);
    const hubMode = url.searchParams.get("hub.mode");
    const hubVerifyToken = url.searchParams.get("hub.verify_token");
    const hubChallenge = url.searchParams.get("hub.challenge");

    const expectedToken = Deno.env.get("META_VERIFY_TOKEN");
    if (hubMode === "subscribe" && hubVerifyToken === expectedToken && hubChallenge) {
      return new Response(hubChallenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Verification token mismatch", { status: 403 });
  }

  if (method === "POST") {
    try {
      const payload = await request.json();
      const messages = payload?.entry?.[0]?.changes?.[0]?.value?.messages ?? [];

      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!serviceRoleKey) {
        console.error("[Webhook] SUPABASE_SERVICE_ROLE_KEY not configured — cannot persist messages");
        return new Response(null, { status: 200 });
      }

      const supabaseAdmin = createClient(
        supabaseUrl,
        serviceRoleKey,
        { db: { schema: "public" }, auth: { persistSession: false } },
      );

      for (const msg of messages) {
        const sender = msg.from ?? "";
        const type = msg.type ?? "";
        const content = msg.text?.body ?? "";
        const isMedia = MEDIA_TYPES.includes(type);

        // Meta retries deliveries it considers failed, so skip messages we already stored.
        if (msg.id) {
          const { data: existing } = await supabaseAdmin
            .from("messages")
            .select("id")
            .eq("wa_message_id", msg.id)
            .limit(1);
          if (existing && existing.length > 0) {
            console.log("[Webhook] Duplicate message, skipping:", msg.id);
            continue;
          }
        }

        let mediaInfo = null;
        let caption = "";
        let displayContent = content;

        if (isMedia) {
          mediaInfo = await processInboundMedia(msg, type, supabaseAdmin);
          caption = msg[type]?.caption || "";
          displayContent = caption || (type === "audio" ? "🎤 Voice message" : `📎 ${type} message`);
        }

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
          media_size: mediaInfo?.mediaSize ?? 0,
        };

        // Must use the service-role client: RLS on public.messages rejects anon inserts.
        const { error } = await supabaseAdmin.from("messages").insert(messageRecord);
        if (error) console.error("[Webhook] Supabase insert error:", error);
      }

      return new Response(null, { status: 200 });
    } catch (err) {
      // Always ack with 200. A non-2xx makes Meta retry the same payload and can
      // eventually disable the webhook subscription.
      console.error("[Webhook] Processing error:", err);
      return new Response(null, { status: 200 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

Deno.serve(handler);