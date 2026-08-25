/* ==========================================================================
   NexusLead AI - WhatsApp CRM Two-Way Inbox & Realtime Component
   ========================================================================== */

class InboxComponent {
  constructor() {
    this.selectedConvId = 'conv_001';
    this.filterMode = 'all'; // 'all', 'unread', 'assigned_me', 'unassigned', 'resolved'
    this.searchTerm = '';
    this.selectedAttachment = null;
    this.realtimeChannel = null;
    this.timerInterval = null;
  }

  init() {
    this.bindEvents();
    this.render();
    this.setupScrollListeners();
    this.setupRealtimeSubscription();

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

    // Start 1-minute interval to update 24-hr session countdown
    this.timerInterval = setInterval(() => this.update24hWindowTimer(), 30000);
  }

  /* ── Supabase Realtime Subscription ────────────────────────────────── */
  setupRealtimeSubscription() {
    try {
      if (window.authService && window.authService.supabase) {
        const supabase = window.authService.supabase;
        this.realtimeChannel = supabase
          .channel('inbox-realtime')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload) => {
              const newMsg = payload.new;
              if (newMsg && window.whatsappService) {
                window.whatsappService.receiveSimulatedInbound(
                  newMsg.sender_number || '+91 94470 12345',
                  newMsg.body || newMsg.content || ''
                );
              }
            }
          )
          .subscribe();
      }
    } catch (e) {
      console.warn('[Inbox Realtime] Could not subscribe to Supabase Realtime:', e.message);
    }
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
        this.filterMode = chip.getAttribute('data-filter') || 'all';
        this.renderConversationList();
      });
    });

    // Send Message Form
    const sendForm = document.getElementById('chat-send-form');
    if (sendForm) {
      sendForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSendMessage();
      });
    }

    // Textarea Enter handler (Enter sends, Shift+Enter new line)
    const msgInput = document.getElementById('chat-message-input');
    if (msgInput) {
      msgInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage();
        }
      });
    }

    // Emoji Picker Trigger
    const emojiBtn = document.getElementById('inbox-emoji-trigger-btn');
    const emojiPopover = document.getElementById('emoji-picker-popover');
    if (emojiBtn && emojiPopover) {
      emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPopover.style.display = emojiPopover.style.display === 'none' ? 'grid' : 'none';
      });

      document.addEventListener('click', (e) => {
        if (!emojiPopover.contains(e.target) && e.target !== emojiBtn) {
          emojiPopover.style.display = 'none';
        }
      });

      emojiPopover.querySelectorAll('.emoji-item').forEach(item => {
        item.addEventListener('click', () => {
          const emoji = item.getAttribute('data-emoji');
          if (msgInput && emoji) {
            msgInput.value += emoji;
            msgInput.focus();
          }
          emojiPopover.style.display = 'none';
        });
      });
    }

    // Attachment File Input
    const mediaInput = document.getElementById('inbox-media-file-input');
    const previewBar = document.getElementById('inbox-attachment-preview-bar');
    const attachmentNameEl = document.getElementById('inbox-attachment-name');
    const clearAttachmentBtn = document.getElementById('inbox-clear-attachment-btn');

    if (mediaInput) {
      mediaInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.selectedAttachment = file;
          if (attachmentNameEl) attachmentNameEl.textContent = `📎 Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
          if (previewBar) previewBar.style.display = 'flex';
        }
      });
    }

    if (clearAttachmentBtn) {
      clearAttachmentBtn.addEventListener('click', () => {
        this.selectedAttachment = null;
        if (mediaInput) mediaInput.value = '';
        if (previewBar) previewBar.style.display = 'none';
      });
    }

    // Approved Template Trigger Button
    const templateBtn = document.getElementById('inbox-template-selector-btn');
    const templateBannerBtn = document.getElementById('inbox-open-templates-banner-btn');
    const handleOpenTemplates = () => {
      if (window.navigationComponent) {
        window.navigationComponent.switchView('templates');
      }
    };
    if (templateBtn) templateBtn.addEventListener('click', handleOpenTemplates);
    if (templateBannerBtn) templateBannerBtn.addEventListener('click', handleOpenTemplates);

    // AI / Human Mode Toggle
    const btnAi = document.getElementById('mode-toggle-ai');
    const btnHuman = document.getElementById('mode-toggle-human');
    if (btnAi && btnHuman) {
      btnAi.addEventListener('click', () => this.switchMode('AI'));
      btnHuman.addEventListener('click', () => this.switchMode('HUMAN'));
    }

    // Mark Resolved Button
    const resolveBtn = document.getElementById('chat-resolve-btn');
    if (resolveBtn) {
      resolveBtn.addEventListener('click', () => this.toggleResolved());
    }

    // Delete Chat Thread Button
    const deleteBtn = document.getElementById('chat-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (this.selectedConvId) {
          this.deleteConversation(this.selectedConvId);
        }
      });
    }

    // Simulate Customer Inbound Reply
    const simForm = document.getElementById('simulate-customer-reply-form');
    if (simForm) {
      simForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('sim-customer-inbound-text');
        const text = input ? input.value.trim() : '';
        if (text && this.selectedConvId) {
          const convs = window.appState.get('conversations') || [];
          const conv = convs.find(c => c.id === this.selectedConvId);
          const phone = conv ? conv.phone : '+91 94470 12345';
          window.whatsappService.receiveSimulatedInbound(phone, text);
          if (input) input.value = '';
        }
      });
    }

    // Right Panel CRM Stage Selector
    const stageSelect = document.getElementById('inbox-sidebar-stage-select');
    if (stageSelect) {
      stageSelect.addEventListener('change', (e) => {
        const newStage = e.target.value;
        const conv = (window.appState.get('conversations') || []).find(c => c.id === this.selectedConvId);
        if (conv) {
          conv.leadStage = newStage;
          const leads = window.appState.get('leads') || [];
          const lead = leads.find(l => l.id === conv.leadId);
          if (lead) lead.stage = newStage;
          window.appState.set('conversations', window.appState.get('conversations'));
        }
      });
    }

    // Right Panel Assigned Agent Selector
    const agentSelect = document.getElementById('inbox-sidebar-agent-select');
    if (agentSelect) {
      agentSelect.addEventListener('change', (e) => {
        const agent = e.target.value;
        const conv = (window.appState.get('conversations') || []).find(c => c.id === this.selectedConvId);
        if (conv) {
          conv.assignedAgent = agent;
          window.appState.set('conversations', window.appState.get('conversations'));
        }
      });
    }

    // Right Panel Add Tag Form
    const tagForm = document.getElementById('inbox-add-tag-form');
    if (tagForm) {
      tagForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const tagInput = document.getElementById('inbox-new-tag-input');
        const tagText = tagInput ? tagInput.value.trim() : '';
        if (tagText && this.selectedConvId) {
          const conv = (window.appState.get('conversations') || []).find(c => c.id === this.selectedConvId);
          if (conv) {
            conv.tags = conv.tags || [];
            if (!conv.tags.includes(tagText)) {
              conv.tags.push(tagText);
              window.appState.set('conversations', window.appState.get('conversations'));
              this.renderRightSidebar(conv);
            }
          }
          if (tagInput) tagInput.value = '';
        }
      });
    }

    // Right Panel Add Internal Note Form
    const noteForm = document.getElementById('inbox-add-note-form');
    if (noteForm) {
      noteForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const noteInput = document.getElementById('inbox-new-note-input');
        const noteText = noteInput ? noteInput.value.trim() : '';
        if (noteText && this.selectedConvId) {
          const conv = (window.appState.get('conversations') || []).find(c => c.id === this.selectedConvId);
          if (conv) {
            conv.internalNotes = conv.internalNotes || [];
            conv.internalNotes.unshift({
              id: 'note_' + Date.now(),
              author: 'Karthik Raja',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              text: noteText
            });
            window.appState.set('conversations', window.appState.get('conversations'));
            this.renderRightSidebar(conv);
          }
          if (noteInput) noteInput.value = '';
        }
      });
    }
  }

  deleteConversation(convId) {
    if (!confirm('Are you sure you want to delete this chat thread?')) return;

    let convs = window.appState.get('conversations') || [];
    convs = convs.filter(c => c.id !== convId);
    window.appState.set('conversations', convs);

    let messagesMap = window.appState.get('messages') || {};
    delete messagesMap[convId];
    window.appState.set('messages', messagesMap);

    if (this.selectedConvId === convId) {
      this.selectedConvId = convs.length > 0 ? convs[0].id : null;
    }
    this.render();
  }

  toggleResolved() {
    const convs = window.appState.get('conversations') || [];
    const conv = convs.find(c => c.id === this.selectedConvId);
    if (!conv) return;

    conv.status = conv.status === 'RESOLVED' ? 'OPEN' : 'RESOLVED';
    window.appState.set('conversations', convs);
    this.render();
  }

  switchMode(mode) {
    const convs = window.appState.get('conversations') || [];
    const conv = convs.find(c => c.id === this.selectedConvId);
    if (conv) {
      conv.mode = mode;
      window.appState.set('conversations', convs);
      this.updateModeToggleUI(mode);
    }
  }

  updateModeToggleUI(mode) {
    const btnAi = document.getElementById('mode-toggle-ai');
    const btnHuman = document.getElementById('mode-toggle-human');
    if (!btnAi || !btnHuman) return;

    if (mode === 'AI') {
      btnAi.className = 'mode-btn active ai';
      btnHuman.className = 'mode-btn';
    } else {
      btnAi.className = 'mode-btn';
      btnHuman.className = 'mode-btn active human';
    }
  }

  handleSendMessage(suggestedText = null) {
    const input = document.getElementById('chat-message-input');
    let text = suggestedText || (input ? input.value.trim() : '');

    if (this.selectedAttachment) {
      text = `📎 Attached [${this.selectedAttachment.name}]: ${text}`;
      this.selectedAttachment = null;
      const mediaInput = document.getElementById('inbox-media-file-input');
      const previewBar = document.getElementById('inbox-attachment-preview-bar');
      if (mediaInput) mediaInput.value = '';
      if (previewBar) previewBar.style.display = 'none';
    }

    if (!text || !this.selectedConvId) return;

    window.whatsappService.sendMessage(this.selectedConvId, text);

    if (input && !suggestedText) {
      input.value = '';
      input.style.height = 'auto';
    }
  }

  render() {
    this.renderConversationList();
    this.renderActiveChat();
  }

  /* ── 1. Left Panel: Conversation List ──────────────────────────────── */
  renderConversationList() {
    const container = document.getElementById('inbox-conversations-scroll');
    if (!container) return;

    let convs = window.appState.get('conversations') || [];

    // Filter Logic
    if (this.filterMode === 'unread') {
      convs = convs.filter(c => c.unreadCount > 0);
    } else if (this.filterMode === 'ai_active') {
      convs = convs.filter(c => c.mode === 'AI');
    } else if (this.filterMode === 'human_active') {
      convs = convs.filter(c => c.mode === 'HUMAN' || c.mode === 'MANUAL');
    } else {
      // 'all': show all conversations
      convs = convs.filter(c => c.status !== 'RESOLVED');
    }

    // Search filter
    if (this.searchTerm) {
      convs = convs.filter(c =>
        c.contactName.toLowerCase().includes(this.searchTerm) ||
        (c.company && c.company.toLowerCase().includes(this.searchTerm)) ||
        (c.phone && c.phone.toLowerCase().includes(this.searchTerm))
      );
    }

    if (convs.length === 0) {
      container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">No conversations match your filter.</div>`;
      return;
    }

    container.innerHTML = convs.map(conv => {
      const isActive = conv.id === this.selectedConvId;
      const initials = conv.contactName ? conv.contactName.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() : 'WC';
      const statusClass = conv.mode === 'AI' ? 'status-ai-active' : 'status-human-active';

      return `
        <div class="conversation-item ${isActive ? 'active' : ''}" data-conv-id="${conv.id}">
          <div class="conversation-avatar">
            ${initials}
            <div class="avatar-badge-status ${statusClass}"></div>
          </div>
          <div class="conversation-meta">
            <div class="conv-top-row">
              <span class="conv-name">${conv.contactName}</span>
              <span class="conv-time">${conv.lastTimestamp || ''}</span>
            </div>
            <div class="conv-snippet">${conv.lastMessage || 'No messages yet'}</div>
            ${conv.unreadCount > 0 ? `<div class="badge badge-whatsapp" style="margin-top: 4px; font-size: 10px; padding: 2px 6px;">${conv.unreadCount} new</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Bind item clicks
    container.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        const convId = item.getAttribute('data-conv-id');
        this.selectConversation(convId);
      });
    });
  }

  selectConversation(convId) {
    this.selectedConvId = convId;
    window.whatsappService.markAsRead(convId);
    this.render();
  }

  /* ── 2. Center Panel: Active Chat Window ────────────────────────────── */
  renderActiveChat() {
    const convs = window.appState.get('conversations') || [];
    const conv = convs.find(c => c.id === this.selectedConvId);

    const nameEl = document.getElementById('chat-lead-name');
    const compEl = document.getElementById('chat-lead-company');
    const resolveBtn = document.getElementById('chat-resolve-btn');

    if (!conv) {
      if (nameEl) nameEl.textContent = 'Select a conversation';
      if (compEl) compEl.textContent = '';
      return;
    }

    if (nameEl) nameEl.textContent = conv.contactName;
    if (compEl) compEl.textContent = `${conv.company || 'Inbound WhatsApp'} · ${conv.phone}`;

    if (resolveBtn) {
      resolveBtn.innerHTML = conv.status === 'RESOLVED' ? '🔄 Re-open Chat' : '✓ Mark Resolved';
      resolveBtn.style.color = conv.status === 'RESOLVED' ? '#34d399' : 'var(--text-secondary)';
    }

    this.updateModeToggleUI(conv.mode);
    this.update24hWindowTimer(conv);
    this.renderMessages(conv.id);
    this.renderAiSuggestions(conv);
    this.renderRightSidebar(conv);
  }

  update24hWindowTimer(conv = null) {
    if (!conv && this.selectedConvId) {
      conv = (window.appState.get('conversations') || []).find(c => c.id === this.selectedConvId);
    }
    const banner = document.getElementById('inbox-24h-banner');
    const countEl = document.getElementById('session-timer-count');
    const bannerTemplateBtn = document.getElementById('inbox-open-templates-banner-btn');
    if (!banner || !conv) return;

    // Simulate 24-hr session window countdown
    const lastTime = new Date(conv.lastTimestamp || Date.now());
    const windowExpiry = new Date(lastTime.getTime() + 24 * 60 * 60 * 1000);
    const diffMs = windowExpiry.getTime() - Date.now();

    if (diffMs <= 0) {
      banner.className = 'session-window-banner expired';
      banner.innerHTML = `
        <span>⚠️ <strong>24h Session Expired:</strong> Free-form messaging blocked by Meta. Approved template required.</span>
      `;
      if (bannerTemplateBtn) bannerTemplateBtn.style.display = 'inline-flex';
    } else {
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      banner.className = hours < 2 ? 'session-window-banner expiring' : 'session-window-banner active';
      if (countEl) countEl.textContent = `${hours}h ${mins}m left`;
    }
  }

  renderMessages(convId) {
    const scrollArea = document.getElementById('chat-messages-scroll');
    if (!scrollArea) return;

    const messagesMap = window.appState.get('messages') || {};
    const msgs = messagesMap[convId] || [];

    if (msgs.length === 0) {
      scrollArea.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px; margin-top: 40px;">No messages in this chat yet.</div>`;
      return;
    }

    scrollArea.innerHTML = msgs.map((msg, index) => {
      const isOutbound = msg.direction === 'OUTBOUND';
      const isSystem = msg.direction === 'SYSTEM' || msg.isSystem;

      if (isSystem) {
        return `
          <div class="msg-row justify-center flex my-2">
            <div class="msg-bubble system-bubble text-xs text-muted px-3 py-1 bg-tertiary rounded-full border border-subtle">
              ${msg.text || msg.body || ''}
            </div>
          </div>
        `;
      }

      const bubbleClass = isOutbound ? 'msg-bubble-outbound' : 'msg-bubble-inbound';

      return `
        <div class="msg-row ${isOutbound ? 'justify-end' : 'justify-start'} flex">
          <div class="msg-bubble-wrap ${isOutbound ? 'outbound' : 'inbound'}">
            <div class="msg-bubble ${bubbleClass} max-w-md p-3 rounded-lg text-sm shadow">
              <div class="msg-body">${msg.text || msg.body || ''}</div>
              <div class="msg-footer flex items-center justify-between gap-3 mt-2 text-xs" style="font-size: 10px; color: rgba(255,255,255,0.7);">
                ${isOutbound ? `<span class="ai-tag-pill" style="background: rgba(139, 92, 246, 0.25); color: #c4b5fd; padding: 1px 6px; border-radius: 4px; font-weight: 700; text-transform: uppercase;">${msg.sentByHuman ? 'HUMAN' : 'AI AGENT'}</span>` : '<span></span>'}
                <span class="msg-meta flex items-center gap-1">
                  <span>${msg.timestamp || 'Just now'}${isOutbound ? ' · DELIVERED' : ''}</span>
                  ${isOutbound ? '<span class="msg-tick read" style="color: #38bdf8; font-weight: 700;">✓✓</span>' : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('') + '<div id="messagesEndRef"></div>';
  }

  renderAiSuggestions(conv) {
    const bar = document.getElementById('chat-ai-suggestions-bar');
    if (!bar) return;

    const suggestions = [
      'Acknowledge inquiry and offer personalized assistance',
      'Ask 2 quick qualification questions'
    ];

    bar.innerHTML = `
      <span style="font-size: 11.5px; font-weight: 700; color: #a78bfa; white-space: nowrap;">✨ AI Suggestions:</span>
      ${suggestions.map(text => `
        <button type="button" class="ai-suggest-chip btn btn-secondary btn-sm" style="font-size: 11.5px; border-radius: 14px; padding: 4px 10px; background: rgba(139, 92, 246, 0.12); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.3); text-align: left;">
          ${text}
        </button>
      `).join('')}
    `;

    bar.querySelectorAll('.ai-suggest-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.textContent.trim();
        this.handleSendMessage(text);
      });
    });
  }

  /* ── 3. Right Panel: Prospect & CRM Details ─────────────────────────── */
  renderRightSidebar(conv) {
    const contactEl = document.getElementById('inbox-sidebar-contact');
    const compEl = document.getElementById('inbox-sidebar-company');
    const phoneEl = document.getElementById('inbox-sidebar-phone');
    const scoreEl = document.getElementById('inbox-sidebar-ai-score');
    const aiSummaryEl = document.getElementById('inbox-sidebar-ai-summary');
    const stageSelect = document.getElementById('inbox-sidebar-stage-select');
    const agentSelect = document.getElementById('inbox-sidebar-agent-select');
    const tagsContainer = document.getElementById('inbox-sidebar-tags-container');
    const notesList = document.getElementById('inbox-internal-notes-list');

    if (!conv) return;

    if (contactEl) contactEl.textContent = conv.contactName;
    if (compEl) compEl.textContent = conv.company || 'Inbound WhatsApp';
    if (phoneEl) phoneEl.textContent = conv.phone || '+91 94470 12345';

    // AI Lead Score
    if (scoreEl) {
      const score = conv.aiScore || 75;
      const label = score >= 80 ? 'HOT' : score >= 50 ? 'WARM' : 'COLD';
      const colorBg = score >= 80 ? 'rgba(239, 68, 68, 0.18)' : score >= 50 ? 'rgba(245, 158, 11, 0.18)' : 'rgba(59, 130, 246, 0.18)';
      const colorText = score >= 80 ? '#f87171' : score >= 50 ? '#fbbf24' : '#60a5fa';
      scoreEl.style.background = colorBg;
      scoreEl.style.color = colorText;
      scoreEl.style.borderColor = colorText;
      scoreEl.textContent = `Score: ${score}/100 (${label})`;
    }

    // AI Briefing Summary
    if (aiSummaryEl) {
      aiSummaryEl.textContent = conv.aiSummary || 'Received real inbound message via WhatsApp webhook.';
    }

    if (stageSelect && conv.leadStage) stageSelect.value = conv.leadStage;
    if (agentSelect && conv.assignedAgent) agentSelect.value = conv.assignedAgent;

    // Tags
    if (tagsContainer) {
      const tags = conv.tags || ['VIP Lead', 'Dental Clinic'];
      tagsContainer.innerHTML = tags.map(t => `
        <span class="crm-tag-badge">
          ${t}
          <button type="button" class="crm-tag-remove-btn" data-tag="${t}">✕</button>
        </span>
      `).join('');

      tagsContainer.querySelectorAll('.crm-tag-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const t = btn.getAttribute('data-tag');
          conv.tags = (conv.tags || []).filter(x => x !== t);
          window.appState.set('conversations', window.appState.get('conversations'));
          this.renderRightSidebar(conv);
        });
      });
    }

    // Internal Notes
    if (notesList) {
      const notes = conv.internalNotes || [
        { author: 'Karthik Raja', timestamp: '10:15 AM', text: 'Prospect expressed interest in automated WhatsApp booking sequence.' }
      ];

      notesList.innerHTML = notes.map(n => `
        <div class="internal-note-card">
          <div class="internal-note-header">
            <strong>${n.author}</strong>
            <span>${n.timestamp}</span>
          </div>
          <div class="internal-note-body">${n.text}</div>
        </div>
      `).join('');
    }
  }
}

window.inboxComponent = new InboxComponent();
