// api/messages.js
// Reads and sends WhatsApp messages for the signed-in user's organization.
//
// SECURITY
//   * Every request must carry a real Supabase session JWT (Authorization:
//     Bearer <access_token>). The anon key is NOT accepted as a session.
//   * The organization is resolved from organization_users, never from a
//     client-supplied value.
//   * The service-role client is only used AFTER that check passes.
//   * Messages whose organization_id is NULL are never returned. Their tenant
//     ownership is unknown, so they stay server-side rather than leaking into
//     the wrong tenant.
import { createSupabaseAdminClient, missingSupabaseServerConfig, requireOrgAccess } from './_supabase.js';

const SIGNED_URL_TTL = 60 * 60 * 24; // 24 hours
const DEFAULT_LIMIT = 200;
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000; // WhatsApp 24h customer service window
const DUPLICATE_WINDOW_MS = 60 * 1000;           // duplicate-suppression window

// ---------------------------------------------------------------------------
// CORS
//
// The previous value was an ARRAY, which Node serialises as a comma-joined
// string. That is not a valid Access-Control-Allow-Origin value, so browsers
// rejected every cross-origin response.
//
// The origin is now reflected ONLY on an exact allowlist match — never `*`,
// never echoed back from the request. An absent/unknown Origin gets no
// Allow-Origin header at all, so the browser blocks it.
//
// CORS is defence in depth only; the real boundary is the session JWT plus
// organization membership, which is enforced on every request below.
// ---------------------------------------------------------------------------
const DEFAULT_ALLOWED_ORIGINS = [
  'https://w-asaas.vercel.app', // production
  'http://localhost:3001',      // dev-server.js
  'http://localhost:3000',      // npm run serve
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3000'
];

function allowedOrigins() {
  const extra = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

function applyCors(req, res) {
  const origin = String(req.headers?.origin || req.headers?.Origin || '');
  if (origin && allowedOrigins().has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function pickText(row) {
  return row.content || row.body || row.message_body || '';
}

function pickTime(row) {
  return row.received_at || row.created_at || null;
}

function toDirection(row) {
  const value = String(row.direction || '').toLowerCase();
  if (value === 'outbound' || value === 'out' || value === 'sent') return 'out';
  return 'in';
}

function initialsFromName(name, phone) {
  const source = String(name || phone || '?').trim();
  const parts = source.replace(/[^\p{L}\p{N}\s+]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Build an approved-template payload for sends made outside the 24h window.
 * The `templates` table does not exist in this database, so the approved
 * template name comes from server env. Returns null when unconfigured so the
 * caller can fail loudly rather than send free-form text Meta will reject.
 */
function buildTemplatePayload(phone, text, templateParams) {
  const name = (process.env.WHATSAPP_TEMPLATE_NAME || '').trim();
  if (!name) return null;

  const language = (process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en').trim();
  const params = Array.isArray(templateParams) && templateParams.length
    ? templateParams.map(String)
    : [text];

  return {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: { name, language: { code: language }, components: [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: p })) }] }
  };
}

export default async function handler(req, res) {
  applyCors(req, res);
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed', messages: [] });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    const missing = missingSupabaseServerConfig();
    console.error('[messages] Supabase configuration missing:', missing.join(', '));
    return res.status(503).json({ error: 'Server database configuration is unavailable.', missing, messages: [] });
  }

  // ---- Authentication + organization membership ------------------------
  // Runs BEFORE any service-role query. A client-supplied organization_id is
  // only ever used to pick between the user's OWN memberships.
  const requestedOrg = (req.query && req.query.organization_id) || null;
  const access = await requireOrgAccess(req, res, requestedOrg);
  if (!access) return;
  const organizationId = access.organizationId;

  // ---- POST: send a real WhatsApp Cloud API message ----------------------
  // Flow: validate -> verify phone belongs to org -> 24h window -> call Meta.
  // A message is only ever marked `sent` when Meta returns 200 + a message id.
  if (req.method === 'POST') {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}));
    const phone = digitsOnly(body.phone || body.to || body.sender_number);
    const text = String(body.text || body.content || body.message || '').trim();

    if (!phone) return res.status(400).json({ success: false, error: 'A phone number is required.' });
    if (!text) return res.status(400).json({ success: false, error: 'Message text is required.' });
    if (text.length > 4096) return res.status(400).json({ success: false, error: 'Message text is too long (max 4096).' });

    // --- Ownership check: may this user message this number? ---------------
    // A phone is reachable only if this organization already has a message
    // thread for it, or a lead whose phone matches. Runs BEFORE any outbound
    // call, so a valid session cannot be used to message arbitrary numbers.
    // Matching is done on the last 7 digits server-side so it is independent
    // of country-code / formatting differences, and so it does not depend on
    // paging through an arbitrarily large lead list.
    const last7 = phone.slice(-7);
    // A single suffix match. PostgREST turns `*` into SQL `%`, so this matches
    // any formatting of the same number (+91…, 0…, bare national number).
    const leadPhoneFilter = last7 ? `phone.like.*${last7}` : null;

    const [{ data: ownMessages }, { data: ownLeads }] = await Promise.all([
      supabase.from('messages').select('id').eq('organization_id', organizationId).eq('sender_number', phone).limit(1),
      leadPhoneFilter
        ? supabase.from('leads').select('id, phone').eq('organization_id', organizationId).or(leadPhoneFilter).limit(25)
        : Promise.resolve({ data: [] })
    ]);

    const ownsLead = (ownLeads || []).some(l => digitsOnly(l.phone).slice(-7) === last7);
    if (!ownMessages?.length && !ownsLead) {
      return res.status(403).json({
        success: false,
        error: 'This phone number is not part of your organization.'
      });
    }

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WA_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
      || process.env.PHONE_NUMBER_ID
      || process.env.WA_PHONE_NUMBER_ID;
    if (!accessToken || !phoneNumberId) {
      return res.status(500).json({
        success: false,
        error: 'WhatsApp is not configured on the server.',
        missing: [!accessToken && 'WHATSAPP_ACCESS_TOKEN', !phoneNumberId && 'WHATSAPP_PHONE_NUMBER_ID'].filter(Boolean)
      });
    }

    // --- Duplicate suppression (BEST EFFORT — not true idempotency) ---------
    //
    // The client sends `clientMessageId`, but `public.messages` has NO column
    // to store it (verified against the live schema: no client_message_id /
    // idempotency_key / request_id / dedupe_key / external_id). There is also
    // no other durable store for it, so a client-supplied key cannot be
    // honoured without adding a column — which is out of scope and would mean
    // changing the database. `clientMessageId` is therefore deliberately
    // ignored rather than silently pretending to be honoured.
    //
    // What IS implemented is duplicate suppression keyed on
    // (organization_id, sender_number, content) within a short window, which
    // covers the realistic double-click / double-submit case. It is NOT
    // idempotency: two concurrent requests can still both pass this check and
    // send twice. Genuine idempotency needs a unique client-key column.
    const dupeCutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
    const { data: dupe } = await supabase
      .from('messages')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('sender_number', phone)
      .eq('content', text)
      .eq('direction', 'outbound')
      // 'failed' is excluded on purpose so a retry after an error still sends.
      .in('status', ['sending', 'sent', 'delivered'])
      .gte('created_at', dupeCutoff)
      .order('created_at', { ascending: false })
      .limit(1);

    if (dupe && dupe.length) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        deduplicatedBy: 'org+phone+content within ' + (DUPLICATE_WINDOW_MS / 1000) + 's',
        idempotencyKeyHonoured: false,
        messageId: dupe[0].wa_message_id,
        status: dupe[0].status,
        message: dupe[0]
      });
    }

    // --- 24h customer service window ---------------------------------------
    const { data: lastInbound } = await supabase
      .from('messages')
      .select('received_at,created_at')
      .eq('organization_id', organizationId)
      .eq('sender_number', phone)
      .eq('direction', 'inbound')
      .order('received_at', { ascending: false, nullsFirst: false })
      .limit(1);

    const lastInboundAt = lastInbound?.[0]?.received_at || lastInbound?.[0]?.created_at || null;
    const withinWindow = lastInboundAt
      ? (Date.now() - new Date(lastInboundAt).getTime()) < SERVICE_WINDOW_MS
      : false;

    const now = new Date().toISOString();
    const payload = withinWindow
      ? { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }
      : buildTemplatePayload(phone, text, body.templateParams);

    if (!withinWindow && !payload) {
      // Outside 24h Meta requires an approved template. Fail loudly, do not send.
      return res.status(422).json({
        success: false,
        error: 'This customer is outside the 24-hour service window, so an approved template is required. Set WHATSAPP_TEMPLATE_NAME (and pass templateParams) to send.',
        code: 'TEMPLATE_REQUIRED',
        windowOpen: false,
        lastInboundAt
      });
    }

    // --- Persist `sending` first so a crash never silently loses the send --
    const { data: pendingRow, error: pendingErr } = await supabase
      .from('messages')
      .insert({
        organization_id: organizationId,
        sender_number: phone,
        direction: 'outbound',
        message_type: 'text',
        channel: 'whatsapp',
        content: text,
        received_at: now,
        created_at: now,
        status: 'sending',
        is_ai: !!body.is_ai
      })
      .select()
      .single();
    if (pendingErr) {
      return res.status(500).json({ success: false, error: `Could not queue message: ${pendingErr.message}` });
    }

    // --- Call the WhatsApp Cloud API ----------------------------------------
    let graphResult;
    try {
      const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });
      const metaBody = await metaRes.json().catch(() => ({}));

      if (!metaRes.ok || metaBody?.error) {
        const apiError = metaBody?.error?.message || `HTTP ${metaRes.status}`;
        const apiCode = metaBody?.error?.code || null;
        // Requirement: never mark as sent on failure.
        await supabase.from('messages').update({ status: 'failed' }).eq('id', pendingRow.id);
        return res.status(502).json({
          success: false,
          error: `WhatsApp rejected the message: ${apiError}`,
          code: apiCode,
          status: 'failed',
          messageId: pendingRow.id
        });
      }

      const waMessageId = metaBody?.messages?.[0]?.id || null;
      graphResult = { waMessageId, contact: metaBody?.contacts?.[0]?.wa_id || phone };
    } catch (err) {
      await supabase.from('messages').update({ status: 'failed' }).eq('id', pendingRow.id);
      return res.status(502).json({
        success: false,
        error: `Could not reach WhatsApp Cloud API: ${err.message}`,
        status: 'failed',
        messageId: pendingRow.id
      });
    }

    // --- Persist the real WhatsApp id + sent status -------------------------
    const { data: sentRow } = await supabase
      .from('messages')
      .update({
        wa_message_id: graphResult.waMessageId,
        status: 'sent',
        sender_number: phone
      })
      .eq('id', pendingRow.id)
      .select()
      .single();

    return res.status(200).json({
      success: true,
      status: 'sent',
      messageId: graphResult.waMessageId,
      rowId: pendingRow.id,
      usedTemplate: !withinWindow,
      message: sentRow || { ...pendingRow, wa_message_id: graphResult.waMessageId, status: 'sent' }
    });
  }

  const query = req.query || {};
  const limit = Math.min(parseInt(query.limit, 10) || DEFAULT_LIMIT, 500);

  try {
    let select = supabase
      .from('messages')
      .select('*')
      // Hard tenant boundary. Rows with organization_id = NULL are excluded
      // because .eq() never matches NULL — their owner is unknown.
      .eq('organization_id', organizationId)
      .order('received_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    // Optional filters
    if (query.sender_number) select = select.eq('sender_number', String(query.sender_number));
    if (query.lead_id) select = select.eq('lead_id', String(query.lead_id));
    if (query.conversation_id) select = select.eq('conversation_id', String(query.conversation_id));
    if (query.since) select = select.gt('received_at', String(query.since));

    let { data, error } = await select;

    // Older rows may have a null received_at; retry ordering by created_at.
    if (error || !data) {
      const fallback = await supabase
        .from('messages')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(limit);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('[messages] Supabase query error:', error);
      return res.status(500).json({ error: error.message, messages: [] });
    }

    const rows = data || [];

    // Resolve media storage paths into signed URLs.
    const messages = await Promise.all(rows.map(async (msg) => {
      if (!msg.media_url || msg.message_type === 'text') return msg;
      if (/^https?:\/\//i.test(msg.media_url)) return { ...msg, mediaUrl: msg.media_url };

      let cleanPath = msg.media_url;
      if (cleanPath.startsWith('whatsapp-media/')) {
        cleanPath = cleanPath.replace(/^whatsapp-media\//, '');
      }

      const { data: urlData, error: urlError } = await supabase
        .storage
        .from('whatsapp-media')
        .createSignedUrl(cleanPath, SIGNED_URL_TTL);

      if (urlError || !urlData?.signedUrl) {
        const publicUrl = supabase.storage.from('whatsapp-media').getPublicUrl(cleanPath).data?.publicUrl;
        const finalUrl = publicUrl || null;
        return { ...msg, media_url: finalUrl, mediaUrl: finalUrl };
      }
      return { ...msg, media_url: urlData.signedUrl, mediaUrl: urlData.signedUrl };
    }));

    // Enrich with lead names so the inbox shows real contacts, not raw numbers.
    // SECURITY: this query MUST be tenant-scoped. Without the
    // organization_id filter it would attach another organization's lead name
    // to a thread, leaking customer identity across tenants.
    const phones = [...new Set(messages.map(m => m.sender_number).filter(Boolean))];
    const nameByDigits = new Map();
    if (phones.length) {
      const { data: leads, error: leadsErr } = await supabase
        .from('leads')
        .select('id,name,contact_name,company,company_name,phone')
        .eq('organization_id', organizationId)
        .limit(1000);
      if (leadsErr) {
        // Never fall back to an unscoped read; degrade to raw numbers instead.
        console.error('[messages] lead-name enrichment failed:', leadsErr.message);
      }
      (leads || []).forEach(lead => {
        const d = digitsOnly(lead.phone);
        if (!d) return;
        const label = lead.name || lead.contact_name || lead.company || lead.company_name;
        if (label && !nameByDigits.has(d)) nameByDigits.set(d, label);
      });
    }

    // Group into inbox threads keyed by sender number.
    const byThread = new Map();
    messages.forEach(msg => {
      const key = msg.sender_number || msg.lead_id || msg.conversation_id || 'unknown';
      if (!byThread.has(key)) byThread.set(key, []);
      byThread.get(key).push({
        id: msg.id,
        dir: toDirection(msg),
        text: pickText(msg),
        time: pickTime(msg),
        messageType: msg.message_type || 'text',
        mediaUrl: msg.mediaUrl || msg.media_url || null,
        mediaCaption: msg.media_caption || null,
        status: msg.status ? String(msg.status).toLowerCase() : null,
        isAi: !!msg.is_ai
      });
    });

    const conversations = [...byThread.entries()].map(([key, msgs]) => {
      // `messages` came back newest-first; show oldest-first in the thread.
      const ordered = [...msgs].reverse();
      const last = ordered[ordered.length - 1];
      const displayName = nameByDigits.get(digitsOnly(key)) || key;
      return {
        key,
        phone: key,
        name: displayName,
        initials: initialsFromName(displayName, key),
        channel: 'whatsapp',
        preview: last?.text || (last?.messageType === 'text' ? '' : `[${last?.messageType || 'media'}]`),
        time: last?.time || null,
        messages: ordered
      };
    });

    // Newest conversation first.
    conversations.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));

    return res.status(200).json({
      success: true,
      count: messages.length,
      messages,
      conversations,
      fetchedAt: new Date().toISOString(),
      tenancyNote: 'Scoped to the authenticated user organization. Messages with a NULL organization_id are never returned.'
    });
  } catch (err) {
    console.error('API Error in /api/messages:', err);
    return res.status(500).json({ error: err.message, messages: [] });
  }
}
