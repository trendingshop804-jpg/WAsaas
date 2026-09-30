// api/messages.js
// Reads and sends WhatsApp text and media messages for the signed-in user's organization.
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
import { decryptToken } from './_crypto.js';

const SIGNED_URL_TTL = 60 * 60 * 24; // 24 hours
const DEFAULT_LIMIT = 200;
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000; // WhatsApp 24h customer service window
const DUPLICATE_WINDOW_MS = 60 * 1000;           // duplicate-suppression window

// ---------------------------------------------------------------------------
// CORS
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

function normalizePhone(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  // India normalization:
  // 10 digits: e.g. 8111986637 -> 918111986637
  if (digits.length === 10) {
    return '91' + digits;
  }
  // 11 digits with leading 0: e.g. 08111986637 -> 918111986637
  if (digits.length === 11 && digits.startsWith('0')) {
    return '91' + digits.slice(1);
  }
  // 12 digits with 91: e.g. 918111986637 -> 918111986637
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits;
}

const LEAD_SCAN_PAGE = 500;

/**
 * Every equivalent spelling of one phone number, used only for comparison.
 *
 * Shared with api/meta-webhook.js so the webhook and this API agree on who a
 * number belongs to. Without a shared rule the webhook could reuse a lead
 * (08111986637 == 918111986637) while this authorization check rejected it,
 * producing a 403 on a thread that demonstrably exists.
 *
 * These are whole-number equivalences only. Nothing here compares suffixes, so
 * two different numbers sharing their last 7 digits still never match.
 */
function phoneVariants(value) {
  const digits = digitsOnly(value);
  const forms = new Set();
  if (!digits) return forms;

  forms.add(digits);
  if (digits.startsWith('00') && digits.length > 4) forms.add(digits.slice(2));
  if (digits.startsWith('0') && digits.length > 10) forms.add(digits.slice(1));
  if (digits.length === 10) forms.add('91' + digits);
  if (digits.length === 12 && digits.startsWith('91')) forms.add(digits.slice(2));

  return forms;
}

/** True when two phone values denote the same subscriber. */
function phoneMatches(a, b) {
  const left = phoneVariants(a);
  if (left.size === 0) return false;
  for (const form of phoneVariants(b)) {
    if (left.has(form)) return true;
  }
  return false;
}

/**
 * Exact normalized phone match against one organization's leads.
 *
 * The comparison has to happen in JS: PostgREST cannot express "digits only",
 * and a stored phone may be "+91 98765 11111", "0912-345-6789" or
 * "919876511111". Those all normalize to the same value, so an equality filter
 * on any single stored spelling would miss the others.
 *
 * The scan is paginated to exhaustion in deterministic id order rather than
 * capped, so a row limit can never hide a valid exact match. A short cap would
 * silently deny legitimate sends once an organization had enough leads.
 *
 * Never widens to a suffix comparison: two different numbers that happen to
 * share their last 7 digits must NOT authorize a send.
 */
async function organizationHasLeadForPhone(supabase, organizationId, target) {
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, phone')
      .eq('organization_id', organizationId)
      .order('id', { ascending: true })
      .range(from, from + LEAD_SCAN_PAGE - 1);

    // Fail closed on error: an unreadable lead list must not authorize anyone.
    if (error) return false;

    const rows = data || [];
    if (rows.some(l => l.phone && phoneMatches(l.phone, target))) return true;
    if (rows.length < LEAD_SCAN_PAGE) return false;
    from += LEAD_SCAN_PAGE;
  }
}

// ---------------------------------------------------------------------------
// Lead creation helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a caller-supplied phone to bare digits and validate the result.
 * Returns null when the value cannot be a real phone number, so the caller can
 * answer 400 instead of storing junk.
 *
 * Accepts common human formats (+, spaces, dashes, dots, parentheses) and
 * rejects anything that is not a plausible E.164 length (7..15 digits).
 */
function normalizePhoneForLead(value) {
  const digits = digitsOnly(value);
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

/**
 * Find a lead in THIS organization whose stored phone normalizes to `target`.
 *
 * Scoped to organization_id so a number belonging to another tenant can never
 * be reported, matched or overwritten. Paginated to exhaustion for the same
 * reason as organizationHasLeadForPhone: a row limit must not be able to hide
 * a duplicate (which would silently create one) or to miss the exact match.
 */
async function findLeadByNormalizedPhone(supabase, organizationId, target) {
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, contact_name, company_name, name, phone, status')
      .eq('organization_id', organizationId)
      .order('id', { ascending: true })
      .range(from, from + LEAD_SCAN_PAGE - 1);

    if (error) return null;
    const rows = data || [];
    const hit = rows.find(l => l.phone && phoneMatches(l.phone, target));
    if (hit) return hit;
    if (rows.length < LEAD_SCAN_PAGE) return null;
    from += LEAD_SCAN_PAGE;
  }
}

function cleanText(value, maxLength) {
  const s = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, maxLength) : '';
}

/**
 * Exact phone match against one organization's message threads.
 *
 * messages.sender_number is written digits-only by this endpoint and by the
 * inbound webhook, so equality on the normalized value is complete here. The
 * organization_id filter is what keeps this tenant-scoped.
 */
async function organizationHasMessageForPhone(supabase, organizationId, target) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_number')
    .eq('organization_id', organizationId)
    .eq('sender_number', target)
    .limit(1);

  if (error) return false;
  return (data || []).length > 0;
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
 */
function buildTemplatePayload(phone, text, templateParams, templateNameOverride) {
  const name = (templateNameOverride || process.env.WHATSAPP_TEMPLATE_NAME || 'hello_world').trim();
  if (!name) return null;

  const language = (process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US').trim();
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

// ---------------------------------------------------------------------------
// Media Helpers (Consolidated from send-media.js)
// ---------------------------------------------------------------------------
const MIME_TO_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/x-icon': 'ico',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov', 'video/x-msvideo': 'avi', 'video/webm': 'webm', 'video/x-matroska': 'mkv',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac', 'audio/opus': 'opus', 'audio/amr': 'amr',
  'application/pdf': 'pdf', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt', 'text/csv': 'csv', 'text/html': 'html', 'text/css': 'css', 'application/json': 'json', 'application/xml': 'xml', 'text/xml': 'xml',
  'application/zip': 'zip', 'application/x-zip-compressed': 'zip', 'application/x-rar-compressed': 'rar', 'application/vnd.rar': 'rar',
  'application/x-7z-compressed': '7z', 'application/x-tar': 'tar', 'application/gzip': 'gz',
  'application/vnd.android.package-archive': 'apk', 'application/x-msdownload': 'exe', 'application/postscript': 'ai', 'image/vnd.adobe.photoshop': 'psd'
};

function extFromMime(mimeType) {
  const clean = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (MIME_TO_EXT[clean]) return MIME_TO_EXT[clean];
  const sub = clean.split('/')[1] || 'bin';
  return /^[a-z0-9]{1,8}$/.test(sub) ? sub : 'bin';
}

function getMimeTypeFromExt(ext) {
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', webm: 'video/webm', '3gp': 'video/3gpp',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/opus', amr: 'audio/amr',
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain', csv: 'text/csv', html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json', xml: 'application/xml',
    zip: 'application/zip', rar: 'application/x-rar-compressed', '7z': 'application/x-7z-compressed', tar: 'application/x-tar', gz: 'application/gzip',
    apk: 'application/vnd.android.package-archive', exe: 'application/x-msdownload', psd: 'image/vnd.adobe.photoshop', ai: 'application/postscript'
  };
  return map[ext] || 'application/octet-stream';
}

function getMetaMediaType(messageType) {
  const map = {
    image: 'image',
    audio: 'audio',
    document: 'document',
    video: 'video',
    sticker: 'image'
  };
  return map[messageType] || 'document';
}

function getMediaMessageTypeFromMime(mimeType, fileName) {
  if (!mimeType) return 'document';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'document';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'document';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'document';
  const ext = fileName?.split('.').pop()?.toLowerCase() || '';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(ext)) return 'document';
  return 'document';
}

async function getTenantWhatsAppCredentials(supabase, organizationId) {
  const { data: conn, error } = await supabase
    .from('whatsapp_connections')
    .select('phone_number_id, access_token_encrypted, access_token')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !conn) return null;
  if (!conn.phone_number_id) return null;

  let accessToken = null;
  if (conn.access_token_encrypted) {
    try {
      accessToken = await decryptToken(conn.access_token_encrypted);
    } catch (_) { accessToken = null; }
  }
  if (!accessToken && conn.access_token) accessToken = conn.access_token;

  if (!accessToken) return null;
  return { phoneNumberId: conn.phone_number_id, accessToken };
}

async function uploadMediaToMeta(phoneNumberId, accessToken, fileBuffer, mimeType, fileName) {
  const formData = new FormData();
  const uploadName = fileName && /\.[a-zA-Z0-9]{1,8}$/.test(fileName)
    ? fileName
    : `media.${extFromMime(mimeType)}`;
  formData.append('file', new Blob([fileBuffer], { type: mimeType }), uploadName);
  formData.append('messaging_product', 'whatsapp');
  formData.append('type', mimeType);

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/media`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    body: formData
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Meta media upload failed: ${res.status}`);
  }

  return data.id;
}

async function sendMediaMessage(phoneNumberId, accessToken, toNumber, messageType, mediaId, caption, fileName) {
  const metaType = getMetaMediaType(messageType);
  const body = {
    messaging_product: 'whatsapp',
    to: toNumber,
    type: metaType,
    [metaType]: { id: mediaId }
  };

  if (caption && ['image', 'video', 'document'].includes(metaType)) {
    body[metaType].caption = caption;
  }

  if (metaType === 'document' && fileName) {
    body[metaType].filename = fileName;
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Meta send failed: ${res.status}`);
  }

  return data;
}

async function uploadToSupabaseStorage(supabase, senderNumber, fileBuffer, fileName, mimeType, mediaId) {
  const cleanPhone = String(senderNumber || '').replace(/[^0-9]/g, '').slice(-10) || 'unknown';
  const safeName = String(fileName || `media_${mediaId}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const hasExt = /\.[a-zA-Z0-9]{1,8}$/.test(safeName);
  const suffix = hasExt ? '' : `.${extFromMime(mimeType)}`;
  const storagePath = `${cleanPhone}/${mediaId}/${mediaId}_${safeName}${suffix}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('whatsapp-media')
    .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });

  if (uploadError) {
    console.error('Supabase Storage upload error:', uploadError);
    return null;
  }

  return uploadData?.path || storagePath;
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------
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
  const requestedOrg = (req.query && req.query.organization_id) || null;
  const access = await requireOrgAccess(req, res, requestedOrg);
  if (!access) return;
  const organizationId = access.organizationId;

  // ---- POST action=create-lead -------------------------------------------
  // Lives inside this route (not a new api/*.js) because Vercel is already at
  // the 12-function limit. organization_id comes from the verified membership
  // above and is NEVER read from the request.
  if (req.method === 'POST' && String(req.query?.action || '').toLowerCase() === 'create-lead') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      const rawPhone = body.phone ?? body.phoneNumber ?? body.contact_number ?? body.mobile;
      if (rawPhone === undefined || rawPhone === null || String(rawPhone).trim() === '') {
        return res.status(400).json({ success: false, error: 'A phone number is required.' });
      }

      const phone = normalizePhoneForLead(rawPhone);
      if (!phone) {
        return res.status(400).json({ success: false, error: 'A valid phone number (7-15 digits) is required.' });
      }

      const contactName = cleanText(body.contactName ?? body.contact_name ?? body.name, 120);
      const companyName = cleanText(body.companyName ?? body.company_name ?? body.company, 120);
      const email = cleanText(body.email, 160);
      const source = cleanText(body.source, 60) || 'Manual';
      const notes = cleanText(body.notes, 2000);

      if (!contactName && !companyName) {
        return res.status(400).json({ success: false, error: 'Provide at least a contact name or a company name.' });
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, error: 'A valid email address is required.' });
      }

      // Duplicate within THIS organization only. Never merges, updates or
      // reports a lead that belongs to a different tenant.
      const existing = await findLeadByNormalizedPhone(supabase, organizationId, phone);
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'A lead with this phone number already exists in your organization.',
          code: 'DUPLICATE_LEAD',
          duplicate: true,
          lead: existing
        });
      }

      // leads.company_name / contact_name / phone / name are NOT NULL.
      const insertRow = {
        organization_id: organizationId,
        phone,
        contact_name: contactName || companyName,
        name: contactName || companyName,
        company_name: companyName || contactName,
        status: 'NEW',
        source,
        notes,
        opted_out: false
      };
      if (email) insertRow.email = email;

      const { data: created, error: createErr } = await supabase
        .from('leads')
        .insert(insertRow)
        .select('id, organization_id, contact_name, name, company_name, phone, email, status, source, created_at')
        .single();

      if (createErr) {
        console.error('[messages] lead create failed:', createErr.message);
        return res.status(500).json({ success: false, error: 'Could not create the lead.' });
      }

      return res.status(201).json({ success: true, lead: created });
    } catch (err) {
      console.error('[messages] create-lead error:', err.message);
      return res.status(500).json({ success: false, error: 'Could not create the lead.' });
    }
  }

  const isMediaSend = req.method === 'POST' && (req.query?.route === 'send-media' || req.query?.media === '1');

  // ---- POST: Send Outbound Media (Consolidated /api/send-media handler) ---
  if (isMediaSend) {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { messageType, text, leadId, senderNumber, caption, fileName, mimeType } = body;
      const fileBase64 = body.fileBase64 || body.file;

      if (!fileBase64 || !senderNumber || !leadId) {
        return res.status(400).json({ error: 'fileBase64, senderNumber, and leadId are required' });
      }

      const { data: conversation, error: conversationError } = await supabase
        .from('conversations')
        .select('id, organization_id')
        .eq('lead_id', leadId)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (conversationError || !conversation || conversation.organization_id !== organizationId) {
        return res.status(404).json({ error: 'No conversation found for this lead.' });
      }

      const creds = await getTenantWhatsAppCredentials(supabase, organizationId);
      if (!creds) {
        return res.status(409).json({
          error: 'No active WhatsApp connection is configured for your organization.'
        });
      }
      const { phoneNumberId, accessToken } = creds;

      const fileBuffer = Buffer.from(fileBase64, 'base64');
      if (!fileBuffer.length) {
        return res.status(400).json({ error: 'Uploaded file is empty or not valid base64' });
      }

      const resolvedMimeType = mimeType || getMimeTypeFromExt(fileName?.split('.').pop()?.toLowerCase()) || 'application/octet-stream';
      const resolvedMessageType = messageType || getMediaMessageTypeFromMime(resolvedMimeType, fileName) || 'document';

      let mediaId = null;
      let storagePath = null;

      try {
        mediaId = await uploadMediaToMeta(phoneNumberId, accessToken, fileBuffer, resolvedMimeType, fileName);
      } catch (err) {
        console.error('Meta media upload failed:', err);
        return res.status(502).json({ error: `Meta upload failed: ${err.message}` });
      }

      try {
        const sendResult = await sendMediaMessage(
          phoneNumberId,
          accessToken,
          senderNumber,
          resolvedMessageType,
          mediaId,
          caption || text || '',
          fileName
        );
        const waMessageId = sendResult.messages?.[0]?.id || null;

        try {
          storagePath = await uploadToSupabaseStorage(supabase, senderNumber, fileBuffer, fileName || `media_${mediaId}`, resolvedMimeType, mediaId);
        } catch (storageErr) {
          console.error('Supabase Storage upload failed:', storageErr);
        }

        const sentAt = new Date().toISOString();
        const bodyText = text || caption || fileName || 'Media message';
        const messageRecord = {
          organization_id: organizationId,
          conversation_id: conversation.id,
          wa_message_id: waMessageId,
          sender_number: senderNumber,
          sender: 'user',
          body: bodyText,
          message_body: bodyText,
          content: bodyText,
          message_type: resolvedMessageType,
          direction: 'outbound',
          received_at: sentAt,
          created_at: sentAt,
          status: 'sent',
          media_url: storagePath,
          media_mime_type: resolvedMimeType,
          file_name: fileName || `media_${mediaId}`,
          media_caption: caption || null,
          media_size: fileBuffer.length
        };

        const { error: dbError } = await supabase
          .from('messages')
          .insert(messageRecord);

        if (dbError) throw new Error('Supabase insert failed: ' + dbError.message);

        let mediaPublicUrl = null;
        if (storagePath) {
          const { data: signed } = await supabase.storage
            .from('whatsapp-media')
            .createSignedUrl(storagePath, SIGNED_URL_TTL);
          mediaPublicUrl = signed?.signedUrl
            || supabase.storage.from('whatsapp-media').getPublicUrl(storagePath).data?.publicUrl
            || null;
        }

        return res.status(200).json({
          success: true,
          messageId: waMessageId,
          mediaId,
          storagePath,
          mediaPublicUrl,
          message: { ...messageRecord, media_public_url: mediaPublicUrl }
        });
      } catch (err) {
        console.error('Send media message failed:', err);
        return res.status(502).json({ error: `Send failed: ${err.message}` });
      }
    } catch (err) {
      console.error('Server error in send-media handler:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ---- POST: Send Outbound Text WhatsApp Message -------------------------
  if (req.method === 'POST') {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}));
    const phone = digitsOnly(body.phone || body.to || body.sender_number);
    const text = String(body.text || body.content || body.message || '').trim();

    if (!phone) return res.status(400).json({ success: false, error: 'A phone number is required.' });
    if (!text) return res.status(400).json({ success: false, error: 'Message text is required.' });
    if (text.length > 4096) return res.status(400).json({ success: false, error: 'Message text is too long (max 4096).' });

    // --- Authorization: exact normalized phone match, organization-scoped ---
    // No suffix matching. `phone` is already digitsOnly above, and a contact is
    // authorized only when the normalized value stored in the database is
    // IDENTICAL. A different number sharing the last 7 digits is rejected.
    const [ownsMessage, ownsLead] = await Promise.all([
      organizationHasMessageForPhone(supabase, organizationId, phone),
      organizationHasLeadForPhone(supabase, organizationId, phone)
    ]);

    if (!ownsMessage && !ownsLead) {
      return res.status(403).json({
        success: false,
        error: 'This phone number is not part of your organization.'
      });
    }

    const tenantCreds = await getTenantWhatsAppCredentials(supabase, organizationId);
    const accessToken = tenantCreds?.accessToken
      || process.env.WHATSAPP_ACCESS_TOKEN
      || process.env.WA_ACCESS_TOKEN;
    const phoneNumberId = tenantCreds?.phoneNumberId
      || process.env.WHATSAPP_PHONE_NUMBER_ID
      || process.env.PHONE_NUMBER_ID
      || process.env.WA_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      return res.status(500).json({
        success: false,
        error: 'WhatsApp is not configured on the server.',
        missing: [!accessToken && 'WHATSAPP_ACCESS_TOKEN', !phoneNumberId && 'WHATSAPP_PHONE_NUMBER_ID'].filter(Boolean)
      });
    }

    const dupeCutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
    const { data: dupe } = await supabase
      .from('messages')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('sender_number', phone)
      .eq('content', text)
      .eq('direction', 'outbound')
      .in('status', ['sending', 'sent', 'delivered'])
      .gte('created_at', dupeCutoff)
      .order('created_at', { ascending: false })
      .limit(5);

    const matchingDupe = (dupe || []).find(m => digitsOnly(m.sender_number) === phone);
    if (matchingDupe) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        deduplicatedBy: 'org+phone+content within ' + (DUPLICATE_WINDOW_MS / 1000) + 's',
        idempotencyKeyHonoured: false,
        messageId: matchingDupe.wa_message_id,
        status: matchingDupe.status,
        message: matchingDupe
      });
    }

    // Newest inbound for THIS exact number. Previously the 5 newest inbound
    // messages for the whole organization were fetched and then filtered, so a
    // busier tenant could push the matching row out of the result set and the
    // 24-hour window would be computed from the wrong (missing) row.
    const phoneForms = Array.from(phoneVariants(phone));
    if (!phoneForms.includes(phone)) phoneForms.push(phone);
    const bareDigits = digitsOnly(phone);
    if (bareDigits && !phoneForms.includes(bareDigits)) phoneForms.push(bareDigits);
    if (bareDigits && !phoneForms.includes('+' + bareDigits)) phoneForms.push('+' + bareDigits);

    const { data: lastInbound } = await supabase
      .from('messages')
      .select('received_at,created_at,sender_number')
      .eq('organization_id', organizationId)
      .in('sender_number', phoneForms)
      .eq('direction', 'inbound')
      .order('received_at', { ascending: false, nullsFirst: false })
      .limit(1);

    const lastInboundAt = lastInbound?.[0]?.received_at || lastInbound?.[0]?.created_at || null;
    const withinWindow = lastInboundAt
      ? (Date.now() - new Date(lastInboundAt).getTime()) < SERVICE_WINDOW_MS
      : false;

    const reqTemplateName = body.template_name || body.templateName || body.template || process.env.WHATSAPP_TEMPLATE_NAME || null;
    const now = new Date().toISOString();
    const payload = withinWindow
      ? { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }
      : buildTemplatePayload(phone, text, body.templateParams, reqTemplateName);

    if (!withinWindow && !payload) {
      return res.status(422).json({
        success: false,
        error: 'This customer is outside the 24-hour service window, so an approved template is required. Set WHATSAPP_TEMPLATE_NAME (and pass templateParams) to send.',
        code: 'TEMPLATE_REQUIRED',
        windowOpen: false,
        lastInboundAt
      });
    }

    let conversationId = body.conversation_id || null;
    if (!conversationId) {
      const lead = await findLeadByNormalizedPhone(supabase, organizationId, phone);
      if (lead) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('lead_id', lead.id)
          .limit(1);
        if (conv?.[0]?.id) conversationId = conv[0].id;
      }
    }

    const insertPayload = {
      organization_id: organizationId,
      sender_number: phone,
      direction: 'outbound',
      message_type: 'text',
      channel: 'whatsapp',
      content: text,
      body: text,
      message_body: text,
      received_at: now,
      created_at: now,
      status: 'sending',
      is_ai: !!body.is_ai
    };
    if (conversationId) insertPayload.conversation_id = conversationId;

    const { data: pendingRow, error: pendingErr } = await supabase
      .from('messages')
      .insert(insertPayload)
      .select()
      .single();
    if (pendingErr) {
      return res.status(500).json({ success: false, error: `Could not queue message: ${pendingErr.message}` });
    }

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

    if (conversationId) {
      await supabase
        .from('conversations')
        .update({
          last_message: text,
          last_timestamp: now,
          channel: 'whatsapp',
        })
        .eq('id', conversationId);
    }

    return res.status(200).json({
      success: true,
      status: 'sent',
      messageId: graphResult.waMessageId,
      rowId: pendingRow.id,
      usedTemplate: !withinWindow,
      message: sentRow || { ...pendingRow, wa_message_id: graphResult.waMessageId, status: 'sent' }
    });
  }

  // ---- GET: Fetch Messages & Conversations --------------------------------
  const query = req.query || {};
  const limit = Math.min(parseInt(query.limit, 10) || DEFAULT_LIMIT, 500);

  try {
    let select = supabase
      .from('messages')
      .select('*')
      .eq('organization_id', organizationId)
      .order('received_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (query.sender_number) select = select.eq('sender_number', String(query.sender_number));
    if (query.lead_id) select = select.eq('lead_id', String(query.lead_id));
    if (query.conversation_id) select = select.eq('conversation_id', String(query.conversation_id));
    if (query.since) select = select.gt('received_at', String(query.since));

    let { data, error } = await select;

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

    const phones = [...new Set(messages.map(m => m.sender_number).filter(Boolean))];
    const nameByDigits = new Map();
    if (phones.length) {
      const { data: leads, error: leadsErr } = await supabase
        .from('leads')
        .select('id,name,contact_name,company,company_name,phone')
        .eq('organization_id', organizationId)
        .limit(1000);
      if (leadsErr) {
        console.error('[messages] lead-name enrichment failed:', leadsErr.message);
      }
      (leads || []).forEach(lead => {
        const d = digitsOnly(lead.phone);
        const norm = normalizePhone(lead.phone);
        if (!d && !norm) return;
        const label = lead.name || lead.contact_name || lead.company || lead.company_name;
        if (label) {
          if (d && !nameByDigits.has(d)) nameByDigits.set(d, label);
          if (norm && !nameByDigits.has(norm)) nameByDigits.set(norm, label);
        }
      });
    }

    const byThread = new Map();
    messages.forEach(msg => {
      const key = msg.sender_number || msg.lead_id || msg.conversation_id || 'unknown';
      if (!byThread.has(key)) byThread.set(key, []);
      byThread.get(key).push({
        id: msg.id,
        dir: toDirection(msg),
        text: pickText(msg),
        time: pickTime(msg),
        channel: msg.channel || 'whatsapp',
        messageType: msg.message_type || 'text',
        mediaUrl: msg.mediaUrl || msg.media_url || null,
        mediaCaption: msg.media_caption || null,
        status: msg.status ? String(msg.status).toLowerCase() : null,
        isAi: !!msg.is_ai
      });
    });

    const conversations = [...byThread.entries()].map(([key, msgs]) => {
      const ordered = [...msgs].reverse();
      const last = ordered[ordered.length - 1];
      const displayName = nameByDigits.get(normalizePhone(key)) || nameByDigits.get(digitsOnly(key)) || key;
      const threadChannel = msgs.find(m => m.channel)?.channel || 'whatsapp';
      return {
        key,
        phone: key,
        name: displayName,
        initials: initialsFromName(displayName, key),
        channel: threadChannel,
        preview: last?.text || (last?.messageType === 'text' ? '' : `[${last?.messageType || 'media'}]`),
        time: last?.time || null,
        messages: ordered
      };
    });

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
