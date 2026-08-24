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
    // Check queues every 10 seconds
    setInterval(() => {
      this.processBackgroundQueues();
    }, 10000);
  }

  processBackgroundQueues() {
    const org = window.appState.getCurrentOrg();
    if (org.isPaused) return; // Emergency kill-switch respected

    const campaigns = window.appState.get('campaigns') || [];
    campaigns.forEach(camp => {
      if (camp.status === 'Running' && camp.sentCount < camp.totalLeads) {
        // Send next message batch in queue
        const leads = window.appState.get('leads').filter(l => l.campaignId === camp.id && !l.lastContacted && !l.optedOut);
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
    executionLog.push({ step: 'Trigger', node: workflow.nodes[0]?.title, status: 'Completed', timestamp: new Date().toLocaleTimeString() });

    // Step 2: AI Lead Scoring
    const scoreResult = window.aiService.analyzeLead(lead);
    lead.score = scoreResult.score;
    lead.scoreCategory = scoreResult.category;
    executionLog.push({ step: 'AI Scoring', node: 'AI Scoring Engine', result: `Score: ${lead.score}/100 (${lead.scoreCategory.toUpperCase()})`, status: 'Completed', timestamp: new Date().toLocaleTimeString() });

    // Step 3: Condition Check
    if (lead.score >= 60) {
      executionLog.push({ step: 'Condition Branch', node: 'High Score >= 60', result: 'Evaluated TRUE -> Route to WhatsApp Intro', status: 'Completed', timestamp: new Date().toLocaleTimeString() });
      
      // Step 4: WhatsApp Message
      const aiMsg = await window.aiService.generateMessage({ lead, sequenceStep: 0 });
      executionLog.push({ step: 'Action', node: 'Send WhatsApp Intro Template', result: `Dispatched message to ${lead.phone}`, status: 'Completed', timestamp: new Date().toLocaleTimeString() });

      if (org.whatsappConnected) {
        await window.whatsappService.sendMessage({ leadId: lead.id, text: aiMsg.message, isAI: true });
      }
    } else {
      executionLog.push({ step: 'Condition Branch', node: 'Score < 60', result: 'Routed to Nurture Bucket', status: 'Completed', timestamp: new Date().toLocaleTimeString() });
    }

    window.appState.addAuditLog(
      'Workflow Executed',
      `${workflow.name} -> ${lead.contactName}`,
      `Completed ${executionLog.length} steps successfully.`,
      'Success'
    );

    return executionLog;
  }
}

window.automationEngine = new AutomationEngine();
