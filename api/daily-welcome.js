import { authorizeCron, hasRequiredConfig, isUsablePhone, sendTemplate, supabase, updateLead } from './_lead-followups.js';

export default async function handler(req, res) {
  if (!authorizeCron(req, res) || !hasRequiredConfig(res)) return;
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const { data: leads, error } = await supabase.from('leads').select('id, phone').eq('status', 'NEW').eq('opted_out', false);
    if (error) throw new Error(`Lead query failed: ${error.message}`);
    let sent = 0; let failed = 0;
    for (const lead of leads || []) {
      if (!isUsablePhone(lead.phone)) { console.warn(`Skipping lead ${lead.id}: invalid phone number`); failed++; continue; }
      try {
        await sendTemplate(lead.phone.replace(/[^0-9]/g, ''), 'welcome_message');
        const now = Date.now();
        await updateLead(lead.id, { status: 'CONTACTED', last_contacted_at: new Date(now).toISOString(), followup_count: 0, next_followup_at: new Date(now + 2 * 86400000).toISOString() });
        sent++;
      } catch (err) { failed++; console.error(`Welcome message failed for lead ${lead.id}:`, err.message); }
    }
    return res.status(200).json({ processed: leads?.length || 0, sent, failed });
  } catch (err) {
    console.error('Daily welcome failed:', err);
    return res.status(500).json({ error: err.message });
  }
}