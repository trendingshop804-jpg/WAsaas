import {
  authorizeCron,
  hasRequiredConfig,
  isUsablePhone,
  normalizeInternationalPhone,
  sendMetaWhatsAppTemplate,
  claimDueLead,
  releaseLeadLock,
  supabase,
  updateLeadState,
  logAutomationEvent,
} from './_lead-followups.js';

// Each cron execution gets a unique run ID for log correlation
function makeRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default async function handler(req, res) {
  // ── 1. Authorization check ───────────────────────────────────────────────
  if (!authorizeCron(req, res)) return;
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ── 2. Configuration check ───────────────────────────────────────────────
  // Returns a descriptive error (without exposing secrets) if env vars are missing.
  if (!hasRequiredConfig()) {
    return res.status(200).json({
      status:  'Skipped',
      message: 'WhatsApp integration is not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in Vercel → Settings → Environment Variables.'
    });
  }

  const action = (req.query.action || req.query.type || '').toLowerCase();
  if (action === 'welcome') {
    try {
      const { data: leads, error } = await supabase.from('leads').select('id, phone').eq('status', 'NEW').eq('opted_out', false);
      if (error) throw new Error(`Lead query failed: ${error.message}`);
      let sent = 0; let failed = 0;
      for (const lead of leads || []) {
        if (!isUsablePhone(lead.phone)) { console.warn(`Skipping lead ${lead.id}: invalid phone number`); failed++; continue; }
        try {
          await sendMetaWhatsAppTemplate({ to: lead.phone, templateName: 'welcome_message', languageCode: 'en' });
          const now = Date.now();
          await updateLeadState(lead.id, { status: 'CONTACTED', last_contacted_at: new Date(now).toISOString(), followup_count: 0, next_followup_at: new Date(now + 2 * 86400000).toISOString() });
          sent++;
        } catch (err) { failed++; console.error(`Welcome message failed for lead ${lead.id}:`, err.message); }
      }
      return res.status(200).json({ processed: leads?.length || 0, sent, failed });
    } catch (err) {
      console.error('Daily welcome failed:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  const runId = makeRunId();
  await logAutomationEvent(runId, 'execution_started', null, `Cron run started at ${new Date().toISOString()}`);

  try {
    // ── 3. Release any stale locks from prior crashed runs ───────────────
    // Leads locked for >10 minutes are assumed to have crashed — unlock them.
    if (supabase) {
      const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: staleLeads } = await supabase
        .from('leads')
        .update({ is_locked_for_sending: false, locked_at: null })
        .eq('is_locked_for_sending', true)
        .lt('locked_at', staleThreshold)
        .select('id');

      if (staleLeads?.length) {
        await logAutomationEvent(runId, 'stale_locks_released', null, `Released ${staleLeads.length} stale lock(s)`);
      }
    }

    // ── 4. Query due follow-up leads ─────────────────────────────────────
    // Conditions:
    //   - follow_up_enabled = true
    //   - follow_up_status is NOT Paused or Completed
    //   - status is NOT REPLIED (customer already responded)
    //   - opted_out = false
    //   - next_followup_at is in the past (or now)
    const nowIso = new Date().toISOString();

    let leads = [];
    if (supabase) {
      const { data: dbLeads, error: queryError } = await supabase
        .from('leads')
        .select('*')
        .eq('follow_up_enabled', true)
        .not('follow_up_status', 'in', '("Paused","Completed")')
        .not('status', 'in', '("REPLIED","replied","Replied","Won","Lost")')
        .eq('opted_out', false)
        .lte('next_followup_at', nowIso)
        .order('next_followup_at', { ascending: true })
        .limit(50);

      if (queryError) {
        await logAutomationEvent(runId, 'query_failed', null, `DB query warning: ${queryError.message}`);
      } else if (dbLeads?.length) {
        leads = dbLeads;
      }
    }

    if (leads.length === 0 && Array.isArray(req.body?.leads)) {
      leads = req.body.leads.filter(l => {
        if (!l || l.opted_out || l.follow_up_enabled === false) return false;
        if (['Paused', 'Completed'].includes(l.follow_up_status)) return false;
        if (['REPLIED', 'replied', 'Replied', 'Won', 'Lost'].includes(l.status)) return false;
        if (!l.next_followup_at || !l.nextFollowupDate) return true;
        const due = l.next_followup_at || l.nextFollowupDate;
        return new Date(due) <= new Date();
      }).slice(0, 50);
    }

    const leadCount = (leads || []).length;
    await logAutomationEvent(runId, 'due_followups_found', null, `Found ${leadCount} due lead(s)`);

    if (leadCount === 0) {
      return res.status(200).json({
        status:    'Success',
        runId,
        processed: 0,
        sent:      0,
        failed:    0,
        paused:    0,
        completed: 0,
        message:   'No due follow-ups found.'
      });
    }

    let processed = 0;
    let sent      = 0;
    let failed    = 0;
    let paused    = 0;
    let completed = 0;

    for (const lead of leads) {
      processed++;

      // ── 5. Acquire duplicate-send lock ─────────────────────────────────
      const locked = await claimDueLead(lead.id);
      if (!locked) {
        await logAutomationEvent(runId, 'lead_skipped', lead.id, 'Already locked by another process');
        continue;
      }

      await logAutomationEvent(runId, 'lead_claimed', lead.id, `Processing ${lead.contact_name || lead.name || lead.id}`);

      try {
        // ── 6. Re-validate state (may have changed after lock acquired) ──
        const { data: freshLead } = await supabase
          .from('leads')
          .select('opted_out, status, follow_up_status, follow_up_enabled')
          .eq('id', lead.id)
          .single();

        if (
          freshLead?.opted_out ||
          ['REPLIED','replied','Replied'].includes(freshLead?.status) ||
          freshLead?.follow_up_status === 'Paused' ||
          !freshLead?.follow_up_enabled
        ) {
          await updateLeadState(lead.id, { follow_up_status: 'Paused' });
          await logAutomationEvent(runId, 'lead_skipped', lead.id, 'Paused: opted out, replied, or automation disabled');
          paused++;
          continue;
        }

        // ── 7. Validate phone number ────────────────────────────────────
        if (!isUsablePhone(lead.phone)) {
          const errMsg = 'Valid WhatsApp phone number is required (must be 10–15 digits with country code).';
          await updateLeadState(lead.id, {
            follow_up_status: 'Failed',
            notes: (lead.notes ? lead.notes + '\n' : '') + `[${new Date().toLocaleDateString()}] ${errMsg}`
          });
          await logAutomationEvent(runId, 'message_failed', lead.id, `Invalid phone: ${lead.phone || 'empty'}`);
          failed++;
          continue;
        }

        // ── 8. Determine template and parameters ────────────────────────
        const currentStage   = lead.follow_up_stage  || 'First Follow-up';
        const templateName   = lead.default_template  || 'followup_message';
        const languageCode   = lead.template_language || 'en';
        const contactName    = lead.contact_name || lead.name || 'there';
        const company        = lead.company_name || lead.company || '';
        const service        = lead.interested_in || lead.industry || 'automation solution';

        await logAutomationEvent(runId, 'message_attempted', lead.id,
          `Template: "${templateName}" | Stage: ${currentStage} | Phone: ...${String(lead.phone).slice(-4)}`
        );

        // ── 9. Call the REAL Meta WhatsApp Cloud API ────────────────────
        let metaRes;
        try {
          metaRes = await sendMetaWhatsAppTemplate({
            to:           lead.phone,
            templateName,
            languageCode,
            parameters:   [contactName, service, company],
          });
        } catch (metaErr) {
          // Log Meta error details (safe — no secrets in metaErr.message)
          await logAutomationEvent(runId, 'message_failed', lead.id, metaErr.message);
          await updateLeadState(lead.id, {
            follow_up_status: 'Failed',
            notes: (lead.notes ? lead.notes + '\n' : '') + `[${new Date().toLocaleDateString()}] Meta API Error: ${metaErr.message}`
          });

          // Record the failed attempt in message history
          if (supabase) {
            await supabase.from('follow_up_messages').insert({
              lead_id:              lead.id,
              user_id:              lead.user_id || null,
              message:              `Failed to send ${currentStage} template "${templateName}" to ...${String(lead.phone).slice(-4)}`,
              direction:            'outbound',
              channel:              'WhatsApp',
              template_name:        templateName,
              status:               'Failed',
              whatsapp_message_id:  null,
              error_message:        metaErr.message,
              sent_at:              null,
              created_at:           new Date().toISOString(),
            });
          }

          failed++;
          continue; // Move to next lead — do NOT update schedule
        }

        // ── 10. Meta accepted the message — record it as SENT ───────────
        const waMsgId  = metaRes.whatsappMessageId; // Real ID from Meta — never fake
        const sentIso  = new Date().toISOString();

        await logAutomationEvent(runId, 'meta_response_received', lead.id,
          `Meta message ID received for lead ${lead.id}`
        );

        // Record in follow_up_messages history
        await supabase.from('follow_up_messages').insert({
          lead_id:             lead.id,
          user_id:             lead.user_id || null,
          message:             `Sent ${currentStage} template "${templateName}" to ...${String(lead.phone).slice(-4)}`,
          direction:           'outbound',
          channel:             'WhatsApp',
          template_name:       templateName,
          status:              'Sent',
          whatsapp_message_id: waMsgId,
          error_message:       null,
          sent_at:             sentIso,
          created_at:          sentIso,
        });

        // Mirror to messages table for CRM conversation view
        await supabase.from('messages').insert({
          organization_id: lead.organization_id,
          wa_message_id:  waMsgId,
          sender_number:  normalizeInternationalPhone(lead.phone),
          sender:         'system',
          body:           `Sent ${currentStage} template "${templateName}"`,
          message_body:   `Sent ${currentStage} template "${templateName}"`,
          content:        `Sent ${currentStage} template "${templateName}"`,
          message_type:   'template',
          direction:      'outbound',
          status:         'sent',
          received_at:    sentIso,
          created_at:     sentIso,
        }).then(({ error }) => {
          if (error) console.warn('[daily-followup] messages table mirror failed:', error.message);
        });

        await logAutomationEvent(runId, 'message_sent', lead.id,
          `Stage: ${currentStage} | Msg ID: ...${waMsgId.slice(-8)}`
        );

        // ── 11. Calculate next follow-up stage and schedule ─────────────
        const now = Date.now();
        let nextStage  = 'Second Follow-up';
        let nextDateIso = new Date(now + 3 * 86400000).toISOString(); // +3 days
        let nextStatus  = 'Scheduled';

        if (currentStage === 'Second Follow-up') {
          nextStage   = 'Final Follow-up';
          nextDateIso = new Date(now + 7 * 86400000).toISOString(); // +7 days
          nextStatus  = 'Scheduled';
        } else if (currentStage === 'Final Follow-up') {
          nextStage   = 'Completed';
          nextDateIso = null;
          nextStatus  = 'Completed';
          completed++;
        }

        // ── 12. Save updated lead state (only after successful send) ────
        await updateLeadState(lead.id, {
          last_follow_up_sent_at: sentIso,
          last_contacted_at:      sentIso,
          follow_up_stage:        nextStage,
          next_followup_at:       nextDateIso,
          follow_up_status:       nextStatus,
          status:                 nextStatus === 'Completed' ? 'Completed' : 'CONTACTED',
          followup_count:         Number(lead.followup_count || 0) + 1,
        });

        sent++;

      } catch (leadErr) {
        // Catch unexpected errors per-lead — do not crash the entire run
        failed++;
        console.error(`[daily-followup] Unexpected error for lead ${lead.id}:`, leadErr.message);
        await logAutomationEvent(runId, 'message_failed', lead.id, `Unexpected error: ${leadErr.message}`);
        await updateLeadState(lead.id, {
          follow_up_status: 'Failed',
          notes: (lead.notes ? lead.notes + '\n' : '') + `[${new Date().toLocaleDateString()}] Scheduler error: ${leadErr.message}`,
        }).catch(() => {});

      } finally {
        // Always release the lock — even on error
        await releaseLeadLock(lead.id);
      }
    }

    await logAutomationEvent(runId, 'execution_complete', null,
      `processed=${processed} sent=${sent} failed=${failed} paused=${paused} completed=${completed}`
    );

    return res.status(200).json({
      status:    'Success',
      runId,
      processed,
      sent,
      failed,
      paused,
      completed,
    });

  } catch (err) {
    console.error('[daily-followup] Scheduler run error:', err.message);
    await logAutomationEvent(runId, 'execution_failed', null, err.message);
    return res.status(500).json({ error: err.message, runId });
  }
}