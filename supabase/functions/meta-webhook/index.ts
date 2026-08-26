// meta-webhook Edge Function (Supabase)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker"];

async function processInboundMedia(msg: any, mediaType: string, supabaseAdmin: any) {
  const mediaId = msg[mediaType]?.id;
  if (!mediaId) return null;

  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  if (!accessToken) {
    console.error("[Media] WHATSAPP_ACCESS_TOKEN not configured");
    return null;
  }

  let metaRes;
  let downloadRes;
  let uploadResult;

  try {
    metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}?access_token=${accessToken}`);
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    if (!meta.url) return null;

    downloadRes = await fetch(meta.url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!downloadRes.ok) return null;
    const buffer = await downloadRes.arrayBuffer();
    const mimeType = meta.content_type || downloadRes.headers.get("content-type") || "application/octet-stream";
    const fileName = meta.filename || `${mediaId}`;

    const cleanPhone = String(msg.from || "").replace(/[^0-9]/g, "").slice(-10);
    const ext = (mimeType.split("/")[1] || "bin").split(";")[0];
    const safeFileName = `${mediaId}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storagePath = `${cleanPhone}/${mediaId}/${safeFileName}.${ext}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("whatsapp-media")
      .upload(storagePath, new Uint8Array(buffer), { contentType: mimeType, upsert: true });

    uploadResult = uploadData;
    if (uploadError) return null;

    const { data: publicUrlData } = supabaseAdmin.storage.from("whatsapp-media").getPublicUrl(storagePath);
    const publicUrl = publicUrlData?.publicUrl;
    if (!publicUrl) return null;

    return { mediaUrl: publicUrl, mediaMimeType: mimeType, fileName };
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

      const supabaseAdmin = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { db: { schema: "public" }, auth: { persistSession: false } }
      );

      for (const msg of messages) {
        const sender = msg.from ?? "";
        const type = msg.type ?? "";
        const content = msg.text?.body ?? "";
        const isMedia = MEDIA_TYPES.includes(type);

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
        };

        const { error } = await supabase.from("messages").insert(messageRecord);
        if (error) console.error("[Webhook] Supabase insert error:", error);
      }

      return new Response(null, { status: 200 });
    } catch (err) {
      console.error("[Webhook] Processing error:", err);
      return new Response("Server error", { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

Deno.serve(handler);