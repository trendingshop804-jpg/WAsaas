import {
  hasRequiredConfig,
  isUsablePhone,
  normalizeInternationalPhone,
  sendMetaWhatsAppTemplate,
  supabase,
  updateLeadState,
} from './_lead-followups.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ['https://yourdomain.com', 'https://app.yourdomain.com', 'http://localhost:3000']);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // 1. Verify server-side configuration (WHATSAPP_ACCESS_TOKEN & WHATSAPP_PHONE_NUMBER_ID)
  if (!hasRequiredConfig(res)) return;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    let { leadId, phone, direct_phone, templateName = 'hello_world', stage = 'Test Message', parameters = [] } = body;

    const targetPhone = phone || direct_phone;
    let lead = null;

    // 2. If leadId is supplied, lookup lead in database
    if (leadId && supabase) {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .maybeSingle();

      if (!error && data) {
        lead = data;
      }
    }

    // 3. If leadId is not supplied/found, but a phone number is given, search or create lead
    if (!lead && targetPhone && supabase) {
      const normPhone = normalizeInternationalPhone(targetPhone) || targetPhone.replace(/[^0-9+]/g, '');
      if (normPhone) {
        const last10 = normPhone.replace(/\D/g, '').slice(-10);
        if (last10) {
          const { data: searchData } = await supabase
            .from('leads')
            .select('*')
            .ilike('phone', `%${last10}`)
            .limit(1);

          if (searchData && searchData.length > 0) {
            lead = searchData[0];
            leadId = lead.id;
          } else {
            // Auto-create a test lead so leadId is valid and saved in DB
            const { data: createdLead, error: createErr } = await supabase
              .from('leads')
              .insert([{
                name: 'WhatsApp Test Contact',
                contact_name: 'WhatsApp Test Contact',
                phone: normPhone.startsWith('+') ? normPhone : `+${normPhone}`,
                source: 'WhatsApp Test',
                status: 'NEW',
                notes: 'Auto-created during WhatsApp API connection test',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }])
              .select('*')
              .single();

            if (!createErr && createdLead) {
              lead = createdLead;
              leadId = lead.id;
            }
          }
        }
      }
    }

    if (!lead) {
      return res.status(400).json({ error: 'Please select a valid lead or enter a valid phone number before testing WhatsApp.' });
    }

    if (!isUsablePhone(lead.phone)) {
      return res.status(400).json({ error: 'Valid WhatsApp phone number is required.' });
    }

    const contactName = lead.contact_name || lead.name || 'there';
    const company = lead.company_name || lead.company || '';
    const service = lead.interested_in || lead.industry || 'automation solution';
    const templateParams = parameters.length > 0 ? parameters : [contactName, service, company];

    // 4. Execute real Meta Cloud API call
    const metaRes = await sendMetaWhatsAppTemplate({
      to: lead.phone,
      templateName,
      languageCode: 'en',
      parameters: templateParams
    });

    const sentIso = new Date().toISOString();

    // 5. Log outbound message to follow_up_messages history table
    if (supabase) {
      await supabase.from('follow_up_messages').insert([{
        user_id: lead.user_id || null,
        lead_id: lead.id,
        message: `Outbound ${stage} template "${templateName}" sent to ${lead.phone}`,
        direction: 'outbound',
        channel: 'WhatsApp',
        template_name: templateName,
        status: 'Sent',
        whatsapp_message_id: metaRes.whatsappMessageId,
        sent_at: sentIso,
        created_at: sentIso
      }]);

      await updateLeadState(lead.id, {
        last_follow_up_sent_at: sentIso,
        last_contacted_at: sentIso,
        follow_up_status: 'Sent'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'WhatsApp message sent successfully via Meta Cloud API.',
      whatsappMessageId: metaRes.whatsappMessageId,
      leadId: lead.id
    });
  } catch (err) {
    console.error('[Send WhatsApp Follow-up Error]:', err.message);
    return res.status(500).json({
      error: `WhatsApp message could not be sent. ${err.message}`
    });
  }
}
