/* =============================================================================
   social-inbox.js — NextBright CRM
   Instagram DM Inbox: Conversation list, chat window, contact panel.
   
   How it works:
   1. On load: checks for instagram_connection in localStorage / Supabase.
   2. If connected: fetches conversations from /api/social-conversations?action=list
   3. If not connected: shows connection prompt.
   4. Sends messages via /api/social-conversations?action=send_message (server-side only).
   5. All data is persisted in Supabase (social_conversations, social_messages tables).
   ============================================================================= */
'use strict';

(function () {

  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const toast = (msg, type) => { if (typeof window.showToast === 'function') window.showToast(msg, type); };

  /* ---- State ---- */
  const state = {
    conversations: [],
    activeConvId: null,
    filter: 'all',
    search: '',
    loading: false,
    igConnected: false,
    igAccount: null,
    messages: {},  // convId -> []
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
      state.igAccount = JSON.parse(localStorage.getItem('nb_ig_connection') || 'null');
      state.igConnected = !!state.igAccount;
    } catch {
      state.igConnected = false;
    }
  }

  /* ---- Load conversations from server (or localStorage fallback) ---- */
  async function loadConversations() {
    if (!state.igConnected) {
      renderConvList();
      renderEmptyState('not-connected');
      return;
    }

    state.loading = true;
    renderConvList();

    try {
      const data = await apiFetch('/api/social-conversations?action=list');
      state.conversations = data.conversations || [];
      // Cache locally
      localStorage.setItem('nb_social_conversations', JSON.stringify(state.conversations));
    } catch (err) {
      // Fall back to cached data
      state.conversations = JSON.parse(localStorage.getItem('nb_social_conversations') || '[]');
      if (state.conversations.length === 0) {
        console.warn('[SocialInbox] Could not load conversations:', err.message);
      }
    } finally {
      state.loading = false;
      renderConvList();
      if (state.conversations.length > 0) {
        renderEmptyState('select');
      } else {
        renderEmptyState('empty');
      }
    }
  }

  /* ---- Load messages for a conversation ---- */
  async function loadMessages(convId) {
    if (state.messages[convId]) return state.messages[convId];
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
    const q = state.search.toLowerCase();
    if (q) {
      list = list.filter(c =>
        (c.participant_name || '').toLowerCase().includes(q) ||
        (c.participant_username || '').toLowerCase().includes(q) ||
        (c.last_message_text || '').toLowerCase().includes(q)
      );
    }
    if (state.filter === 'unread') list = list.filter(c => c.unread_count > 0);
    if (state.filter === 'open') list = list.filter(c => c.status === 'open');
    if (state.filter === 'closed') list = list.filter(c => c.status === 'closed');
    if (state.filter === 'assigned') list = list.filter(c => c.assigned_to);
    return list.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
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
        ${state.search ? 'No conversations match your search.' : state.filter !== 'all' ? 'No conversations with this filter.' : state.igConnected ? 'No conversations yet.' : ''}
      </div>`;
      return;
    }

    el.innerHTML = list.map(c => {
      const name = c.participant_name || c.participant_username || 'Unknown';
      const initials = name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
      const isActive = c.id === state.activeConvId;
      const isUnread = c.unread_count > 0;
      const hasPic = !!c.participant_pic;
      const badgeColors = ['#2563EB', '#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#0EA5E9', '#EC4899'];
      const color = badgeColors[Math.abs(name.charCodeAt(0)) % badgeColors.length];

      return `
        <div class="social-conv-item ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''}"
             data-conv-id="${esc(c.id)}" role="button" tabindex="0">
          <div class="conv-avatar-wrap">
            <div class="conv-avatar" style="background:${hasPic ? 'transparent' : color}">
              ${hasPic ? `<img src="${esc(c.participant_pic)}" alt="${esc(name)}" loading="lazy">` : initials}
            </div>
            <div class="conv-platform-badge" title="Instagram">📸</div>
          </div>
          <div class="conv-item-body">
            <div class="conv-item-header">
              <span class="conv-item-name">${esc(name)}</span>
              <span class="conv-item-time">${timeAgo(c.last_message_at)}</span>
            </div>
            <div class="conv-item-last-msg">${esc(c.last_message_text || 'No messages yet')}</div>
          </div>
          ${isUnread ? `<div class="conv-unread-badge">${c.unread_count > 9 ? '9+' : c.unread_count}</div>` : ''}
        </div>
      `;
    }).join('');

    // Bind click events
    el.querySelectorAll('.social-conv-item').forEach(item => {
      item.addEventListener('click', () => selectConversation(item.dataset.convId));
      item.addEventListener('keydown', e => { if (e.key === 'Enter') selectConversation(item.dataset.convId); });
    });
  }

  /* ---- Render empty state in chat panel ---- */
  function renderEmptyState(mode) {
    const emptyEl = document.getElementById('social-inbox-empty-state');
    const chatEl = document.getElementById('social-chat-active');
    if (!emptyEl || !chatEl) return;

    if (mode === 'not-connected') {
      emptyEl.style.display = 'flex';
      chatEl.style.display = 'none';
      emptyEl.innerHTML = `
        <div class="social-inbox-empty-icon">🔒</div>
        <div style="font-weight:600;color:var(--text-primary)">Connect Instagram to view your inbox</div>
        <div style="font-size:0.8125rem;text-align:center;max-width:280px;">
          Link your Instagram Professional account to receive and reply to DM conversations.
        </div>
        <button class="btn btn-primary btn-sm" onclick="window.switchView('social-integrations')">
          📸 Connect Instagram
        </button>
        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">
          Requires: instagram_manage_messages permission
        </div>
      `;
    } else if (mode === 'empty') {
      emptyEl.style.display = 'flex';
      chatEl.style.display = 'none';
      emptyEl.innerHTML = `
        <div class="social-inbox-empty-icon">📭</div>
        <div style="font-weight:600;color:var(--text-primary)">No conversations yet</div>
        <div style="font-size:0.8125rem;">When customers DM your Instagram account, they'll appear here.</div>
      `;
    } else if (mode === 'select') {
      emptyEl.style.display = 'flex';
      chatEl.style.display = 'none';
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

    // Reset unread count locally
    conv.unread_count = 0;
    renderConvList();

    // Show chat panel
    const emptyEl = document.getElementById('social-inbox-empty-state');
    const chatEl = document.getElementById('social-chat-active');
    if (emptyEl) emptyEl.style.display = 'none';
    if (chatEl) chatEl.style.display = 'flex';

    // Render header
    renderChatHeader(conv);

    // Load and render messages
    const msgs = await loadMessages(convId);
    renderMessages(msgs, conv);

    // Render contact panel
    renderContactPanel(conv);

    // Mark as read via API (best effort)
    apiFetch('/api/social-conversations?action=mark_read', {
      method: 'POST',
      body: JSON.stringify({ conv_id: convId }),
    }).catch(() => {});

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
        <button class="btn btn-secondary btn-sm btn-icon" title="Assign" id="social-assign-btn"><i data-feather="user-plus"></i></button>
        <button class="btn btn-secondary btn-sm btn-icon" title="Add label" id="social-label-btn"><i data-feather="tag"></i></button>
        <button class="btn btn-secondary btn-sm btn-icon" title="Create CRM lead" id="social-crm-btn" onclick="createLeadFromConv()"><i data-feather="user-check"></i></button>
        <button class="btn btn-secondary btn-sm" id="social-close-conv-btn" onclick="toggleConvStatus()">
          ${conv.status === 'closed' ? '↩ Reopen' : '✓ Close'}
        </button>
      </div>
    `;
  }

  /* ---- Render messages ---- */
  function renderMessages(msgs, conv) {
    const el = document.getElementById('social-messages-area');
    if (!el) return;

    if (!msgs.length) {
      el.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:0.8125rem;padding:24px;">No messages yet.</div>`;
      return;
    }

    el.innerHTML = msgs.map(msg => {
      const isOut = msg.direction === 'out';
      const content = esc(msg.content || '');
      let mediaHtml = '';

      if (msg.media_url && msg.message_type === 'image') {
        mediaHtml = `<img class="bubble-img" src="${esc(msg.media_url)}" alt="Image" loading="lazy" onclick="window.open('${esc(msg.media_url)}','_blank')">`;
      } else if (msg.media_url && msg.message_type === 'video') {
        mediaHtml = `<div class="bubble-video-wrap"><video controls preload="none"><source src="${esc(msg.media_url)}"></video></div>`;
      }

      const statusIcon = isOut ? (msg.delivery_status === 'read' ? '✓✓' : msg.delivery_status === 'delivered' ? '✓✓' : '✓') : '';

      return `
        <div class="social-msg-bubble ${isOut ? 'out' : 'in'}">
          ${mediaHtml}
          ${content ? `<div class="bubble-inner">${content}</div>` : ''}
          <div class="bubble-meta">
            <span>${msg.created_at ? new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
            ${isOut ? `<span class="bubble-status ${msg.delivery_status === 'read' ? 'read' : ''}">${statusIcon}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Scroll to bottom
    el.scrollTop = el.scrollHeight;
  }

  /* ---- Render contact panel ---- */
  function renderContactPanel(conv) {
    const el = document.getElementById('social-contact-info');
    if (!el) return;
    const name = conv.participant_name || conv.participant_username || 'Unknown';
    el.innerHTML = `
      <!-- Profile -->
      <div class="contact-panel-section">
        <div class="conv-avatar" style="width:56px;height:56px;font-size:1.1rem;margin:0 auto 10px;background:#dc2743;color:#fff;">
          ${conv.participant_pic ? `<img src="${esc(conv.participant_pic)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" loading="lazy">` : name.slice(0, 2).toUpperCase()}
        </div>
        <div style="text-align:center;font-weight:700;font-size:0.9375rem;">${esc(name)}</div>
        ${conv.participant_username ? `<div style="text-align:center;font-size:0.78rem;color:var(--text-muted);">@${esc(conv.participant_username)}</div>` : ''}
      </div>

      <!-- CRM Actions -->
      <div class="contact-panel-section">
        <div class="contact-panel-label">CRM Actions</div>
        ${conv.lead_id ? `
          <div style="font-size:0.8rem;color:#10b981;display:flex;align-items:center;gap:6px;margin-bottom:6px;">✅ Linked to CRM lead</div>
        ` : `
          <button class="btn btn-primary btn-sm w-full" onclick="createLeadFromConv()" style="width:100%;justify-content:center;margin-bottom:6px;">
            <i data-feather="user-plus" style="width:13px;height:13px;"></i> Create CRM Lead
          </button>
        `}
        <button class="btn btn-secondary btn-sm w-full" style="width:100%;justify-content:center;" onclick="window.switchView('leads')">
          <i data-feather="users" style="width:13px;height:13px;"></i> View in CRM
        </button>
      </div>

      <!-- Labels -->
      <div class="contact-panel-section">
        <div class="contact-panel-label">Labels</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          ${(conv.labels || []).map(l => `<span style="padding:2px 8px;background:var(--brand-primary-light);color:var(--brand-primary);border-radius:4px;font-size:0.72rem;font-weight:600;">${esc(l)}</span>`).join('') || `<span style="font-size:0.78rem;color:var(--text-muted);">No labels</span>`}
          <button class="btn btn-secondary btn-sm" style="font-size:0.72rem;padding:2px 8px;height:auto;" onclick="addLabel()">+ Add</button>
        </div>
      </div>

      <!-- Internal Notes -->
      <div class="contact-panel-section">
        <div class="contact-panel-label">Internal Notes</div>
        <textarea id="social-internal-note" rows="3" class="form-input" style="font-size:0.78rem;resize:vertical;" placeholder="Add a private note…"></textarea>
        <button class="btn btn-secondary btn-sm" style="margin-top:6px;" onclick="saveNote()">Save Note</button>
      </div>

      <!-- Assign To -->
      <div class="contact-panel-section">
        <div class="contact-panel-label">Assigned To</div>
        <div style="font-size:0.8375rem;color:var(--text-primary);">
          ${conv.assigned_to ? 'Team Member' : '<span style="color:var(--text-muted);">Unassigned</span>'}
        </div>
        <button class="btn btn-secondary btn-sm" style="margin-top:6px;" onclick="assignConversation()"><i data-feather="user" style="width:12px;height:12px;"></i> Assign</button>
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

    if (!state.igConnected) {
      toast('Instagram not connected. Please connect in Social Integrations.', 'error');
      return;
    }

    input.value = '';
    input.disabled = true;

    // Optimistic UI update
    const optimistic = {
      id: 'opt_' + Date.now(),
      direction: 'out',
      message_type: 'text',
      content: text,
      delivery_status: 'sent',
      created_at: new Date().toISOString(),
    };
    if (!state.messages[state.activeConvId]) state.messages[state.activeConvId] = [];
    state.messages[state.activeConvId].push(optimistic);
    renderMessages(state.messages[state.activeConvId], conv);

    try {
      const result = await apiFetch('/api/social-conversations?action=send_message', {
        method: 'POST',
        body: JSON.stringify({
          conv_id: state.activeConvId,
          participant_id: conv.participant_id,
          text,
        }),
      });

      // Replace optimistic with real message
      const idx = state.messages[state.activeConvId].findIndex(m => m.id === 'opt_' + Date.now() - 1 || m.id === optimistic.id);
      if (idx >= 0 && result.message) {
        state.messages[state.activeConvId][idx] = result.message;
      }
      renderMessages(state.messages[state.activeConvId], conv);
      toast('Message sent', 'success');
    } catch (err) {
      toast(`Failed to send message: ${err.message}`, 'error');
      // Mark optimistic as failed
      optimistic.delivery_status = 'failed';
      renderMessages(state.messages[state.activeConvId], conv);
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  /* ---- Create CRM lead from conversation ---- */
  window.createLeadFromConv = function () {
    const conv = state.conversations.find(c => c.id === state.activeConvId);
    if (!conv) return;
    const name = conv.participant_name || conv.participant_username || 'Instagram Contact';
    // Pre-fill quick-add modal if it exists
    const nameEl = document.getElementById('qa-name');
    const sourceEl = document.getElementById('qa-source');
    if (nameEl) nameEl.value = name;
    if (sourceEl) sourceEl.value = 'Instagram';
    const modal = document.getElementById('quick-add-modal');
    if (modal) modal.style.display = 'flex';
    toast(`Pre-filled lead form for "${name}"`, 'default');
  };

  /* ---- Toggle conversation open/close ---- */
  window.toggleConvStatus = function () {
    const conv = state.conversations.find(c => c.id === state.activeConvId);
    if (!conv) return;
    const newStatus = conv.status === 'closed' ? 'open' : 'closed';
    apiFetch('/api/social-conversations?action=update_status', {
      method: 'POST',
      body: JSON.stringify({ conv_id: conv.id, status: newStatus }),
    }).then(() => {
      conv.status = newStatus;
      renderChatHeader(conv);
      toast(`Conversation ${newStatus}`, 'success');
    }).catch(err => toast('Failed: ' + err.message, 'error'));
  };

  /* ---- Add label ---- */
  window.addLabel = function () {
    const label = prompt('Enter label name:');
    if (!label) return;
    const conv = state.conversations.find(c => c.id === state.activeConvId);
    if (!conv) return;
    conv.labels = [...(conv.labels || []), label.trim()];
    renderContactPanel(conv);
    apiFetch('/api/social-conversations?action=add_label', {
      method: 'POST',
      body: JSON.stringify({ conv_id: conv.id, label: label.trim() }),
    }).catch(() => {});
  };

  /* ---- Save internal note ---- */
  window.saveNote = function () {
    const noteEl = document.getElementById('social-internal-note');
    if (!noteEl || !noteEl.value.trim()) return;
    const conv = state.conversations.find(c => c.id === state.activeConvId);
    if (!conv) return;
    const note = { text: noteEl.value.trim(), at: new Date().toISOString() };
    conv.internal_notes = [...(conv.internal_notes || []), note];
    noteEl.value = '';
    apiFetch('/api/social-conversations?action=add_note', {
      method: 'POST',
      body: JSON.stringify({ conv_id: conv.id, note }),
    }).catch(() => {});
    toast('Note saved', 'success');
  };

  /* ---- Assign conversation ---- */
  window.assignConversation = function () {
    toast('Open the team settings to assign conversations to team members.', 'default');
  };

  /* ---- Bind filter chips ---- */
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

  /* ---- Bind search ---- */
  function bindSearch() {
    const el = document.getElementById('social-conv-search');
    if (el) {
      el.addEventListener('input', () => {
        state.search = el.value;
        renderConvList();
      });
    }
  }

  /* ---- Bind send button and textarea ---- */
  function bindInput() {
    const sendBtn = document.getElementById('social-send-btn');
    const inputBox = document.getElementById('social-input-box');

    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (inputBox) {
      inputBox.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      });
      // Auto-resize
      inputBox.addEventListener('input', () => {
        inputBox.style.height = 'auto';
        inputBox.style.height = Math.min(inputBox.scrollHeight, 100) + 'px';
      });
    }

    // Attach image button
    const attachBtn = document.getElementById('social-attach-btn');
    if (attachBtn) {
      attachBtn.addEventListener('click', () => {
        toast('Image sending requires Instagram Graph API credentials to be configured.', 'default');
      });
    }

    // Connect button in empty state
    const connectBtn = document.getElementById('social-inbox-connect-ig-btn');
    if (connectBtn) connectBtn.addEventListener('click', () => window.switchView('social-integrations'));
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

  /* ---- Hook into navigation ---- */
  const _origSwitch = window.switchView;
  window.switchView = function (viewId, ...rest) {
    if (typeof _origSwitch === 'function') _origSwitch(viewId, ...rest);
    if (viewId === 'social-inbox') setTimeout(init, 80);
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (window.location.hash.includes('social-inbox')) setTimeout(init, 100);
  });

  window.socialInbox = { init, loadConversations, state };

  // Add spin animation if not present
  if (!document.getElementById('social-spin-style')) {
    const s = document.createElement('style');
    s.id = 'social-spin-style';
    s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }

})();
