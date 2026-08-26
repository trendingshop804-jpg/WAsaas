// api/send-media.js
// Vercel serverless function to send outbound media via WhatsApp Cloud API.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

function getMimeTypeFromExt(ext) {
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain', csv: 'text/csv'
  };
  return map[ext] || 'application/octet-stream';
}

async function uploadMediaToMeta(phoneNumberId, accessToken, fileBuffer, mimeType, fileName) {
  const formData = new FormData();
  const uploadName = fileName && /\.[a-zA-Z0-9]{1,8}$/.test(fileName)
    ? fileName
    : `media.${extFromMime(mimeType)}`;
  formData.append('file', new Blob([fileBuffer], { type: mimeType }), uploadName);
  formData.append('messaging_product', 'whatsapp');
  formData.append('type', mimeType);

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, {
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

  // Meta requires `filename` for documents, otherwise the recipient sees a generic name.
  if (metaType === 'document' && fileName) {
    body[metaType].filename = fileName;
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
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

async function uploadToSupabaseStorage(senderNumber, fileBuffer, fileName, mimeType, mediaId) {
  const cleanPhone = String(senderNumber || '').replace(/[^0-9]/g, '').slice(-10) || 'unknown';
  const storagePath = buildStoragePath(cleanPhone, mediaId, fileName, mimeType);

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('whatsapp-media')
    .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });

  if (uploadError) {
    console.error('Supabase Storage upload error:', uploadError);
    return null;
  }

  return uploadData?.path || storagePath;
}

/**
 * Build a safe storage path. Keeps the original extension when the file name
 * already has one, so we never produce names like "invoice.pdf.pdf" or
 * "sheet.xlsx.vnd.openxmlformats-officedocument.spreadsheetml.sheet".
 */
function buildStoragePath(cleanPhone, mediaId, fileName, mimeType) {
  const safeName = String(fileName || `media_${mediaId}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const hasExt = /\.[a-zA-Z0-9]{1,8}$/.test(safeName);
  const suffix = hasExt ? '' : `.${extFromMime(mimeType)}`;
  return `${cleanPhone}/${mediaId}/${mediaId}_${safeName}${suffix}`;
}

const MIME_TO_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
  'application/pdf': 'pdf', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt', 'text/csv': 'csv', 'application/zip': 'zip'
};

function extFromMime(mimeType) {
  const clean = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (MIME_TO_EXT[clean]) return MIME_TO_EXT[clean];
  const sub = clean.split('/')[1] || 'bin';
  // Reject long vendor sub-types like "vnd.openxmlformats-...", they are not extensions.
  return /^[a-z0-9]{1,8}$/.test(sub) ? sub : 'bin';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    // The frontend posts `fileBase64`; `file` is accepted as a legacy alias.
    const { messageType, text, leadId, senderNumber, caption, fileName, mimeType } = body;
    const fileBase64 = body.fileBase64 || body.file;

    if (!fileBase64 || !senderNumber || !leadId) {
      return res.status(400).json({ error: 'fileBase64, senderNumber, and leadId are required' });
    }

    if (!WHATSAPP_ACCESS_TOKEN || !PHONE_NUMBER_ID) {
      return res.status(500).json({ error: 'WhatsApp credentials not configured on server' });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Supabase credentials not configured on server' });
    }

    const fileBuffer = Buffer.from(fileBase64, 'base64');
    if (!fileBuffer.length) {
      return res.status(400).json({ error: 'Uploaded file is empty or not valid base64' });
    }

    const resolvedMimeType = mimeType || getMimeTypeFromExt(fileName?.split('.').pop()?.toLowerCase()) || 'application/octet-stream';
    const resolvedMessageType = messageType || getMediaMessageTypeFromMime(resolvedMimeType, fileName) || 'document';

    let mediaId = null;
    let storagePath = null;

    try {
      mediaId = await uploadMediaToMeta(PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, fileBuffer, resolvedMimeType, fileName);
    } catch (err) {
      console.error('Meta media upload failed:', err);
      return res.status(502).json({ error: `Meta upload failed: ${err.message}` });
    }

    try {
      const sendResult = await sendMediaMessage(
        PHONE_NUMBER_ID,
        WHATSAPP_ACCESS_TOKEN,
        senderNumber,
        resolvedMessageType,
        mediaId,
        caption || text || '',
        fileName
      );
      const waMessageId = sendResult.messages?.[0]?.id || null;

      try {
        storagePath = await uploadToSupabaseStorage(senderNumber, fileBuffer, fileName || `media_${mediaId}`, resolvedMimeType, mediaId);
      } catch (storageErr) {
        console.error('Supabase Storage upload failed:', storageErr);
      }

      const messageRecord = {
        wa_message_id: waMessageId,
        sender_number: senderNumber,
        content: text || caption || fileName || 'Media message',
        message_type: resolvedMessageType,
        direction: 'outbound',
        received_at: new Date().toISOString(),
        media_url: storagePath,
        media_mime_type: resolvedMimeType,
        file_name: fileName || `media_${mediaId}`,
        media_caption: caption || null,
        media_size: fileBuffer.length
      };

      const { error: dbError } = await supabase
        .from('messages')
        .insert(messageRecord);

      if (dbError) {
        console.error('Supabase insert error:', dbError);
      }

      // The DB keeps the storage path; the client needs a fetchable URL for its
      // optimistic bubble, so resolve one here.
      let mediaPublicUrl = null;
      if (storagePath) {
        const { data: signed } = await supabase.storage
          .from('whatsapp-media')
          .createSignedUrl(storagePath, 60 * 60 * 24);
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
    console.error('Server error in /api/send-media:', err);
    return res.status(500).json({ error: err.message });
  }
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