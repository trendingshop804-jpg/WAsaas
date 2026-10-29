import { createSupabaseAdminClient, requireOrgAccess } from './_supabase.js';

/* Org-scoped appointments storage.
   Appointments used to be appended to window.NB only, so the calendar looked
   populated until a refresh wiped it. Every write here is confirmed by the
   database before the caller reports success; when the appointments table is
   missing (migration not applied) the route answers 503 SCHEMA_NOT_READY so the
   UI can show an error instead of a fake confirmation. */

const APPOINTMENT_FIELDS = 'id, organization_id, title, customer_name, starts_at, ends_at, assigned_agent_id, notes, created_at, updated_at';

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body;
}

function isMissingTableError(error) {
  if (!error) return false;
  return error.code === 'PGRST205' || /could not find the table/i.test(String(error.message || ''));
}

function parseTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function schemaNotReady(res) {
  return res.status(503).json({
    error: 'Appointments storage is not enabled for this workspace yet. Run the appointments migration (supabase/migrations/20261017120000_deals_and_appointments.sql) and retry.',
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
    const { data, error } = await admin.from('appointments')
      .select(APPOINTMENT_FIELDS)
      .eq('organization_id', access.organizationId)
      .order('starts_at', { ascending: true })
      .limit(limit);
    if (error) {
      if (isMissingTableError(error)) return schemaNotReady(res);
      console.error('[appointments] list:', error.message);
      return res.status(500).json({ error: 'Could not load appointments.' });
    }
    return res.status(200).json({ success: true, appointments: data || [] });
  }

  if (req.method === 'POST') {
    const title = String(body.title || body.type || '').trim();
    const customerName = String(body.customer_name || body.customer || '').trim() || null;
    const startsAt = parseTimestamp(body.starts_at || body.startsAt || body.scheduled_at);
    const endsAt = parseTimestamp(body.ends_at || body.endsAt);
    const notes = String(body.notes || '').trim() || null;

    if (!title) return res.status(400).json({ error: 'Appointment title is required.' });
    if (!startsAt) return res.status(400).json({ error: 'A valid date and time is required for the appointment.' });
    if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) return res.status(400).json({ error: 'End time must be after the start time.' });

    try {
      const row = { organization_id: access.organizationId, title, customer_name: customerName, starts_at: startsAt, ends_at: endsAt, notes };
      const { data, error } = await admin.from('appointments').insert(row).select(APPOINTMENT_FIELDS).single();
      if (error) {
        if (isMissingTableError(error)) return schemaNotReady(res);
        console.error('[appointments] create:', error.message);
        return res.status(500).json({ error: 'Could not schedule appointment.' });
      }
      return res.status(201).json({ success: true, appointment: data });
    } catch (error) {
      console.error('[appointments] create:', error.message);
      return res.status(500).json({ error: 'Could not schedule appointment.' });
    }
  }

  if (req.method === 'PATCH') {
    const id = String(query.id || body.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Appointment id is required.' });
    const updates = { updated_at: new Date().toISOString() };

    if ('title' in body || 'type' in body) {
      updates.title = String(body.title || body.type || '').trim();
      if (!updates.title) return res.status(400).json({ error: 'Appointment title is required.' });
    }
    if ('starts_at' in body || 'startsAt' in body || 'scheduled_at' in body) {
      const startsAt = parseTimestamp(body.starts_at || body.startsAt || body.scheduled_at);
      if (!startsAt) return res.status(400).json({ error: 'A valid date and time is required for the appointment.' });
      updates.starts_at = startsAt;
    }
    if ('ends_at' in body || 'endsAt' in body) updates.ends_at = parseTimestamp(body.ends_at || body.endsAt);
    if ('customer_name' in body || 'customer' in body) updates.customer_name = String(body.customer_name || body.customer || '').trim() || null;
    if ('notes' in body) updates.notes = String(body.notes || '').trim() || null;

    const { data, error } = await admin.from('appointments')
      .update(updates).eq('id', id).eq('organization_id', access.organizationId).select(APPOINTMENT_FIELDS).maybeSingle();
    if (error) {
      if (isMissingTableError(error)) return schemaNotReady(res);
      console.error('[appointments] update:', error.message);
      return res.status(500).json({ error: 'Could not update appointment.' });
    }
    if (!data) return res.status(404).json({ error: 'Appointment not found.' });
    return res.status(200).json({ success: true, appointment: data });
  }

  if (req.method === 'DELETE') {
    const id = String(query.id || body.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Appointment id is required.' });
    const { data, error } = await admin.from('appointments')
      .delete().eq('id', id).eq('organization_id', access.organizationId).select('id').maybeSingle();
    if (error) {
      if (isMissingTableError(error)) return schemaNotReady(res);
      console.error('[appointments] delete:', error.message);
      return res.status(500).json({ error: 'Could not delete appointment.' });
    }
    if (!data) return res.status(404).json({ error: 'Appointment not found.' });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
