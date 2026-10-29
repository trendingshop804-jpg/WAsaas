// api/_ai-reply.js
// Shared server-side AI auto-reply logic for WhatsApp and Meta webhooks
import { decryptToken } from './_crypto.js';
import {
  chronologicalHistory,
  decideAutoReply,
  detectIntent,
  selectKnowledge,
  missingInformationReply,
  isUnsafeRepeatedReply
} from '../../supabase/functions/meta-webhook/ai-reply.mjs';

export {
  chronologicalHistory,
  decideAutoReply,
  detectIntent,
  selectKnowledge,
  missingInformationReply,
  isUnsafeRepeatedReply
};

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

/**
 * Remove any secret tokens (Bearer tokens, Meta access tokens, API keys)
 * from strings and error details before writing to logs.
 */
export function sanitizeSecretString(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/(Bearer\s+|access_token=)[^\s&"']+/gi, '$1[REDACTED]')
    .replace(/\b(EAA[A-Za-z0-9_-]{20,})\b/g, '[REDACTED_META_TOKEN]')
    .replace(/\b(sk-[A-Za-z0-9_-]{20,})\b/g, '[REDACTED_API_KEY]');
}

export function sanitizeErrorDetails(err) {
  if (!err) return null;
  if (typeof err === 'string') return sanitizeSecretString(err);
  if (err instanceof Error) {
    return {
      message: sanitizeSecretString(err.message),
      code: err.code || null,
      name: err.name || 'Error'
    };
  }
  try {
    const jsonStr = JSON.stringify(err);
    return JSON.parse(sanitizeSecretString(jsonStr));
  } catch (_) {
    return { message: sanitizeSecretString(String(err)) };
  }
}

/**
 * Detect user opt-out keywords (e.g. stop, unsubscribe, remove me, not interested)
 */
export function isOptOut(message) {
  return /\b(stop|unsubscribe|remove me|do not contact|don't contact|not interested)\b/i.test(String(message || ''));
}

/**
 * When customer sends any inbound message, pause automatic scheduled follow-up
 * sequence so we do not send automated follow-ups after they have already replied.
 */
export async function pauseLeadFollowUp(admin, leadId) {
  if (!admin || !leadId) return;
  try {
    const { error } = await admin
      .from('leads')
      .update({
        follow_up_status: 'Paused',
        status: 'Replied'
      })
      .eq('id', leadId)
      .in('follow_up_status', ['Scheduled', 'Processing', 'Failed', 'Sent']);

    if (error) {
      console.warn('[AI Agent] Could not pause follow-up for lead', leadId, error.message);
    }
  } catch (err) {
    console.warn('[AI Agent] pauseLeadFollowUp error:', err?.message || err);
  }
}

/**
 * Update lead record when customer requests opt-out
 */
export async function handleLeadOptOut(admin, leadId) {
  if (!admin || !leadId) return;
  try {
    await admin
      .from('leads')
      .update({
        opted_out: true,
        opted_out_at: new Date().toISOString(),
        score: 0,
        next_followup_at: null,
        followup_count: 0,
        follow_up_status: 'Paused',
        follow_up_enabled: false
      })
      .eq('id', leadId);
  } catch (err) {
    console.error('[AI Agent] Opt-out update error:', err?.message || err);
  }
}

/**
 * Load tenant's active AI agent and active knowledge base
 */
export async function loadAutoReplyContext(admin, organizationId) {
  if (!admin || !organizationId) return null;

  const { data: agents, error: agentError } = await admin
    .from('ai_agents')
    .select('id, business_name, system_instructions, tone, status, auto_reply_enabled, handover_keywords, updated_at')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .eq('auto_reply_enabled', true)
    .order('updated_at', { ascending: false })
    .limit(1);

  const activeAgent = (agents || []).find(a => a.status === 'active' && a.auto_reply_enabled === true);
  if (!activeAgent) {
    return null;
  }

  const { data: knowledge, error: knowledgeError } = await admin
    .from('ai_knowledge_base')
    .select('id, title, content, category, keywords, updated_at')
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  if (knowledgeError) {
    console.warn('[AI Agent] Knowledge base unavailable:', knowledgeError.message);
    return null;
  }

  const activeKnowledge = (knowledge || []).filter(k => k.is_active !== false);
  return { agent: activeAgent, knowledge: activeKnowledge };
}

/**
 * Fetch chronological chat history for conversation
 */
export async function fetchChatHistory(admin, organizationId, conversationId, limit = 20) {
  if (!admin || !conversationId) return [];
  const { data } = await admin
    .from('messages')
    .select('direction, body, content, message_type, received_at, created_at')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversationId)
    .order('received_at', { ascending: false })
    .limit(limit);

  return (data || []).reverse();
}

/**
 * Calls OpenRouter or OpenAI LLM strictly grounded on verified Knowledge Base
 */
export async function generateAIReply({ agent, sources, history, userMessage, openRouterApiKey, openRouterModel }) {
  const apiKey = openRouterApiKey || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';
  const model = openRouterModel || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

  if (!apiKey) {
    return { ok: false, text: '', outcome: 'not_configured', errorCode: 'AI_PROVIDER_NOT_CONFIGURED' };
  }

  const businessName = agent.business_name || 'our business';
  const tone = agent.tone || 'professional and helpful';
  const instructions = agent.system_instructions || 'Answer customer questions accurately and concisely.';
  const knowledgeContext = sources.map(source => `[${source.title}] ${source.content}`).join('\n\n');

  const systemPrompt = `You are ${businessName}'s WhatsApp assistant.

## Voice & format
- Use a ${tone} tone and keep replies to 1-3 short lines.
- Reply in the language the lead writes in (English, Tamil, Malayalam, or mixed).
- Answer the customer's latest question directly before asking anything new.
- Do not repeat a greeting or question already present in the conversation.

## Hard rules
- Use only the verified Knowledge Base below for factual claims, pricing, features, and timelines.
- If the answer is not explicitly present, respond with exactly __INSUFFICIENT_KNOWLEDGE__ instead of guessing.
- Never ask for sensitive info (passwords, OTPs, card numbers) over chat.

## Additional instructions
${instructions}

## Verified Knowledge Base
${knowledgeContext}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.body || m.content || ''
    })),
    { role: 'user', content: userMessage }
  ];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'WAsaas AI Agent'
      },
      body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 220 }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        text: '',
        outcome: 'http_error',
        errorCode: String(data?.error?.code || response.status)
      };
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) return { ok: false, text: '', outcome: 'empty_response', errorCode: 'AI_PROVIDER_EMPTY' };
    if (reply === '__INSUFFICIENT_KNOWLEDGE__') {
      return { ok: false, text: '', outcome: 'insufficient_knowledge', errorCode: 'AI_KNOWLEDGE_REJECTED' };
    }
    return { ok: true, text: reply, outcome: 'success', errorCode: null };
  } catch (error) {
    console.error('[AI Agent] Provider request failed:', error?.message || error);
    return { ok: false, text: '', outcome: 'exception', errorCode: error?.name === 'AbortError' ? 'TIMEOUT' : 'AI_PROVIDER_EXCEPTION' };
  }
}

/**
 * Parse CRM structured fields if AI output contains trailing JSON
 */
export function parseAIResponse(rawContent) {
  const text = (rawContent || '').trim();
  const jsonMatch = text.match(/(\{[\s\S]*\})\s*$/);
  let replyText = text;
  let crmData = null;

  if (jsonMatch) {
    try {
      crmData = JSON.parse(jsonMatch[1]);
      replyText = text.slice(0, jsonMatch.index).trim();
    } catch (e) {
      console.warn('[AI Agent] Failed to parse AI CRM JSON:', e?.message || e);
    }
  }

  return { replyText, crmData };
}

/**
 * Update lead profile from parsed CRM data
 */
export async function updateLeadFromCRM(admin, leadId, crmData) {
  if (!admin || !crmData || !leadId) return;

  const updates = {};
  if (crmData.captured_fields) {
    const fields = crmData.captured_fields;
    if (fields.name) updates.contact_name = fields.name;
    if (fields.industry) updates.industry = fields.industry;
    if (fields.need) updates.ai_summary = fields.need;
  }
  if (crmData.lead_status) {
    const statusMap = { HOT: 'QUALIFIED', WARM: 'REPLIED', COLD: 'NEW' };
    updates.status = statusMap[crmData.lead_status] || crmData.lead_status;
    updates.score_category = crmData.lead_status;
  }
  if (crmData.notes) {
    updates.notes = crmData.notes;
  }

  if (Object.keys(updates).length > 0) {
    try {
      await admin.from('leads').update(updates).eq('id', leadId);
    } catch (err) {
      console.warn('[AI Agent] Lead CRM update error:', err?.message || err);
    }
  }
}

/**
 * Retrieve decrypted tenant WhatsApp credentials for a given organization
 */
export async function getTenantWhatsAppCredentials(admin, organizationId, phoneNumberId) {
  if (!organizationId || !admin) return null;

  let query = admin
    .from('whatsapp_connections')
    .select('phone_number_id, waba_id, access_token_encrypted, access_token')
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  if (phoneNumberId) {
    query = query.eq('phone_number_id', phoneNumberId);
  }

  const { data: conn, error } = await query
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !conn) return null;
  const targetPhoneId = conn.phone_number_id || phoneNumberId;
  if (!targetPhoneId) return null;

  let accessToken = null;
  if (conn.access_token_encrypted) {
    try {
      accessToken = await decryptToken(conn.access_token_encrypted);
    } catch (_) {
      accessToken = null;
    }
  }
  if (!accessToken && conn.access_token) {
    accessToken = conn.access_token;
  }

  if (!accessToken) return null;
  return { phoneNumberId: targetPhoneId, wabaId: conn.waba_id || null, accessToken };
}

/**
 * Send WhatsApp text message via Meta Graph API using tenant credentials
 */
export async function sendWhatsAppReply({ phoneNumberId, to, body, accessToken }) {
  if (!accessToken || !phoneNumberId || !to) {
    throw new Error('WhatsApp token, phone number ID, or recipient is missing');
  }

  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const safeError = sanitizeErrorDetails(data?.error || data);
    throw new Error(`WhatsApp send failed (${response.status}): ${JSON.stringify(safeError)}`);
  }

  return data;
}

/**
 * Persist AI decision & execution outcome to ai_reply_logs safely without exposing secrets
 */
export async function recordAIOutcome(admin, details) {
  if (!admin || !details.organizationId) return;

  const safeEvent = {
    organization_id: details.organizationId,
    conversation_id: details.conversationId,
    inbound_message_id: details.inboundMessageId,
    agent_id: details.agentId || null,
    provider: 'openrouter',
    model: details.model || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    provider_outcome: details.providerOutcome,
    provider_error_code: details.providerErrorCode || null,
    fallback_reason: details.fallbackReason || null,
    intent: details.intent || 'unknown',
    selected_knowledge: details.sources || [],
    send_result: details.sendResult || 'not_attempted',
    outbound_message_id: details.outboundMessageId || null
  };

  console.info('[AI Agent] outcome', JSON.stringify(safeEvent));

  const status = details.sendResult === 'sent' ? 'sent' : details.sendResult === 'failed' ? 'failed' : 'handover';
  try {
    const { error } = await admin.from('ai_reply_logs').insert({
      organization_id: details.organizationId,
      agent_id: details.agentId || null,
      channel: 'whatsapp',
      conversation_id: details.conversationId,
      incoming_message: details.incomingMessage,
      ai_draft_reply: details.replyKind === 'ai' ? details.reply || null : null,
      final_sent_reply: details.sendResult === 'sent' ? details.reply || null : null,
      handover_triggered: details.sendResult !== 'sent' || details.replyKind === 'clarification',
      handover_reason: details.fallbackReason || null,
      status,
      api_result: safeEvent
    });
    if (error) console.warn('[AI Agent] Could not persist outcome:', error.code || error.message);
  } catch (err) {
    console.warn('[AI Agent] Outcome log error:', err?.message || err);
  }
}
