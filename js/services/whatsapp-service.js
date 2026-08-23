/* ==========================================================================
   NexusLead AI - WhatsApp Provider Service Layer
   Dual Method: Method A (Meta Cloud API OAuth) & Method B (Authorized QR Provider)
   ========================================================================== */

class WhatsAppService {
  constructor() {
    this.providers = [
      { id: 'meta_official', name: 'Meta WhatsApp Business Cloud API (Official)', type: 'oauth' },
      { id: 'qr_gateway', name: 'Authorized QR Gateway Provider', type: 'qr' }
    ];
    this.qrTimer = null;
    this.qrTimeLeft = 45;
  }

  // Method A: Official Meta OAuth Flow
  async connectMetaOAuth({ 
    wabaName = 'Nexus Growth Labs WABA', 
    phoneNumber = '+91 98401 23456', 
    provider = 'Meta Cloud API (Official)',
    token = null,
    phoneId = null,
    wabaId = null
  } = {}) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const org = window.appState.getCurrentOrg();
        org.whatsappConnected = true;
        org.whatsappNumber = phoneNumber;
        org.whatsappProvider = provider;
        if (token) org.whatsappToken = token;
        if (phoneId) org.phoneId = phoneId;
        if (wabaId) org.wabaId = wabaId;
        else if (!org.wabaId) org.wabaId = 'WABA_' + Math.floor(1000000000 + Math.random() * 9000000000);
        
        window.appState.saveState();
        window.appState.addAuditLog(
          'WhatsApp Meta OAuth Connected',
          'WABA ID ' + org.wabaId,
          `Connected number ${phoneNumber} with verified WhatsApp Business permissions via ${provider}.`,
          'Connected'
        );
        window.appState.emit('whatsappConnectionChanged', {
          status: 'CONNECTED',
          provider: 'meta_official',
          number: phoneNumber
        });
        resolve({ success: true, number: phoneNumber, wabaId: org.wabaId });
      }, 1200);
    });
  }

  // Method B: QR Code Session Lifecycle (Legitimate Authorized Provider)
  startQRFlow(onStatusUpdate, onTick) {
    this.qrTimeLeft = 45;
    if (this.qrTimer) clearInterval(this.qrTimer);

    onStatusUpdate('QR_GENERATING');

    setTimeout(() => {
      onStatusUpdate('WAITING_FOR_SCAN', {
        qrData: `https://wa.me/qr/NEXUSLEAD_AUTH_SESSION_${Date.now()}`,
        expiresIn: this.qrTimeLeft
      });

      this.qrTimer = setInterval(() => {
        this.qrTimeLeft -= 1;
        if (onTick) onTick(this.qrTimeLeft);

        if (this.qrTimeLeft <= 0) {
          clearInterval(this.qrTimer);
          onStatusUpdate('SESSION_EXPIRED');
        }
      }, 1000);
    }, 800);
  }

  simulateQRScanSuccess(phoneNumber = '+91 94471 88990') {
    if (this.qrTimer) clearInterval(this.qrTimer);
    const org = window.appState.getCurrentOrg();
    org.whatsappConnected = true;
    org.whatsappNumber = phoneNumber;
    org.whatsappProvider = 'QR Code Provider (UltraGateway)';
    org.wabaId = 'QR_SESSION_' + Math.floor(1000 + Math.random() * 9000);
    window.appState.saveState();
    window.appState.addAuditLog(
      'WhatsApp QR Connected',
      'Session ' + org.wabaId,
      `Authorized QR session paired for ${phoneNumber}.`,
      'Connected'
    );
    window.appState.emit('whatsappConnectionChanged', {
      status: 'CONNECTED',
      provider: 'qr_gateway',
      number: phoneNumber
    });
    return { success: true, number: phoneNumber };
  }

  disconnect() {
    const org = window.appState.getCurrentOrg();
    const prevNumber = org.whatsappNumber;
    org.whatsappConnected = false;
    org.whatsappNumber = null;
    org.wabaId = null;
    window.appState.saveState();
    window.appState.addAuditLog(
      'WhatsApp Disconnected',
      'Connection',
      `Disconnected WhatsApp account (${prevNumber}).`,
      'Disconnected'
    );
    window.appState.emit('whatsappConnectionChanged', { status: 'DISCONNECTED' });
  }

  // Outbound Message Dispatch with Rate-Limiting & Guardrails
  async sendMessage({ leadId, text, isAI = false }) {
    const org = window.appState.getCurrentOrg();
    if (org.isPaused) {
      throw new Error('Automation is currently PAUSED via Global Emergency Kill-Switch.');
    }
    if (!org.whatsappConnected) {
      throw new Error('No WhatsApp account connected. Please connect via Meta OAuth or QR.');
    }

    const lead = window.appState.get('leads').find(l => l.id === leadId);
    if (lead && lead.optedOut) {
      throw new Error('Cannot message opted-out contact (Compliance Rule).');
    }

    // Check conversation
    const conversations = window.appState.get('conversations');
    let conv = conversations.find(c => c.leadId === leadId);

    const newMsg = {
      id: 'm_' + Date.now(),
      sender: 'outbound',
      isAI,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'SENT'
    };

    if (conv) {
      conv.messages.push(newMsg);
      conv.lastMessage = text;
      conv.lastTimestamp = newMsg.timestamp;
    } else if (lead) {
      conv = {
        id: 'conv_' + Date.now(),
        leadId: lead.id,
        leadName: lead.contactName,
        company: lead.companyName,
        phone: lead.phone,
        unreadCount: 0,
        mode: isAI ? 'AI' : 'HUMAN',
        status: isAI ? 'AI Active' : 'Human Active',
        lastMessage: text,
        lastTimestamp: newMsg.timestamp,
        messages: [newMsg],
        aiSuggestions: window.aiService.suggestReplies({ messages: [newMsg] })
      };
      conversations.unshift(conv);
    }

    // Update lead lastContacted
    if (lead) {
      lead.lastContacted = new Date().toISOString();
      if (lead.status === 'New') lead.status = 'Contacted';
    }

    // Real Meta Cloud API Dispatch if real token & phoneId are present
    if (org.whatsappToken && org.phoneId && lead && lead.phone) {
      try {
        const cleanPhone = lead.phone.replace(/[^0-9]/g, '');
        const metaRes = await fetch(`https://graph.facebook.com/v18.0/${org.phoneId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${org.whatsappToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanPhone,
            type: 'text',
            text: { preview_url: false, body: text }
          })
        });
        const metaData = await metaRes.json();
        if (metaData.messages && metaData.messages[0]) {
          newMsg.metaMessageId = metaData.messages[0].id;
          newMsg.status = 'SENT_TO_META';
        }
      } catch (err) {
        console.warn('Real Meta Cloud API dispatch failed, fallback to local flow:', err);
      }
    }

    // Deduct usage credit
    org.creditsUsed = (org.creditsUsed || 0) + 1;

    window.appState.saveState();
    window.appState.emit('messageSent', { message: newMsg, leadId });

    // Simulate delivery tick if not already delivered
    setTimeout(() => {
      newMsg.status = 'DELIVERED';
      window.appState.saveState();
      window.appState.emit('messageDelivered', { messageId: newMsg.id });
    }, 1500);

    return newMsg;
  }

  // Receive Simulated Incoming Inbound Message from Prospect
  receiveSimulatedInbound({ leadId, text }) {
    const org = window.appState.getCurrentOrg();
    const leads = window.appState.get('leads');
    // Conditional inbound logging based on settings flag
    if (org.enableInboundLogging) {
      console.log('[Inbound] receiveSimulatedInbound called', {leadId, text});
      // Also record an audit log for inbound messages
      const lead = leads.find(l => l.id === leadId);
      if (lead) {
        window.appState.addAuditLog('Inbound Message Received', lead.contactName, text, 'Success');
      }
    }
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const optOutCheck = window.aiService.detectOptOut(text);
    if (optOutCheck.isOptOut) {
      lead.optedOut = true;
      lead.status = 'Lost';
      lead.score = 0;
      window.appState.addAuditLog(
        'Opt-Out Auto-Enforced',
        `Lead ${lead.contactName} (${lead.companyName})`,
        optOutCheck.reason,
        'Protected'
      );
    } else {
      if (lead.status === 'Contacted' || lead.status === 'New') {
        lead.status = 'Replied';
      }
    }

    const conversations = window.appState.get('conversations');
    let conv = conversations.find(c => c.leadId === leadId);
    console.log('[Inbound] existing conv', conv ? conv.id : 'none');

    const inMsg = {
      id: 'm_in_' + Date.now(),
      sender: 'inbound',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (!conv) {
      conv = {
        id: 'conv_' + Date.now(),
        leadId: lead.id,
        leadName: lead.contactName,
        company: lead.companyName,
        phone: lead.phone,
        unreadCount: 0,
        messages: []
      };
      conversations.unshift(conv);
    }

    conv.messages.push(inMsg);
    conv.lastMessage = text;
    conv.lastTimestamp = inMsg.timestamp;
    conv.unreadCount = (conv.unreadCount || 0) + 1;
    conv.aiSuggestions = window.aiService.suggestReplies(conv);

    // If NOT opted out and NOT paused, generate automatic AI response after delay
    console.log('[Inbound] scheduling AI reply (optedOut:', lead.optedOut, ', org.isPaused:', org.isPaused, ')');
    if (!lead.optedOut && !org.isPaused) {
      conv.mode = 'AI';
      conv.status = 'AI Active';
      setTimeout(async () => {
        try {
          const intent = window.aiService.classifyIntent(text);
          let replyText = 'Thank you for your response! We will share our walkthrough details shortly.';
          if (intent.intent === 'DEMO_REQUEST') {
            replyText = `Great! I can book a 15-min discovery walkthrough for tomorrow at 11:30 AM or 3:00 PM IST. Which time works best for you?`;
            lead.status = 'Qualified';
          } else if (intent.intent === 'PRICING_INQUIRY') {
            replyText = `Our growth plan starts at ₹4,999/month, including full AI Sales Agent, 5,000 monthly lead quota, and WhatsApp CRM integration. Would you like a customized breakdown?`;
            lead.status = 'Proposal';
          }

          await this.sendMessage({ leadId: lead.id, text: replyText, isAI: true });
          window.appState.addAuditLog('AI Auto-Reply Sent', `Lead ${lead.contactName}`, 'Automatic intent-based response.', 'AI');
        } catch (e) {
          console.error('Failed to dispatch AI response:', e);
        }
      }, 1800);
    }

    window.appState.saveState();
    window.appState.emit('inboundReceived', { message: inMsg, leadId });
  }
}

window.whatsappService = new WhatsAppService();
