// meta-webhook Edge Function (Supabase)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";

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

function fallbackReply(message: string): string {
  const normalized = message.toLowerCase();
  if (/\b(price|pricing|cost|rate|how much)\b/.test(normalized)) {
    return "Thanks for asking! I can share the right pricing once I understand what you need. What are you looking to achieve?";
  }
  if (/\b(demo|call|meeting|book)\b/.test(normalized)) {
    return "Absolutely — I'd be happy to arrange a quick demo. What day and time work best for you?";
  }
  return "Hi! Thanks for getting in touch. How can I help you today?";
}

function isOptOut(message: string): boolean {
  return /\b(stop|unsubscribe|remove me|do not contact|don't contact|not interested)\b/i.test(message);
}

async function generateAIReply(organization: Record<string, unknown>, history: Array<Record<string, unknown>>, userMessage: string): Promise<string> {
  if (!openRouterApiKey) return fallbackReply(userMessage);

  const businessName = organization?.name || 'our business';
  const productDescription = organization?.product_description || 'our services';
  const pricingSummary = organization?.pricing_summary || 'contact us for pricing details';
  const bookingLink = organization?.booking_link || '';

  const systemPrompt = `You are ${businessName}'s WhatsApp assistant. Your job is to greet inbound leads, qualify them, and either book them in or hand them off to a human — all inside a normal WhatsApp chat.

## Voice & format
- Sound like a helpful person on WhatsApp, not a form. Short messages (1-3 lines max).
- One question at a time. Never dump multiple questions in one message.
- Use the lead's name once you have it. Light emoji is fine, don't overdo it.
- Reply in the language the lead writes in (English, Tamil, Malayalam, or mixed).

## Conversation flow
1. Greet + discover intent — Ask what brought them here in one friendly line.
2. Qualify — Naturally collect, over the course of the chat (not as a checklist):
   - Name
   - Business/industry
   - What problem they're trying to solve / what they're interested in
   - Budget range (ask softly, e.g. "roughly what budget are you working with?")
   - Timeline (immediate / this month / just exploring)
3. Score the lead internally as HOT (ready to buy, has budget + timeline), WARM (interested, needs nurturing), or COLD (just browsing/no fit).
4. Route:
   - HOT → offer to book a call/demo right away, share ${bookingLink}, and flag for human follow-up.
   - WARM → answer their questions, share relevant info/pricing, ask if they'd like a callback.
   - COLD → answer politely, add to nurture list, don't push for a call.
5. Handoff — If the lead asks something you're unsure of, asks for a human, or gets frustrated, say so plainly and tag for human takeover. Never pretend to be human if directly asked.

## Hard rules
- Never invent pricing, features, or timelines you weren't given — say you'll confirm and get back to them.
- Never ask for sensitive info (passwords, OTPs, card numbers) over chat.
- Don't repeat a question the lead already answered earlier in the chat.
- If the lead goes silent, don't follow up more than twice.

## Output for the CRM (structured, not shown to the lead)
After each exchange, also produce:
{
  "lead_status": "HOT | WARM | COLD",
  "captured_fields": { "name": "", "industry": "", "need": "", "budget": "", "timeline": "" },
  "next_action": "book_call | send_info | human_handoff | nurture",
  "notes": ""
}

## Context
- Business: ${businessName}
- Product/Service: ${productDescription}
- Pricing: ${pricingSummary}
- Booking link: ${bookingLink}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({
      role: (m as Record<string, string>).direction === 'inbound' ? 'user' : 'assistant',
      content: (m as Record<string, string>).body || ''
    })),
    { role: 'user', content: userMessage }
  ];

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openRouterApiKey}`, "Content-Type": "application/json", "X-Title": "WAsaas AI Agent" },
      body: JSON.stringify({ model: "openai/gpt-4o-mini", messages, temperature: 0.7, max_tokens: 600 })
    });

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (response.ok && reply) return reply;
  } catch (error) {
    console.error("[AI Agent] Reply generation failed:", error);
  }
  return fallbackReply(userMessage);
}

async function sendWhatsAppReply(phoneNumberId: string, to: string, body: string) {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  if (!accessToken || !phoneNumberId || !to) throw new Error("WhatsApp token, phone number ID, or recipient is missing");
  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`WhatsApp send failed (${response.status}): ${JSON.stringify(data)}`);
  return data;
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

async function getOrganizationId(supabaseAdmin: any, phoneNumberId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("whatsapp_connections")
    .select("organization_id")
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .limit(1);

  return data?.[0]?.organization_id || null;
}

async function findOrCreateLead(supabaseAdmin: any, organizationId: string, phoneNumber: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone", phoneNumber)
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0].id;
  }

  const { data: newLead, error } = await supabaseAdmin
    .from("leads")
    .insert({
      organization_id: organizationId,
      company_name: "WhatsApp Lead",
      contact_name: "",
      phone: phoneNumber,
      source: "WhatsApp",
      status: "NEW",
      score: 50,
      score_category: "WARM",
    })
    .select("id")
    .single();

  if (error) {
    console.error("Lead creation error:", error);
    throw new Error(`Failed to create lead: ${error.message}`);
  }

  return newLead.id;
}

async function findOrCreateConversation(supabaseAdmin: any, organizationId: string, leadId: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("lead_id", leadId)
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0].id;
  }

  const { data: newConv, error } = await supabaseAdmin
    .from("conversations")
    .insert({
      organization_id: organizationId,
      lead_id: leadId,
      mode: "AI",
      unread_count: 0,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Conversation creation error:", error);
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  return newConv.id;
}

async function fetchChatHistory(supabaseAdmin: any, conversationId: string, limit = 20): Promise<Array<Record<string, unknown>>> {
  const { data } = await supabaseAdmin
    .from("messages")
    .select("direction, body, message_type, received_at")
    .eq("conversation_id", conversationId)
    .order("received_at", { ascending: true })
    .limit(limit);

  return data || [];
}

function parseAIResponse(rawContent: string): { replyText: string; crmData: Record<string, unknown> | null } {
  const text = (rawContent || "").trim();
  const jsonMatch = text.match(/(\{[\s\S]*\})\s*$/);
  let replyText = text;
  let crmData: Record<string, unknown> | null = null;

  if (jsonMatch) {
    try {
      crmData = JSON.parse(jsonMatch[1]);
      replyText = text.slice(0, jsonMatch.index).trim();
    } catch (e) {
      console.warn("Failed to parse AI CRM JSON:", (e as Error).message);
    }
  }

  return { replyText, crmData };
}

async function updateLeadFromCRM(supabaseAdmin: any, leadId: string, crmData: Record<string, unknown> | null) {
  if (!crmData || !leadId) return;

  const updates: Record<string, unknown> = {};

  if (crmData.captured_fields) {
    const fields = crmData.captured_fields as Record<string, string>;
    if (fields.name && !updates.contact_name) updates.contact_name = fields.name;
    if (fields.industry && !updates.industry) updates.industry = fields.industry;
    if (fields.need && !updates.ai_summary) updates.ai_summary = fields.need;
  }

  if (crmData.lead_status) {
    const statusMap: Record<string, string> = { 'HOT': 'QUALIFIED', 'WARM': 'REPLIED', 'COLD': 'NEW' };
    updates.status = statusMap[crmData.lead_status as string] || updates.status;
    updates.score_category = crmData.lead_status;
  }

  if (crmData.notes) {
    updates.notes = crmData.notes;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabaseAdmin
      .from("leads")
      .update(updates)
      .eq("id", leadId);

    if (error) {
      console.error("Lead CRM update error:", error);
    }
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
      const value = payload?.entry?.[0]?.changes?.[0]?.value ?? {};
      const messages = value.messages ?? [];
      const phoneNumberId = value.metadata?.phone_number_id ?? "";

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

      const organizationId = await getOrganizationId(supabaseAdmin, phoneNumberId);
      if (!organizationId) {
        console.error("[Webhook] No active WhatsApp connection found for phone_number_id:", phoneNumberId);
        return new Response(null, { status: 200 });
      }

      let orgSettings: Record<string, string> = {};
      try {
        const { data } = await supabaseAdmin
          .from("organizations")
          .select("*")
          .eq("id", organizationId)
          .limit(1);
        orgSettings = (data?.[0] as Record<string, string>) || {};
      } catch (err) {
        console.warn("[Webhook] Could not fetch organization settings:", (err as Error).message);
      }

      for (const msg of messages) {
        const sender = msg.from ?? "";
        const type = msg.type ?? "";
        const content = msg.text?.body ?? "";
        const isMedia = MEDIA_TYPES.includes(type);

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

        let leadId: string | null = null;
        let conversationId: string | null = null;
        let chatHistory: Array<Record<string, unknown>> = [];

        try {
          leadId = await findOrCreateLead(supabaseAdmin, organizationId, sender);
          conversationId = await findOrCreateConversation(supabaseAdmin, organizationId, leadId);

          if (type === "text" && content.trim()) {
            chatHistory = await fetchChatHistory(supabaseAdmin, conversationId);
          }
        } catch (err) {
          console.error("[Webhook] Lead/Conversation setup error:", err);
        }

        if (!conversationId) {
          console.error("[Webhook] Skipping message — no conversation_id available");
          continue;
        }

        const messageRecord = {
          conversation_id: conversationId,
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

        const { error } = await supabaseAdmin.from("messages").insert(messageRecord);
        if (error) console.error("[Webhook] Supabase insert error:", error);

        if (isOptOut(content) && leadId) {
          try {
            await supabaseAdmin
              .from("leads")
              .update({
                opted_out: true,
                score: 0,
                next_follow_up_at: null,
                followup_count: 0,
              })
              .eq("id", leadId);
          } catch (error) {
            console.error("[Webhook] Opt-out update error:", error);
          }
        }

        if (type === "text" && content.trim() && !isOptOut(content)) {
          try {
            const aiRaw = await generateAIReply(orgSettings, chatHistory, content);
            const parsed = parseAIResponse(aiRaw);
            const replyText = parsed.replyText || fallbackReply(content);

            const sent = await sendWhatsAppReply(phoneNumberId, sender, replyText);
            const sentAt = new Date().toISOString();
            const { error: outboundError } = await supabaseAdmin.from("messages").insert({
              conversation_id: conversationId,
              wa_message_id: sent.messages?.[0]?.id,
              sender_number: sender,
              sender: "agent",
              body: replyText,
              message_body: replyText,
              content: replyText,
              message_type: "text",
              direction: "outbound",
              received_at: sentAt,
              created_at: sentAt,
              is_ai: true,
              status: "sent",
            });
            if (outboundError) throw outboundError;

            await updateLeadFromCRM(supabaseAdmin, leadId, parsed.crmData);

            await supabaseAdmin
              .from("conversations")
              .update({
                last_message: replyText,
                last_timestamp: new Date().toISOString()
              })
              .eq("id", conversationId);
          } catch (error) {
            console.error("[AI Agent] Auto-reply send failed:", error);
          }
        }
      }

      return new Response(null, { status: 200 });
    } catch (err) {
      console.error("[Webhook] Processing error:", err);
      return new Response(null, { status: 200 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

Deno.serve(handler);