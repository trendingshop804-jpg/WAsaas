/* ==========================================================================
   NexusLead AI - WhatsApp Inbox & Live Two-Way Chat Component
   ========================================================================== */

class InboxComponent {
  constructor() {
    this.selectedConvId = 'conv_001';
    this.filterMode = 'all'; // 'all', 'ai', 'human', 'unread'
    this.searchTerm = '';
  }

  init() {
    this.bindEvents();
    this.render();
    this.setupScrollListeners();

    window.appState.on('messageSent', () => {
      this.render();
      this.scrollToBottom(true);
    });
    window.appState.on('inboundReceived', () => {
      const messagesScroll = document.getElementById('chat-messages-scroll');
      let isNearBottom = true;
      if (messagesScroll) {
        const distFromBottom = messagesScroll.scrollHeight - messagesScroll.scrollTop - messagesScroll.clientHeight;
        isNearBottom = distFromBottom < 160;
      }
      this.render();
      if (isNearBottom) {
        this.scrollToBottom(true);
      } else {
        this.showScrollBottomButton(true);
      }
    });
    window.appState.on('conversations', () => this.render());
  }

  setupScrollListeners() {
    const messagesScroll = document.getElementById('chat-messages-scroll');
    const scrollBtn = document.getElementById('inbox-scroll-bottom-btn');

    if (messagesScroll) {
      messagesScroll.addEventListener('scroll', () => {
        const distFromBottom = messagesScroll.scrollHeight - messagesScroll.scrollTop - messagesScroll.clientHeight;
        if (distFromBottom > 140) {
          if (scrollBtn) scrollBtn.classList.add('visible');
        } else {
          if (scrollBtn) {
            scrollBtn.classList.remove('visible');
            const badge = document.getElementById('inbox-scroll-unread-badge');
            if (badge) badge.style.display = 'none';
          }
        }
      });
    }

    if (scrollBtn) {
      scrollBtn.addEventListener('click', () => {
        this.scrollToBottom(true);
        const badge = document.getElementById('inbox-scroll-unread-badge');
        if (badge) badge.style.display = 'none';
      });
    }
  }

  showScrollBottomButton(hasNewMsg = false) {
    const scrollBtn = document.getElementById('inbox-scroll-bottom-btn');
    const badge = document.getElementById('inbox-scroll-unread-badge');
    if (scrollBtn) scrollBtn.classList.add('visible');
    if (badge && hasNewMsg) badge.style.display = 'block';
  }

  scrollToBottom(smooth = true) {
    const messagesEndRef = document.getElementById('messagesEndRef');
    const messagesScroll = document.getElementById('chat-messages-scroll');
    if (messagesEndRef) {
      messagesEndRef.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    } else if (messagesScroll) {
      messagesScroll.scrollTo({
        top: messagesScroll.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }


  bindEvents() {
    // Search input
    const search = document.getElementById('inbox-search-input');
    if (search) {
      search.addEventListener('input', (e) => {
        this.searchTerm = e.target.value.toLowerCase();
        this.renderConversationList();
      });
    }

    // Filter chips
    document.querySelectorAll('.inbox-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.inbox-filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.filterMode = chip.getAttribute('data-filter');
        this.renderConversationList();
      });
    });

    // Chat form submit (Send message)
    const chatForm = document.getElementById('chat-send-form');
    if (chatForm) {
      chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSendMessage();
      });
    }

    // Simulate Customer Inbound Message form submit
    const inboundForm = document.getElementById('simulate-customer-reply-form');
    if (inboundForm) {
      inboundForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSimulateInbound();
      });
    }

    // Delete active conversation button
    const deleteBtn = document.getElementById('chat-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const conv = this.getSelectedConversation();
        if (conv) {
          this.deleteConversation(conv.id);
        }
      });
    }
  }

  deleteConversation(convId) {
    let convs = window.appState.get('conversations') || [];
    const conv = convs.find(c => c.id === convId);
    if (!conv) return;

    if (confirm(`Are you sure you want to delete the chat thread with ${conv.leadName || conv.phone}?`)) {
      convs = convs.filter(c => c.id !== convId);
      window.appState.set('conversations', convs);
      window.appState.addAuditLog('Chat Thread Deleted', conv.leadName || conv.phone, 'Deleted conversation thread.', 'Success');
      if (convs.length > 0) {
        this.selectedConvId = convs[0].id;
      } else {
        this.selectedConvId = null;
      }
      this.render();
    }
  }

  getSelectedConversation() {
    const convs = window.appState.get('conversations') || [];
    return convs.find(c => c.id === this.selectedConvId) || convs[0];
  }

  selectConversation(convId) {
    this.selectedConvId = convId;
    const conv = (window.appState.get('conversations') || []).find(c => c.id === convId);
    if (conv) conv.unreadCount = 0;
    window.appState.saveState();
    this.render();
    setTimeout(() => this.scrollToBottom(true), 50);
  }

  selectConversationByLeadId(leadId) {
    const convs = window.appState.get('conversations') || [];
    const lead = (window.appState.get('leads') || []).find(l => l.id === leadId);
    const leadDigits = lead && lead.phone ? String(lead.phone).replace(/[^0-9]/g, '').slice(-10) : '';

    let conv = convs.find(c => c.leadId === leadId) ||
               (leadDigits ? convs.find(c => String(c.phone || '').replace(/[^0-9]/g, '').slice(-10) === leadDigits) : null);

    if (conv) {
      if (lead && conv.leadId !== lead.id) {
        conv.leadId = lead.id;
      }
      this.selectConversation(conv.id);
    } else if (lead) {
      conv = {
        id: 'conv_' + Date.now(),
        leadId: lead.id,
        leadName: lead.contactName,
        company: lead.companyName,
        phone: lead.phone,
        unreadCount: 0,
        mode: 'AI',
        status: 'AI Active',
        lastMessage: 'Ready for conversation',
        lastTimestamp: 'Just now',
        messages: [
          { id: 'm_init', sender: 'system', text: 'Chat thread initialized for ' + lead.contactName, timestamp: 'Just now' }
        ],
        aiSuggestions: ['Send introduction greeting', 'Ask qualification question']
      };
      convs.unshift(conv);
      window.appState.set('conversations', convs);
      this.selectConversation(conv.id);
    }
  }

  render() {
    this.renderConversationList();
    this.renderActiveChat();
    this.setupScrollListeners();
  }

  renderConversationList() {
    const listEl = document.getElementById('inbox-conversations-scroll');
    if (!listEl) return;

    const convs = window.appState.get('conversations') || [];
    const filtered = convs.filter(c => {
      const matchesSearch = !this.searchTerm ||
        c.leadName.toLowerCase().includes(this.searchTerm) ||
        c.company.toLowerCase().includes(this.searchTerm) ||
        c.phone.includes(this.searchTerm);

      let matchesMode = true;
      if (this.filterMode === 'ai') matchesMode = c.mode === 'AI';
      if (this.filterMode === 'human') matchesMode = c.mode === 'HUMAN';
      if (this.filterMode === 'unread') matchesMode = (c.unreadCount || 0) > 0;

      return matchesSearch && matchesMode;
    });

    listEl.innerHTML = filtered.map(c => `
      <div class="conversation-item ${c.id === this.selectedConvId ? 'active' : ''}" onclick="window.inboxComponent.selectConversation('${c.id}')">
        <div class="conversation-avatar">
          ${c.leadName.split(' ').map(n => n[0]).join('').slice(0, 2)}
          <span class="avatar-badge-status ${c.mode === 'AI' ? 'status-ai-active' : 'status-human-active'}"></span>
        </div>
        <div class="conversation-meta">
          <div class="conv-top-row">
            <span class="conv-name">${this.escapeHtml(c.leadName)}</span>
            <span class="conv-time">${c.lastTimestamp}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="conv-snippet">${this.escapeHtml(c.lastMessage)}</span>
            ${(c.unreadCount || 0) > 0 ? `<span class="nav-pill pulse-green">${c.unreadCount}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  renderActiveChat() {
    const conv = this.getSelectedConversation();
    if (!conv) return;

    const lead = (window.appState.get('leads') || []).find(l => l.id === conv.leadId);

    // Chat Header
    const nameEl = document.getElementById('chat-lead-name');
    const compEl = document.getElementById('chat-lead-company');
    const modeBtnAI = document.getElementById('mode-toggle-ai');
    const modeBtnHuman = document.getElementById('mode-toggle-human');

    if (nameEl) nameEl.textContent = conv.leadName;
    if (compEl) compEl.textContent = `${conv.company} · ${conv.phone}`;

    if (modeBtnAI && modeBtnHuman) {
      if (conv.mode === 'AI') {
        modeBtnAI.className = 'mode-btn active ai';
        modeBtnHuman.className = 'mode-btn';
      } else {
        modeBtnAI.className = 'mode-btn';
        modeBtnHuman.className = 'mode-btn active human';
      }

      modeBtnAI.onclick = () => this.setChatMode(conv.id, 'AI');
      modeBtnHuman.onclick = () => this.setChatMode(conv.id, 'HUMAN');
    }

    // Message List
    const messagesScroll = document.getElementById('chat-messages-scroll');
    if (messagesScroll) {
      messagesScroll.innerHTML = (conv.messages || []).map(m => {
        if (m.sender === 'system') {
          return `
            <div class="msg-bubble-wrap system">
              <div class="msg-bubble">${this.escapeHtml(m.text)}</div>
            </div>
          `;
        }

        const isInbound = m.sender === 'inbound';
        const msgType = m.type || 'text';

        let contentHtml = '';

        switch (msgType) {
          case 'image':
            contentHtml = `
              <div class="msg-media msg-media-image">
                <img src="${m.mediaUrl || ''}" alt="${this.escapeHtml(m.caption || 'Image')}" class="msg-img" onclick="window.inboxComponent.openMediaViewer('${m.mediaUrl || ''}', 'image')" />
              </div>
              ${m.caption ? `<div class="msg-media-caption">${this.escapeHtml(m.caption)}</div>` : ''}
            `;
            break;

          case 'video':
            contentHtml = `
              <div class="msg-media msg-media-video">
                <video src="${m.mediaUrl || ''}" class="msg-video" controls preload="metadata"></video>
              </div>
              ${m.caption ? `<div class="msg-media-caption">${this.escapeHtml(m.caption)}</div>` : ''}
            `;
            break;

          case 'document':
          case 'file':
            const fileName = m.fileName || 'Document';
            const fileSize = m.fileSize || '';
            const fileIcon = this.getFileIcon(fileName);
            contentHtml = `
              <div class="msg-file-attachment">
                <div class="msg-file-icon">${fileIcon}</div>
                <div class="msg-file-info">
                  <div class="msg-file-name">${this.escapeHtml(fileName)}</div>
                  ${fileSize ? `<div class="msg-file-size">${this.escapeHtml(fileSize)}</div>` : ''}
                </div>
                ${m.mediaUrl ? `<a href="${m.mediaUrl}" target="_blank" class="msg-file-download" title="Download">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </a>` : ''}
              </div>
              ${m.caption ? `<div class="msg-media-caption">${this.escapeHtml(m.caption)}</div>` : ''}
            `;
            break;

          case 'sticker':
            contentHtml = `
              <div class="msg-sticker">
                <img src="${m.mediaUrl || ''}" alt="Sticker" class="msg-sticker-img" />
              </div>
            `;
            break;

          case 'audio':
            contentHtml = `
              <div class="msg-audio">
                <audio src="${m.mediaUrl || ''}" controls preload="metadata" class="msg-audio-player"></audio>
              </div>
            `;
            break;

          case 'location':
            contentHtml = `
              <div class="msg-location">
                <div class="msg-location-icon">📍</div>
                <div class="msg-location-info">
                  <div class="msg-location-name">${this.escapeHtml(m.locationName || 'Shared Location')}</div>
                  ${m.locationAddress ? `<div class="msg-location-address">${this.escapeHtml(m.locationAddress)}</div>` : ''}
                </div>
              </div>
            `;
            break;

          case 'contact':
            contentHtml = `
              <div class="msg-contact-card">
                <div class="msg-contact-icon">👤</div>
                <div class="msg-contact-info">
                  <div class="msg-contact-name">${this.escapeHtml(m.contactName || 'Contact')}</div>
                  ${m.contactPhone ? `<div class="msg-contact-phone">${this.escapeHtml(m.contactPhone)}</div>` : ''}
                </div>
              </div>
            `;
            break;

          case 'unknown':
            contentHtml = `
              <div class="msg-unknown">
                <div class="msg-unknown-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div class="msg-unknown-text">${this.escapeHtml(m.text || 'Unsupported message type')}</div>
              </div>
            `;
            break;

          default: // text
            contentHtml = this.escapeHtml(m.text);
            break;
        }

        const bubbleClass = msgType === 'sticker' ? 'msg-bubble msg-bubble-sticker' : 'msg-bubble';

        return `
          <div class="msg-bubble-wrap ${isInbound ? 'inbound' : 'outbound'}">
            <div class="${bubbleClass}">
              ${contentHtml}
            </div>
            <div class="msg-footer">
              ${m.isAI ? '<span class="ai-tag-pill">AI AGENT</span>' : ''}
              ${msgType !== 'text' && msgType !== 'unknown' ? `<span class="msg-type-tag">${this.getMsgTypeLabel(msgType)}</span>` : ''}
              <span>${m.timestamp}</span>
              ${!isInbound ? `<span>· ${m.status || 'DELIVERED'}</span>` : ''}
            </div>
          </div>
        `;
      }).join('') + '<div id="messagesEndRef"></div>';

      const messagesEndRef = document.getElementById('messagesEndRef');
      if (messagesEndRef) {
        messagesEndRef.scrollIntoView({ behavior: 'smooth' });
      } else {
        messagesScroll.scrollTop = messagesScroll.scrollHeight;
      }
    }


    // AI Suggestions Bar
    const aiBar = document.getElementById('chat-ai-suggestions-bar');
    if (aiBar) {
      const suggestions = conv.aiSuggestions || window.aiService.suggestReplies(conv);
      aiBar.innerHTML = `
        <span style="font-size: 11px; font-weight: 700; color: #a78bfa; white-space: nowrap;">✨ AI Suggestions:</span>
        ${suggestions.map(s => `
          <button class="ai-chip" onclick="window.inboxComponent.applyAiSuggestion(\`${s.replace(/"/g, '\\"')}\`)">
            ${this.escapeHtml(s)}
          </button>
        `).join('')}
      `;
    }

    // Lead Sidebar details
    if (lead) {
      const setLeadDetail = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setLeadDetail('inbox-sidebar-contact', lead.contactName);
      setLeadDetail('inbox-sidebar-company', lead.companyName);
      setLeadDetail('inbox-sidebar-phone', lead.phone);
      setLeadDetail('inbox-sidebar-email', lead.email || 'N/A');
      setLeadDetail('inbox-sidebar-location', lead.location);
      setLeadDetail('inbox-sidebar-score', `Score: ${lead.score}/100 (${lead.scoreCategory.toUpperCase()})`);
      setLeadDetail('inbox-sidebar-ai-summary', lead.aiSummary || 'Active conversational opportunity.');
    }
  }

  setChatMode(convId, mode) {
    const convs = window.appState.get('conversations') || [];
    const conv = convs.find(c => c.id === convId);
    if (conv) {
      conv.mode = mode;
      conv.status = mode === 'AI' ? 'AI Active' : 'Human Active';
      conv.messages.push({
        id: 'm_sys_' + Date.now(),
        sender: 'system',
        text: mode === 'HUMAN' ? 'Human Takeover engaged. AI Bot paused.' : 'AI Sales Agent resumed for conversation.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      window.appState.saveState();
      window.appState.addAuditLog(
        mode === 'HUMAN' ? 'Human Takeover Engaged' : 'AI Agent Resumed',
        conv.leadName,
        `Switched chat mode to ${mode}.`,
        'Success'
      );
      this.render();
    }
  }

  applyAiSuggestion(text) {
    const input = document.getElementById('chat-message-input');
    if (input) {
      input.value = text;
      input.focus();
    }
  }

  async handleSendMessage() {
    const input = document.getElementById('chat-message-input');
    const text = input ? input.value.trim() : '';
    if (!text) return;

    const conv = this.getSelectedConversation();
    if (!conv) return;

    input.value = '';
    try {
      await window.whatsappService.sendMessage({
        leadId: conv.leadId,
        text,
        isAI: conv.mode === 'AI'
      });
    } catch (err) {
      alert(err.message);
    }
  }

  handleSimulateInbound() {
    const input = document.getElementById('sim-customer-inbound-text');
    const text = input ? input.value.trim() : '';
    if (!text) return;

    const conv = this.getSelectedConversation();
    if (!conv) return;

    input.value = '';
    window.whatsappService.receiveSimulatedInbound({
      leadId: conv.leadId,
      text
    });
  }

  getFileIcon(fileName) {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    const iconMap = {
      pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
      ppt: '📑', pptx: '📑', csv: '📊', txt: '📃',
      zip: '🗜️', rar: '🗜️', '7z': '🗜️',
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
      mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬',
      mp3: '🎵', wav: '🎵', ogg: '🎵', aac: '🎵',
      apk: '📱', exe: '⚙️', dmg: '💿',
    };
    return iconMap[ext] || '📎';
  }

  getMsgTypeLabel(type) {
    const labels = {
      image: '📷 Photo', video: '🎥 Video', document: '📄 Document',
      file: '📎 File', sticker: '🩷 Sticker', audio: '🎤 Audio',
      location: '📍 Location', contact: '👤 Contact'
    };
    return labels[type] || type;
  }

  openMediaViewer(url, type) {
    if (!url) return;
    // Create fullscreen overlay
    let overlay = document.getElementById('media-viewer-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'media-viewer-overlay';
    overlay.className = 'media-viewer-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    let mediaEl = '';
    if (type === 'image') {
      mediaEl = `<img src="${url}" class="media-viewer-content" alt="Full size image" />`;
    } else if (type === 'video') {
      mediaEl = `<video src="${url}" class="media-viewer-content" controls autoplay></video>`;
    }

    overlay.innerHTML = `
      <button class="media-viewer-close" onclick="document.getElementById('media-viewer-overlay').remove()">✕</button>
      ${mediaEl}
    `;
    document.body.appendChild(overlay);
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
}

window.inboxComponent = new InboxComponent();
