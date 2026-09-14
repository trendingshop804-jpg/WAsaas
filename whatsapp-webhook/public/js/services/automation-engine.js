/* ==========================================================================
   NexusLead AI - Automation Engine & Background Workflow Runner
   ========================================================================== */

class AutomationEngine {
  constructor() {
    this.activeWorkers = [];
    this.queue = [];
    this.initHeartbeat();
  }

  initHeartbeat() {
    // Check queues & multi-day follow-up schedules every 10 seconds
    setInterval(() => {
      this.processBackgroundQueues();
      this.processMultiDayFollowupQueue();
    }, 10000);
  }

  processBackgroundQueues() {
    const org = window.appState.getCurrentOrg();
    if (org.isPaused) return; // Emergency kill-switch respected

    const campaigns = window.appState.get('campaigns') || [];
    campaigns.forEach(camp => {
      if (camp.status === 'Running' && camp.sentCount < camp.totalLeads) {
        // Send next message batch in queue
        const leads = (window.appState.get('leads') || []).filter(l => l.campaignId === camp.id && !l.lastContacted && !l.optedOut);
        if (leads.length > 0) {
          const lead = leads[0];
          const template = window.appState.get('templates').find(t => t.id === camp.templateId);
          const body = template ? template.body.replace('{{first_name}}', lead.contactName.split(' ')[0]).replace('{{company_name}}', lead.companyName).replace('{{location}}', lead.location) : 'Hello!';
          window.whatsappService.sendMessage({ leadId: lead.id, text: body, isAI: true }).catch(console.warn);
          camp.sentCount += 1;
          window.appState.saveState();
        }
      }
    });
  }

  // Multi-day automated lead nurturing scheduler (Day 1, Day 2, Day 4, Day 7)
  processMultiDayFollowupQueue() {
    const org = window.appState.getCurrentOrg();
    if (org.isPaused) return;

    const leads = window.appState.get('leads') || [];
    const now = Date.now();

    leads.forEach(async (lead) => {
      if (lead.optedOut || ['Replied', 'Won', 'Lost'].includes(lead.status)) return;

      const createdTime = new Date(lead.createdDate || lead.created_at || now).getTime();
      const elapsedDays = Math.floor((now - createdTime) / (1000 * 60 * 60 * 24));
      const lastStep = lead.lastFollowupStep || 0;

      let targetStep = 0;
      if (elapsedDays >= 7 && lastStep < 7) {
        targetStep = 7;
      } else if (elapsedDays >= 4 && lastStep < 4) {
        targetStep = 4;
      } else if (elapsedDays >= 2 && lastStep < 2) {
        targetStep = 2;
      } else if (elapsedDays >= 1 && lastStep < 1) {
        targetStep = 1;
      }

      if (targetStep > 0 && targetStep > lastStep) {
        lead.lastFollowupStep = targetStep;
        lead.lastContacted = new Date().toISOString();
        window.appState.saveState();

        const aiRes = await window.aiService.generateMultiDayFollowup({ lead, step: targetStep });
        const text = aiRes.message;

        if (text && org.whatsappConnected) {
          await window.whatsappService.sendMessage({ leadId: lead.id, text, isAI: true }).catch(console.warn);
        }

        window.appState.addAuditLog(
          `Day ${targetStep} Tanglish Follow-Up`,
          lead.contactName,
          `Sent Day ${targetStep} message to ${lead.phone}`,
          'Success'
        );
      }
    });
  }

  // Execute a workflow run for a specific lead or test
  async executeWorkflow(workflowId, leadId) {
    const org = window.appState.getCurrentOrg();
    if (org.isPaused) {
      throw new Error('Cannot execute workflow while automations are PAUSED.');
    }

    const workflow = window.appState.get('workflows').find(w => w.id === workflowId);
    if (!workflow) throw new Error('Workflow not found');

    const leadsList = window.appState.get('leads') || [];
    const lead = (leadId ? leadsList.find(l => l.id === leadId) : null)
      || leadsList[0]
      || {
        id: 'test_prospect_01',
        contactName: 'Sample Prospect',
        companyName: 'Test Business',
        phone: '+91 98765 43210',
        email: 'prospect@example.com',
        industry: 'Technology',
        location: 'Kochi, Kerala',
        score: 75,
        scoreCategory: 'warm'
      };

    const executionLog = [];
    executionLog.push({ step: 'Trigger', node: workflow.nodes[0]?.title || 'New Lead Trigger', status: 'Completed', timestamp: new Date().toLocaleTimeString() });

    // Step 1: Day 1 (Welcome & Value)
    const day1Res = await window.aiService.generateMultiDayFollowup({ lead, step: 1 });
    executionLog.push({
      step: 'Day 1 (Welcome & Value)',
      node: 'Day 1 Greeting + Demo Link',
      result: `[Tanglish AI]: "${day1Res.message}"`,
      status: 'Completed',
      timestamp: new Date().toLocaleTimeString()
    });

    // Step 2: Day 2 (Follow-up & Case Study)
    const day2Res = await window.aiService.generateMultiDayFollowup({ lead, step: 2 });
    executionLog.push({
      step: 'Day 2 (Follow-up & Case Study)',
      node: 'Day 2 Social Proof (50% time saved)',
      result: `[Tanglish AI]: "${day2Res.message}"`,
      status: 'Completed',
      timestamp: new Date().toLocaleTimeString()
    });

    // Step 3: Day 4 (Soft Reminder)
    const day4Res = await window.aiService.generateMultiDayFollowup({ lead, step: 4 });
    executionLog.push({
      step: 'Day 4 (Soft Reminder)',
      node: 'Day 4 2-Line Screen Share Check-in',
      result: `[Tanglish AI]: "${day4Res.message}"`,
      status: 'Completed',
      timestamp: new Date().toLocaleTimeString()
    });

    // Step 4: Day 7 (Limited Scarcity Offer)
    const day7Res = await window.aiService.generateMultiDayFollowup({ lead, step: 7 });
    executionLog.push({
      step: 'Day 7 (Limited Scarcity Offer)',
      node: 'Day 7 20% Discount Offer',
      result: `[Tanglish AI]: "${day7Res.message}"`,
      status: 'Completed',
      timestamp: new Date().toLocaleTimeString()
    });

    window.appState.addAuditLog(
      'Multi-Day Sequence Executed',
      `${workflow.name} -> ${lead.contactName}`,
      `Completed 4-step sequence (Day 1, 2, 4, 7).`,
      'Success'
    );

    return executionLog;
  }
}

window.automationEngine = new AutomationEngine();
