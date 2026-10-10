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

  normalizePhone(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/[^0-9]/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
  }

  findLeadByPhone(phone, leads = null) {
    if (!leads) leads = window.appState.get('leads') || [];
    const targetDigits = this.normalizePhone(phone);
    if (!targetDigits) return null;
    return leads.find(l => this.normalizePhone(l.phone) === targetDigits) || null;
  }

  findConversationByPhone(phone, conversations = null) {
    if (!conversations) conversations = window.appState.get('conversations') || [];
    const targetDigits = this.normalizePhone(phone);
    if (!targetDigits) return null;
    return conversations.find(c => this.normalizePhone(c.phone) === targetDigits) || null;
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
    const org = window.appState.getCurrentOrg();
    org.whatsappConnected = true;
    org.whatsappNumber = phoneNumber;
    org.whatsappProvider = provider;
    if (token) org.whatsappToken = token;
    if (phoneId) org.phoneId = phoneId;
    if (wabaId) org.wabaId = wabaId;
    else if (!org.wabaId) org.wabaId = 'WABA_' + Math.floor(1000000000 + Math.random() * 9000000000);
    
    window.appState.saveState();

    // Persist connection to backend / Supabase whatsapp_connections table
    try {
      const fnUrl = window.supabaseConfig?.isSupabaseConfigured()
        ? window.supabaseConfig.getEdgeFunctionUrl('meta-oauth-exchange')
        : '/api/meta-oauth-exchange';
      const authHeaders = window.supabaseConfig?.isSupabaseConfigured()
        ? window.supabaseConfig.getAuthHeaders()
        : { 'Content-Type': 'application/json' };

      const syncPayload = {
        accessToken: token,
        phoneNumberId: phoneId || 'default',
        wabaId: org.wabaId,
        phoneNumber: phoneNumber,
        displayName: wabaName,
        organizationId: org.id || window.appState?.get('currentOrgId') || 'org_default',
        mode: 'direct_save'
      };

      fetch(fnUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(syncPayload)
      }).catch(err => console.warn('[WhatsAppService] Background sync notice:', err.message));
    } catch (e) {
      console.warn('[WhatsAppService] Could not trigger backend connection sync:', e.message);
    }

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
    return { success: true, number: phoneNumber, wabaId: org.wabaId };
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

  async fetchCurrentProfile() {
    const org = window.appState.getCurrentOrg();
    if (!org.whatsappConnected) return { success: false, error: 'No WhatsApp connection active.' };

    const fnUrl = window.supabaseConfig?.isSupabaseConfigured()
      ? window.supabaseConfig.getEdgeFunctionUrl('update-whatsapp-profile')
      : '/api/update-whatsapp-profile';
    const authHeaders = window.supabaseConfig?.isSupabaseConfigured()
      ? window.supabaseConfig.getAuthHeaders()
      : { 'Content-Type': 'application/json' };

    const orgId = org?.id || window.appState?.get('currentOrgId') || 'org_default';
    const payload = {
      action: 'fetch_profile',
      organizationId: orgId,
      accessToken: org.whatsappToken,
      phoneNumberId: org.phoneId,
      wabaId: org.wabaId,
      phoneNumber: org.whatsappNumber
    };

    try {
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.profile) {
        org.about = data.profile.about || org.about;
        org.profilePictureUrl = data.profile.profile_picture_url || org.profilePictureUrl;
        window.appState.saveState();
      }
      return data;
    } catch (err) {
      if (fnUrl.includes('/functions/v1/')) {
        const localRes = await fetch('/api/update-whatsapp-profile', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(payload),
        });
        const localData = await localRes.json().catch(() => ({}));
        if (localRes.ok && localData.success && localData.profile) {
          org.about = localData.profile.about || org.about;
          org.profilePictureUrl = localData.profile.profile_picture_url || org.profilePictureUrl;
          window.appState.saveState();
          return localData;
        }
      }
      return { success: false, error: err.message || 'Failed to fetch WhatsApp profile' };
    }
  }

  async updateProfilePicture(imageBase64, fileName) {
    const org = window.appState.getCurrentOrg();
    if (!org.whatsappConnected) return { success: false, error: 'No WhatsApp connection active.' };

    const orgId = org?.id || window.appState?.get('currentOrgId') || 'org_default';
    const fnUrl = window.supabaseConfig?.isSupabaseConfigured()
      ? window.supabaseConfig.getEdgeFunctionUrl('update-whatsapp-profile')
      : '/api/update-whatsapp-profile';
    const authHeaders = window.supabaseConfig?.isSupabaseConfigured()
      ? window.supabaseConfig.getAuthHeaders()
      : { 'Content-Type': 'application/json' };

    const payload = {
      action: 'update_profile_picture',
      imageBase64,
      fileName,
      organizationId: orgId,
      accessToken: org.whatsappToken,
      phoneNumberId: org.phoneId,
      wabaId: org.wabaId,
      phoneNumber: org.whatsappNumber
    };

    try {
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (data.profile_picture_url) {
          org.profilePictureUrl = data.profile_picture_url;
        }
        window.appState.saveState();
        window.appState.addAuditLog('WhatsApp Profile Picture Updated', org.whatsappNumber, 'Profile photo synced to WhatsApp Business.', 'Success');
        return data;
      }
      return { success: false, error: data.error || 'Meta API rejected profile picture update.' };
    } catch (err) {
      if (fnUrl.includes('/functions/v1/')) {
        try {
          const localRes = await fetch('/api/update-whatsapp-profile', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(payload),
          });
          const localData = await localRes.json().catch(() => ({}));
          if (localRes.ok && localData.success) {
            if (localData.profile_picture_url) org.profilePictureUrl = localData.profile_picture_url;
            window.appState.saveState();
            return localData;
          }
          return { success: false, error: localData.error || err.message };
        } catch (lErr) {
          return { success: false, error: lErr.message };
        }
      }
      return { success: false, error: err.message };
    }
  }

  async updateAbout(about) {
    const org = window.appState.getCurrentOrg();
    if (!org.whatsappConnected) return { success: false, error: 'No WhatsApp connection active.' };

    if (about.length > 139) return { success: false, error: `About text exceeds 139 characters (${about.length}/139).` };

    const orgId = org?.id || window.appState?.get('currentOrgId') || 'org_default';
    const fnUrl = window.supabaseConfig?.isSupabaseConfigured()
      ? window.supabaseConfig.getEdgeFunctionUrl('update-whatsapp-profile')
      : '/api/update-whatsapp-profile';
    const authHeaders = window.supabaseConfig?.isSupabaseConfigured()
      ? window.supabaseConfig.getAuthHeaders()
      : { 'Content-Type': 'application/json' };

    const payload = {
      action: 'update_about',
      about,
      organizationId: orgId,
      accessToken: org.whatsappToken,
      phoneNumberId: org.phoneId,
      wabaId: org.wabaId,
      phoneNumber: org.whatsappNumber
    };

    try {
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        org.about = about;
        window.appState.saveState();
        window.appState.addAuditLog('WhatsApp About Text Updated', org.whatsappNumber, `About set to: "${about}"`, 'Success');
        return data;
      }
      return { success: false, error: data.error || 'Meta API rejected About text update.' };
    } catch (err) {
      if (fnUrl.includes('/functions/v1/')) {
        try {
          const localRes = await fetch('/api/update-whatsapp-profile', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(payload),
          });
          const localData = await localRes.json().catch(() => ({}));
          if (localRes.ok && localData.success) {
            org.about = about;
            window.appState.saveState();
            return localData;
          }
          return { success: false, error: localData.error || err.message };
        } catch (lErr) {
          return { success: false, error: lErr.message };
        }
      }
      return { success: false, error: err.message };
    }
  }

  _dataURLToFile(dataUrl) {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
    if (!match) return new File([], 'photo.png', { type: 'image/png' });
    const bytes = atob(match[2]);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new File([arr], 'profile.jpg', { type: match[1] });
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

    // Check conversation by leadId OR normalized phone
    const conversations = window.appState.get('conversations') || [];
    let conv = conversations.find(c => c.leadId === leadId) || (lead ? this.findConversationByPhone(lead.phone, conversations) : null);
    if (conv && lead && conv.leadId !== lead.id) {
      conv.leadId = lead.id;
    }

    if (!lead?.phone) {
      throw new Error('This contact does not have a valid WhatsApp phone number.');
    }

    // Send through the authenticated server endpoint so tenant validation,
    // service-window/template checks and the real Meta dispatch happen once.
    if (!window.apiClient?.authenticatedFetch) {
      throw new Error('Your session is not ready. Please refresh the page and sign in again.');
    }

    let sendResponse;
    try {
      sendResponse = await window.apiClient.authenticatedFetch('/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          phone: lead.phone,
          text,
          is_ai: isAI,
          conversation_id: conv?.id || null,
          clientMessageId: `inbox:${leadId}:${Date.now()}`
        })
      });
    } catch (err) {
      throw new Error(this.getErrorMessage(err, 'Unable to send the WhatsApp message.'));
    }

    const sendBody = await sendResponse.json().catch(() => ({}));
    if (!sendResponse.ok || !sendBody?.success) {
      throw new Error(this.getErrorMessage(sendBody, `Unable to send the WhatsApp message (HTTP ${sendResponse.status}).`));
    }
    const metaMessageId = sendBody.messageId || sendBody.message?.wa_message_id || null;
    const now = new Date();
    const nowISO = now.toISOString();
    const newMsg = {
      id: 'm_' + Date.now(),
      sender: 'outbound',
      isAI,
      text,
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      received_at: nowISO,
      status: 'SENT'
    };

    if (conv) {
      conv.messages.push(newMsg);
      conv.lastMessage = text;
      conv.lastTimestamp = nowISO;
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
        lastTimestamp: nowISO,
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

    if (metaMessageId) newMsg.id = metaMessageId;

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

  getErrorMessage(error, fallback) {
    const seen = new Set();
    const findMessage = (value) => {
      if (typeof value === 'string') {
        const text = value.trim();
        return text && text !== '[object Object]' ? text : '';
      }
      if (!value || typeof value !== 'object' || seen.has(value)) return '';
      seen.add(value);
      return findMessage(value.message)
        || findMessage(value.error)
        || findMessage(value.details)
        || findMessage(value.description)
        || findMessage(value.reason);
    };
    return findMessage(error) || fallback;
  }
  // Receive Simulated Incoming Inbound Message from Prospect
  receiveSimulatedInbound({ leadId, text }) {
    const org = window.appState.getCurrentOrg();
    const leads = window.appState.get('leads') || [];
    // Conditional inbound logging based on settings flag
    if (org.enableInboundLogging) {
      console.log('[Inbound] receiveSimulatedInbound called', {leadId, text});
      // Also record an audit log for inbound messages
      const lead = leads.find(l => l.id === leadId);
      if (lead) {
        window.appState.addAuditLog('Inbound Message Received', lead.contactName, text, 'Success');
      }
    }
    let lead = leads.find(l => l.id === leadId);
    if (!lead) {
      lead = {
        id: leadId,
        contactName: `WhatsApp Contact (${leadId})`,
        companyName: 'Inbound WhatsApp',
        phone: '',
        email: '',
        location: 'Inbound',
        status: 'Replied',
        score: 75,
        scoreCategory: 'warm',
        source: 'Simulated Inbound',
        lastContacted: new Date().toISOString(),
        aiSummary: 'Simulated inbound message for testing.'
      };
      leads.unshift(lead);
      window.appState.set('leads', leads);
    }

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

    const conversations = window.appState.get('conversations') || [];
    let conv = conversations.find(c => c.leadId === leadId) || this.findConversationByPhone(lead.phone, conversations);
    if (conv && conv.leadId !== lead.id) {
      conv.leadId = lead.id;
    }
    console.log('[Inbound] existing conv', conv ? conv.id : 'none');

    const now = new Date();
    const nowISO = now.toISOString();
    const inMsg = {
      id: 'm_in_' + Date.now(),
      sender: 'inbound',
      text,
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      received_at: nowISO
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
    conv.lastTimestamp = nowISO;
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

  // Real-time Supabase Inbound Message Synchronization
  async syncInboundMessagesFromSupabase() {
    try {
      let rawMessages = [];

      // SECURITY: read messages ONLY through the authenticated API.
      // A direct browser query with the anon key would bypass tenant
      // filtering and expose other organizations' data, so there is
      // deliberately no direct-Supabase fallback here.
      const sessionHeaders = window.supabaseConfig?.getSessionHeaders?.() || null;
      if (!sessionHeaders) {
        console.warn('[WhatsAppService] Not signed in; skipping inbound sync.');
        return;
      }
      try {
        const organizationId = window.appState?.get('currentOrgId');
        // 500 is the server's own hard cap (Math.min(limit, 500)). At limit=100
        // the newest 100 rows were the only ones synced, so older conversations
        // simply never reached the inbox and nothing reported an error.
        const qs = organizationId
          ? '?limit=500&organization_id=' + encodeURIComponent(organizationId)
          : '?limit=500';
        // Routed through the central helper: it resolves a LIVE session and
        // refreshes an expired one. The old getSessionHeaders() path read a raw
        // localStorage value with no expiry check, so a signed-in user whose
        // token had expired was rejected with a bare 401 and an empty inbox.
        const res = window.apiClient
          ? await window.apiClient.authenticatedFetch('/api/messages' + qs)
          : await fetch('/api/messages' + qs, { headers: sessionHeaders });
        if (res.status === 401) {
          console.warn('[WhatsAppService] Session expired; skipping inbound sync.');
          return;
        }
        if (!res.ok) {
          // Previously any non-401 failure (403 cross-tenant, 404 wrong
          // deployment, 500) fell through with no branch at all, so
          // rawMessages stayed empty and the sync looked like a quiet no-op.
          console.error('[WhatsAppService] /api/messages returned HTTP ' + res.status);
          return;
        }
        const data = await res.json();
        if (data.messages && Array.isArray(data.messages)) {
          rawMessages = data.messages;
        }
      } catch (fErr) {
        // AuthRequiredError means "not signed in" - the helper deliberately did
        // not send a request. Anything else is a real failure worth surfacing.
        if (fErr?.code === 'AUTH_REQUIRED' || fErr?.name === 'AuthRequiredError') {
          console.warn('[WhatsAppService] Not signed in; skipping inbound sync.');
        } else {
          console.error('Local /api/messages fetch failed:', fErr.message);
        }
      }

      if (rawMessages.length === 0) {
        console.warn('[WhatsAppService] /api/messages returned no messages for this organization.');
        return;
      }

      const leads = window.appState.get('leads') || [];
      const conversations = window.appState.get('conversations') || [];
      let stateChanged = false;

      if (!this.processedMsgIds) {
        this.processedMsgIds = new Set();
      }

      // API returns the latest rows first; render each conversation chronologically.
      const orderedMessages = [...rawMessages].sort((a, b) => new Date(a.received_at || a.created_at || 0) - new Date(b.received_at || b.created_at || 0));
      for (const msg of orderedMessages) {
        const msgId = msg.id || `${msg.sender_number}_${msg.received_at || msg.created_at}`;
        if (this.processedMsgIds.has(msgId)) continue;
        this.processedMsgIds.add(msgId);

        const channel = msg.channel || (msg.sender_number && String(msg.sender_number).startsWith('ig_') ? 'instagram' : 'whatsapp');
        const senderRaw = String(msg.sender_number || msg.sender || '');
        const senderClean = senderRaw.replace(/[^0-9a-zA-Z_]/g, '');
        if (!senderClean && !senderRaw) continue;

        // Extract message text from all possible field locations
        const rawPayload = msg.raw || {};
        const waMsg = rawPayload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || {};
        const text =
          msg.content ||
          msg.caption ||
          msg.body ||
          msg.text ||
          waMsg?.text?.body ||
          waMsg?.image?.caption ||
          waMsg?.video?.caption ||
          waMsg?.document?.filename ||
          (waMsg?.audio?.id && '🎤 Audio message') ||
          (waMsg?.sticker?.id && '🩷 Sticker') ||
          (waMsg?.location && `📍 ${waMsg.location.name || 'Location'}`) ||
          (waMsg?.contacts?.[0]?.name?.formatted_name && `👤 ${waMsg.contacts[0].name.formatted_name}`) ||
          null;

        // Derive media type from Supabase column OR raw payload (backward compat)
        const rawMsgType = msg.message_type || waMsg?.type || 'text';
        const mediaTypeMap = { image: 'image', video: 'video', audio: 'audio', document: 'document', sticker: 'sticker', location: 'location', contacts: 'contact' };
        const resolvedType = mediaTypeMap[rawMsgType] || (rawMsgType === 'text' ? 'text' : (text ? 'text' : 'unknown'));

        // Resolve media URL: prefer stored DB column (already a signed URL from /api/messages),
        // fall back to raw payload URLs for backward compatibility
        const mediaUrl = msg.media_url || waMsg?.image?.url || waMsg?.video?.url || waMsg?.audio?.url || waMsg?.document?.url || waMsg?.sticker?.url || undefined;
        const mimeType = msg.media_mime_type || waMsg?.image?.mime_type || waMsg?.video?.mime_type || undefined;
        const fileName = msg.file_name || waMsg?.document?.filename || undefined;
        const caption = msg.media_caption || waMsg?.image?.caption || waMsg?.video?.caption || undefined;

        // Build display text — for media messages, use caption as the text if available
        let displayText = text;
        if (resolvedType !== 'text' && resolvedType !== 'unknown') {
          displayText = caption || text || null;
        }
        if (!displayText) {
          displayText = `📩 ${msg.sender_number || 'Unknown'} sent a ${resolvedType} message`;
        }

        // Match existing lead by normalized phone or instagram sender
        let lead = channel === 'instagram'
          ? leads.find(l => l.phone === senderRaw || l.contactName === `@${senderRaw}` || l.id === 'lead_ig_' + senderClean)
          : this.findLeadByPhone(senderClean, leads);

        if (!lead) {
          if (channel === 'instagram') {
            lead = {
              id: 'lead_ig_' + senderClean,
              contactName: `@${senderRaw || 'instagram_user'}`,
              companyName: 'Instagram Direct',
              phone: senderRaw,
              email: '',
              location: 'Instagram Direct',
              status: 'Replied',
              score: 75,
              scoreCategory: 'warm',
              source: 'Instagram',
              lastContacted: msg.received_at || new Date().toISOString(),
              aiSummary: 'Received Instagram direct message.'
            };
          } else {
            lead = {
              id: 'lead_in_' + senderClean,
              contactName: `WhatsApp Contact (+${senderClean})`,
              companyName: 'Inbound WhatsApp',
              phone: senderRaw.startsWith('+') ? senderRaw : `+${senderClean}`,
              email: '',
              location: 'WhatsApp Webhook',
              status: 'Replied',
              score: 75,
              scoreCategory: 'warm',
              source: 'Meta Webhook',
              lastContacted: msg.received_at || new Date().toISOString(),
              aiSummary: 'Received real inbound message via WhatsApp webhook.'
            };
          }
          leads.unshift(lead);
          window.appState.set('leads', leads);
        } else {
          if (lead.status === 'New' || lead.status === 'Contacted') {
            lead.status = 'Replied';
          }
          lead.lastContacted = msg.received_at || new Date().toISOString();
        }

        // Match conversation by conversation ID or lead ID
        let conv = conversations.find(c => c.id === msg.conversation_id) || conversations.find(c => c.leadId === lead.id && (c.channel || 'whatsapp') === channel) || this.findConversationByPhone(lead.phone, conversations);
        if (conv && conv.leadId !== lead.id) {
          conv.leadId = lead.id;
        }

        const formattedTime = new Date(msg.received_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const inMsg = {
          id: 'm_sb_' + msgId,
          sender: msg.direction === 'outbound' ? 'outbound' : 'inbound',
          direction: msg.direction === 'outbound' ? 'OUTBOUND' : 'INBOUND',
          type: resolvedType,
          message_type: resolvedType,
          channel: channel,
          text: resolvedType === 'text' ? displayText : displayText,
          body: displayText,
          caption: caption || undefined,
          media_caption: caption || undefined,
          mediaUrl: mediaUrl || undefined,
          media_url: mediaUrl || undefined,
          mimeType: mimeType || undefined,
          media_mime_type: mimeType || undefined,
          fileName: fileName || undefined,
          file_name: fileName || undefined,
          mediaSize: msg.media_size || 0,
          media_size: msg.media_size || 0,
          locationName: waMsg?.location?.name,
          locationAddress: waMsg?.location?.address,
          contactName: waMsg?.contacts?.[0]?.name?.formatted_name,
          contactPhone: waMsg?.contacts?.[0]?.phones?.[0]?.phone,
          timestamp: formattedTime,
          received_at: msg.received_at
        };

        if (!conv) {
          conv = {
            id: msg.conversation_id || ('conv_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
            leadId: lead.id,
            leadName: lead.contactName,
            company: lead.companyName,
            phone: lead.phone,
            channel: channel,
            unreadCount: msg.direction === 'outbound' ? 0 : 1,
            mode: 'AI',
            status: 'AI Active',
            lastMessage: displayText || text || '📩 New message',
            lastTimestamp: msg.received_at || new Date().toISOString(),
            messages: [inMsg],
            aiSuggestions: window.aiService ? window.aiService.suggestReplies({ messages: [inMsg] }) : []
          };
          conversations.unshift(conv);
        } else {
          if (!conv.channel) conv.channel = channel;
          if (!conv.messages.some(m => m.id === inMsg.id || (m.text === inMsg.text && m.timestamp === formattedTime))) {
            conv.messages.push(inMsg);
            conv.lastMessage = displayText || text || '📩 New message';
            conv.lastTimestamp = msg.received_at || new Date().toISOString();
            if (msg.direction !== 'outbound') {
              conv.unreadCount = (conv.unreadCount || 0) + 1;
            }
          }
        }

        stateChanged = true;
        window.appState.addAuditLog('Inbound Webhook Synced', lead.contactName, text, 'Success');
      }

      if (stateChanged) {
        window.appState.saveState();
        window.appState.emit('inboundReceived', {});
        window.appState.emit('leads', leads);
        window.appState.emit('conversations', conversations);
        window.appState.emit('*', { key: 'inboundSync' });
      }
    } catch (err) {
      console.warn('Failed syncing Supabase inbound messages:', err);
    }
  }

  markAsRead(convId) {
    const conversations = window.appState.get('conversations') || [];
    const conv = conversations.find(c => c.id === convId);
    if (conv && conv.unreadCount > 0) {
      conv.unreadCount = 0;
      window.appState.saveState();
    }
  }

  startInboundPolling(intervalMs = 4000) {
    this.syncInboundMessagesFromSupabase();
    if (!this.pollingInterval) {
      this.pollingInterval = setInterval(() => this.syncInboundMessagesFromSupabase(), intervalMs);
    }
  }
}

window.whatsappService = new WhatsAppService();
