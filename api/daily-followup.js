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

// ---------------------------------------------------------------------------
// Master switch for AUTOMATIC (cron) runs.
// The cron stays scheduled but is a no-op until this is explicitly enabled,
// so enabling the schedule can never surprise anyone with a real send.
// Manual runs can still be forced with ?force=1 for testing.
// ---------------------------------------------------------------------------
function isAutoRunEnabled() {
  return String(process.env.FOLLOWUP_AUTOMATION_ENABLED || '').toLowerCase() === 'true';
}

// ---------------------------------------------------------------------------
// AI follow-up copy generation (OpenRouter).
// The AI only WRITES the text — the actual send still goes through an
// approved WhatsApp template, because Meta rejects free-form text outside the
// 24-hour customer service window.
// ---------------------------------------------------------------------------
async function generateAiFollowup({ contactName, company, service, stage, lastMessage }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const base = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const model = process.env.FOLLOWUP_AI_MODEL || 'openai/gpt-4o-mini';

  const prompt = [
    'You write short, friendly WhatsApp follow-up messages for a small business sales team.',
    `Write a follow-up message for the "${stage}" step.`,
    `Contact: ${contactName || 'there'}`,
    company ? `Company: ${company}` : '',
    service ? `They are interested in: ${service}` : '',
    lastMessage ? `Their last message was: "${String(lastMessage).slice(0, 200)}"` : '',
    '',
    'Rules:',
    '- Maximum 2 short sentences. No emojis. No markdown. No links unless asked.',
    '- Sound human and specific, not salesy. Do not invent facts.',
    '- Do not include a greeting like "Hello <name>" — it is added by the template.',
    '- Return ONLY the message text, nothing else.'
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://w-asaas.vercel.app',
        'X-Title': 'NextBright Follow-up'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 120
      })
    });

    if (!res.ok) {
      console.warn('[followup-ai] OpenRouter error', res.status);
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    // Guard against runaway model output.
    return text.replace(/\s+/g, ' ').slice(0, 320);
  } catch (err) {
    console.warn('[followup-ai] generation failed:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.query?.route === 'send-whatsapp-followup' || req.query?.action === 'send-followup') {
    const { default: sendFollowup } = await import('./_send-whatsapp-followup.js');
    return sendFollowup(req, res);
  }

  // ── 1. Authorization check ───────────────────────────────────────────────
  if (!(await authorizeCron(req, res))) return;
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

  // Automatic cron runs stay disabled until FOLLOWUP_AUTOMATION_ENABLED=true.
  // ?force=1 lets an operator run it manually without flipping the switch.
  const forced = String(req.query?.force || '') === '1';
  if (!isAutoRunEnabled() && !forced) {
    return res.status(200).json({
      status: 'Disabled',
      runId,
      processed: 0,
      sent: 0,
      failed: 0,
      message: 'Automatic follow-up is switched off. Set FOLLOWUP_AUTOMATION_ENABLED=true to enable, or call with ?force=1 to run once manually.'
    });
  }

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
        // A lead that has never been scheduled (NULL) is due immediately.
        // Without this, leads with no next_followup_at are never picked up.
        .or(`next_followup_at.is.null,next_followup_at.lte.${nowIso}`)
        .order('next_followup_at', { ascending: true, nullsFirst: true })
        .limit(50);

      if (queryError) {
        await logAutomationEvent(runId, 'query_failed', null, `DB query warning: ${queryError.message}`);
      } else if (dbLeads?.length) {
        leads = dbLeads;
      }
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
        const templateName   = lead.default_template
          || process.env.FOLLOWUP_TEMPLATE_NAME
          || 'followup_message';
        const languageCode   = lead.template_language
          || process.env.FOLLOWUP_TEMPLATE_LANGUAGE
          || 'en';
        const contactName    = lead.contact_name || lead.name || 'there';
        const company        = lead.company_name || lead.company || '';
        const service        = lead.interested_in || lead.industry || 'automation solution';

        await logAutomationEvent(runId, 'message_attempted', lead.id,
          `Template: "${templateName}" | Stage: ${currentStage} | Phone: ...${String(lead.phone).slice(-4)}`
        );

        // ── 9. Call the REAL Meta WhatsApp Cloud API ────────────────────
        // The AI writes the copy; the approved template is what actually
        // sends it. If AI is unavailable we fall back to the lead's template
        // parameters so a follow-up is never silently lost.
        const aiText = await generateAiFollowup({
          contactName, company, service, stage: currentStage
        });
        if (aiText) {
          await logAutomationEvent(runId, 'ai_copy_generated', lead.id, aiText.slice(0, 180));
        }

        const templateParams = aiText
          ? [contactName, company || service, aiText]
          : [contactName, service, company];

        let metaRes;
        try {
          metaRes = await sendMetaWhatsAppTemplate({
            to:           lead.phone,
            templateName,
            languageCode,
            parameters:   templateParams,
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

        // Mirror to messages table for CRM conversation view.
        // The API inbox is tenant-scoped, so this row must carry organization_id
        // or the sent follow-up would be invisible to the organization that owns
        // it. Pre-migration the column does not exist yet, so fall back to the
        // legacy shape instead of failing the whole insert.
        const mirrorRow = {
          organization_id: lead.organization_id || null,
          wa_message_id:  waMsgId,
          sender_number:  normalizeInternationalPhone(lead.phone),
          sender:         'system',
          body:           `Sent ${currentStage} template "${templateName}"`,
          message_body:   `Sent ${currentStage} template "${templateName}"`,
          content:        aiText || `Sent ${currentStage} template "${templateName}"`,
          message_type:   'template',
          direction:      'outbound',
          status:         'sent',
          received_at:    sentIso,
          created_at:     sentIso,
        };

        let mirror = await supabase.from('messages').insert(mirrorRow);
        if (mirror.error && /organization_id|column|schema cache|42703|PGRST204/i.test(mirror.error.message || '')) {
          const { organization_id, ...legacyRow } = mirrorRow;
          mirror = await supabase.from('messages').insert(legacyRow);
        }
        if (mirror.error) {
          console.warn('[daily-followup] messages table mirror failed:', mirror.error.message);
        }

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