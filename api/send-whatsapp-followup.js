import {
  hasRequiredConfig,
  isUsablePhone,
  sendMetaWhatsAppTemplate,
  supabase,
  updateLeadState,
} from './_lead-followups.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (!hasRequiredConfig(res)) return;

  try {
    const { leadId, templateName = 'followup_message', stage = 'Test Message', parameters = [] } = req.body || {};

    if (!leadId) {
      return res.status(400).json({ error: 'leadId is required.' });
    }

    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadErr || !lead) {
      return res.status(404).json({ error: 'Lead not found in database.' });
    }

    if (!isUsablePhone(lead.phone)) {
      return res.status(400).json({ error: 'Valid WhatsApp phone number is required.' });
    }

    const contactName = lead.contact_name || lead.name || 'there';
    const company = lead.company_name || lead.company || '';
    const service = lead.interested_in || lead.industry || 'automation solution';
    const templateParams = parameters.length > 0 ? parameters : [contactName, service, company];

    // Execute real Meta Cloud API call
    const metaRes = await sendMetaWhatsAppTemplate({
      to: lead.phone,
      templateName,
      languageCode: 'en',
      parameters: templateParams
    });

    const sentIso = new Date().toISOString();

    // Log to history
    await supabase.from('follow_up_messages').insert({
      user_id: lead.user_id,
      lead_id: lead.id,
      message: `Outbound ${stage} template "${templateName}" sent to ${lead.phone}`,
      direction: 'outbound',
      channel: 'WhatsApp',
      template_name: templateName,
      status: 'Sent',
      whatsapp_message_id: metaRes.whatsappMessageId,
      sent_at: sentIso,
      created_at: sentIso
    });

    await updateLeadState(lead.id, {
      last_follow_up_sent_at: sentIso,
      last_contacted_at: sentIso,
      follow_up_status: 'Sent'
    });

    return res.status(200).json({
      success: true,
      message: 'WhatsApp message sent successfully via Meta Cloud API.',
      whatsappMessageId: metaRes.whatsappMessageId
    });
  } catch (err) {
    console.error('[Send WhatsApp Follow-up Error]:', err.message);
    return res.status(500).json({
      error: `WhatsApp message could not be sent. ${err.message}`
    });
  }
}
