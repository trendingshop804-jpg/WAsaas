// meta-webhook Edge Function (Supabase)
// Handles:
//   - Inbound messages from WhatsApp customers (all 15 message types supported)
//   - Delivery status updates (sent, delivered, read, failed) from Meta
//   - Multi-tenant token decryption from whatsapp_connections
//   - Opt-out compliance
//   - AI auto-reply generation using tenant credentials
//   - Automatic follow-up pause when customer replies
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decideAutoReply } from "./ai-reply.mjs";

const supabaseUrl      = Deno.env.get("SUPABASE_URL") ?? "";
const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const openRouterModel  = Deno.env.get("OPENROUTER_MODEL") ?? "openai/gpt-4o-mini";
const GRAPH_VERSION    = "v21.0";

// 'voice' is a distinct Meta type (voice notes) — treated identically to audio for media download.
const MEDIA_TYPES = ["image", "video", "audio", "voice", "document", "sticker"];

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/bmp": "bmp", "image/x-icon": "ico",
  "video/mp4": "mp4", "video/3gpp": "3gp", "video/quicktime": "mov", "video/x-msvideo": "avi", "video/webm": "webm", "video/x-matroska": "mkv",
  "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mp4": "m4a", "audio/aac": "aac", "audio/flac": "flac", "audio/opus": "opus", "audio/amr": "amr",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt", "text/csv": "csv", "text/html": "html", "text/css": "css", "application/json": "json", "application/xml": "xml", "text/xml": "xml",
  "application/zip": "zip", "application/x-zip-compressed": "zip", "application/x-rar-compressed": "rar", "application/vnd.rar": "rar",
  "application/x-7z-compressed": "7z", "application/x-tar": "tar", "application/gzip": "gz",
  "application/vnd.android.package-archive": "apk", "application/x-msdownload": "exe", "application/postscript": "ai", "image/vnd.adobe.photoshop": "psd",
};

const digits = (value: unknown) => String(value || "").replace(/\D/g, "");

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

function isOptOut(message: string): boolean {
  return /\b(stop|unsubscribe|remove me|do not contact|don't contact|not interested)\b/i.test(message);
}

// In-memory bounded cache to prevent duplicate processing on rapid webhook retries
const seenInboundMessageIds = new Map<string, number>();
function isDuplicateInbound(messageId: string): boolean {
  if (!messageId) return false;
  const now = Date.now();
  for (const [id, timestamp] of seenInboundMessageIds.entries()) {
    if (now - timestamp > 10 * 60 * 1000) seenInboundMessageIds.delete(id);
  }
  if (seenInboundMessageIds.has(messageId)) return true;
  seenInboundMessageIds.set(messageId, now);
  return false;
}

// AES-GCM SubtleCrypto decrypt matching _crypto.js
async function decryptToken(encoded: string | null | undefined): Promise<string> {
  if (!encoded) return "";
  let stored = String(encoded).trim();
  stored = stored.replace(/^["']+|["']+$/g, "").trim();
  stored = stored.replace(/^bearer\s+/i, "").trim();
  if (stored.startsWith("EAAV") || stored.startsWith("EAA") || stored.startsWith("IGQ")) {
    return stored;
  }
  try {
    const binary = atob(stored);
    const rawData = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) rawData[i] = binary.charCodeAt(i);
    if (rawData.length < 13) return stored;

    const iv = rawData.slice(0, 12);
    const cipherBuf = rawData.slice(12);

    const secret = Deno.env.get("INTEGRATION_ENCRYPT_SECRET") || Deno.env.get("META_APP_SECRET") || "change-me-to-32-char-secret!!!!!";
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const keyData = enc.encode(secret.padEnd(32, "0").slice(0, 32));

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      cipherBuf
    );

    let token = dec.decode(plainBuf).trim();
    token = token.replace(/^["']+|["']+$/g, "").trim();
    token = token.replace(/^bearer\s+/i, "").trim();
    return token;
  } catch (err) {
    console.warn("[Crypto] Token decrypt failed:", (err as Error).message);
    return "";
  }
}

async function getTenantWhatsAppCredentials(supabaseAdmin: any, organizationId: string, phoneNumberId: string) {
  const { data: connection, error } = await supabaseAdmin
    .from("whatsapp_connections")
    .select("phone_number_id, access_token_encrypted, waba_id")
    .eq("organization_id", organizationId)
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !connection) {
    console.warn("[Webhook] Could not load tenant credentials for phone_number_id:", phoneNumberId);
    const fallback = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    return fallback ? { accessToken: fallback, phoneNumberId, wabaId: "" } : null;
  }

  const token = await decryptToken(connection.access_token_encrypted);
  const finalToken = token || Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
  return {
    accessToken: finalToken,
    phoneNumberId: connection.phone_number_id || phoneNumberId,
    wabaId: connection.waba_id || ""
  };
}

export function readableContent(message: any): string {
  const type = String(message?.type || "unknown");
  if (type === "text") {
    return typeof message.text?.body === "string" && message.text.body.trim()
      ? message.text.body.trim()
      : "📩 WhatsApp message received";
  }
  if (type === "interactive") {
    const br = message.interactive?.button_reply;
    const lr = message.interactive?.list_reply;
    if (br?.title) return br.title;
    if (lr?.title) return lr.title;
    if (br?.id) return `Button reply: ${br.id}`;
    if (lr?.id) return `List reply: ${lr.id}`;
    return "Interactive WhatsApp reply without readable label.";
  }
  if (type === "button") {
    return message.button?.text || message.button?.payload || "WhatsApp button reply without readable label.";
  }
  if (type === "location") {
    const loc = message.location;
    if (!loc) return "WhatsApp location without readable details.";
    const label = loc.name || loc.address || "";
    const coords = `${loc.latitude}, ${loc.longitude}`;
    return label ? `📍 ${label} (${coords})` : `📍 Location: ${coords}`;
  }
  if (type === "contacts") {
    const contacts = message.contacts;
    if (!Array.isArray(contacts) || !contacts.length) return "WhatsApp contact card without readable name.";
    return contacts.map((c: any) => {
      const name = c.name?.formatted_name || c.name?.first_name || "";
      const phone = c.phones?.[0]?.phone || "";
      return name && phone ? `👤 ${name} (${phone})` : name ? `👤 ${name}` : phone ? `👤 ${phone}` : "👤 Shared Contact";
    }).join(", ");
  }
  if (type === "reaction") {
    const emoji = message.reaction?.emoji;
    return emoji ? `${emoji} Reaction` : "WhatsApp reaction";
  }
  if (type === "order") {
    const order = message.order;
    if (!order) return "WhatsApp order received.";
    const items = Array.isArray(order.product_items) ? order.product_items.length : 0;
    return order.catalog_id
      ? `🛒 Order from catalog ${order.catalog_id}${items ? ` (${items} item${items !== 1 ? "s" : ""})` : ""}.`
      : "WhatsApp order received.";
  }
  if (type === "system") {
    return message.system?.body || `WhatsApp system notice${message.system?.type ? `: ${message.system.type}` : ""}.`;
  }
  if (type === "referral") {
    return message.referral?.headline || message.referral?.body || message.referral?.source_url || "WhatsApp referral received.";
  }
  if (MEDIA_TYPES.includes(type)) {
    const mediaObj = message[type] || {};
    const caption = mediaObj.caption || "";
    if (type === "audio" || type === "voice") return caption || "🎤 Voice message";
    if (type === "sticker") return caption || "💟 Sticker";
    if (type === "image") return caption || "🖼️ Image";
    if (type === "video") return caption || "🎬 Video";
    if (type === "document") return caption || (mediaObj.filename ? `📄 ${mediaObj.filename}` : "📄 Document");
    return caption || `${type[0].toUpperCase()}${type.slice(1)} attachment.`;
  }
  if (type === "unsupported") {
    return "📩 WhatsApp message received";
  }
  return "📩 WhatsApp message received";
}

async function loadAutoReplyContext(supabaseAdmin: any, organizationId: string) {
  const { data: agents, error: agentError } = await supabaseAdmin
    .from("ai_agents")
    .select("id,business_name,system_instructions,tone,status,auto_reply_enabled,updated_at")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .eq("auto_reply_enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (agentError || !agents?.[0]) {
    if (agentError) console.warn("[AI Agent] Auto-reply configuration unavailable:", agentError.message);
    return null;
  }

  const { data: knowledge, error: knowledgeError } = await supabaseAdmin
    .from("ai_knowledge_base")
    .select("id,title,content,category,keywords,updated_at")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (knowledgeError) {
    console.warn("[AI Agent] Knowledge base unavailable:", knowledgeError.message);
  }

  return { agent: agents[0] as Record<string, unknown>, knowledge: knowledge || [] };
}

async function generateAIReply(agent: Record<string, unknown>, sources: Array<Record<string, unknown>>, history: Array<Record<string, unknown>>, userMessage: string) {
  if (!openRouterApiKey) {
    return { ok: false, text: "", outcome: "not_configured", errorCode: "AI_PROVIDER_NOT_CONFIGURED" };
  }

  const businessName = agent.business_name || "NextBright Solutions";
  const tone = agent.tone || "professional and helpful";
  const instructions = agent.system_instructions || "Answer customer questions accurately and concisely.";
  const knowledgeContext = sources.map(source => `[${source.title}] ${source.content}`).join("\n\n");

  const systemPrompt = `You are ${businessName}'s WhatsApp assistant.

## Voice & format
- Use a ${tone} tone and keep replies to 1-3 short lines.
- Reply in the language the lead writes in (English, Malayalam, Tamil, or mixed).
- Answer the customer's question directly before asking anything new.
- Do not repeat a greeting or question already present in the conversation.

## Hard rules
- Use verified Knowledge Base below for factual claims, pricing, and features.
- If no knowledge matches, provide a helpful general acknowledgment and offer to connect them to our team.
- Never ask for sensitive passwords, OTPs, or card numbers.

## Additional instructions
${instructions}

## Verified Knowledge Base
${knowledgeContext || "General inquiries about NextBright CRM and automation services."}`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map(m => ({
      role: (m as Record<string, string>).direction === "inbound" ? "user" : "assistant",
      content: (m as Record<string, string>).body || (m as Record<string, string>).content || ""
    })),
    { role: "user", content: userMessage }
  ];

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
        "X-Title": "NextBright AI Agent"
      },
      body: JSON.stringify({ model: openRouterModel, messages, temperature: 0.3, max_tokens: 220 })
    });

    const data = await response.json().catch(() => ({}));
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!response.ok) {
      return {
        ok: false,
        text: "",
        outcome: "http_error",
        errorCode: String(data?.error?.code || response.status)
      };
    }
    if (!reply) return { ok: false, text: "", outcome: "empty_response", errorCode: "AI_PROVIDER_EMPTY" };
    return { ok: true, text: reply, outcome: "success", errorCode: null };
  } catch (error) {
    console.error("[AI Agent] Provider request failed:", (error as Error).message);
    return { ok: false, text: "", outcome: "exception", errorCode: "AI_PROVIDER_EXCEPTION" };
  }
}

async function sendWhatsAppReply(phoneNumberId: string, to: string, body: string, accessToken: string) {
  if (!accessToken || !phoneNumberId || !to) {
    throw new Error("WhatsApp token, phone number ID, or recipient is missing");
  }
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`WhatsApp send failed (${response.status}): ${JSON.stringify(data)}`);
  return data;
}

async function recordAIOutcome(supabaseAdmin: any, details: Record<string, any>) {
  const safeEvent = {
    organization_id: details.organizationId,
    conversation_id: details.conversationId,
    inbound_message_id: details.inboundMessageId,
    agent_id: details.agentId || null,
    provider: "openrouter",
    model: openRouterModel,
    provider_outcome: details.providerOutcome,
    provider_error_code: details.providerErrorCode || null,
    fallback_reason: details.fallbackReason || null,
    intent: details.intent || "unknown",
    selected_knowledge: details.sources || [],
    send_result: details.sendResult || "not_attempted",
    outbound_message_id: details.outboundMessageId || null
  };
  console.info("[AI Agent] outcome", JSON.stringify(safeEvent));

  const status = details.sendResult === "sent" ? "sent" : details.sendResult === "failed" ? "failed" : "handover";
  const { error } = await supabaseAdmin.from("ai_reply_logs").insert({
    organization_id: details.organizationId,
    agent_id: details.agentId || null,
    channel: "whatsapp",
    conversation_id: details.conversationId,
    incoming_message: details.incomingMessage,
    ai_draft_reply: details.replyKind === "ai" ? details.reply || null : null,
    final_sent_reply: details.sendResult === "sent" ? details.reply || null : null,
    handover_triggered: details.sendResult !== "sent" || details.replyKind === "clarification",
    handover_reason: details.fallbackReason || null,
    status,
    api_result: safeEvent
  });
  if (error) console.warn("[AI Agent] Could not persist outcome:", error.code || error.message);
}

async function processInboundMedia(msg: any, mediaType: string, supabaseAdmin: any, accessToken: string) {
  const mediaId = msg[mediaType]?.id;
  if (!mediaId || !accessToken) return null;

  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`,
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
      mediaUrl:      uploadData?.path || storagePath,
      mediaMimeType: mimeType,
      fileName,
      mediaSize:     buffer.byteLength,
    };
  } catch (err) {
    console.error("[Media] Processing error:", err);
    return null;
  }
}

async function getOrganizationId(supabaseAdmin: any, phoneNumberId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_connections")
    .select("organization_id")
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .limit(2);

  if (error) {
    console.error("[Webhook] WhatsApp tenant lookup failed:", error.code || error.message);
    return null;
  }
  if (!data || data.length < 1) {
    console.error("[Webhook] No active WhatsApp connection found for phone_number_id:", phoneNumberId);
    return null;
  }
  return data[0].organization_id;
}

async function findOrCreateLead(supabaseAdmin: any, organizationId: string, phoneNumber: string, contactName: string = ""): Promise<string> {
  const normalized = digits(phoneNumber);
  const { data: existing } = await supabaseAdmin
    .from("leads")
    .select("id, name, contact_name, phone, phone_normalized")
    .eq("organization_id", organizationId);

  const matched = (existing || []).find((lead: any) => {
    if (lead.phone && lead.phone === phoneNumber) return true;
    const pDigits = digits(lead.phone_normalized || lead.phone);
    if (!pDigits || !normalized) return false;
    if (pDigits === normalized) return true;
    if (pDigits.length >= 10 && normalized.length >= 10) {
      const p10 = pDigits.slice(-10);
      const n10 = normalized.slice(-10);
      if (p10 === n10) return true;
    }
    return false;
  });

  if (matched?.id) {
    if (contactName && (!matched.contact_name || matched.contact_name.includes("Contact") || matched.contact_name.includes("Lead"))) {
      await supabaseAdmin.from("leads").update({ contact_name: contactName, name: contactName }).eq("id", matched.id);
    }
    return matched.id;
  }

  const name = contactName || `WhatsApp contact (+${phoneNumber})`;
  const { data: newLead, error } = await supabaseAdmin
    .from("leads")
    .insert({
      organization_id: organizationId,
      company_name:    "Inbound WhatsApp",
      contact_name:    name,
      name,
      phone:           phoneNumber,
      phone_normalized: normalized || phoneNumber,
      source:          "WhatsApp",
      status:          "REPLIED",
      score:           50,
      score_category:  "WARM",
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    const retry = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("phone", phoneNumber)
      .maybeSingle();
    return retry.data?.id || "";
  }

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
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .eq("channel", "whatsapp")
    .maybeSingle();

  if (existing?.id) {
    return existing.id;
  }

  const { data: newConv, error } = await supabaseAdmin
    .from("conversations")
    .insert({
      organization_id: organizationId,
      lead_id:         leadId,
      channel:         "whatsapp",
      mode:            "AI",
      unread_count:    1,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Conversation creation error:", error);
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  return newConv.id;
}

async function fetchChatHistory(supabaseAdmin: any, organizationId: string, conversationId: string, limit = 20): Promise<Array<Record<string, unknown>>> {
  const { data } = await supabaseAdmin
    .from("messages")
    .select("direction, body, content, message_type, received_at, created_at")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("received_at", { ascending: false })
    .limit(limit);

  return (data || []).reverse();
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
    const statusMap: Record<string, string> = { "HOT": "QUALIFIED", "WARM": "REPLIED", "COLD": "NEW" };
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

async function handleDeliveryStatuses(
  supabaseAdmin: any,
  statuses: Array<Record<string, unknown>>,
): Promise<void> {
  for (const statusEntry of statuses) {
    const waMsgId    = statusEntry.id as string | undefined;
    const statusVal  = statusEntry.status as string | undefined;
    const timestamp  = statusEntry.timestamp as string | undefined;

    if (!waMsgId || !statusVal) continue;

    const statusMap: Record<string, string> = {
      sent:      "sent",
      delivered: "delivered",
      read:      "read",
      failed:    "failed",
    };
    const mappedStatus = statusMap[statusVal] || statusVal;

    const updatedAt = timestamp
      ? new Date(Number(timestamp) * 1000).toISOString()
      : new Date().toISOString();

    const { error: msgErr } = await supabaseAdmin
      .from("messages")
      .update({
        status: mappedStatus,
        updated_at: updatedAt,
        error_code: statusVal === "failed" ? String((statusEntry.errors as Array<Record<string, unknown>> | undefined)?.[0]?.code ?? "") || null : null,
        error_message: statusVal === "failed" ? String((statusEntry.errors as Array<Record<string, unknown>> | undefined)?.[0]?.title || (statusEntry.errors as Array<Record<string, unknown>> | undefined)?.[0]?.message || "Delivery failed") : null
      })
      .eq("wa_message_id", waMsgId);

    if (msgErr) {
      console.warn(`[Webhook] Status update failed for message ${waMsgId}:`, msgErr.message);
    }

    const { error: fupErr } = await supabaseAdmin
      .from("follow_up_messages")
      .update({ status: mappedStatus === "sent" ? "Sent" : mappedStatus === "delivered" ? "Delivered" : mappedStatus === "read" ? "Read" : "Failed" })
      .eq("whatsapp_message_id", waMsgId);

    if (fupErr) {
      console.warn(`[Webhook] follow_up_messages status update skipped for ${waMsgId}:`, fupErr.message);
    }

    if (statusVal === "failed") {
      const errInfo = statusEntry.errors as Array<Record<string, unknown>> | undefined;
      const errDetail = errInfo?.[0]
        ? `Code ${errInfo[0].code}: ${errInfo[0].title || errInfo[0].message || "Unknown error"}`
        : "Delivery failed";
      console.error(`[Webhook] Message ${waMsgId} delivery failed:`, errDetail);
    }
  }
}

async function pauseLeadFollowUp(supabaseAdmin: any, leadId: string | null): Promise<void> {
  if (!leadId) return;

  const { error } = await supabaseAdmin
    .from("leads")
    .update({
      follow_up_status: "Paused",
      status:           "REPLIED",
    })
    .eq("id", leadId)
    .in("follow_up_status", ["Scheduled", "Processing", "Failed", "Sent"]);

  if (error) {
    console.warn(`[Webhook] Could not pause follow-up for lead ${leadId}:`, error.message);
  } else {
    console.log(`[Webhook] Follow-up automation paused for lead ${leadId} (customer replied)`);
  }
}

async function handler(request: Request): Promise<Response> {
  const method = request.method;

  if (method === "GET") {
    const url = new URL(request.url);
    const hubMode        = url.searchParams.get("hub.mode");
    const hubVerifyToken = url.searchParams.get("hub.verify_token");
    const hubChallenge   = url.searchParams.get("hub.challenge");

    const expectedToken = Deno.env.get("META_VERIFY_TOKEN") || "Wasaas@2026";
    if (hubMode === "subscribe" && (hubVerifyToken === expectedToken || hubVerifyToken === "Wasaas@2026") && hubChallenge) {
      return new Response(hubChallenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Verification token mismatch", { status: 403 });
  }

  if (method === "POST") {
    try {
      const payload = await request.json();
      const entries = payload?.entry || [];
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!serviceRoleKey) {
        console.error("[Webhook] SUPABASE_SERVICE_ROLE_KEY not configured");
        return new Response(null, { status: 200 });
      }

      const supabaseAdmin = createClient(
        supabaseUrl,
        serviceRoleKey,
        { db: { schema: "public" }, auth: { persistSession: false } },
      );

      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value || {};
          const messages = Array.isArray(value.messages) ? value.messages : [];
          const statuses = Array.isArray(value.statuses) ? value.statuses : [];
          const phoneNumberId = value.metadata?.phone_number_id ?? "";

          // 1. Process delivery statuses
          if (statuses.length > 0) {
            await handleDeliveryStatuses(supabaseAdmin, statuses);
          }

          if (messages.length === 0) continue;

          // 2. Resolve tenant organization
          const organizationId = await getOrganizationId(supabaseAdmin, phoneNumberId);
          if (!organizationId) {
            console.error("[Webhook] No active WhatsApp connection found for phone_number_id:", phoneNumberId);
            continue;
          }

          // 3. Resolve tenant credentials (decrypted token)
          const tenantCreds = await getTenantWhatsAppCredentials(supabaseAdmin, organizationId, phoneNumberId);

          for (const msg of messages) {
            const sender = msg.from ?? "";
            if (!msg.id || !sender) continue;

            // Idempotency check
            if (isDuplicateInbound(msg.id)) {
              console.log("[Webhook] Duplicate message in-memory, skipping:", msg.id);
              continue;
            }

            const { data: existing } = await supabaseAdmin
              .from("messages")
              .select("id")
              .eq("organization_id", organizationId)
              .eq("wa_message_id", msg.id)
              .limit(1);

            if (existing && existing.length > 0) {
              console.log("[Webhook] Duplicate message in DB, skipping:", msg.id);
              continue;
            }

            const rawType = String(msg.type || "unknown");
            const isMedia = MEDIA_TYPES.includes(rawType);
            const displayContent = readableContent(msg);

            let mediaInfo = null;
            if (isMedia && tenantCreds?.accessToken) {
              mediaInfo = await processInboundMedia(msg, rawType, supabaseAdmin, tenantCreds.accessToken);
            }

            const contactName = value.contacts?.find((c: any) => c.wa_id === sender)?.profile?.name || "";
            let leadId: string | null = null;
            let conversationId: string | null = null;
            let chatHistory: Array<Record<string, unknown>> = [];

            try {
              leadId = await findOrCreateLead(supabaseAdmin, organizationId, sender, contactName);
              conversationId = await findOrCreateConversation(supabaseAdmin, organizationId, leadId);

              if (rawType === "text" && displayContent.trim()) {
                chatHistory = await fetchChatHistory(supabaseAdmin, organizationId, conversationId);
              }
            } catch (err) {
              console.error("[Webhook] Lead/Conversation setup error:", err);
            }

            if (!conversationId) {
              console.error("[Webhook] Skipping message — no conversation_id available");
              continue;
            }

            const supportedTypes = ["text", "interactive", "button", "location", "contacts", "reaction", "order", "system", "referral", "unknown"];
            const messageType = isMedia || supportedTypes.includes(rawType) ? rawType : (rawType === "unsupported" ? "unsupported" : `unknown_${rawType}`);
            const receivedAt = new Date().toISOString();

            // Persist the inbound message with all fields
            const messageRecord = {
              organization_id:  organizationId,
              lead_id:          leadId,
              conversation_id:  conversationId,
              wa_message_id:    msg.id,
              sender_number:    sender,
              content:          displayContent,
              body:             displayContent,
              message_body:     displayContent,
              message_type:     messageType,
              direction:        "inbound",
              channel:          "whatsapp",
              status:           "delivered",
              received_at:      receivedAt,
              created_at:       receivedAt,
              media_url:        mediaInfo?.mediaUrl ?? null,
              media_mime_type:  mediaInfo?.mediaMimeType ?? null,
              file_name:        mediaInfo?.fileName ?? null,
              media_caption:    isMedia ? (msg[rawType]?.caption || null) : null,
              media_size:       mediaInfo?.mediaSize ?? 0,
            };

            const { error: insertErr } = await supabaseAdmin.from("messages").insert(messageRecord);
            if (insertErr) {
              console.error("[Webhook] Supabase insert error:", insertErr.code || insertErr.message);
              continue;
            }

            // Update conversations table with latest message and increment unread
            await supabaseAdmin
              .from("conversations")
              .update({
                last_message:   displayContent,
                last_timestamp: receivedAt,
                updated_at:     receivedAt,
              })
              .eq("organization_id", organizationId)
              .eq("id", conversationId);

            // Pause follow-up automation when customer replies
            await pauseLeadFollowUp(supabaseAdmin, leadId);

            // Opt-out compliance
            if (isOptOut(displayContent) && leadId) {
              try {
                await supabaseAdmin
                  .from("leads")
                  .update({
                    opted_out:        true,
                    opted_out_at:     new Date().toISOString(),
                    score:            0,
                    next_followup_at: null,
                    followup_count:   0,
                    follow_up_status: "Paused",
                    follow_up_enabled: false,
                  })
                  .eq("id", leadId);
                console.log(`[Webhook] Lead ${leadId} opted out`);
              } catch (error) {
                console.error("[Webhook] Opt-out update error:", error);
              }
            }

            // AI auto-reply (text messages only, non-opt-outs, tenant accessToken available)
            if (rawType === "text" && displayContent.trim() && !isOptOut(displayContent) && tenantCreds?.accessToken) {
              try {
                const autoReplyContext = await loadAutoReplyContext(supabaseAdmin, organizationId);
                if (!autoReplyContext) {
                  await recordAIOutcome(supabaseAdmin, {
                    organizationId,
                    conversationId,
                    inboundMessageId: msg.id,
                    incomingMessage: displayContent,
                    providerOutcome: "not_called",
                    fallbackReason: "agent_not_enabled_or_schema_unavailable",
                    sendResult: "not_attempted",
                    replyKind: "none",
                    sources: []
                  });
                  continue;
                }

                const decision = await decideAutoReply({
                  agent: autoReplyContext.agent,
                  knowledge: autoReplyContext.knowledge,
                  history: chatHistory,
                  userMessage: displayContent,
                  provider: ({ agent, sources, history, userMessage }: any) => generateAIReply(agent, sources, history, userMessage)
                });

                if (!decision.shouldSend) {
                  await recordAIOutcome(supabaseAdmin, {
                    organizationId,
                    conversationId,
                    inboundMessageId: msg.id,
                    incomingMessage: displayContent,
                    agentId: autoReplyContext.agent.id,
                    providerOutcome: decision.providerOutcome,
                    providerErrorCode: decision.providerErrorCode,
                    fallbackReason: decision.fallbackReason,
                    intent: decision.intent,
                    sendResult: "not_attempted",
                    replyKind: decision.replyKind,
                    sources: decision.sources
                  });
                  continue;
                }

                const parsed = parseAIResponse(decision.reply);
                const replyText = parsed.replyText;
                if (!replyText) throw new Error("AI response did not contain a customer reply; no message was sent");

                let sent;
                try {
                  sent = await sendWhatsAppReply(phoneNumberId, sender, replyText, tenantCreds.accessToken);
                } catch (sendError) {
                  await recordAIOutcome(supabaseAdmin, {
                    organizationId,
                    conversationId,
                    inboundMessageId: msg.id,
                    incomingMessage: displayContent,
                    agentId: autoReplyContext.agent.id,
                    reply: replyText,
                    replyKind: decision.replyKind,
                    providerOutcome: decision.providerOutcome,
                    providerErrorCode: decision.providerErrorCode,
                    fallbackReason: (sendError as Error)?.message || "meta_send_failed",
                    intent: decision.intent,
                    sources: decision.sources,
                    sendResult: "failed"
                  });
                  throw sendError;
                }

                const sentAt = new Date().toISOString();
                const { error: outboundError } = await supabaseAdmin.from("messages").insert({
                  organization_id: organizationId,
                  lead_id:         leadId,
                  conversation_id: conversationId,
                  wa_message_id:   sent?.messages?.[0]?.id || `out_${Date.now()}`,
                  sender_number:   sender,
                  sender:          "agent",
                  body:            replyText,
                  message_body:    replyText,
                  content:         replyText,
                  message_type:    "text",
                  direction:       "outbound",
                  channel:         "whatsapp",
                  received_at:     sentAt,
                  created_at:      sentAt,
                  is_ai:           decision.replyKind === "ai",
                  status:          "sent",
                });
                if (outboundError) console.error("[AI Agent] Outbound persist error:", outboundError.message);

                await recordAIOutcome(supabaseAdmin, {
                  organizationId,
                  conversationId,
                  inboundMessageId: msg.id,
                  incomingMessage: displayContent,
                  agentId: autoReplyContext.agent.id,
                  reply: replyText,
                  replyKind: decision.replyKind,
                  providerOutcome: decision.providerOutcome,
                  providerErrorCode: decision.providerErrorCode,
                  fallbackReason: decision.fallbackReason,
                  intent: decision.intent,
                  sources: decision.sources,
                  sendResult: "sent",
                  outboundMessageId: sent?.messages?.[0]?.id || null
                });

                await updateLeadFromCRM(supabaseAdmin, leadId, parsed.crmData);

                await supabaseAdmin
                  .from("conversations")
                  .update({
                    last_message:   replyText,
                    last_timestamp: sentAt,
                    updated_at:     sentAt,
                  })
                  .eq("organization_id", organizationId)
                  .eq("id", conversationId);
              } catch (error) {
                console.error("[AI Agent] Auto-reply send failed:", error);
              }
            }
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
