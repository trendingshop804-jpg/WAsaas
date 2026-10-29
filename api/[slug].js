/**
 * api/[slug].js — the ONE serverless function for every /api/* endpoint.
 *
 * Why: Vercel's Hobby plan rejects deployments with more than 12 serverless
 * functions. The api/ directory previously held 14 routed handlers (12 already
 * deployed, so adding deals/appointments exceeded the limit). All handlers now
 * live in server/api/ and are imported here, so this file is the only function
 * Vercel sees — adding a new endpoint never hits the plan limit again.
 *
 * Routing:
 *   /api/leads            -> server/api/leads.js
 *   /api/test-connection  -> alias table below (was vercel.json rewrites and
 *                            dev-server's API_REWRITES — now ONE source of
 *                            truth so local and production route identically)
 *
 * Every URL that existed before keeps working, including the ones that were
 * broken on production because underscore-prefixed files are not routed by
 * Vercel (e.g. /api/trigger-call, /api/send-whatsapp-followup,
 * /api/admin-system, /api/admin-companies).
 */

import admin from '../server/api/admin.js';
import aiChat from '../server/api/ai-chat.js';
import appointments from '../server/api/appointments.js';
import dailyFollowup from '../server/api/daily-followup.js';
import deals from '../server/api/deals.js';
import instagram from '../server/api/instagram.js';
import integrationKeys from '../server/api/integration-keys.js';
import integrationStatus from '../server/api/integration-status.js';
import leads from '../server/api/leads.js';
import messages from '../server/api/messages.js';
import metaOauthExchange from '../server/api/meta-oauth-exchange.js';
import metaWebhook from '../server/api/meta-webhook.js';
import publicConfig from '../server/api/public-config.js';
import tasks from '../server/api/tasks.js';

/** slug -> handler (real file names in server/api/) */
const ROUTES = {
  admin,
  'ai-chat': aiChat,
  appointments,
  'daily-followup': dailyFollowup,
  deals,
  instagram,
  'integration-keys': integrationKeys,
  'integration-status': integrationStatus,
  leads,
  messages,
  'meta-oauth-exchange': metaOauthExchange,
  'meta-webhook': metaWebhook,
  'public-config': publicConfig,
  tasks
};

/**
 * Legacy/short URLs -> { target, query }. Values are injected into req.query
 * only when the caller did not already supply them, matching the behaviour the
 * rewrites had on production and the API_REWRITES table the dev server used.
 */
const ALIASES = {
  'test-connection': { target: 'integration-status', query: { route: 'test-connection' } },
  'trigger-call': { target: 'integration-status', query: { route: 'trigger-call' } },
  'send-whatsapp-followup': { target: 'daily-followup', query: { route: 'send-whatsapp-followup' } },
  'update-whatsapp-profile': { target: 'meta-oauth-exchange', query: { route: 'update-whatsapp-profile' } },
  'admin-companies': { target: 'admin', query: { resource: 'companies' } },
  'admin-system': { target: 'admin', query: { resource: 'system' } },
  'send-media': { target: 'messages', query: { route: 'send-media' } },
  'social-conversations': { target: 'instagram', query: { action: 'social_conversations' } },
  'wa-campaigns': { target: 'messages', query: { action: 'wa_campaigns' } },
  'ai-agents': { target: 'ai-chat', query: { route: 'ai_agents' } },
  'knowledge-base': { target: 'ai-chat', query: { route: 'knowledge_base' } },
  onboarding: { target: 'leads', query: { route: 'onboarding' } }
};

function resolveSlug(req) {
  // The path is authoritative — never the ?slug= query value, which a client
  // could send to reach a different handler. Falls back to req.query.slug for
  // callers (dev-server) that pass it explicitly without a normalised URL.
  let slug = '';
  try {
    const pathname = new URL(req.url || '', 'http://localhost').pathname;
    const match = pathname.match(/^\/api\/(.+)$/);
    if (match) slug = decodeURIComponent(match[1]);
  } catch {
    slug = '';
  }
  if (!slug) slug = Array.isArray(req.query?.slug) ? req.query.slug[0] : req.query?.slug || '';
  slug = String(slug || '').replace(/\/+$/, '');
  const alias = ALIASES[slug];
  if (alias) return { key: alias.target, extra: alias.query };
  return { key: slug, extra: null };
}

function injectQuery(req, extra) {
  if (!extra) return;
  const current = req.query || {};
  const patch = {};
  for (const [key, value] of Object.entries(extra)) {
    if (current[key] === undefined) patch[key] = value;
  }
  if (!Object.keys(patch).length) return;
  try {
    Object.assign(current, patch); // in place — handlers read req.query
    if (req.query === undefined) req.query = current;
  } catch {
    try { req.query = { ...current, ...patch }; } catch { /* last resort */ }
  }
}

export default async function handler(req, res) {
  const { key, extra } = resolveSlug(req);
  const routeHandler = ROUTES[key];
  if (!routeHandler) {
    return res.status(404).json({ error: `Unknown API route: ${key || ''}`.trim() });
  }
  injectQuery(req, extra);
  return routeHandler(req, res);
}
