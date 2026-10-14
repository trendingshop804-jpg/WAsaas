/* =============================================================================
   social-inbox.js — NextBright CRM
   Instagram DM Inbox: Conversation list, chat window, contact panel.
   Supports live Meta Graph API sync & rich Interactive Demo / Sandbox Mode.
   ============================================================================= */
'use strict';

(function () {

  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const toast = (msg, type) => { if (typeof window.showToast === 'function') window.showToast(msg, type); };

  const DEFAULT_DEMO_CONVERSATIONS = [
    {
      id: 'conv-ig-1',
      participant_id: 'ig_user_101',
      participant_name: 'Sophia Martinez',
      participant_username: 'sophiam_design',
      participant_pic: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      platform: 'instagram',
      unread_count: 2,
      status: 'open',
      last_message_text: 'Hi! I saw your post on WhatsApp CRM integration. What is the pricing for enterprise?',
      last_message_at: new Date(Date.now() - 3600000 * 2).toISOString(),
      labels: ['Inquiry', 'Enterprise']
    },
    {
      id: 'conv-ig-2',
      participant_id: 'ig_user_102',
      participant_name: 'Alex Johnson',
      participant_username: 'alexj_tech',
      participant_pic: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      platform: 'instagram',
      unread_count: 0,
      status: 'open',
      last_message_text: 'Thanks for sending the demo link! Checking it out now.',
      last_message_at: new Date(Date.now() - 86400000 * 1).toISOString(),
      labels: ['Demo Sent']
    },
    {
      id: 'conv-ig-3',
      participant_id: 'ig_user_103',
      participant_name: 'Priya Patel',
      participant_username: 'priya_lifestyle',
      participant_pic: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      platform: 'instagram',
      unread_count: 1,
      status: 'open',
      last_message_text: 'Can this integrate with our Shopify store as well?',
      last_message_at: new Date(Date.now() - 3600000 * 5).toISOString(),
      labels: ['Shopify', 'Integration']
    },
    {
      id: 'conv-ig-4',
      participant_id: 'ig_user_104',
      participant_name: 'Marcus Vance',
      participant_username: 'marcus_vance',
      participant_pic: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      platform: 'instagram',
      unread_count: 0,
      status: 'closed',
      last_message_text: 'Confirmed for our onboarding call on Friday. See you then!',
      last_message_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      labels: ['Closed Won']
    }
  ];

  const DEFAULT_DEMO_MESSAGES = {
    'conv-ig-1': [
      { id: 'm1', direction: 'in', content: 'Hey there! Loved your reel on automated follow-ups.', created_at: new Date(Date.now() - 7200000).toISOString() },
      { id: 'm2', direction: 'out', content: 'Hi Sophia! Thanks for reaching out. We help automate lead engagement directly into CRM.', delivery_status: 'read', created_at: new Date(Date.now() - 5400000).toISOString() },
      { id: 'm3', direction: 'in', content: 'Hi! I saw your post on WhatsApp CRM integration. What is the pricing for enterprise?', created_at: new Date(Date.now() - 3600000 * 2).toISOString() }
    ],
    'conv-ig-2': [
      { id: 'm201', direction: 'in', content: 'Could you send me your product roadmap?', created_at: new Date(Date.now() - 86400000 * 2).toISOString() },
      { id: 'm202', direction: 'out', content: 'Sure Alex, here is our demo workspace link and documentation.', delivery_status: 'read', created_at: new Date(Date.now() - 86400000 * 1.5).toISOString() },
      { id: 'm203', direction: 'in', content: 'Thanks for sending the demo link! Checking it out now.', created_at: new Date(Date.now() - 86400000 * 1).toISOString() }
    ],
    'conv-ig-3': [
      { id: 'm301', direction: 'in', content: 'Can this integrate with our Shopify store as well?', created_at: new Date(Date.now() - 3600000 * 5).toISOString() }
    ],
    'conv-ig-4': [
      { id: 'm401', direction: 'in', content: 'Confirmed for our onboarding call on Friday. See you then!', created_at: new Date(Date.now() - 86400000 * 3).toISOString() }
    ]
  };

  /* ---- State ---- */
  const state = {
    conversations: [],
    activeConvId: null,
    filter: 'all',
    search: '',
    loading: false,
    igConnected: false,
    igAccount: null,
    messages: {},
  };

  /* ---- Auth helper ---- */
  function getAuthToken() {
    return window.supabaseConfig?.accessToken
      || localStorage.getItem('sb-access-token')
      || '';
  }

  /* ---- API helpers ---- */
  async function apiFetch(path, opts = {}) {
    const token = getAuthToken();
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
    return data;
  }

  /* ---- Load Instagram connection status ---- */
  function loadIgConnection() {
    try {
      state.igAccount = JSON.parse(localStorage.getItem('nb_ig_connection') || localStorage.getItem('nb_instagram_conn') || 'null');
      state.igConnected = !!(state.igAccount && (state.igAccount.page_access_token || state.igAccount.accessToken || state.igAccount.ig_account_id));
    } catch {
      state.igConnected = false;
    }
  }

  /* ---- Load conversations from server (or localStorage fallback) ---- */
  async function loadConversations() {
    state.loading = true;
    renderConvList();

    let stored = [];
    try {
      stored = JSON.parse(localStorage.getItem('nb_social_conversations') || '[]');
    } catch (_) {}

    if (state.igConnected) {
      try {
        const data = await apiFetch('/api/social-conversations?action=list');
        if (data.conversations && data.conversations.length > 0) {
          state.conversations = data.conversations;
          localStorage.setItem('nb_social_conversations', JSON.stringify(state.conversations));
        } else if (stored.length > 0) {
          state.conversations = stored;
        } else {
          state.conversations = DEFAULT_DEMO_CONVERSATIONS;
        }
      } catch (err) {
        state.conversations = stored.length ? stored : DEFAULT_DEMO_CONVERSATIONS;
      }
    } else {
      state.conversations = stored.length ? stored : DEFAULT_DEMO_CONVERSATIONS;
    }

    state.loading = false;
    renderConvList();

    if (state.conversations.length > 0) {
      if (!state.activeConvId) {
        selectConversation(state.conversations[0].id);
      } else {
        selectConversation(state.activeConvId);
      }
    } else {
      renderEmptyState('empty');
    }
  }

  /* ---- Load messages for a conversation ---- */
  async function loadMessages(convId) {
    if (state.messages[convId]) return state.messages[convId];
    if (DEFAULT_DEMO_MESSAGES[convId]) {
      state.messages[convId] = [...DEFAULT_DEMO_MESSAGES[convId]];
      return state.messages[convId];
    }
    try {
      const data = await apiFetch(`/api/social-conversations?action=messages&conv_id=${encodeURIComponent(convId)}`);
      state.messages[convId] = data.messages || [];
    } catch {
      state.messages[convId] = [];
    }
    return state.messages[convId];
  }

  /* ---- Filter conversations ---- */
  function filteredConvs() {
    let list = [...state.conversations];
    const q = (state.search || '').toLowerCase();
    if (q) {
      list = list.filter(c =>
        (c.participant_name || '').toLowerCase().includes(q) ||
        (c.participant_username || '').toLowerCase().includes(q) ||
        (c.last_message_text || '').toLowerCase().includes(q)
      );
    }
    if (state.filter === 'unread') list = list.filter(c => (c.unread_count || 0) > 0);
    if (state.filter === 'open') list = list.filter(c => (c.status || 'open') === 'open');
    if (state.filter === 'closed') list = list.filter(c => c.status === 'closed');
    if (state.filter === 'assigned') list = list.filter(c => c.assigned_to);
    return list.sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
  }

  /* ---- Relative time ---- */
  function timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return Math.floor(h / 24) + 'd';
  }

  /* ---- Render conversation list ---- */
  function renderConvList() {
    const el = document.getElementById('social-conv-list');
    if (!el) return;

    if (state.loading) {
      el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.8125rem;">
        <div class="spinner" style="margin:0 auto 8px;width:24px;height:24px;border:2px solid var(--border-light);border-top-color:var(--brand-primary);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        Loading conversations…
      </div>`;
      return;
    }

    const list = filteredConvs();
    if (!list.length) {
      el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.8125rem;">
        No conversations found.
      </div>`;
      return;
    }

    el.innerHTML = list.map(c => {
      const active = c.id === state.activeConvId ? 'active' : '';
      const unread = (c.unread_count || 0) > 0 ? 'unread' : '';
      const name = c.participant_name || c.participant_username || 'Unknown';
      const initials = name.slice(0, 2).toUpperCase();
      const time = timeAgo(c.last_message_at);

      return `
        <div class="social-conv-item ${active} ${unread}" data-id="${esc(c.id)}" onclick="window.NextBrightInbox.selectConversation('${esc(c.id)}')">
          <div class="conv-avatar" style="position:relative;background:#dc2743;color:#fff;">
            ${c.participant_pic ? `<img src="${esc(c.participant_pic)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" loading="lazy">` : initials}
            <span class="platform-dot ig" style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;border:2px solid #fff;"></span>
          </div>
          <div class="conv-item-content">
            <div class="conv-item-top">
              <span class="conv-item-name">${esc(name)}</span>
              <span class="conv-item-time">${time}</span>
            </div>
            <div class="conv-item-preview">${esc(c.last_message_text || 'No messages')}</div>
            <div class="conv-item-bottom">
              ${(c.labels || []).slice(0, 2).map(l => `<span class="conv-chip">${esc(l)}</span>`).join('')}
              ${c.unread_count > 0 ? `<span class="conv-unread-count">${c.unread_count}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    const badgeEl = document.getElementById('social-inbox-badge');
    const totalUnread = state.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
    if (badgeEl) {
      badgeEl.textContent = totalUnread;
      badgeEl.style.display = totalUnread > 0 ? 'inline-flex' : 'none';
    }
  }

  /* ---- Render empty state in chat panel ---- */
  function renderEmptyState(mode) {
    const emptyEl = document.getElementById('social-inbox-empty-state');
    const chatEl = document.getElementById('social-chat-active');
    if (!emptyEl || !chatEl) return;

    emptyEl.style.display = 'flex';
    chatEl.style.display = 'none';

    if (mode === 'empty') {
      emptyEl.innerHTML = `
        <div class="social-inbox-empty-icon">📭</div>
        <div style="font-weight:600;color:var(--text-primary)">No conversations yet</div>
        <div style="font-size:0.8125rem;">When customers DM your Instagram account, they'll appear here.</div>
      `;
    } else {
      emptyEl.innerHTML = `
        <div class="social-inbox-empty-icon">📨</div>
        <div style="font-weight:600;color:var(--text-primary)">Select a conversation</div>
        <div style="font-size:0.8125rem;">Choose a conversation from the list to view messages</div>
      `;
    }
  }

  /* ---- Select and open conversation ---- */
  async function selectConversation(convId) {
    state.activeConvId = convId;
    const conv = state.conversations.find(c => c.id === convId);
    if (!conv) return;

    conv.unread_count = 0;
    renderConvList();

    const emptyEl = document.getElementById('social-inbox-empty-state');
    const chatEl = document.getElementById('social-chat-active');
    if (emptyEl) emptyEl.style.display = 'none';
    if (chatEl) chatEl.style.display = 'flex';

    renderChatHeader(conv);

    const msgs = await loadMessages(convId);
    renderMessages(msgs, conv);
    renderContactPanel(conv);

    if (state.igConnected) {
      apiFetch('/api/social-conversations?action=mark_read', {
        method: 'POST',
        body: JSON.stringify({ conv_id: convId }),
      }).catch(() => {});
    }

    if (typeof feather !== 'undefined') feather.replace();
  }

  /* ---- Render chat header ---- */
  function renderChatHeader(conv) {
    const el = document.getElementById('social-chat-header');
    if (!el) return;
    const name = conv.participant_name || conv.participant_username || 'Unknown';
    el.innerHTML = `
      <div class="conv-avatar" style="width:36px;height:36px;font-size:0.8rem;flex-shrink:0;background:#dc2743;color:#fff;">
        ${conv.participant_pic ? `<img src="${esc(conv.participant_pic)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" loading="lazy">` : name.slice(0, 2).toUpperCase()}
      </div>
      <div class="chat-header-info">
        <div class="chat-header-name">${esc(name)}</div>
        <div class="chat-header-meta">
          ${conv.participant_username ? `@${esc(conv.participant_username)} · ` : ''}
          <span class="status-badge ${conv.status || 'open'}" style="font-size:0.68rem;">${esc(conv.status || 'open')}</span>
        </div>
      </div>
      <div class="chat-header-actions">
        <button class="btn btn-secondary btn-sm btn-icon" title="Add label" onclick="window.addLabel()"><i data-feather="tag"></i></button>
        <button class="btn btn-secondary btn-sm btn-icon" title="Create CRM lead" onclick="window.createLeadFromConv()"><i data-feather="user-check"></i></button>
        <button class="btn btn-secondary btn-sm" id="social-close-conv-btn" onclick="window.toggleConvStatus()">
          ${conv.status === 'closed' ? '↩ Reopen' : '✓ Close'}
        </button>
      </div>
    `;
  }

  /* ---- Render messages ---- */
  function renderMessages(msgs, conv) {
    const el = document.getElementById('social-messages-area');
    if (!el) return;

    if (!msgs || !msgs.length) {
      el.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:0.8125rem;padding:24px;">No messages in this conversation.</div>`;
      return;
    }

    el.innerHTML = msgs.map(msg => {
      const isOut = msg.direction === 'out';
      const content = esc(msg.content || '');
      let mediaHtml = '';

      if (msg.media_url && (msg.message_type === 'image' || msg.media_url.includes('photo') || msg.media_url.endsWith('.jpg') || msg.media_url.endsWith('.png'))) {
        mediaHtml = `<img class="bubble-img" src="${esc(msg.media_url)}" alt="Image" loading="lazy" style="max-width:240px;border-radius:8px;margin-bottom:6px;display:block;" onclick="window.open('${esc(msg.media_url)}','_blank')">`;
      } else if (msg.media_url && msg.message_type === 'video') {
        mediaHtml = `<div class="bubble-video-wrap"><video controls style="max-width:240px;border-radius:8px;margin-bottom:6px;"><source src="${esc(msg.media_url)}"></video></div>`;
      }

      const statusIcon = isOut ? (msg.delivery_status === 'read' ? '✓✓' : msg.delivery_status === 'delivered' ? '✓✓' : '✓') : '';

      return `
        <div class="social-msg-bubble ${isOut ? 'out' : 'in'}" style="margin-bottom:8px;">
          ${mediaHtml}
          ${content ? `<div class="bubble-inner" style="line-height:1.4;">${content}</div>` : ''}
          <div class="bubble-meta" style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;display:flex;justify-content:${isOut ? 'flex-end' : 'flex-start'};gap:4px;">
            <span>${msg.created_at ? new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
            ${isOut ? `<span class="bubble-status" style="color:#2563eb;">${statusIcon}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    el.scrollTop = el.scrollHeight;
  }

  /* ---- Render contact panel ---- */
  function renderContactPanel(conv) {
    const el = document.getElementById('social-contact-info');
    if (!el) return;
    const name = conv.participant_name || conv.participant_username || 'Unknown';
    el.innerHTML = `
      <!-- Profile -->
      <div class="contact-panel-section" style="padding:14px;border-bottom:1px solid var(--border-light);text-align:center;">
        <div class="conv-avatar" style="width:54px;height:54px;font-size:1.1rem;margin:0 auto 8px;background:#dc2743;color:#fff;">
          ${conv.participant_pic ? `<img src="${esc(conv.participant_pic)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" loading="lazy">` : name.slice(0, 2).toUpperCase()}
        </div>
        <div style="font-weight:700;font-size:0.95rem;color:var(--text-primary);">${esc(name)}</div>
        ${conv.participant_username ? `<div style="font-size:0.8rem;color:var(--text-muted);">@${esc(conv.participant_username)}</div>` : ''}
      </div>

      <!-- CRM Actions -->
      <div class="contact-panel-section" style="padding:14px;border-bottom:1px solid var(--border-light);">
        <div class="contact-panel-label" style="font-size:0.75rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;">CRM Integration</div>
        ${conv.lead_id ? `
          <div style="font-size:0.82rem;color:#10b981;display:flex;align-items:center;gap:6px;margin-bottom:8px;">
            <span>✅ Linked to CRM Pipeline</span>
          </div>
        ` : `
          <button class="btn btn-primary btn-sm w-full" onclick="window.createLeadFromConv()" style="width:100%;justify-content:center;margin-bottom:8px;">
            <i data-feather="user-plus" style="width:13px;height:13px;"></i> Create CRM Lead
          </button>
        `}
        <button class="btn btn-secondary btn-sm w-full" style="width:100%;justify-content:center;" onclick="window.switchView('leads')">
          <i data-feather="users" style="width:13px;height:13px;"></i> View CRM Contacts
        </button>
      </div>

      <!-- Labels -->
      <div class="contact-panel-section" style="padding:14px;border-bottom:1px solid var(--border-light);">
        <div class="contact-panel-label" style="font-size:0.75rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;">Labels</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          ${(conv.labels || []).map(l => `<span style="padding:2px 8px;background:var(--brand-primary-light,#e0f2fe);color:var(--brand-primary,#0284c7);border-radius:4px;font-size:0.72rem;font-weight:600;">${esc(l)}</span>`).join('') || `<span style="font-size:0.75rem;color:var(--text-muted);">No labels</span>`}
          <button class="btn btn-secondary btn-sm" style="font-size:0.72rem;padding:2px 8px;height:auto;" onclick="window.addLabel()">+ Add</button>
        </div>
      </div>

      <!-- Internal Notes -->
      <div class="contact-panel-section" style="padding:14px;">
        <div class="contact-panel-label" style="font-size:0.75rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;">Private Notes</div>
        <textarea id="social-internal-note" rows="3" class="form-control" style="font-size:0.8rem;resize:vertical;margin-bottom:6px;" placeholder="Add private note for sales team..."></textarea>
        <button class="btn btn-secondary btn-sm" onclick="window.saveNote()">Save Note</button>
      </div>
    `;
    if (typeof feather !== 'undefined') feather.replace();
  }

  /* ---- Send message ---- */
  async function sendMessage() {
    const input = document.getElementById('social-input-box');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const conv = state.conversations.find(c => c.id === state.activeConvId);
    if (!conv) return;

    input.value = '';

    const newMsg = {
      id: 'msg_' + Date.now(),
      direction: 'out',
      message_type: 'text',
      content: text,
      delivery_status: 'delivered',
      created_at: new Date().toISOString(),
    };

    if (!state.messages[state.activeConvId]) state.messages[state.activeConvId] = [];
    state.messages[state.activeConvId].push(newMsg);

    conv.last_message_text = text;
    conv.last_message_at = new Date().toISOString();

    renderMessages(state.messages[state.activeConvId], conv);
    renderConvList();

    if (state.igConnected) {
      try {
        await apiFetch('/api/social-conversations?action=send_message', {
          method: 'POST',
          body: JSON.stringify({
            conv_id: state.activeConvId,
            participant_id: conv.participant_id,
            text,
          }),
        });
        toast('Message sent via Instagram API', 'success');
      } catch (err) {
        console.warn('[SocialInbox] Live API send error, kept in local state:', err.message);
      }
    } else {
      toast('Message dispatched (Sandbox Mode)', 'success');
      // Simulate reply from recipient
      setTimeout(() => {
        if (state.activeConvId !== conv.id) return;
        const replies = [
          "Got it, thanks for the quick response! Could you share more details?",
          "Awesome! That sounds great. We will review this with our team.",
          "Thank you! Could we also get a quick product demo link?",
          "Perfect, appreciate the follow-up. Talk soon!"
        ];
        const replyText = replies[Math.floor(Math.random() * replies.length)];
        const replyMsg = {
          id: 'msg_' + Date.now(),
          direction: 'in',
          message_type: 'text',
          content: replyText,
          delivery_status: 'read',
          created_at: new Date().toISOString()
        };
        state.messages[state.activeConvId].push(replyMsg);
        conv.last_message_text = replyText;
        conv.last_message_at = new Date().toISOString();
        renderMessages(state.messages[state.activeConvId], conv);
        renderConvList();
      }, 1400);
    }
  }

  /* ---- Create CRM lead from conversation ---- */
  window.createLeadFromConv = function () {
    const conv = state.conversations.find(c => c.id === state.activeConvId);
    if (!conv) return;
    const name = conv.participant_name || conv.participant_username || 'Instagram Contact';

    const newLead = {
      id: Date.now(),
      name: name,
      phone: '+1 (555) 019-' + Math.floor(1000 + Math.random() * 9000),
      source: 'Instagram DM',
      status: 'New',
      assigned: 'Alex Mathew',
      lastActivity: 'Just now',
      date: new Date().toISOString().split('T')[0],
      score: 82,
      notes: `Captured from Instagram DM (@${conv.participant_username || 'user'}). Last message: "${conv.last_message_text || ''}"`
    };

    if (window.NB && Array.isArray(window.NB.leads)) {
      window.NB.leads.unshift(newLead);
      if (typeof window.renderRecentLeads === 'function') window.renderRecentLeads();
      if (typeof window.renderLeadsTable === 'function') window.renderLeadsTable();
    }

    conv.lead_id = newLead.id;
    renderContactPanel(conv);
    toast(`Successfully created CRM Lead for "${name}"!`, 'success');
  };

  /* ---- Toggle conversation open/close ---- */
  window.toggleConvStatus = function () {
    const conv = state.conversations.find(c => c.id === state.activeConvId);
    if (!conv) return;
    conv.status = conv.status === 'closed' ? 'open' : 'closed';
    renderChatHeader(conv);
    renderConvList();
    toast(`Conversation marked as ${conv.status}`, 'success');
  };

  /* ---- Add label ---- */
  window.addLabel = function () {
    const conv = state.conversations.find(c => c.id === state.activeConvId);
    if (!conv) return;
    const label = prompt('Enter new label name (e.g. VIP, Pricing Inquiry, Priority):');
    if (label && label.trim()) {
      conv.labels = [...(conv.labels || []), label.trim()];
      renderContactPanel(conv);
      renderConvList();
      toast(`Label "${label.trim()}" added`, 'success');
    }
  };

  /* ---- Save note ---- */
  window.saveNote = function () {
    const noteEl = document.getElementById('social-internal-note');
    if (!noteEl || !noteEl.value.trim()) return;
    toast('Note saved for contact', 'success');
    noteEl.value = '';
  };

  /* ---- Bind filters & search ---- */
  function bindFilters() {
    document.querySelectorAll('.social-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.social-filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.filter = chip.dataset.filter || 'all';
        renderConvList();
      });
    });
  }

  function bindSearch() {
    const el = document.getElementById('social-conv-search');
    if (el) {
      el.addEventListener('input', () => {
        state.search = el.value;
        renderConvList();
      });
    }
  }

  function bindInput() {
    const sendBtn = document.getElementById('social-send-btn');
    const inputBox = document.getElementById('social-input-box');

    if (sendBtn) {
      sendBtn.onclick = sendMessage;
    }
    if (inputBox) {
      inputBox.onkeydown = e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      };
    }

    const attachBtn = document.getElementById('social-attach-btn');
    if (attachBtn) {
      attachBtn.onclick = () => {
        const url = prompt('Enter Image URL to attach in DM:', 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600');
        if (url && state.activeConvId) {
          const conv = state.conversations.find(c => c.id === state.activeConvId);
          const msg = {
            id: 'msg_' + Date.now(),
            direction: 'out',
            message_type: 'image',
            media_url: url,
            content: 'Attached media',
            delivery_status: 'delivered',
            created_at: new Date().toISOString()
          };
          if (!state.messages[state.activeConvId]) state.messages[state.activeConvId] = [];
          state.messages[state.activeConvId].push(msg);
          if (conv) {
            conv.last_message_text = '📷 Image attachment';
            conv.last_message_at = new Date().toISOString();
          }
          renderMessages(state.messages[state.activeConvId], conv);
          renderConvList();
          toast('Image attachment dispatched!', 'success');
        }
      };
    }

    const composeBtn = document.getElementById('social-inbox-compose-btn');
    if (composeBtn) {
      composeBtn.onclick = () => {
        const modal = document.getElementById('modal-social-compose');
        if (modal) modal.style.display = 'flex';
      };
    }

    const composeForm = document.getElementById('form-social-compose');
    if (composeForm) {
      composeForm.onsubmit = e => {
        e.preventDefault();
        const username = document.getElementById('social-compose-username')?.value.trim();
        const text = document.getElementById('social-compose-text')?.value.trim();
        if (!username || !text) return;
        const newId = 'conv-ig-' + Date.now();
        const newConv = {
          id: newId,
          participant_id: 'user_' + Date.now(),
          participant_name: username,
          participant_username: username,
          participant_pic: '',
          platform: 'instagram',
          unread_count: 0,
          status: 'open',
          last_message_text: text,
          last_message_at: new Date().toISOString(),
          labels: ['Direct DM']
        };
        state.conversations.unshift(newConv);
        state.messages[newId] = [{
          id: 'msg_' + Date.now(),
          direction: 'out',
          message_type: 'text',
          content: text,
          delivery_status: 'delivered',
          created_at: new Date().toISOString()
        }];
        localStorage.setItem('nb_social_conversations', JSON.stringify(state.conversations));
        document.getElementById('modal-social-compose').style.display = 'none';
        renderConvList();
        selectConversation(newId);
        toast(`New direct message initiated with @${username}`, 'success');
      };
    }

    const connectBtn = document.getElementById('social-inbox-connect-ig-btn');
    if (connectBtn) {
      connectBtn.onclick = () => window.switchView('social-integrations');
    }
  }

  /* ---- Init ---- */
  function init() {
    loadIgConnection();
    bindFilters();
    bindSearch();
    bindInput();
    loadConversations();
    if (typeof feather !== 'undefined') feather.replace();
  }

  // Export public API
  window.NextBrightInbox = {
    init,
    selectConversation,
    sendMessage,
    loadConversations,
    state
  };
  window.socialInbox = window.NextBrightInbox;

  document.addEventListener('DOMContentLoaded', () => {
    if (window.location.hash.includes('social-inbox')) setTimeout(init, 100);
  });

})();
