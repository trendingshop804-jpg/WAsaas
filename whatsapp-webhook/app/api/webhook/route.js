// app/api/webhook/route.js
// WhatsApp Cloud API Webhook — receives inbound messages and saves them to Supabase.
// Uses the service role key (bypasses RLS) since this is a trusted server-side handler.

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ── Supabase admin client (service role, no RLS) ─────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a phone number to its last 10 digits for deduplication.
 */
const normalisePhone = (raw = '') => raw.replace(/\D/g, '').slice(-10);

/**
 * Verify the X-Hub-Signature-256 header sent by Meta.
 * Skip verification if META_APP_SECRET is not configured (dev mode).
 */
const verifySignature = async (req, rawBody) => {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true; // dev: skip

  const sigHeader = req.headers.get('x-hub-signature-256') || '';
  const [, received] = sigHeader.split('sha256=');
  if (!received) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(received, 'hex'),
    Buffer.from(expected, 'hex')
  );
};

/**
 * Simple opt-out keyword detector (multilingual).
 */
const isOptOut = (text = '') => {
  const lower = text.toLowerCase().trim();
  const keywords = [
    'stop', 'unsubscribe', 'optout', 'opt out', 'not interested',
    'no thanks', 'no thank you', 'remove me', 'cancel',
    // Tamil
    'வேண்டாம்', 'நிறுத்து',
    // Malayalam
    'നിർത്തുക', 'വേണ്ട',
    // Hindi
    'बंद करो', 'मैसेज मत करो',
  ];
  return keywords.some((kw) => lower.includes(kw));
};

// ── GET — Meta webhook verification ──────────────────────────────────────────
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('[Webhook] ✅ Verification successful');
    return new Response(challenge, { status: 200 });
  }

  console.warn('[Webhook] ❌ Verification failed — token mismatch');
  return new Response('Forbidden', { status: 403 });
}

// ── POST — Inbound WhatsApp messages ─────────────────────────────────────────
export async function POST(req) {
  // 1. Read raw body for signature verification
  const rawBody = await req.text();

  // 2. Verify Meta signature
  const isValid = await verifySignature(req, rawBody);
  if (!isValid) {
    console.warn('[Webhook] ❌ Invalid signature');
    return new Response('Unauthorized', { status: 401 });
  }

  // 3. Parse JSON
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  console.log('[Webhook] Incoming payload:', JSON.stringify(body, null, 2));

  // 4. Walk the Meta payload structure
  try {
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) {
      // Could be a status update (delivered / read) — acknowledge and move on
      return new Response('OK', { status: 200 });
    }

    const messages  = value.messages  || [];
    const contacts  = value.contacts  || [];
    const statuses  = value.statuses  || [];
    const metadata  = value.metadata  || {};
    const wabaPhone = metadata.display_phone_number || '';

    // 4a. Process each inbound message
    for (const msg of messages) {
      await processInboundMessage(msg, contacts, wabaPhone);
    }

    // 4b. Process delivery / read status updates
    for (const status of statuses) {
      await processStatusUpdate(status);
    }

  } catch (err) {
    console.error('[Webhook] Processing error:', err);
    // Always return 200 to Meta so it doesn't retry indefinitely
  }

  return new Response('OK', { status: 200 });
}

// ── processInboundMessage ─────────────────────────────────────────────────────
async function processInboundMessage(msg, contacts, wabaPhone) {
  const fromPhone = msg.from; // E.164 without +
  const msgId     = msg.id;
  const timestamp = msg.timestamp; // Unix seconds
  const msgType   = msg.type;      // text | image | audio | document | video | sticker | ...

  // Extract display name from contacts array
  const contact = contacts.find((c) => c.wa_id === fromPhone);
  const displayName = contact?.profile?.name || fromPhone;

  // Extract text body
  let textBody = '';
  if (msgType === 'text') {
    textBody = msg.text?.body || '';
  } else if (msg[msgType]?.caption) {
    textBody = msg[msgType].caption;
  }

  console.log(`[Webhook] Message from ${fromPhone} (${displayName}): "${textBody}" [${msgType}]`);

  // ── 1. Upsert lead by phone ───────────────────────────────────────────────
  const normPhone = normalisePhone(fromPhone);

  // Search for existing lead by normalised phone (last 10 digits)
  const { data: existingLeads, error: searchErr } = await supabase
    .from('leads')
    .select('id, name, status, notes')
    .ilike('phone', `%${normPhone}`)
    .limit(1);

  if (searchErr) {
    console.error('[Webhook] Lead search error:', searchErr.message);
  }

  let leadId;

  if (existingLeads && existingLeads.length > 0) {
    leadId = existingLeads[0].id;

    // Update last_contacted_at and status if still 'New'
    const updates = {
      last_contacted_at: new Date(Number(timestamp) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (existingLeads[0].status === 'New' || existingLeads[0].status === 'new') {
      updates.status = 'Contacted';
    }
    // Handle opt-out
    if (isOptOut(textBody)) {
      updates.status = 'Lost';
      updates.notes = (existingLeads[0].notes || '') + `\n[OPT-OUT ${new Date().toISOString()}] "${textBody}"`;
    }

    await supabase.from('leads').update(updates).eq('id', leadId);

  } else {
    // Create a new lead from the inbound message
    const newLead = {
      name: displayName,
      contact_name: displayName,
      phone: `+${fromPhone}`,
      source: 'WhatsApp Inbound',
      company: 'Unknown',
      company_name: 'Unknown',
      status: isOptOut(textBody) ? 'Lost' : 'Contacted',
      notes: isOptOut(textBody) ? `[OPT-OUT] "${textBody}"` : `Auto-created from WhatsApp inbound message`,
      last_contacted_at: new Date(Number(timestamp) * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: created, error: createErr } = await supabase
      .from('leads')
      .insert([newLead])
      .select('id')
      .single();

    if (createErr) {
      console.error('[Webhook] Lead creation error:', createErr.message);
    } else {
      leadId = created.id;
      console.log(`[Webhook] ✅ New lead created: ${leadId} for ${displayName}`);
    }
  }

  // ── 2. Append inbound message text to lead notes ────────────────────────
  // Note: follow_up_messages has a NOT NULL user_id constraint and is designed
  // for user-sent messages. Inbound webhook messages are appended to lead notes
  // instead. To build a full messages table, add a `wa_messages` table without
  // the user_id constraint and insert there.
  if (leadId && textBody) {
    // Re-fetch current notes to append
    const { data: leadRow } = await supabase
      .from('leads')
      .select('notes')
      .eq('id', leadId)
      .single();

    const ts = new Date(Number(timestamp) * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const appendedNote = `${leadRow?.notes || ''}\n[Inbound WA ${ts}]: ${textBody}`.trim();

    const { error: noteErr } = await supabase
      .from('leads')
      .update({ notes: appendedNote, updated_at: new Date().toISOString() })
      .eq('id', leadId);

    if (noteErr) {
      console.warn('[Webhook] Notes append warning:', noteErr.message);
    } else {
      console.log(`[Webhook] ✅ Inbound message appended to lead ${leadId} notes`);
    }
  }

  // ── 3. Media metadata (image / audio / document / video) ─────────────────
  if (msgType !== 'text' && msg[msgType]) {
    const media = msg[msgType];
    console.log(`[Webhook] Media: type=${msgType}, id=${media.id}, mime=${media.mime_type}`);
    // You can download the media using the Media ID via:
    // GET https://graph.facebook.com/v22.0/{media-id}
    // and then store the signed URL in Supabase Storage.
  }
}

// ── processStatusUpdate ───────────────────────────────────────────────────────
async function processStatusUpdate(status) {
  // status.id       — WhatsApp message ID
  // status.status   — 'sent' | 'delivered' | 'read' | 'failed'
  // status.recipient_id — recipient phone
  console.log(`[Webhook] Status update: msg=${status.id} → ${status.status}`);
  // Future: update a `messages` table delivery status field here
}
