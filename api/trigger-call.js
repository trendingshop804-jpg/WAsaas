/**
 * api/trigger-call.js — Trigger a MacroDroid webhook for a CRM call button.
 *
 * The browser posts the phone number to this server-side proxy so the webhook
 * URL is not exposed as a browser credential and cross-origin restrictions do
 * not block the request. MacroDroid receives the number in its `data` query
 * parameter.
 *
 * SECURITY
 *   * Requires a signed-in Supabase session that is a member of an organization.
 *   * The destination URL comes ONLY from the MACRODROID_WEBHOOK_URL server
 *     environment variable. There is no hardcoded default and the browser can
 *     never supply a destination.
 *   * The webhook URL is never returned in a response and never logged.
 *   * Fails closed when the environment variable is missing.
 */

import { requireOrgAccess } from './_supabase.js';

const REQUEST_TIMEOUT_MS = 10_000;

function getWebhookUrl() {
  // Server-side configuration only. Empty when unset -> the caller fails closed.
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
  return String(value || '').trim().replace(/[\r\n]/g, '');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ── Authorization ────────────────────────────────────────────────────────
  // A signed-in organization member is required. Runs before any outbound call.
  const access = await requireOrgAccess(req, res);
  if (!access) return;

  const body = parseBody(req.body);
  const query = req.query || {};
  const phone = normalizePhone(body.phone || body.phoneNumber || query.phone);
  const name = String(body.name || query.name || '').trim().replace(/[\r\n]/g, '').slice(0, 120);

  if (!phone) {
    return res.status(400).json({ success: false, error: 'A phone number is required.' });
  }
  if (phone.length > 64) {
    return res.status(400).json({ success: false, error: 'Phone number is too long.' });
  }

  let webhook;
  try {
    const configured = getWebhookUrl();
    // Fail closed: no server-side configuration means no send.
    if (!configured) throw new Error('MACRODROID_WEBHOOK_URL is not configured.');
    webhook = new URL(configured);
    if (webhook.protocol !== 'https:') throw new Error('MacroDroid webhook must use HTTPS.');
  } catch (error) {
    // Log the reason only — never the URL itself.
    console.error('[MacroDroid Webhook Config Error]', error.message);
    return res.status(503).json({ success: false, error: 'Call webhook is not configured on the server.' });
  }

  // MacroDroid Webhook Trigger exposes request content through `data`.
  webhook.searchParams.set('data', phone);
  if (name) webhook.searchParams.set('name', name);

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
      return res.status(502).json({
        success: false,
        error: `MacroDroid returned HTTP ${response.status}${detail ? `: ${detail}` : '.'}`
      });
    }

    return res.status(200).json({
      success: true,
      message: 'MacroDroid webhook triggered.'
      // The phone number is deliberately not echoed back.
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'MacroDroid webhook request timed out.'
      : `MacroDroid webhook request failed: ${error.message}`;
    console.error('[MacroDroid Webhook Error]', message);
    return res.status(502).json({ success: false, error: message });
  } finally {
    clearTimeout(timeout);
  }
}
