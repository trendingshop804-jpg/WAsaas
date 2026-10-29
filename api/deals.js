import { createSupabaseAdminClient, requireOrgAccess } from './_supabase.js';

/* Org-scoped deals storage.
   The CRM used to keep deals only in window.NB (memory), so every "deal created"
   toast evaporated on refresh. Deals now live in the deals table and are only
   reported as saved after the row is confirmed by the database.

   Schema: supabase/migrations/20261017120000_deals_and_appointments.sql
   If that migration has not been applied yet, every route answers 503 with
   code SCHEMA_NOT_READY and the UI must surface that error instead of success. */

const DEAL_STAGES = new Set(['New', 'Contacted', 'Proposal', 'Negotiation', 'Won', 'Lost']);
const DEAL_FIELDS = 'id, organization_id, lead_id, customer_name, title, amount, currency, stage, notes, created_at, updated_at';

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body;
}

function isMissingTableError(error) {
  if (!error) return false;
  return error.code === 'PGRST205' || /could not find the table/i.test(String(error.message || ''));
}

/* Amounts are stored as NUMERIC and validated on the server as well as in the
   browser: non-finite and negative values are rejected outright. Strings such as
   "₹1,20,000" are accepted and normalized to 120000; anything that cannot be
   parsed to a finite number >= 0 is rejected. */
function parseAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw || raw.includes('-')) return null;
  const digits = raw.replace(/[^0-9.]/g, '');
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : null;
}

function schemaNotReady(res) {
  return res.status(503).json({
    error: 'Deals storage is not enabled for this workspace yet. Run the deals migration (supabase/migrations/20261017120000_deals_and_appointments.sql) and retry.',
    code: 'SCHEMA_NOT_READY'
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const access = await requireOrgAccess(req, res, null);
  if (!access) return;
  const admin = createSupabaseAdminClient();
  if (!admin) return res.status(503).json({ error: 'Database service is unavailable.' });
  const query = req.query || {};
  const body = parseBody(req);

  if (req.method === 'GET') {
    const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 200, 1), 500);
    const { data, error } = await admin.from('deals')
      .select(DEAL_FIELDS)
      .eq('organization_id', access.organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      if (isMissingTableError(error)) return schemaNotReady(res);
      console.error('[deals] list:', error.message);
      return res.status(500).json({ error: 'Could not load deals.' });
    }
    return res.status(200).json({ success: true, deals: data || [] });
  }

  if (req.method === 'POST') {
    const title = String(body.title || body.name || '').trim();
    const amount = parseAmount(body.amount);
    const stage = String(body.stage || 'New').trim();
    const leadId = String(body.lead_id || body.leadId || '').trim() || null;
    const customerName = String(body.customer_name || body.customer || '').trim() || null;
    const notes = String(body.notes || '').trim() || null;

    if (!title) return res.status(400).json({ error: 'Deal name is required.' });
    if (amount === null) return res.status(400).json({ error: 'Enter a valid deal amount: zero or a positive number.' });
    if (amount < 0) return res.status(400).json({ error: 'Deal amount cannot be negative.' });
    if (!DEAL_STAGES.has(stage)) return res.status(400).json({ error: 'Invalid deal stage.' });

    try {
      if (leadId) {
        const { data: lead } = await admin.from('leads').select('id').eq('id', leadId).eq('organization_id', access.organizationId).maybeSingle();
        if (!lead) return res.status(404).json({ error: 'Linked lead was not found in your organization.' });
      }
      const row = { organization_id: access.organizationId, title, amount, stage, lead_id: leadId, customer_name: customerName, notes };
      const { data, error } = await admin.from('deals').insert(row).select(DEAL_FIELDS).single();
      if (error) {
        if (isMissingTableError(error)) return schemaNotReady(res);
        console.error('[deals] create:', error.message);
        return res.status(500).json({ error: 'Could not create deal.' });
      }
      return res.status(201).json({ success: true, deal: data });
    } catch (error) {
      console.error('[deals] create:', error.message);
      return res.status(500).json({ error: 'Could not create deal.' });
    }
  }

  if (req.method === 'PATCH') {
    const id = String(query.id || body.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Deal id is required.' });
    const updates = { updated_at: new Date().toISOString() };

    if ('title' in body || 'name' in body) {
      updates.title = String(body.title || body.name || '').trim();
      if (!updates.title) return res.status(400).json({ error: 'Deal name is required.' });
    }
    if ('amount' in body) {
      const amount = parseAmount(body.amount);
      if (amount === null || amount < 0) return res.status(400).json({ error: 'Enter a valid deal amount: zero or a positive number.' });
      updates.amount = amount;
    }
    if ('stage' in body) {
      const stage = String(body.stage || '').trim();
      if (!DEAL_STAGES.has(stage)) return res.status(400).json({ error: 'Invalid deal stage.' });
      updates.stage = stage;
    }
    if ('customer_name' in body || 'customer' in body) updates.customer_name = String(body.customer_name || body.customer || '').trim() || null;
    if ('notes' in body) updates.notes = String(body.notes || '').trim() || null;
    if ('lead_id' in body || 'leadId' in body) updates.lead_id = String(body.lead_id || body.leadId || '').trim() || null;

    const { data, error } = await admin.from('deals')
      .update(updates).eq('id', id).eq('organization_id', access.organizationId).select(DEAL_FIELDS).maybeSingle();
    if (error) {
      if (isMissingTableError(error)) return schemaNotReady(res);
      console.error('[deals] update:', error.message);
      return res.status(500).json({ error: 'Could not update deal.' });
    }
    if (!data) return res.status(404).json({ error: 'Deal not found.' });
    return res.status(200).json({ success: true, deal: data });
  }

  if (req.method === 'DELETE') {
    const id = String(query.id || body.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Deal id is required.' });
    const { data, error } = await admin.from('deals')
      .delete().eq('id', id).eq('organization_id', access.organizationId).select('id').maybeSingle();
    if (error) {
      if (isMissingTableError(error)) return schemaNotReady(res);
      console.error('[deals] delete:', error.message);
      return res.status(500).json({ error: 'Could not delete deal.' });
    }
    if (!data) return res.status(404).json({ error: 'Deal not found.' });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
