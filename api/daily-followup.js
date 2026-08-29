import { authorizeCron, hasRequiredConfig, isUsablePhone, sendTemplate, supabase, updateLead } from './_lead-followups.js';

const MAX_FOLLOWUPS = 3;

export default async function handler(req, res) {
  if (!authorizeCron(req, res) || !hasRequiredConfig(res)) return;
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const { data: leads, error } = await supabase.from('leads').select('id, phone, followup_count').eq('status', 'CONTACTED').eq('opted_out', false).lte('next_followup_at', new Date().toISOString());
    if (error) throw new Error(`Lead query failed: ${error.message}`);
    let sent = 0; let markedCold = 0; let failed = 0;
    for (const lead of leads || []) {
      const count = Number(lead.followup_count || 0);
      try {
        if (count >= MAX_FOLLOWUPS) { await updateLead(lead.id, { status: 'COLD', next_followup_at: null }); markedCold++; continue; }
        if (!isUsablePhone(lead.phone)) throw new Error('Invalid phone number');
        await sendTemplate(lead.phone.replace(/[^0-9]/g, ''), 'followup_message');
        const nextCount = count + 1; const now = Date.now();
        await updateLead(lead.id, {
          followup_count: nextCount, last_contacted_at: new Date(now).toISOString(),
          next_followup_at: nextCount >= MAX_FOLLOWUPS ? null : new Date(now + 2 * 86400000).toISOString(),
          status: nextCount >= MAX_FOLLOWUPS ? 'COLD' : 'CONTACTED',
        });
        sent++; if (nextCount >= MAX_FOLLOWUPS) markedCold++;
      } catch (err) { failed++; console.error(`Follow-up failed for lead ${lead.id}:`, err.message); }
    }
    return res.status(200).json({ processed: leads?.length || 0, sent, markedCold, failed });
  } catch (err) {
    console.error('Daily follow-up failed:', err);
    return res.status(500).json({ error: err.message });
  }
}