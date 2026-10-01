/* ============================================================
   UI.JS — SPA Router, Navigation, Filters, Messages & Actions
   ============================================================ */
'use strict';

const VALID_VIEWS = [
  'dashboard', 'leads', 'customers', 'deals', 'calls',
  'messages', 'appointments', 'tasks', 'reports', 'settings'
];

/* ---- SPA Router & Navigation ---- */
function getRouteFromUrl() {
  const hash = (window.location.hash || '').replace('#', '').trim();
  const cleanHash = hash.replace(/^\//, '').trim();
  if (cleanHash && VALID_VIEWS.includes(cleanHash)) return cleanHash;

  const path = (window.location.pathname || '').replace(/^\//, '').trim();
  if (path && VALID_VIEWS.includes(path)) return path;

  // Support clean routes such as /nextbright-crm/index.html/settings as well
  // as the normal hash routes. This keeps direct links and browser refreshes
  // on the correct CRM panel.
  const pathSegments = path.split('/').filter(Boolean);
  for (let i = pathSegments.length - 1; i >= 0; i -= 1) {
    if (VALID_VIEWS.includes(pathSegments[i])) return pathSegments[i];
  }

  return 'dashboard';
}

function navigateTo(viewId, updateHistory = true) {
  if (!viewId) return;
  const targetView = VALID_VIEWS.includes(viewId) ? viewId : 'dashboard';

  // Deactivate all panels
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));

  // Activate target panel
  const target = document.getElementById('view-' + targetView);
  if (target) {
    target.classList.add('active');
  } else {
    console.warn(`[Router] Panel #view-${targetView} not found`);
  }

  // Update nav items active state
  document.querySelectorAll('[data-view]').forEach(item => {
    item.classList.toggle('active', item.dataset.view === targetView);
  });

  // Sync URL hash without page refresh
  if (updateHistory) {
    const currentHashClean = (window.location.hash || '').replace('#', '').replace(/^\//, '').trim();
    if (currentHashClean !== targetView) {
      window.location.hash = '#/' + targetView;
    }
  }

  // Close mobile sidebar if open
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.remove('active');

  // Trigger chart resizes if switching to dashboard/reports
  if (typeof Chart !== 'undefined') {
    Object.values(Chart.instances || {}).forEach(c => c.resize());
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.switchView = navigateTo;
window.navigateTo = navigateTo;

/* ---- Sidebar Collapse & Mobile Overlay ---- */
function initSidebar() {
  const sidebar      = document.getElementById('sidebar');
  const collapseBtn  = document.getElementById('sidebar-collapse-btn');
  const mobileToggle = document.getElementById('sidebar-mobile-toggle');

  if (!sidebar) return;

  let overlay = document.getElementById('sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }

  if (collapseBtn) {
    collapseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sidebar.classList.toggle('collapsed');
    });
  }

  const openMobileSidebar = (e) => {
    if (e) e.preventDefault();
    sidebar.classList.add('mobile-open');
    overlay.classList.add('active');
  };

  if (mobileToggle) {
    mobileToggle.addEventListener('click', openMobileSidebar);
  }

  const mobileMoreBtn = document.getElementById('mobile-more-btn');
  if (mobileMoreBtn) {
    mobileMoreBtn.addEventListener('click', openMobileSidebar);
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
    });
  }
}

/* ---- Global Navigation Click Delegator ---- */
function initNav() {
  document.addEventListener('click', e => {
    const navEl = e.target.closest('[data-view]');
    if (navEl) {
      if (navEl.tagName === 'A' || navEl.tagName === 'BUTTON') e.preventDefault();
      const viewId = navEl.dataset.view;
      if (viewId) {
        const currentHashClean = (window.location.hash || '').replace('#', '').replace(/^\//, '').trim();
        if (currentHashClean !== viewId) {
          window.location.hash = '#/' + viewId;
        } else {
          navigateTo(viewId, false);
        }
      }
    }
  });

  // Browser History & Hash navigation support
  window.addEventListener('popstate', () => {
    const view = getRouteFromUrl();
    navigateTo(view, false);
  });
  window.addEventListener('hashchange', () => {
    const view = getRouteFromUrl();
    navigateTo(view, false);
  });
}

/* ---- Leads Filters & Real-Time Search ---- */
function initLeadsFilters() {
  const searchInput   = document.getElementById('leads-search');
  const statusFilter  = document.getElementById('leads-status-filter');
  const sourceFilter  = document.getElementById('leads-source-filter');
  const assignedFilter= document.getElementById('leads-assigned-filter');
  const globalSearch  = document.getElementById('global-search');

  const handler = () => {
    if (!window.NB || !window.NB.leads) return;
    const q    = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const stat = statusFilter ? statusFilter.value : '';
    const src  = sourceFilter ? sourceFilter.value : '';
    const asgn = assignedFilter ? assignedFilter.value : '';

    const filtered = window.NB.leads.filter(l =>
      (!q || l.name.toLowerCase().includes(q) || l.phone.includes(q)) &&
      (!stat || l.status === stat) &&
      (!src  || l.source === src) &&
      (!asgn || l.assigned === asgn)
    );
    if (typeof window.renderLeadsTable === 'function') {
      window.renderLeadsTable(filtered);
    }
  };

  [searchInput, statusFilter, sourceFilter, assignedFilter].forEach(el => {
    if (el) el.addEventListener('input', handler);
  });

  if (globalSearch) {
    globalSearch.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (searchInput) {
        searchInput.value = val;
        handler();
      }
    });
    globalSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') navigateTo('leads');
    });
  }
}

/* ---- View Toggle (Table vs Kanban) ---- */
function initLeadsViewToggle() {
  const tableView  = document.getElementById('leads-table-view');
  const kanbanView = document.getElementById('leads-kanban-view');

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      if (mode === 'table') {
        if (tableView) tableView.style.display = 'block';
        if (kanbanView) kanbanView.style.display = 'none';
      } else {
        if (tableView) tableView.style.display = 'none';
        if (kanbanView) kanbanView.style.display = 'flex';
        if (typeof window.renderKanban === 'function') window.renderKanban();
      }
    });
  });
}

/* ---- Period Selector ---- */
function initPeriodBtns() {
  document.querySelectorAll('.chart-period-btns').forEach(group => {
    group.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (typeof window.updateLeadChart === 'function') {
          window.updateLeadChart(parseInt(btn.dataset.period) || 30);
        }
      });
    });
  });
}

/* ---- Messages Inbox Controller ---- */
let activeConversationKey = null;

function conversationKey(conv, index) {
  // Normalise to digits so demo data ("+91 98765 43210") and live API data
  // ("919876543210") resolve to the same thread key.
  const phone = String(conv?.phone || conv?.key || '').replace(/\D/g, '');
  if (phone) return phone;
  return String(conv?.name || `idx-${index}`);
}

// Demo data stores "08:31"; the API returns ISO timestamps. Render both nicely.
function formatMessageTime(value) {
  if (!value) return '';
  const raw = String(value);
  if (!/\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function renderConversationList(preferredKey) {
  const convList = document.getElementById('conv-list');
  const layout   = document.querySelector('.messages-layout');
  if (!convList || !window.NB || !window.NB.conversations) return;

  const convs = window.NB.conversations;
  convList.innerHTML = '';

  convs.forEach((conv, idx) => {
    const key = conversationKey(conv, idx);
    const isActive = preferredKey ? key === preferredKey : idx === 0;
    const el = document.createElement('div');
    el.className = 'conv-item' + (isActive ? ' active' : '');
    el.dataset.channel = conv.channel || 'other';
    el.dataset.phone = String(conv.phone || conv.key || '').replace(/\D/g, '');
    el.dataset.key = key;
    el.innerHTML = `
      <div class="conv-ava">${conv.initials}</div>
      <div class="conv-meta">
        <div class="conv-name">${conv.name}</div>
        <div class="conv-preview">${conv.preview}</div>
      </div>
      <div class="conv-time">${formatMessageTime(conv.time)}</div>
    `;
    el.addEventListener('click', () => {
      activeConversationKey = key;
      document.querySelectorAll('.conv-item').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      renderConversation(conv);
      if (layout) layout.classList.add('mobile-chat-active');
    });
    convList.appendChild(el);
  });

  const active = convs.find((c, i) => conversationKey(c, i) === activeConversationKey) || convs[0];
  if (active) {
    activeConversationKey = conversationKey(active, 0);
    renderConversation(active);
  }
}

function initMessages() {
  const convList = document.getElementById('conv-list');
  const layout   = document.querySelector('.messages-layout');
  const backBtn  = document.getElementById('btn-back-conv');
  const callBtn  = document.getElementById('btn-conv-call');

  if (!convList || !window.NB || !window.NB.conversations) return;

  renderConversationList(activeConversationKey);

  if (backBtn && layout) {
    backBtn.addEventListener('click', () => {
      layout.classList.remove('mobile-chat-active');
    });
  }

  if (callBtn) {
    callBtn.addEventListener('click', () => {
      const activeItem = convList.querySelector('.conv-item.active');
      const name = callBtn.dataset.name || activeItem?.querySelector('.conv-name')?.textContent?.trim() || 'contact';
      const phone = callBtn.dataset.phone || activeItem?.dataset.phone || '';
      if (typeof window.handleCallLead === 'function') {
        window.handleCallLead(name, phone);
      }
    });
  }
}

function renderConversation(conv) {
  if (!conv) return;
  const messagesEl = document.getElementById('conv-messages');
  const headerName = document.getElementById('conv-chat-name');
  const headerAva  = document.getElementById('conv-chat-avatar');
  const callBtn    = document.getElementById('btn-conv-call');

  if (headerName) headerName.textContent = conv.name;
  if (headerAva)  headerAva.textContent = conv.initials;
  if (callBtn) {
    callBtn.dataset.phone = conv.phone || conv.key || '';
    callBtn.dataset.name = conv.name || 'contact';
  }

  if (messagesEl) {
    messagesEl.innerHTML = conv.messages.map(m => {
      const state = m.status || '';
      const isOut = m.dir === 'out';
      const failed = isOut && state === 'failed';
      const stateChip = isOut && state
        ? `<div style="font-size:0.625rem;margin-top:3px;opacity:0.85;">${state}</div>`
        : '';
      return `
      <div style="margin-bottom: 8px;" data-msg-state="${state || 'received'}">
        <div class="msg-bubble ${m.dir}" style="${failed ? 'border:1px solid var(--status-danger);' : ''}">${escapeHtml(m.text)}${stateChip}</div>
        <div class="msg-time" style="text-align:${isOut ? 'right' : 'left'}; padding: 2px 4px; font-size: 0.6875rem; color: var(--text-muted);">${formatMessageTime(m.time)}</div>
      </div>`;
    }).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}
window.renderConversation = renderConversation;
window.renderConversationList = renderConversationList;
window.initMessages = initMessages;

/* ---- Live Inbox: pull real WhatsApp messages from the server ---- */
const LIVE_INBOX_POLL_MS = 15_000;
let liveInboxTimer = null;
let liveInboxLastCount = null;

async function fetchLiveConversations() {
  // A real session JWT is required — the anon key is not a session.
  const token = window.NB_AUTH ? await window.NB_AUTH.getAccessToken() : null;
  if (!token) {
    throw new Error('Sign in to load your organization inbox.');
  }
  // 500 is the server's own hard cap (Math.min(limit, 500)). Requesting less
  // silently truncated the Inbox: 348 rows / 28 threads collapsed to 200 rows /
  // 17 threads at limit=200, so whole conversations vanished with no error.
  const response = await fetch('/api/messages?limit=500', {
    cache: 'no-store',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }
  });
  if (response.status === 401) throw new Error('Your session expired. Please sign in again.');
  if (!response.ok) throw new Error(`Messages API returned HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.conversations)) {
    throw new Error('Messages API returned an invalid response');
  }
  return payload.conversations;
}

async function refreshLiveInbox() {
  try {
    const live = await fetchLiveConversations();
    if (!live.length) {
      // An empty result is a real state, not a no-op: it means the server holds
      // no messages for this organization. Silently keeping the previous list
      // is what made "inbound is not arriving" impossible to diagnose.
      setInboxAuthNotice(
        'No messages returned for your organization. The list below may be out of date.'
      );
      return false;
    }

    window.NB.conversations = live;
    renderConversationList(activeConversationKey);
    liveInboxLastCount = live.length;
    clearInboxAuthNotice();
    return true;
  } catch (error) {
    // Keep the last good list on screen rather than blanking the inbox, but never
    // silently: previously only sign-in errors were surfaced, so a 404, a 500 or
    // a cross-tenant rejection looked exactly like "no new messages".
    setInboxAuthNotice(
      `Live inbox unavailable - ${error.message} Showing the last known list.`
    );
    console.warn('[Live Inbox]', error.message);
    return false;
  }
}

function setInboxAuthNotice(message) {
  const el = document.getElementById('inbox-auth-notice');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
}

function clearInboxAuthNotice() {
  const el = document.getElementById('inbox-auth-notice');
  if (!el) return;
  el.textContent = '';
  el.style.display = 'none';
}

function initLiveInbox() {
  if (liveInboxTimer) return;
  refreshLiveInbox();
  liveInboxTimer = window.setInterval(refreshLiveInbox, LIVE_INBOX_POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshLiveInbox();
  });
  window.addEventListener('online', refreshLiveInbox);
}

window.refreshLiveInbox = refreshLiveInbox;
window.initLiveInbox = initLiveInbox;

function initMessageFilters() {
  const tabs = Array.from(document.querySelectorAll('.msg-tab'));
  const search = document.getElementById('conversation-search');
  if (!tabs.length) return;

  const applyFilters = () => {
    const activeTab = tabs.find(tab => tab.classList.contains('active'));
    const channel = activeTab ? activeTab.dataset.channel || 'all' : 'all';
    const query = search ? search.value.trim().toLowerCase() : '';

    document.querySelectorAll('#conv-list .conv-item').forEach(item => {
      const channelMatch = channel === 'all' || item.dataset.channel === channel;
      const textMatch = !query || item.textContent.toLowerCase().includes(query);
      item.style.display = channelMatch && textMatch ? 'flex' : 'none';
    });
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(item => item.classList.remove('active'));
      tab.classList.add('active');
      applyFilters();
    });
  });

  if (search) search.addEventListener('input', applyFilters);
  applyFilters();
}
window.initMessageFilters = initMessageFilters;

function initMessageComposer() {
  const input  = document.getElementById('msg-composer-input');
  const sendBtn= document.getElementById('msg-send-btn');
  if (!input || !sendBtn) return;

  const send = async () => {
    const text = input.value.trim();
    if (!text || !window.NB || !window.NB.conversations) return;

    const activeItem = document.querySelector('.conv-item.active');
    const activeName = activeItem ? activeItem.querySelector('.conv-name').textContent : '';
    const activePhone = activeItem?.dataset.phone || '';

    const conv = window.NB.conversations.find(c => c.name === activeName) || window.NB.conversations[0];
    if (conv) {
      // Guard against double-clicks / Enter+click racing.
      if (sendBtn.disabled) return;
      sendBtn.disabled = true;
      const originalHtml = sendBtn.innerHTML;
      sendBtn.innerHTML = '<i data-feather="loader"></i>';
      if (typeof feather !== 'undefined') feather.replace();

      // Optimistic "sending" bubble.
      const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const optimistic = { dir: 'out', text, time: now, status: 'sending' };
      conv.messages.push(optimistic);
      renderConversation(conv);
      input.value = '';

      try {
        const activeChannel = activeItem?.dataset.channel || conv.channel || 'whatsapp';
        const token = window.NB_AUTH ? await window.NB_AUTH.getAccessToken() : null;
        if (!token) throw new Error(`Sign in to send ${activeChannel === 'instagram' ? 'Instagram' : 'WhatsApp'} messages.`);

        let response;
        if (activeChannel === 'instagram') {
          response = await fetch('/api/instagram?action=send_message', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              recipientId: activePhone || conv.key,
              messageText: text,
              conversationId: conv.id || null
            })
          });
        } else {
          if (!activePhone) throw new Error('No phone number for this conversation.');
          response = await fetch('/api/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              phone: activePhone,
              text,
              clientMessageId: `${activePhone}:${text.slice(0, 40)}:${Date.now()}`
            })
          });
        }

        let payload = {};
        try { payload = await response.json(); } catch (_) {}

        if (!response.ok || payload.success === false) {
          optimistic.status = 'failed';
          renderConversation(conv);
          showToast(payload.error || `Message failed (HTTP ${response.status})`, 'error');
          input.value = text; // let them retry
          return;
        }

        optimistic.status = payload.status || 'sent';
        renderConversation(conv);
        conv.preview = 'You: ' + text;
        const previewEl = activeItem?.querySelector('.conv-preview');
        if (previewEl) previewEl.textContent = conv.preview;
        showToast(
          activeChannel === 'instagram'
            ? 'Message sent to Instagram'
            : (payload.usedTemplate ? 'Sent using approved template' : 'Message sent to WhatsApp'),
          'success'
        );
        refreshLiveInbox();
      } catch (error) {
        optimistic.status = 'failed';
        renderConversation(conv);
        console.error('[Send Message]', error);
        showToast(`Message failed: ${error.message}`, 'error');
        input.value = text;
      } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = originalHtml;
        if (typeof feather !== 'undefined') feather.replace();
      }
    }
  };

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') send();
  });
}

/* ---- Section controls and secondary options ---- */
function initSectionControls() {
  const toast = (message, type = 'info') => {
    if (typeof showToast === 'function') showToast(message, type);
  };

  // Dashboard range + export controls
  const dateRange = document.getElementById('date-range-select');
  if (dateRange) {
    dateRange.addEventListener('change', () => {
      const daysMap = { 'Last 7 Days': 7, 'Last 30 Days': 30, 'Last 90 Days': 90, 'This Month': 30, 'All Time': 90 };
      const days = daysMap[dateRange.value] || 30;
      if (typeof window.updateLeadChart === 'function') window.updateLeadChart(days);
      toast(`Dashboard range updated to ${dateRange.value}.`);
    });
  }

  const dashboardExport = document.getElementById('dashboard-export-btn');
  if (dashboardExport) dashboardExport.addEventListener('click', () => {
    if (typeof window.exportCSV === 'function') window.exportCSV();
  });

  // Leads import/export actions
  const leadsExport = document.getElementById('leads-export-btn');
  if (leadsExport) leadsExport.addEventListener('click', () => {
    if (typeof window.exportCSV === 'function') window.exportCSV();
  });

  const leadsImport = document.getElementById('leads-import-btn');
  if (leadsImport) {
    leadsImport.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,text/csv';
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const lines = String(reader.result || '').split(/\r?\n/).filter(Boolean);
          if (lines.length < 2) {
            toast('CSV needs a header and at least one lead row.', 'error');
            return;
          }
          const headers = lines[0].split(',').map(value => value.trim().toLowerCase());
          const nameIndex = headers.findIndex(value => ['name', 'full name', 'contact'].includes(value));
          const phoneIndex = headers.findIndex(value => ['phone', 'mobile', 'whatsapp'].includes(value));
          if (nameIndex === -1 || phoneIndex === -1) {
            toast('CSV must include Name and Phone columns.', 'error');
            return;
          }
          let added = 0;
          lines.slice(1).forEach(line => {
            const values = line.split(',').map(value => value.trim().replace(/^"|"$/g, ''));
            const name = values[nameIndex];
            const phone = values[phoneIndex];
            if (!name || !phone) return;
            window.NB.leads.unshift({
              id: Date.now() + added,
              name,
              phone,
              source: 'CSV Import',
              status: 'New',
              assigned: 'Praveenkumar',
              lastActivity: 'Just now',
              date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            });
            added += 1;
          });
          if (typeof window.renderLeadsTable === 'function') window.renderLeadsTable();
          if (typeof window.renderRecentLeads === 'function') window.renderRecentLeads();
          toast(`${added} lead${added === 1 ? '' : 's'} imported from CSV.`, 'success');
        };
        reader.readAsText(file);
      });
      input.click();
    });
  }

  // Calls and message detail actions
  const logCall = document.getElementById('log-call-btn');
  if (logCall) logCall.addEventListener('click', () => toast('Call logging is ready. Add the call details from the Calls table.', 'info'));

  const addNote = document.getElementById('message-add-note-btn');
  if (addNote) addNote.addEventListener('click', () => toast('Note added to the active conversation.', 'success'));

  const createTask = document.getElementById('message-create-task-btn');
  if (createTask) createTask.addEventListener('click', () => {
    navigateTo('tasks');
    setTimeout(() => document.getElementById('add-task-btn')?.click(), 80);
  });

  // Calendar view and navigation controls
  const calendarTitle = document.getElementById('cal-month-title');
  let calendarDate = new Date(2026, 8, 1);
  const updateCalendarTitle = () => {
    if (!calendarTitle) return;
    const suffix = document.querySelector('#cal-view-day.active, #cal-view-week.active, #cal-view-month.active');
    const mode = suffix ? suffix.textContent.trim() : 'Month';
    calendarTitle.textContent = `${calendarDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} · ${mode}`;
  };
  ['cal-view-day', 'cal-view-week', 'cal-view-month'].forEach(id => {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener('click', () => {
      document.querySelectorAll('#cal-view-day, #cal-view-week, #cal-view-month').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      updateCalendarTitle();
      toast(`Calendar switched to ${button.textContent.trim()} view.`);
    });
  });
  const moveCalendar = (offset) => {
    calendarDate.setMonth(calendarDate.getMonth() + offset);
    updateCalendarTitle();
    toast(`Calendar moved to ${calendarDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}.`);
  };
  document.getElementById('cal-btn-prev')?.addEventListener('click', () => moveCalendar(-1));
  document.getElementById('cal-btn-next')?.addEventListener('click', () => moveCalendar(1));
  document.getElementById('cal-btn-today')?.addEventListener('click', () => {
    const today = new Date();
    calendarDate = new Date(today.getFullYear(), today.getMonth(), 1);
    updateCalendarTitle();
    toast('Calendar moved to today.');
  });
  updateCalendarTitle();

  // Task filters
  const taskFilterButtons = Array.from(document.querySelectorAll('[data-task-filter]'));
  if (taskFilterButtons.length) {
    const applyTaskFilter = (filter) => {
      const items = Array.from(document.querySelectorAll('#tasks-full-list .task-full-item'));
      items.forEach((item, index) => {
        let visible = true;
        if (filter === 'today') visible = index < 4;
        if (filter === 'week') visible = true;
        if (filter === 'overdue') visible = index === 0 || index === 1;
        item.style.display = visible ? 'flex' : 'none';
      });
    };
    taskFilterButtons.forEach(button => button.addEventListener('click', () => {
      taskFilterButtons.forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      applyTaskFilter(button.dataset.taskFilter || 'all');
      toast(`Showing ${button.textContent.trim()} tasks.`);
    }));
  }
}
window.initSectionControls = initSectionControls;

/* ---- Integration editor ---- */
const integrationDefinitions = {
  whatsapp: {
    title: 'WhatsApp Cloud API',
    subtitle: 'Configure the Meta business connection used for outbound messages and inbound webhooks.',
    fields: [
      { id: 'business-id', label: 'Meta Business ID', placeholder: '123456789012345' },
      { id: 'phone-number-id', label: 'WhatsApp Phone Number ID', placeholder: '104829104829104' },
      { id: 'waba-id', label: 'WhatsApp Business Account ID', placeholder: 'WABA_1016931798166599' },
      { id: 'display-phone', label: 'Display phone number', placeholder: '+91 98401 23456' },
      { id: 'access-token', label: 'Permanent access token', type: 'password', placeholder: 'EAAG...', help: 'Use a Meta System User token in production.' },
      { id: 'verify-token', label: 'Webhook verify token', placeholder: 'Choose a private verification string' },
      { id: 'messaging-mode', label: 'Messaging mode', type: 'select', options: ['Cloud API', 'QR Gateway'] }
    ]
  },
  instagram: {
    title: 'Instagram DMs',
    subtitle: 'Connect a professional Instagram account for comment-to-DM and inbox automations.',
    fields: [
      { id: 'username', label: 'Instagram username', placeholder: 'nextbright_solutions' },
      { id: 'business-id', label: 'Instagram Business Account ID', placeholder: '17841405728287316' },
      { id: 'page-id', label: 'Linked Facebook Page ID', placeholder: '102938475612345' },
      { id: 'access-token', label: 'Permanent access token', type: 'password', placeholder: 'EAAG...' },
      { id: 'verify-token', label: 'Webhook verify token', placeholder: 'Choose a private verification string' }
    ]
  },
  twilio: {
    title: 'Twilio Voice Calls',
    subtitle: 'Twilio credentials are read from the server environment. The fields below are a local reference only and are never sent anywhere.',
    // Server-side deployment secrets. These cannot be set from the browser:
    // the server reads them from the process environment, and the auth token is
    // far too sensitive to keep in localStorage. Rendered as guidance instead
    // of an input, and excluded from what gets persisted.
    serverManaged: true,
    envVars: {
      'account-sid': 'TWILIO_ACCOUNT_SID',
      'auth-token': 'TWILIO_AUTH_TOKEN',
      'from-number': 'TWILIO_FROM_NUMBER'
    },
    setupHint:
      'In Vercel: Settings > Environment Variables, add the names on the right for all environments, then redeploy. The status badge polls every 30s and will turn green once the server can reach your Twilio account.',
    fields: [
      { id: 'account-sid', label: 'Twilio Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', serverEnv: true },
      { id: 'auth-token', label: 'Auth Token', type: 'password', placeholder: 'Your Twilio auth token', serverEnv: true },
      { id: 'from-number', label: 'Caller number', placeholder: '+91 98765 43210', serverEnv: true },
      { id: 'region', label: 'API region', type: 'select', options: ['US1', 'IE1', 'IN1'] }
    ]
  },
  stripe: {
    title: 'Stripe Payments',
    subtitle: 'Configure checkout, invoices, and payment webhook credentials.',
    fields: [
      { id: 'publishable-key', label: 'Publishable key', placeholder: 'pk_live_...' },
      { id: 'secret-key', label: 'Secret key', type: 'password', placeholder: 'sk_live_...' },
      { id: 'webhook-secret', label: 'Webhook signing secret', type: 'password', placeholder: 'whsec_...' },
      { id: 'currency', label: 'Default currency', type: 'select', options: ['INR', 'USD', 'EUR', 'GBP'] }
    ]
  }
};

// Credentials that must never be kept in localStorage. Earlier builds saved
// every field of this form here, so a Twilio auth token, Meta permanent token
// or Stripe secret key could already be sitting in a browser on disk. Strip
// them on read and overwrite storage so the secret does not linger.
const SECRET_FIELD_IDS = new Set(['access-token', 'auth-token', 'secret-key', 'webhook-secret']);

function scrubSecretFields(settings) {
  let removed = false;
  for (const key of Object.keys(settings || {})) {
    const entry = settings[key];
    if (!entry || typeof entry !== 'object') continue;
    for (const fieldId of Object.keys(entry)) {
      if (SECRET_FIELD_IDS.has(fieldId) || integrationDefinitions[key]?.fields?.some(f => f.type === 'password' || f.serverEnv)) {
        delete entry[fieldId];
        removed = true;
      }
    }
  }
  return removed;
}

function readIntegrationSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem('nextbright_integration_settings') || '{}') || {};
    if (scrubSecretFields(raw)) {
      try { localStorage.setItem('nextbright_integration_settings', JSON.stringify(raw)); } catch (_) { /* best effort */ }
    }
    return raw;
  } catch (error) {
    return {};
  }
}

function writeIntegrationSettings(settings) {
  try {
    localStorage.setItem('nextbright_integration_settings', JSON.stringify(settings));
    return true;
  } catch (error) {
    return false;
  }
}

/* ---- Live integration status ---- */
const INTEGRATION_STATUS_KEYS = ['whatsapp', 'instagram', 'twilio', 'stripe'];
const INTEGRATION_STATUS_POLL_MS = 30_000;
let integrationStatusPromise = null;
let integrationStatusPollTimer = null;

function getIntegrationStatusElements(key) {
  const badge = document.querySelector(`[data-integration-status="${key}"]`);
  const detail = document.querySelector(`[data-integration-detail="${key}"]`);
  const button = document.querySelector(`[data-integration="${key}"]`);
  const card = button?.closest('div[style*="padding"]');
  return { badge, detail, button, card };
}

function formatCheckedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function setIntegrationStatus(key, statusInfo = {}) {
  const status = String(statusInfo.status || 'unavailable');
  const labels = {
    connected: 'Connected',
    not_configured: 'Not configured',
    checking: 'Checking...',
    error: 'Error',
    unavailable: 'Unavailable'
  };
  const classes = {
    connected: 'badge-converted',
    not_configured: 'badge-qualified',
    checking: 'badge-qualified',
    error: 'badge-lost',
    unavailable: 'badge-qualified'
  };
  const message = statusInfo.message || 'Live status has not been verified.';
  const checkedAt = formatCheckedAt(statusInfo.checkedAt);
  const latencyMs = Number(statusInfo.latencyMs);
  const latencyText = Number.isFinite(latencyMs) && latencyMs >= 0 ? ` Latency ${Math.round(latencyMs)} ms.` : '';
  const suffix = checkedAt ? ` Checked ${checkedAt}.${latencyText}` : latencyText;
  // The server now explains where a missing secret has to be set; surface it in
  // the card so the badge is actionable instead of just naming the variables.
  const warnings = Array.isArray(statusInfo.warnings) ? statusInfo.warnings.filter(Boolean) : [];
  const setupHint = statusInfo.setupHint ? ` ${statusInfo.setupHint}` : '';
  const { badge, detail, card } = getIntegrationStatusElements(key);

  if (badge) {
    badge.className = `badge ${classes[status] || classes.unavailable}`;
    badge.textContent = labels[status] || 'Unavailable';
    badge.title = message;
  }
  if (detail) {
    detail.textContent = `${message}${warnings.length ? ` ${warnings.join(' ')}` : ''}${setupHint}${suffix}`;
    detail.title = message;
  }
  if (card) card.setAttribute('data-integration-state', status);
}

function markIntegrationChecking(key) {
  setIntegrationStatus(key, {
    status: 'checking',
    message: 'Checking the live server connection...'
  });
}

async function fetchIntegrationStatuses(keys = INTEGRATION_STATUS_KEYS, options = {}) {
  const selectedKeys = [...new Set((keys || []).map(key => String(key).toLowerCase()).filter(key => INTEGRATION_STATUS_KEYS.includes(key)))];
  if (!selectedKeys.length) return null;
  if (!options.silent) selectedKeys.forEach(markIntegrationChecking);

  if (integrationStatusPromise) return integrationStatusPromise;

  const endpoint = selectedKeys.length === 1
    ? `/api/integration-status?integration=${encodeURIComponent(selectedKeys[0])}`
    : '/api/integration-status';

  integrationStatusPromise = (async () => {
    try {
      const response = await fetch(endpoint, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Status API returned HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload.success || !payload.integrations) throw new Error('Status API returned an invalid response');

      Object.entries(payload.integrations).forEach(([key, statusInfo]) => setIntegrationStatus(key, statusInfo));
      return payload;
    } catch (error) {
      selectedKeys.forEach(key => setIntegrationStatus(key, {
        status: 'unavailable',
        message: 'Live status API is unavailable. Start the API server and configure provider secrets on the server.',
        checkedAt: new Date().toISOString()
      }));
      console.warn('[Integration Status]', error.message);
      return null;
    } finally {
      integrationStatusPromise = null;
    }
  })();

  return integrationStatusPromise;
}

async function testIntegrationConnection(key) {
  const definition = integrationDefinitions[key];
  if (!definition) return null;
  const payload = await fetchIntegrationStatuses([key]);
  const statusInfo = payload?.integrations?.[key];
  if (!statusInfo) {
    showToast(`${definition.title}: live status API is unavailable.`, 'error');
    return null;
  }
  showToast(`${definition.title}: ${statusInfo.message}`, statusInfo.status === 'connected' ? 'success' : 'error');
  return statusInfo;
}

function initIntegrationStatus() {
  if (integrationStatusPollTimer) return;
  fetchIntegrationStatuses();
  integrationStatusPollTimer = window.setInterval(() => fetchIntegrationStatuses(), INTEGRATION_STATUS_POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchIntegrationStatuses();
  });
  window.addEventListener('online', () => fetchIntegrationStatuses());
}

window.fetchIntegrationStatuses = fetchIntegrationStatuses;
window.testIntegrationConnection = testIntegrationConnection;
window.initIntegrationStatus = initIntegrationStatus;

function openIntegrationEditor(key) {
  const definition = integrationDefinitions[key];
  const modal = document.getElementById('integration-modal');
  if (!definition || !modal) return;

  const settings = readIntegrationSettings();
  const values = settings[key] || {};
  document.getElementById('integration-key').value = key;
  document.getElementById('integration-modal-title').textContent = definition.title;
  document.getElementById('integration-modal-subtitle').textContent = definition.subtitle;
  const fieldsWrap = document.getElementById('integration-fields');
  fieldsWrap.innerHTML = '';

  if (definition.setupHint) {
    const hint = document.createElement('div');
    hint.className = 'integration-field-help full';
    hint.style.marginBottom = '10px';
    hint.textContent = definition.setupHint;
    fieldsWrap.appendChild(hint);
  }

  definition.fields.forEach(field => {
    const wrapper = document.createElement('div');
    wrapper.className = `integration-field${field.full ? ' full' : ''}`;
    const label = document.createElement('label');
    label.textContent = field.label;
    label.htmlFor = `integration-${field.id}`;
    wrapper.appendChild(label);

    // Server-managed credentials are shown as the exact variable to set, never
    // as a text box. A box would collect the secret and silently discard it,
    // which is what made this status impossible to clear.
    if (field.serverEnv) {
      const envName = definition.envVars?.[field.id] || field.id;
      const readOnly = document.createElement('input');
      readOnly.type = 'text';
      readOnly.className = 'form-input';
      readOnly.id = `integration-${field.id}`;
      readOnly.name = field.id;
      readOnly.readOnly = true;
      readOnly.tabIndex = -1;
      readOnly.style.opacity = '0.75';
      readOnly.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
      readOnly.value = envName;
      wrapper.appendChild(readOnly);

      const help = document.createElement('span');
      help.className = 'integration-field-help';
      help.textContent = 'Set on the server as this environment variable. Never stored in this browser.';
      wrapper.appendChild(help);

      fieldsWrap.appendChild(wrapper);
      return;
    }

    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      field.options.forEach(option => {
        const optionEl = document.createElement('option');
        optionEl.value = option;
        optionEl.textContent = option;
        input.appendChild(optionEl);
      });
    } else {
      input = document.createElement('input');
      input.type = field.type || 'text';
      input.placeholder = field.placeholder || '';
    }
    input.className = 'form-input';
    input.id = `integration-${field.id}`;
    input.name = field.id;
    input.value = values[field.id] || '';
    wrapper.appendChild(input);

    if (field.help) {
      const help = document.createElement('span');
      help.className = 'integration-field-help';
      help.textContent = field.help;
      wrapper.appendChild(help);
    }
    fieldsWrap.appendChild(wrapper);
  });

  modal.classList.add('open');
  if (typeof feather !== 'undefined') feather.replace();
  setTimeout(() => fieldsWrap.querySelector('input, select')?.focus(), 30);
}
window.openIntegrationEditor = openIntegrationEditor;

function initIntegrationEditor() {
  const modal = document.getElementById('integration-modal');
  if (!modal) return;
  const close = () => modal.classList.remove('open');
  const keyInput = document.getElementById('integration-key');
  const form = document.getElementById('integration-form');
  const fieldsWrap = document.getElementById('integration-fields');

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-integration]');
    if (trigger) openIntegrationEditor(trigger.dataset.integration);
  });

  document.getElementById('integration-modal-close')?.addEventListener('click', close);
  modal.addEventListener('click', event => {
    if (event.target === modal) close();
  });

  document.getElementById('integration-save-btn')?.addEventListener('click', () => {
    const key = keyInput.value;
    const definition = integrationDefinitions[key];
    if (!definition || !form.reportValidity()) return;
    const values = {};
    fieldsWrap.querySelectorAll('input, select').forEach(input => {
      const field = definition.fields.find(f => f.id === input.name);
      // Never persist a credential, and never persist a server-managed value:
      // both would either leak a secret into localStorage or imply the server
      // was configured when it was not.
      if (field?.serverEnv || field?.type === 'password') return;
      values[input.name] = input.value.trim();
    });
    const settings = readIntegrationSettings();
    settings[key] = values;
    const saved = writeIntegrationSettings(settings);
    if (!saved) {
      showToast('Could not save settings in this browser.', 'error');
      return;
    }
    document.querySelectorAll(`[data-integration="${key}"]`).forEach(button => {
      button.innerHTML = '<i data-feather="edit-2"></i> Edit';
    });
    close();
    if (typeof feather !== 'undefined') feather.replace();
    markIntegrationChecking(key);
    void fetchIntegrationStatuses([key]);
    // Be honest about what the click did. For a server-managed integration the
    // credentials were not sent anywhere, so claiming "saved" is what left the
    // user believing Twilio was configured while the server still could not see it.
    showToast(
      definition.serverManaged
        ? `${definition.title}: local preferences saved. Server credentials are unchanged — set the environment variables and redeploy.`
        : `${definition.title} settings saved locally. Live server status is being checked.`,
      definition.serverManaged ? 'error' : 'success'
    );
  });

  document.getElementById('integration-test-btn')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i data-feather="loader"></i> Testing...';
    if (typeof feather !== 'undefined') feather.replace();
    try {
      await testIntegrationConnection(keyInput.value);
    } finally {
      button.disabled = false;
      button.innerHTML = original;
      if (typeof feather !== 'undefined') feather.replace();
    }
  });

  form.addEventListener('submit', event => event.preventDefault());
}
window.initIntegrationEditor = initIntegrationEditor;

/* ---- Settings Nav ---- */
function initSettingsNav() {
  const navItems = Array.from(document.querySelectorAll('.settings-nav-item'));
  const panels = Array.from(document.querySelectorAll('#view-settings .settings-tab-panel'));
  if (!navItems.length || !panels.length) return;

  const activateTab = (tabName) => {
    navItems.forEach(item => {
      const active = item.dataset.settingsTab === tabName;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
    });

    panels.forEach(panel => {
      const active = panel.id === `settings-tab-${tabName}`;
      panel.classList.toggle('active', active);
      panel.style.display = active ? 'block' : 'none';
    });

    if (tabName === 'integrations' && typeof fetchIntegrationStatuses === 'function') {
      fetchIntegrationStatuses();
    }
  };

  navItems.forEach(item => {
    item.setAttribute('role', 'tab');
    item.addEventListener('click', event => {
      event.preventDefault();
      const tabName = item.dataset.settingsTab;
      if (tabName) activateTab(tabName);
    });
  });

  const initial = navItems.find(item => item.classList.contains('active')) || navItems[0];
  activateTab(initial.dataset.settingsTab || 'profile');
}

/* ---- Modals & Action Event Handlers ---- */
function initActionModals() {
  const setupModal = (triggerIds, modalId, closeIds) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const open = () => modal.classList.add('open');
    const close = () => modal.classList.remove('open');

    triggerIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', open);
    });
    closeIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', close);
    });
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
  };

  // 1. Quick Add Lead
  setupModal(['quick-add-btn', 'add-lead-btn'], 'quick-add-modal', ['quick-add-close', 'qa-cancel']);
  const qaSave = document.getElementById('qa-save');
  if (qaSave) {
    qaSave.addEventListener('click', () => {
      const name = document.getElementById('qa-name').value.trim();
      const phone = document.getElementById('qa-phone').value.trim();
      const source = document.getElementById('qa-source').value;
      const assigned = document.getElementById('qa-assigned').value;

      if (!name) { showToast('Please enter lead name', 'error'); return; }

      const newLead = {
        id: window.NB.leads.length + 1,
        name, phone: phone || '+91 98765 00000', source, status: 'New', assigned,
        lastActivity: 'Just now', date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      };
      window.NB.leads.unshift(newLead);
      if (typeof window.renderLeadsTable === 'function') window.renderLeadsTable();
      if (typeof window.renderRecentLeads === 'function') window.renderRecentLeads();
      if (typeof window.renderKanban === 'function') window.renderKanban();

      document.getElementById('quick-add-modal').classList.remove('open');
      showToast(`Lead "${name}" added successfully!`, 'success');
    });
  }

  // 2. Add Customer
  setupModal(['add-customer-btn'], 'modal-add-customer', []);
  const acSave = document.getElementById('ac-save');
  if (acSave) {
    acSave.addEventListener('click', () => {
      const name = document.getElementById('ac-name').value.trim();
      const phone = document.getElementById('ac-phone').value.trim();
      const company = document.getElementById('ac-company').value.trim();
      const revenue = document.getElementById('ac-revenue').value.trim();

      if (!name) { showToast('Please enter customer name', 'error'); return; }

      window.NB.customers.unshift({
        name, phone: phone || '+91 98765 11111', company: company || 'Enterprise',
        revenue: revenue || '₹50,000', assigned: 'Praveenkumar', lastContact: 'Today'
      });
      if (typeof window.renderCustomers === 'function') window.renderCustomers();

      document.getElementById('modal-add-customer').classList.remove('open');
      showToast(`Customer "${name}" added!`, 'success');
    });
  }

  // 3. Add Deal
  setupModal(['add-deal-btn'], 'modal-add-deal', []);
  const adSave = document.getElementById('ad-save');
  if (adSave) {
    adSave.addEventListener('click', () => {
      const name = document.getElementById('ad-name').value.trim();
      const customer = document.getElementById('ad-customer').value.trim();
      const amount = document.getElementById('ad-amount').value.trim();
      const stage = document.getElementById('ad-stage').value;

      if (!name) { showToast('Please enter deal name', 'error'); return; }

      if (!window.NB.deals[stage]) window.NB.deals[stage] = [];
      window.NB.deals[stage].unshift({
        name, customer: customer || 'Client', amount: amount || '₹1,00,000',
        prob: '70%', probClass: 'prob-high', owner: 'Praveenkumar', lastActivity: 'Just now'
      });
      if (typeof window.renderDeals === 'function') window.renderDeals();

      document.getElementById('modal-add-deal').classList.remove('open');
      showToast(`Deal "${name}" created in ${stage}!`, 'success');
    });
  }

  // 4. Add Task
  setupModal(['add-task-btn'], 'modal-add-task', []);
  const atSave = document.getElementById('at-save');
  if (atSave) {
    atSave.addEventListener('click', () => {
      const title = document.getElementById('at-title').value.trim();
      const time = document.getElementById('at-time').value.trim();
      const priority = document.getElementById('at-priority').value;

      if (!title) { showToast('Please enter task description', 'error'); return; }

      window.NB.tasks.unshift({
        title, time: time || 'Today · 5:00 PM', priority, done: false
      });
      if (typeof window.renderTodayTasks === 'function') window.renderTodayTasks();
      if (typeof window.renderFullTasks === 'function') window.renderFullTasks();

      document.getElementById('modal-add-task').classList.remove('open');
      showToast('New task added successfully!', 'success');
    });
  }

  // 5. Add Appointment
  setupModal(['add-appointment-btn'], 'modal-add-appointment', []);
  const apSave = document.getElementById('ap-save');
  if (apSave) {
    apSave.addEventListener('click', () => {
      const type = document.getElementById('ap-type').value.trim();
      const customer = document.getElementById('ap-customer').value.trim();
      const date = document.getElementById('ap-date').value.trim();
      const assigned = document.getElementById('ap-assigned').value;

      if (!type) { showToast('Please enter appointment service title', 'error'); return; }

      window.NB.appointments.unshift({
        type, customer: customer || 'Rahul Sharma', date: date || 'Tomorrow · 11:00 AM', assigned
      });
      if (typeof window.renderAppointments === 'function') window.renderAppointments();

      document.getElementById('modal-add-appointment').classList.remove('open');
      showToast('Appointment scheduled successfully!', 'success');
    });
  }
}

/* ---- Notifications & Profile Dropdown ---- */
  const notifBtn = document.getElementById('notif-btn');
  const notifModal = document.getElementById('modal-notifications');
  if (notifBtn && notifModal) {
    notifBtn.addEventListener('click', () => notifModal.classList.toggle('open'));
    notifModal.addEventListener('click', e => { if (e.target === notifModal) notifModal.classList.remove('open'); });
  }

  const profileAvatar = document.querySelector('.topbar-avatar');
  const profileModal = document.getElementById('modal-profile');
  if (profileAvatar && profileModal) {
    profileAvatar.addEventListener('click', () => profileModal.classList.toggle('open'));
    profileModal.addEventListener('click', e => { if (e.target === profileModal) profileModal.classList.remove('open'); });
  }

/* ---- Toast Notifications ---- */
function showToast(msg, type = 'default') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      ${type === 'success' ? '<polyline points="20 6 9 17 4 12"/>'
      : type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
      : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="8"/>'}
    </svg>
  `;
  const messageEl = document.createElement('span');
  messageEl.textContent = msg;
  toast.appendChild(messageEl);
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = '0.3s ease';
  }, 3000);
  setTimeout(() => toast.remove(), 3350);
}
window.showToast = showToast;

/* ---- Export Data CSV ---- */
window.exportCSV = function() {
  if (!window.NB || !window.NB.leads) return;
  const headers = ['ID', 'Name', 'Phone', 'Source', 'Status', 'Assigned', 'Date'];
  const rows = window.NB.leads.map(l => [l.id, `"${l.name}"`, `"${l.phone}"`, l.source, l.status, `"${l.assigned}"`, l.date]);
  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'NextBright_CRM_Leads_Export.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Exported leads CSV file successfully!', 'success');
};

/* ---- Initialization ---- */
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initNav();
  initLeadsFilters();
  initLeadsViewToggle();
  initPeriodBtns();
  initMessages();
  initLiveInbox();
  initMessageFilters();
  initMessageComposer();
  initSettingsNav();
  initSectionControls();
  initIntegrationEditor();
  initIntegrationStatus();
  initActionModals();

  // Load initial route from URL
  const initialRoute = getRouteFromUrl();
  navigateTo(initialRoute, false);
});
