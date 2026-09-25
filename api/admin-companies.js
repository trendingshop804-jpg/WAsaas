/**
 * api/admin-companies.js — Master Admin Company & Tenant Management API
 * Controls companies, subscription statuses, plans, and feature flag overrides.
 */
import fs from 'fs';
import path from 'path';

// Mock in-memory/file storage for demo & local dev server persistence
const DB_FILE = path.join(process.cwd(), 'scratch', 'admin_companies.json');

function loadCompanies() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {}
  
  // Default demo companies
  return [
    {
      id: 'org-abc-dental',
      name: 'ABC Dental Clinic',
      owner: 'Dr. Anita Sharma',
      email: 'anita@abcdental.com',
      phone: '+91 98765 11111',
      businessType: 'Dental Clinic',
      plan: 'Professional',
      status: 'active',
      usersCount: 5,
      leadsCount: 1245,
      messagesCount: 8430,
      aiRequests: 320,
      storageGb: 3.4,
      products: { crm: true, whatsapp: true, instagram: true, calls: true, ai_assistant: true, payments: true },
      features: { lead_scoring: true, auto_reply: true, call_recording: true, automations: true },
      createdAt: '2026-01-15'
    },
    {
      id: 'org-xyz-garage',
      name: 'XYZ Car Service & Garage',
      owner: 'Vikram Singh',
      email: 'vikram@xyzgarage.com',
      phone: '+91 98765 22222',
      businessType: 'Garage',
      plan: 'Growth',
      status: 'active',
      usersCount: 3,
      leadsCount: 680,
      messagesCount: 4120,
      aiRequests: 180,
      storageGb: 1.8,
      products: { crm: true, whatsapp: true, instagram: false, calls: true, ai_assistant: true, payments: true },
      features: { lead_scoring: true, auto_reply: false, call_recording: false, automations: true },
      createdAt: '2026-02-01'
    },
    {
      id: 'org-glow-salon',
      name: 'Glow Beauty Salon',
      owner: 'Meera Kapoor',
      email: 'meera@glowsalon.com',
      phone: '+91 98765 33333',
      businessType: 'Salon',
      plan: 'Starter',
      status: 'trial',
      usersCount: 2,
      leadsCount: 290,
      messagesCount: 1450,
      aiRequests: 45,
      storageGb: 0.8,
      products: { crm: true, whatsapp: true, instagram: true, calls: false, ai_assistant: false, payments: false },
      features: { lead_scoring: false, auto_reply: false, call_recording: false, automations: false },
      createdAt: '2026-03-10'
    }
  ];
}

function saveCompanies(data) {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

export default async function handler(req, res) {
  const method = req.method;
  let companies = loadCompanies();

  if (method === 'GET') {
    return res.json({ success: true, companies });
  }

  if (method === 'POST') {
    const { action, companyId, updates, newCompany } = req.body || {};

    if (action === 'create') {
      const created = {
        id: `org-${Date.now()}`,
        name: newCompany.name || 'New Company',
        owner: newCompany.owner || 'Admin User',
        email: newCompany.email || 'admin@company.com',
        phone: newCompany.phone || '+91 90000 00000',
        businessType: newCompany.businessType || 'General',
        plan: newCompany.plan || 'Starter',
        status: 'active',
        usersCount: 1,
        leadsCount: 0,
        messagesCount: 0,
        aiRequests: 0,
        storageGb: 0.1,
        products: { crm: true, whatsapp: true, instagram: true, calls: true, ai_assistant: true, payments: true },
        features: { lead_scoring: true, auto_reply: true, call_recording: true, automations: true },
        createdAt: new Date().toISOString().split('T')[0]
      };
      companies.unshift(created);
      saveCompanies(companies);
      return res.json({ success: true, company: created, message: 'Company created successfully' });
    }

    if (action === 'update' && companyId) {
      const target = companies.find(c => c.id === companyId);
      if (!target) return res.status(404).json({ error: 'Company not found' });

      Object.assign(target, updates);
      saveCompanies(companies);
      return res.json({ success: true, company: target, message: 'Company updated successfully' });
    }

    if (action === 'toggle_status' && companyId) {
      const target = companies.find(c => c.id === companyId);
      if (!target) return res.status(404).json({ error: 'Company not found' });

      target.status = target.status === 'active' ? 'suspended' : 'active';
      saveCompanies(companies);
      return res.json({ success: true, company: target, message: `Company status changed to ${target.status}` });
    }

    if (action === 'toggle_product' && companyId) {
      const { productKey, enabled } = req.body;
      const target = companies.find(c => c.id === companyId);
      if (!target) return res.status(404).json({ error: 'Company not found' });

      target.products[productKey] = enabled;
      saveCompanies(companies);
      return res.json({ success: true, company: target, message: `Product ${productKey} set to ${enabled}` });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
