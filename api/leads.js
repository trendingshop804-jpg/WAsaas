import { createSupabaseAdminClient, requireOrgAccess } from './_supabase.js';

const LEAD_STATUSES = new Set(['New', 'Contacted', 'Replied', 'Qualified', 'Won', 'Lost']);
const LEAD_SOURCES = new Set(['Manual', 'WhatsApp', 'Import', 'API']);
function parseBody(req) { if (!req.body) return {}; if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } } return req.body; }
function normalizePhone(value) { const digits = String(value || '').replace(/\D/g, ''); return digits.length >= 7 && digits.length <= 15 ? digits : null; }
function cleanChoice(value, allowed, fallback) { const selected = String(value || fallback).trim(); return allowed.has(selected) ? selected : null; }
function fields() { return 'id, contact_name, company_name, phone, phone_normalized, email, status, score, source, assigned_agent_id, next_followup_at, custom_fields, notes, created_at, updated_at'; }
async function phoneExists(admin, organizationId, normalized, excludeId) { if (!normalized) return false; let q = admin.from('leads').select('id').eq('organization_id', organizationId).eq('phone_normalized', normalized).limit(1); if (excludeId) q = q.neq('id', excludeId); const { data, error } = await q; if (error) throw error; return Boolean(data?.length); }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const access = await requireOrgAccess(req, res, null); if (!access) return;
  const admin = createSupabaseAdminClient(); if (!admin) return res.status(503).json({ error: 'Database service is currently unavailable.' });
  const query = req.query || {};
  if (req.method === 'GET') {
    const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 50, 1), 200), offset = Math.max(Number.parseInt(query.offset, 10) || 0, 0);
    const status = query.status ? cleanChoice(query.status, LEAD_STATUSES) : null, source = query.source ? cleanChoice(query.source, LEAD_SOURCES) : null;
    if ((query.status && !status) || (query.source && !source)) return res.status(400).json({ error: 'Invalid lead status or source.' });
    const search = String(query.search || '').trim().replace(/[(),]/g, '');
    let request = admin.from('leads').select(fields(), { count: 'exact' }).eq('organization_id', access.organizationId).order('updated_at', { ascending: false }).range(offset, offset + limit - 1);
    if (status) request = request.eq('status', status); if (source) request = request.eq('source', source); if (search) request = request.or(`contact_name.ilike.%${search}%,company_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    const { data, error, count } = await request; if (error) return res.status(500).json({ error: 'Could not load leads.' }); return res.status(200).json({ success: true, total: count || 0, leads: data || [] });
  }
  const body = parseBody(req);
  if (req.method === 'POST') {
    const name = String(body.contactName || body.contact_name || body.name || '').trim(), phone = String(body.phone || body.phoneNumber || '').trim(), phoneNormalized = phone ? normalizePhone(phone) : null, email = String(body.email || '').trim().toLowerCase() || null;
    const status = cleanChoice(body.status, LEAD_STATUSES, 'New'), source = cleanChoice(body.source, LEAD_SOURCES, 'Manual');
    if (!name) return res.status(400).json({ error: 'Lead name is required.' }); if (phone && !phoneNormalized) return res.status(400).json({ error: 'Enter a valid phone number with 7–15 digits.' }); if (!phone && !email) return res.status(400).json({ error: 'A phone number or email address is required.' }); if (email && !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' }); if (!status || !source) return res.status(400).json({ error: 'Invalid lead status or source.' });
    try {
      if (await phoneExists(admin, access.organizationId, phoneNormalized)) return res.status(409).json({ error: 'A lead with this phone number already exists in your organization.', code: 'DUPLICATE_PHONE' });
      const row = { organization_id: access.organizationId, contact_name: name, company_name: String(body.companyName || body.company_name || body.company || '').trim() || null, phone: phone || null, phone_normalized: phoneNormalized, email, status, source, score: Number.parseInt(body.score, 10) || 0, assigned_agent_id: body.assignedAgentId || body.assigned_agent_id || null, next_followup_at: body.nextFollowUpAt || body.next_followup_at || null, notes: String(body.notes || '').trim() || null, custom_fields: typeof body.customFields === 'object' && body.customFields ? body.customFields : {} };
      const { data, error } = await admin.from('leads').insert(row).select(fields()).single(); if (error) { if (error.code === '23505') return res.status(409).json({ error: 'A lead with this phone number already exists in your organization.', code: 'DUPLICATE_PHONE' }); throw error; } return res.status(201).json({ success: true, lead: data });
    } catch (error) { console.error('[leads] create:', error.message); return res.status(500).json({ error: 'Could not create lead.' }); }
  }
  if (req.method === 'PATCH' || req.method === 'PUT') {
    const id = String(query.id || body.id || '').trim(); if (!id) return res.status(400).json({ error: 'Lead id is required.' }); const updates = { updated_at: new Date().toISOString() };
    if ('contactName' in body || 'contact_name' in body || 'name' in body) { updates.contact_name = String(body.contactName || body.contact_name || body.name || '').trim(); if (!updates.contact_name) return res.status(400).json({ error: 'Lead name is required.' }); }
    if ('phone' in body || 'phoneNumber' in body) { const phone = String(body.phone || body.phoneNumber || '').trim(), normalized = phone ? normalizePhone(phone) : null; if (phone && !normalized) return res.status(400).json({ error: 'Enter a valid phone number with 7–15 digits.' }); try { if (await phoneExists(admin, access.organizationId, normalized, id)) return res.status(409).json({ error: 'A lead with this phone number already exists in your organization.', code: 'DUPLICATE_PHONE' }); } catch { return res.status(500).json({ error: 'Could not validate phone number.' }); } updates.phone = phone || null; updates.phone_normalized = normalized; }
    if ('email' in body) { const email = String(body.email || '').trim().toLowerCase(); if (email && !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' }); updates.email = email || null; }
    if ('companyName' in body || 'company_name' in body || 'company' in body) updates.company_name = String(body.companyName || body.company_name || body.company || '').trim() || null;
    if ('status' in body) { const status = cleanChoice(body.status, LEAD_STATUSES); if (!status) return res.status(400).json({ error: 'Invalid lead status.' }); updates.status = status; }
    if ('source' in body) { const source = cleanChoice(body.source, LEAD_SOURCES); if (!source) return res.status(400).json({ error: 'Invalid lead source.' }); updates.source = source; }
    [['assignedAgentId','assigned_agent_id'],['assigned_agent_id','assigned_agent_id'],['nextFollowUpAt','next_followup_at'],['next_followup_at','next_followup_at'],['notes','notes']].forEach(([input,column]) => { if (input in body) updates[column] = body[input] || null; });
    const { data, error } = await admin.from('leads').update(updates).eq('id', id).eq('organization_id', access.organizationId).select(fields()).maybeSingle(); if (error) return res.status(500).json({ error: 'Could not update lead.' }); if (!data) return res.status(404).json({ error: 'Lead not found.' }); return res.status(200).json({ success: true, lead: data });
  }
  if (req.method === 'DELETE') { const id = String(query.id || body.id || '').trim(); if (!id) return res.status(400).json({ error: 'Lead id is required.' }); const { error } = await admin.from('leads').delete().eq('id', id).eq('organization_id', access.organizationId); if (error) return res.status(500).json({ error: 'Could not delete lead.' }); return res.status(200).json({ success: true }); }
  return res.status(405).json({ error: 'Method not allowed.' });
}
