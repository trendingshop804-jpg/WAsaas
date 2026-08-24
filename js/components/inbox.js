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
    let conv = convs.find(c => c.leadId === leadId);
    if (conv) {
      this.selectConversation(conv.id);
    } else {
      const lead = (window.appState.get('leads') || []).find(l => l.id === leadId);
      if (lead) {
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
        return `
          <div class="msg-bubble-wrap ${isInbound ? 'inbound' : 'outbound'}">
            <div class="msg-bubble">
              ${this.escapeHtml(m.text)}
            </div>
            <div class="msg-footer">
              ${m.isAI ? '<span class="ai-tag-pill">AI AGENT</span>' : ''}
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

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
}

window.inboxComponent = new InboxComponent();
