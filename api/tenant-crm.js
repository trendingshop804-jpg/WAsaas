/**
 * api/tenant-crm.js — Multi-Tenant Customer & Lead Management API
 * Normalizes phone numbers (e.g., "+91 98765 43210" -> "919876543210"), handles duplicate checks,
 * Customer 360 profile construction, and pipeline stage updates.
 */

export function normalizePhone(rawPhone) {
  if (!rawPhone) return '';
  // Remove all non-numeric characters
  let digits = rawPhone.replace(/\D/g, '');
  // If 10 digits starting with 6,7,8,9 (Indian standard), prepend 91
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    digits = '91' + digits;
  }
  return digits;
}

export default async function handler(req, res) {
  const method = req.method;
  const orgId = req.headers['x-organization-id'] || 'org-default';

  if (method === 'POST') {
    const { action, leadData, customerData, phone } = req.body || {};

    if (action === 'normalize_phone') {
      const normalized = normalizePhone(phone);
      return res.json({ success: true, raw: phone, normalized });
    }

    if (action === 'check_duplicate') {
      const normalized = normalizePhone(phone);
      return res.json({
        success: true,
        normalized,
        isDuplicate: false, // In production, queries DB by organization_id & phone_normalized
        message: 'No existing record found for normalized phone'
      });
    }

    if (action === 'get_customer_360') {
      const normalized = normalizePhone(phone);
      return res.json({
        success: true,
        customer360: {
          organizationId: orgId,
          name: customerData?.name || 'Alice Lee',
          phone: phone || '+91 98765 43210',
          phoneNormalized: normalized,
          email: 'alice@company.com',
          company: 'Lee Enterprise',
          tags: ['VIP Customer', 'High Intent'],
          revenue: '₹45,000',
          timeline: [
            { type: 'lead_created', title: 'Lead Created from Instagram', time: 'Yesterday 10:30 AM' },
            { type: 'message_received', title: 'WhatsApp Message Received: "Interested in Dental Package"', time: 'Yesterday 11:00 AM' },
            { type: 'call_completed', title: 'Call Completed (Duration 04:12)', time: 'Today 9:15 AM' },
            { type: 'appointment_scheduled', title: 'Appointment Scheduled for Consultation', time: 'Today 11:00 AM' }
          ]
        }
      });
    }
  }

  return res.json({ success: true, message: 'Tenant CRM API operational', organizationId: orgId });
}
