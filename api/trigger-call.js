/**
 * api/trigger-call.js — Unified Calling System Hub
 *
 * Handles all calling-related routes via query parameter routing:
 *   POST ?action=dial       — Trigger outbound call (MacroDroid / Twilio)
 *   POST ?action=hangup     — End active call
 *   POST ?action=status     — Update call status (webhook from provider)
 *   POST ?action=inbound    — Log inbound call
 *   GET  ?action=history    — Fetch call history
 *   GET  ?action=settings   — Fetch calling provider settings
 *   POST (no action)        — Legacy: trigger MacroDroid call (backward compat)
 *
 * SECURITY
 *   * Every request (except provider webhooks) requires a signed-in Supabase
 *     session that is a member of an organization.
 *   * The MacroDroid webhook URL comes ONLY from the MACRODROID_WEBHOOK_URL
 *     server env var. Never exposed to the client.
 *   * Fails closed when configuration is missing.
 */

import { createSupabaseAdminClient, requireOrgAccess, getBearerToken } from './_supabase.js';

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_HISTORY_LIMIT = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWebhookUrl() {
  return String(process.env.MACRODROID_WEBHOOK_URL || '').trim();
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(String(body));
  } catch (_) {
    return {};
  }
}

function normalizePhone(value) {
  if (!value) return '';
  const raw = String(value).trim().replace(/[\r\n\t]/g, '');
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 10 && /^[6-9]/.test(digits)) return '+91' + digits;
  if (digits.length === 11 && digits.startsWith('0')) return '+91' + digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  return hasPlus ? '+' + digits : digits;
}

function applyCors(req, res) {
  const origin = String(req.headers?.origin || '');
  const allowed = new Set([
    'https://w-asaas.vercel.app',
    'http://localhost:3001',
    'http://localhost:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3000',
    ...(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  ]);
  if (origin && allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// ---------------------------------------------------------------------------
// MacroDroid Dialer (original logic preserved)
// ---------------------------------------------------------------------------
async function handleMacroDroidDial(phone, name, res) {
  let webhook;
  try {
    const configured = getWebhookUrl();
    if (!configured) throw new Error('MACRODROID_WEBHOOK_URL is not configured.');
    webhook = new URL(configured);
    if (webhook.protocol !== 'https:') throw new Error('MacroDroid webhook must use HTTPS.');
    webhook.search = '';
  } catch (error) {
    console.error('[MacroDroid Webhook Config Error]', error.message);
    return { success: false, status: 503, error: 'Call webhook is not configured on the server.' };
  }

  const safeName = (name || '').replace(/[0-9+()\s-]/g, '').trim().slice(0, 60);
  if (safeName) webhook.searchParams.set('name', encodeURIComponent(safeName));

  webhook.searchParams.set('data', phone);
  webhook.searchParams.set('phone', phone);
  webhook.searchParams.set('number', phone);
  const bareDigits = phone.replace(/\D/g, '');
  const bare10 = bareDigits.slice(-10);
  if (bare10.length === 10) webhook.searchParams.set('bare_phone', bare10);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(webhook.toString(), {
      method: 'GET',
      headers: { Accept: 'text/plain, application/json' },
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
      return { success: false, status: 502, error: `MacroDroid returned HTTP ${response.status}${detail ? `: ${detail}` : '.'}` };
    }

    return { success: true, provider: 'macrodroid' };
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'MacroDroid webhook request timed out.'
      : `MacroDroid webhook request failed: ${error.message}`;
    console.error('[MacroDroid Webhook Error]', message);
    return { success: false, status: 502, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Call History Helpers
// ---------------------------------------------------------------------------
async function logCallRecord(supabase, organizationId, data) {
  const record = {
    organization_id: organizationId,
    phone_number: data.phone || null,
    contact_name: data.name || null,
    lead_id: data.leadId || null,
    direction: data.direction || 'outbound',
    provider: data.provider || 'macrodroid',
    status: data.status || 'initiated',
    duration_seconds: data.duration || 0,
    notes: data.notes || null,
    started_at: new Date().toISOString(),
  };

  const { data: row, error } = await supabase
    .from('calls')
    .insert(record)
    .select('id, phone_number, contact_name, direction, provider, status, started_at')
    .single();

  if (error) {
    console.error('[Calls] Insert failed:', error.message);
    return null;
  }
  return row;
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  applyCors(req, res);
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = String(req.query?.action || '').toLowerCase();
  const supabase = createSupabaseAdminClient();

  // ── Provider status webhook (no auth — called by Twilio/MacroDroid) ──
  if (req.method === 'POST' && action === 'status') {
    if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

    const body = parseBody(req.body);
    const callId = body.callId || body.call_id || body.CallSid;
    const newStatus = body.status || body.CallStatus || 'unknown';
    const duration = parseInt(body.duration || body.CallDuration || '0', 10);

    if (callId) {
      await supabase
        .from('calls')
        .update({
          status: newStatus,
          duration_seconds: duration || undefined,
          ended_at: ['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(newStatus)
            ? new Date().toISOString()
            : undefined,
        })
        .eq('id', callId);
    }

    return res.status(200).json({ received: true });
  }

  // ── All other actions require authentication ──
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const access = await requireOrgAccess(req, res);
  if (!access) return;
  const organizationId = access.organizationId;

  // ── GET: Call History ──
  if (req.method === 'GET' && (action === 'history' || action === '')) {
    if (!supabase) return res.status(503).json({ error: 'Database unavailable', calls: [] });

    const limit = Math.min(parseInt(req.query?.limit || DEFAULT_HISTORY_LIMIT, 10), 200);
    const direction = req.query?.direction; // 'inbound' | 'outbound' | undefined

    let query = supabase
      .from('calls')
      .select('*')
      .eq('organization_id', organizationId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (direction && ['inbound', 'outbound'].includes(direction)) {
      query = query.eq('direction', direction);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[Calls] History query failed:', error.message);
      return res.status(500).json({ error: error.message, calls: [] });
    }

    return res.status(200).json({ success: true, calls: data || [], count: (data || []).length });
  }

  // ── GET: Provider Settings ──
  if (req.method === 'GET' && action === 'settings') {
    return res.status(200).json({
      success: true,
      providers: {
        macrodroid: {
          configured: Boolean(getWebhookUrl()),
          label: 'MacroDroid (Android)',
        },
        twilio: {
          configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
          label: 'Twilio Voice',
        }
      }
    });
  }

  // ── POST: Dial / Legacy ──
  if (req.method === 'POST' && (action === 'dial' || action === '')) {
    const body = parseBody(req.body);
    const phone = normalizePhone(body.phone || body.phoneNumber || req.query?.phone);
    const name = String(body.name || req.query?.name || '').trim().replace(/[\r\n]/g, '').slice(0, 120);
    const provider = String(body.provider || 'macrodroid').toLowerCase();
    const leadId = body.leadId || body.lead_id || null;

    if (!phone) return res.status(400).json({ success: false, error: 'A phone number is required.' });
    if (phone.length > 64) return res.status(400).json({ success: false, error: 'Phone number is too long.' });

    // MacroDroid dial
    const result = await handleMacroDroidDial(phone, name, res);
    if (!result.success) {
      return res.status(result.status || 502).json(result);
    }

    // Log call in DB
    if (supabase) {
      const callRecord = await logCallRecord(supabase, organizationId, {
        phone, name, leadId, direction: 'outbound', provider, status: 'initiated'
      });
      return res.status(200).json({ success: true, message: 'Call initiated.', provider, call: callRecord });
    }

    return res.status(200).json({ success: true, message: 'MacroDroid webhook triggered.', provider });
  }

  // ── POST: Hangup ──
  if (req.method === 'POST' && action === 'hangup') {
    const body = parseBody(req.body);
    const callId = body.callId || body.call_id;

    if (!callId || !supabase) {
      return res.status(400).json({ success: false, error: 'callId is required.' });
    }

    const { error } = await supabase
      .from('calls')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', callId)
      .eq('organization_id', organizationId);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, message: 'Call ended.' });
  }

  // ── POST: Inbound call log ──
  if (req.method === 'POST' && action === 'inbound') {
    const body = parseBody(req.body);
    if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

    const callRecord = await logCallRecord(supabase, organizationId, {
      phone: normalizePhone(body.phone || body.from),
      name: body.name || body.callerName || '',
      leadId: body.leadId || null,
      direction: 'inbound',
      provider: body.provider || 'unknown',
      status: 'ringing'
    });

    return res.status(200).json({ success: true, call: callRecord });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
