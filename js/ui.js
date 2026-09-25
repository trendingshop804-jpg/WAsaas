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
      const mainArea = document.getElementById('main-area');
      if (mainArea) {
        if (sidebar.classList.contains('collapsed')) {
          mainArea.style.marginLeft = '72px';
        } else {
          mainArea.style.marginLeft = 'var(--sidebar-width)';
        }
      }
    });
  }

  if (mobileToggle) {
    mobileToggle.addEventListener('click', (e) => {
      e.preventDefault();
      sidebar.classList.add('mobile-open');
      overlay.classList.add('active');
    });
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
let currentChannelFilter = 'all';
let currentSearchQuery = '';

function renderConvList() {
  const convList = document.getElementById('conv-list');
  if (!convList || !window.NB || !window.NB.conversations) return;

  let list = window.NB.conversations;

  if (currentChannelFilter !== 'all') {
    list = list.filter(c => (c.channel || 'whatsapp').toLowerCase() === currentChannelFilter);
  }

  if (currentSearchQuery) {
    list = list.filter(c =>
      c.name.toLowerCase().includes(currentSearchQuery) ||
      (c.preview && c.preview.toLowerCase().includes(currentSearchQuery))
    );
  }

  convList.innerHTML = '';
  if (list.length === 0) {
    convList.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.8125rem;">No conversations match filter.</div>`;
    return;
  }

  const activeItem = document.querySelector('.conv-item.active');
  const activeName = activeItem ? activeItem.querySelector('.conv-name').textContent : (list[0] ? list[0].name : '');

  list.forEach((conv) => {
    const el = document.createElement('div');
    const isActive = conv.name === activeName || (list.length === 1);
    el.className = 'conv-item' + (isActive ? ' active' : '');
    el.innerHTML = `
      <div class="conv-ava">${conv.initials}</div>
      <div class="conv-meta">
        <div class="conv-name">${conv.name}</div>
        <div class="conv-preview">${conv.preview}</div>
      </div>
      <div class="conv-time">${conv.time}</div>
    `;
    el.addEventListener('click', () => {
      document.querySelectorAll('.conv-item').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      renderConversation(conv);
      const layout = document.querySelector('.messages-layout');
      if (layout) layout.classList.add('mobile-chat-active');
    });
    convList.appendChild(el);
  });

  const selectedConv = list.find(c => c.name === activeName) || list[0];
  if (selectedConv) {
    renderConversation(selectedConv);
  }
}

function initMessages() {
  const layout  = document.querySelector('.messages-layout');
  const backBtn = document.getElementById('btn-back-conv');

  renderConvList();

  // Channel filter tabs (All, WhatsApp, SMS, Email)
  const channelTabs = document.getElementById('msg-channel-tabs');
  if (channelTabs) {
    channelTabs.querySelectorAll('.msg-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        channelTabs.querySelectorAll('.msg-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentChannelFilter = tab.dataset.channel || tab.textContent.toLowerCase().trim();
        renderConvList();
      });
    });
  }

  // Conversation search input
  const searchInput = document.getElementById('conv-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.toLowerCase().trim();
      renderConvList();
    });
  }

  // Back button for mobile
  if (backBtn && layout) {
    backBtn.addEventListener('click', () => {
      layout.classList.remove('mobile-chat-active');
    });
  }

  // Call & Info actions in chat header
  const btnCall = document.getElementById('btn-conv-call');
  const btnInfo = document.getElementById('btn-conv-info');
  if (btnCall) {
    btnCall.addEventListener('click', () => {
      const activeName = document.getElementById('conv-chat-name')?.textContent || 'Client';
      if (typeof handleCallLead === 'function') handleCallLead(activeName, '+91 927 455 8824');
      else showToast(`Calling ${activeName}...`, 'success');
    });
  }
  if (btnInfo) {
    btnInfo.addEventListener('click', () => {
      const panel = document.getElementById('conv-info-panel');
      if (panel) panel.classList.toggle('open');
      showToast('Showing customer details', 'default');
    });
  }

  // Right Customer Info Panel Action Buttons: Add Note & Create Task
  const btnAddNote = document.getElementById('btn-conv-add-note');
  const btnCreateTask = document.getElementById('btn-conv-create-task');
  if (btnAddNote) {
    btnAddNote.addEventListener('click', () => {
      const name = document.getElementById('conv-info-name')?.textContent || 'Customer';
      const note = prompt(`Add note for ${name}:`);
      if (note) {
        showToast(`Note added for ${name}: "${note}"`, 'success');
      }
    });
  }
  if (btnCreateTask) {
    btnCreateTask.addEventListener('click', () => {
      const name = document.getElementById('conv-info-name')?.textContent || 'Customer';
      const titleInput = document.getElementById('at-title');
      if (titleInput) titleInput.value = `Follow up with ${name}`;
      const modal = document.getElementById('modal-add-task');
      if (modal) modal.classList.add('open');
    });
  }
}

function renderConversation(conv) {
  if (!conv) return;

  const messagesEl  = document.getElementById('conv-messages');
  const headerName  = document.getElementById('conv-chat-name');
  const headerAva   = document.getElementById('conv-chat-avatar');
  const headerStatus= document.getElementById('conv-chat-status');

  if (headerName)   headerName.textContent = conv.name;
  if (headerAva)    headerAva.textContent = conv.initials;
  if (headerStatus) headerStatus.textContent = `${conv.channel || 'WhatsApp'} · Online`;

  // Render chat messages
  if (messagesEl && conv.messages) {
    messagesEl.innerHTML = conv.messages.map(m => {
      if (m.dir === 'system') {
        return `
          <div style="text-align:center;margin:12px 0;">
            <span style="display:inline-block;padding:4px 10px;font-size:0.6875rem;background:var(--bg-accent-subtle);color:var(--text-muted);border:1px solid var(--border-light);border-radius:12px;">
              ${m.text}
            </span>
          </div>
        `;
      }
      const isOut = m.dir === 'out';
      const aiTag = m.isAI ? '<span style="display:inline-block;font-size:0.625rem;background:rgba(255,255,255,0.2);padding:1px 5px;border-radius:4px;margin-bottom:4px;">🤖 AI Reply</span><br>' : '';
      let mediaContent = '';
      if (m.type === 'image' && m.mediaUrl) {
        mediaContent = `<div style="margin-bottom:6px;"><img src="${m.mediaUrl}" alt="Attachment" style="max-width:220px;border-radius:8px;display:block;"></div>`;
      }
      return `
        <div style="margin-bottom: 8px;">
          <div class="msg-bubble ${m.dir}" style="white-space:pre-wrap;word-break:break-word;line-height:1.45;">
            ${aiTag}
            ${mediaContent}
            ${m.text || ''}
            ${m.caption ? `<div style="font-size:0.75rem;margin-top:4px;opacity:0.9;">${m.caption}</div>` : ''}
          </div>
          <div class="msg-time" style="text-align:${isOut ? 'right' : 'left'}; padding: 2px 4px; font-size: 0.6875rem; color: var(--text-muted);">${m.time}</div>
        </div>
      `;
    }).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Dynamic Right Customer Info Panel update
  const matchingLead = (window.NB && window.NB.leads)
    ? window.NB.leads.find(l => l.name.toLowerCase() === conv.name.toLowerCase())
    : null;

  const phone  = matchingLead ? matchingLead.phone  : (conv.phone || '+91 927 455 8824');
  const email  = matchingLead ? (matchingLead.email || `${conv.name.toLowerCase().replace(/\s+/g, '.')}@company.com`) : `${conv.name.toLowerCase().replace(/\s+/g, '.')}@company.com`;
  const source = matchingLead ? matchingLead.source : (conv.channel || 'WhatsApp');
  const status = matchingLead ? matchingLead.status : 'New';
  const role   = matchingLead ? `${matchingLead.source} Lead` : 'Marketing Manager';

  const infoAva    = document.getElementById('conv-info-avatar');
  const infoName   = document.getElementById('conv-info-name');
  const infoRole   = document.getElementById('conv-info-role');
  const infoPhone  = document.getElementById('conv-info-phone');
  const infoEmail  = document.getElementById('conv-info-email');
  const infoSource = document.getElementById('conv-info-source');
  const infoStatus = document.getElementById('conv-info-status');

  if (infoAva)    infoAva.textContent = conv.initials;
  if (infoName)   infoName.textContent = conv.name;
  if (infoRole)   infoRole.textContent = role;
  if (infoPhone)  infoPhone.textContent = phone;
  if (infoEmail)  infoEmail.textContent = email;
  if (infoSource) infoSource.textContent = source;
  if (infoStatus) {
    infoStatus.innerHTML = typeof statusBadge === 'function'
      ? statusBadge(status)
      : `<span class="badge badge-new">${status}</span>`;
  }
}
window.renderConversation = renderConversation;
window.initMessages = initMessages;

function initMessageComposer() {
  const input  = document.getElementById('msg-composer-input');
  const sendBtn= document.getElementById('msg-send-btn');
  if (!input || !sendBtn) return;

  const send = () => {
    const text = input.value.trim();
    if (!text || !window.NB || !window.NB.conversations) return;

    const activeItem = document.querySelector('.conv-item.active');
    const activeName = activeItem ? activeItem.querySelector('.conv-name').textContent : '';

    const conv = window.NB.conversations.find(c => c.name === activeName) || window.NB.conversations[0];
    if (conv) {
      const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      conv.messages.push({ dir: 'out', text, time: now });
      conv.preview = 'You: ' + text;
      renderConversation(conv);

      if (activeItem) {
        const previewEl = activeItem.querySelector('.conv-preview');
        if (previewEl) previewEl.textContent = 'You: ' + text;
      }
    }
    input.value = '';
  };

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') send();
  });
}

/* ---- Settings Nav ---- */
function initSettingsNav() {
  document.querySelectorAll('.settings-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });
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

  // 6. Notifications & Profile Dropdown
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
}

/* ---- Settings Navigation Controller ---- */
function initSettingsNav() {
  const navItems = document.querySelectorAll('.settings-nav-item');
  const panels = document.querySelectorAll('.settings-tab-panel');

  if (!navItems.length) return;

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = item.dataset.settingsTab;
      if (!targetTab) return;

      // Update active state on navigation tabs
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      // Hide all panels & display selected panel
      panels.forEach(panel => {
        if (panel.id === `settings-tab-${targetTab}`) {
          panel.classList.add('active');
          panel.style.display = 'block';
        } else {
          panel.classList.remove('active');
          panel.style.display = 'none';
        }
      });
    });
  });
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
    <span>${msg}</span>
  `;
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
  initMessageComposer();
  initSettingsNav();
  initActionModals();
  if (typeof window.initTaskFilters === 'function') window.initTaskFilters();

  // Load initial route from URL
  const initialRoute = getRouteFromUrl();
  navigateTo(initialRoute, false);
});
