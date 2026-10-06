import { createSupabaseAdminClient, requireOrgAccess } from './_supabase.js';

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const access = await requireOrgAccess(req, res, null);
  if (!access) return;

  const admin = createSupabaseAdminClient();
  if (!admin) return res.status(503).json({ error: 'Database service is currently unavailable.' });

  const query = req.query || {};

  // GET /api/leads - Query/List leads
  if (req.method === 'GET') {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 500);
    const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
    const status = query.status ? String(query.status).trim() : null;
    const search = query.search ? String(query.search).trim() : null;

    let dbQuery = admin
      .from('leads')
      .select('id, contact_name, company_name, phone, email, status, score, source, custom_fields, notes, created_at, updated_at', { count: 'exact' })
      .eq('organization_id', access.organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) dbQuery = dbQuery.eq('status', status);
    if (search) {
      dbQuery = dbQuery.or(`contact_name.ilike.%${search}%,company_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: leads, error, count } = await dbQuery;
    if (error) {
      console.error('[leads api] list failed:', error.message);
      return res.status(500).json({ error: 'Could not load leads.', details: error.message });
    }

    return res.status(200).json({
      success: true,
      total: count,
      limit,
      offset,
      leads: leads || []
    });
  }

  const body = parseBody(req);

  // POST /api/leads - Create lead (from Webhook, CRM, Zapier, Make, or API Key)
  if (req.method === 'POST') {
    const contactName = String(body.contactName || body.contact_name || body.name || '').trim();
    const phone = String(body.phone || body.phoneNumber || body.phone_number || '').trim();
    const email = String(body.email || '').trim().toLowerCase() || null;
    const companyName = String(body.companyName || body.company_name || body.company || '').trim() || null;
    const status = String(body.status || 'New').trim();
    const score = parseInt(body.score, 10) || 50;
    const source = String(body.source || (access.isApiKey ? `API (${access.apiKeyName || 'External'})` : 'Manual API')).trim();
    const notes = String(body.notes || '').trim() || null;
    const customFields = typeof body.customFields === 'object' && body.customFields !== null ? body.customFields : {};

    if (!contactName && !phone && !email) {
      return res.status(400).json({ error: 'At least a name, phone number, or email address is required.' });
    }

    const row = {
      organization_id: access.organizationId,
      contact_name: contactName || 'Unknown Lead',
      company_name: companyName,
      phone: phone || null,
      email: email,
      status: status,
      score: score,
      source: source,
      custom_fields: customFields,
      notes: notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: inserted, error } = await admin
      .from('leads')
      .insert(row)
      .select('id, contact_name, company_name, phone, email, status, score, source, custom_fields, notes, created_at')
      .single();

    if (error) {
      console.error('[leads api] insert failed:', error.message);
      return res.status(500).json({ error: 'Could not create lead.', details: error.message });
    }

    return res.status(201).json({
      success: true,
      message: 'Lead created successfully.',
      lead: inserted
    });
  }

  // PUT / PATCH /api/leads - Update lead
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const leadId = String(query.id || body.id || '').trim();
    if (!leadId) return res.status(400).json({ error: 'Lead id is required.' });

    const updates = { updated_at: new Date().toISOString() };
    if (body.contactName !== undefined || body.contact_name !== undefined || body.name !== undefined) {
      updates.contact_name = String(body.contactName || body.contact_name || body.name || '').trim();
    }
    if (body.companyName !== undefined || body.company_name !== undefined || body.company !== undefined) {
      updates.company_name = String(body.companyName || body.company_name || body.company || '').trim() || null;
    }
    if (body.phone !== undefined || body.phoneNumber !== undefined) {
      updates.phone = String(body.phone || body.phoneNumber || '').trim() || null;
    }
    if (body.email !== undefined) {
      updates.email = String(body.email || '').trim().toLowerCase() || null;
    }
    if (body.status !== undefined) {
      updates.status = String(body.status).trim();
    }
    if (body.score !== undefined) {
      updates.score = parseInt(body.score, 10) || 0;
    }
    if (body.notes !== undefined) {
      updates.notes = String(body.notes || '').trim() || null;
    }
    if (body.customFields !== undefined && typeof body.customFields === 'object') {
      updates.custom_fields = body.customFields;
    }

    const { data: updated, error } = await admin
      .from('leads')
      .update(updates)
      .eq('id', leadId)
      .eq('organization_id', access.organizationId)
      .select('id, contact_name, company_name, phone, email, status, score, source, custom_fields, notes, updated_at')
      .single();

    if (error) {
      console.error('[leads api] update failed:', error.message);
      return res.status(500).json({ error: 'Could not update lead.', details: error.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Lead updated successfully.',
      lead: updated
    });
  }

  // DELETE /api/leads - Delete lead
  if (req.method === 'DELETE') {
    const leadId = String(query.id || body.id || '').trim();
    if (!leadId) return res.status(400).json({ error: 'Lead id is required.' });

    const { error } = await admin
      .from('leads')
      .delete()
      .eq('id', leadId)
      .eq('organization_id', access.organizationId);

    if (error) {
      console.error('[leads api] delete failed:', error.message);
      return res.status(500).json({ error: 'Could not delete lead.', details: error.message });
    }

    return res.status(200).json({ success: true, message: 'Lead deleted.' });
  }

  res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  return res.status(405).json({ error: 'Method Not Allowed' });
}
