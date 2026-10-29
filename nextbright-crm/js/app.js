/* ============================================================
   APP.JS — Main rendering logic & Action Handlers
   ============================================================ */
'use strict';

/* ============================================================
   SHARED HELPERS (escaping, phone, money)
   ============================================================ */
function nbEsc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
window.nbEsc = nbEsc;

const NB_INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0
});
function formatINR(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return NB_INR_FORMATTER.format(amount);
}
window.formatINR = formatINR;

/* Deal amounts are numbers. Strings such as "₹1,20,000" are normalized; any
   negative or unparseable value becomes null so it can never inflate totals. */
function parseDealAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw || raw.includes('-')) return null;
  const digits = raw.replace(/[^0-9.]/g, '');
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : null;
}
window.parseDealAmount = parseDealAmount;

function leadPhone(item) { return String(item?.phone || '').trim(); }
function phoneText(item) { return leadPhone(item) || 'Not provided'; }

/* Call / message actions require a real phone number. Without one the buttons
   render disabled with an explicit reason instead of firing a bogus action. */
function contactActionButtons(name, phone) {
  const safeName = nbEsc(name || '');
  const safePhone = nbEsc(phone || '');
  if (!phone) {
    return `
      <div class="row-actions">
        <button class="row-action-btn" title="Call unavailable: no phone number on this record" aria-label="Call unavailable: no phone number on this record" disabled style="opacity:.4;cursor:not-allowed;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6 6l1.27-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        </button>
        <button class="row-action-btn" title="Message unavailable: no phone number on this record" aria-label="Message unavailable: no phone number on this record" disabled style="opacity:.4;cursor:not-allowed;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>`;
  }
  return `
    <div class="row-actions">
      <button class="row-action-btn action-call" title="Call ${safeName}" aria-label="Call ${safeName}" onclick="handleCallLead('${safeName}', '${safePhone}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6 6l1.27-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      </button>
      <button class="row-action-btn action-msg" title="Message ${safeName}" aria-label="Message ${safeName}" onclick="handleMessageLead('${safeName}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </button>
    </div>`;
}

/* ============================================================
   STATUS BADGE HELPER
   ============================================================ */
function statusBadge(status) {
  const map = {
    'New':       'badge-new',
    'Contacted': 'badge-contacted',
    'Replied':   'badge-contacted',
    'Qualified': 'badge-qualified',
    'Proposal':  'badge-proposal',
    'Converted': 'badge-converted',
    'Won':       'badge-converted',
    'Lost':      'badge-lost',
  };
  return `<span class="badge ${map[status] || ''}">${status}</span>`;
}

/* ============================================================
   LEADS — Recent table (Dashboard)
   ============================================================ */
function renderRecentLeads() {
  const tbody = document.getElementById('recent-leads-tbody');
  if (!tbody || !window.NB || !window.NB.leads) return;

  const namedLeads = window.NB.leads.filter(l => !l.name.startsWith('WhatsApp Contact'));
  const recentLeads = (namedLeads.length ? namedLeads : window.NB.leads).slice(0, 5);

  tbody.innerHTML = recentLeads.map(l => {
    const color = window.NB.avatarColor(l.name);
    const initials = window.NB.initials(l.name);
    const phone = leadPhone(l);
    return `
      <tr data-lead-id="${nbEsc(l.id)}">
        <td>
          <div class="lead-name-cell">
            <div class="lead-avatar" style="background:${color}">${initials}</div>
            <span class="lead-name-text">${nbEsc(l.name)}</span>
          </div>
        </td>
        <td><span class="lead-phone-text">${nbEsc(phoneText(l))}</span></td>
        <td><span class="lead-source-text">${nbEsc(l.custom_fields?.source_label || l.source || '—')}</span></td>
        <td>${statusBadge(nbEsc(l.status))}</td>
        <td><span class="recent-lead-date">${nbEsc(l.date || '')}</span></td>
        <td>
          ${contactActionButtons(l.name, phone)}
        </td>
      </tr>
    `;
  }).join('');
}
window.renderRecentLeads = renderRecentLeads;

/* ============================================================
   LEADS — Full table
   ============================================================ */
function renderLeadsTable(leads) {
  const tbody = document.getElementById('leads-table-tbody');
  if (!tbody || !window.NB || !window.NB.leads) return;
  const data = leads || window.NB.leads;
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state" style="padding: 24px; text-align: center; color: var(--text-muted);"><p>No leads match the current filters.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(l => {
    const color = window.NB.avatarColor(l.name);
    const initials = window.NB.initials(l.name);
    const phone = leadPhone(l);
    return `
      <tr data-lead-id="${nbEsc(l.id)}">
        <td><input type="checkbox" style="accent-color:var(--brand-primary)" aria-label="Select ${nbEsc(l.name)}"></td>
        <td>
          <div class="lead-name-cell">
            <div class="lead-avatar" style="background:${color}">${initials}</div>
            <div>
              <div class="lead-name-text">${nbEsc(l.name)}</div>
            </div>
          </div>
        </td>
        <td><span class="lead-phone-text">${nbEsc(phoneText(l))}</span></td>
        <td><span class="lead-source-text">${nbEsc(l.custom_fields?.source_label || l.source || '—')}</span></td>
        <td>${statusBadge(nbEsc(l.status))}</td>
        <td>
          <div class="assigned-chip">
            <div class="assigned-ava">${window.NB.initials(l.assigned)}</div>
            <span>${nbEsc(l.assigned || 'Unassigned')}</span>
          </div>
        </td>
        <td style="color:var(--text-muted);font-size:0.8125rem;">${nbEsc(l.lastActivity || '')}</td>
        <td style="color:var(--text-muted);font-size:0.8125rem;">${nbEsc(l.date || '')}</td>
        <td>
          ${contactActionButtons(l.name, phone)}
          <div class="row-actions" style="margin-top:4px;">
            <button class="row-action-btn" title="Delete ${nbEsc(l.name)}" aria-label="Delete ${nbEsc(l.name)}" style="color:var(--status-danger)" onclick="handleDeleteLead('${nbEsc(l.id)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}
window.renderLeadsTable = renderLeadsTable;

/* ============================================================
   LEADS — Kanban Board
   ============================================================ */
function renderKanban() {
  const board = document.getElementById('leads-kanban-view');
  if (!board || !window.NB || !window.NB.leads) return;
  const stages = ['New','Contacted','Replied','Qualified','Won','Lost'];
  const stageColors = { New:'#2563EB', Contacted:'#10B981', Replied:'#0EA5E9', Qualified:'#F59E0B', Won:'#059669', Lost:'#EF4444' };

  board.innerHTML = stages.map(stage => {
    const leadsInStage = window.NB.leads.filter(l => l.status === stage);
    return `
      <div class="kanban-col">
        <div class="kanban-col-header">
          <span style="color:${stageColors[stage]}">${stage}</span>
          <span class="kanban-count">${leadsInStage.length}</span>
        </div>
        <div class="kanban-cards">
          ${leadsInStage.map(l => `
            <div class="kanban-card">
              <div class="kanban-card-name">${nbEsc(l.name)}</div>
              <div class="kanban-card-meta">${nbEsc(phoneText(l))}</div>
              <div class="kanban-card-footer">
                <span class="badge" style="font-size:0.6875rem;padding:1px 8px;background:${stageColors[stage]}18;color:${stageColors[stage]}">${nbEsc(l.custom_fields?.source_label || l.source || '—')}</span>
                <div class="assigned-chip">
                  <div class="assigned-ava" style="width:18px;height:18px;font-size:0.5rem;">${window.NB.initials(l.assigned)}</div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}
window.renderKanban = renderKanban;

/* ============================================================
   CUSTOMERS Table
   ============================================================ */
function renderCustomers() {
  const tbody = document.getElementById('customers-tbody');
  if (!tbody || !window.NB || !window.NB.customers) return;
  tbody.innerHTML = window.NB.customers.map(c => {
    const color = window.NB.avatarColor(c.name);
    const phone = leadPhone(c);
    return `
      <tr>
        <td>
          <div class="lead-name-cell">
            <div class="lead-avatar" style="background:${color}">${window.NB.initials(c.name)}</div>
            <span class="lead-name-text">${nbEsc(c.name)}</span>
          </div>
        </td>
        <td><span class="lead-phone-text">${nbEsc(phoneText(c))}</span></td>
        <td>${nbEsc(c.company || '—')}</td>
        <td><strong>${nbEsc(c.revenue || '—')}</strong></td>
        <td>
          <div class="assigned-chip">
            <div class="assigned-ava">${window.NB.initials(c.assigned)}</div>
            <span>${nbEsc(c.assigned || 'Unassigned')}</span>
          </div>
        </td>
        <td style="color:var(--text-muted);font-size:0.8125rem;">${nbEsc(c.lastContact || '')}</td>
        <td>
          <div class="row-actions">
            <button class="row-action-btn" title="View 360 profile of ${nbEsc(c.name)}" aria-label="View 360 profile of ${nbEsc(c.name)}" onclick="openCustomer360('${nbEsc(c.name)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          ${contactActionButtons(c.name, phone)}
        </td>
      </tr>
    `;
  }).join('');
}
window.renderCustomers = renderCustomers;

window.openCustomer360 = async function(name) {
  const modal = document.getElementById('modal-customer-360');
  if (!modal) return;

  const c = (window.NB.customers || []).find(item => item.name === name);
  if (!c) { window.showToast?.('Customer record is unavailable.', 'error'); return; }

  document.getElementById('c360-name').textContent = c.name;
  document.getElementById('c360-avatar').textContent = window.NB.initials(c.name);
  document.getElementById('c360-meta').textContent = `${c.company || 'No company'} · Phone: ${phoneText(c)} · Total Revenue: ${c.revenue || 'Not provided'}`;

  const callButton = document.getElementById('c360-call-btn');
  if (callButton) {
    const phone = leadPhone(c);
    callButton.disabled = !phone;
    callButton.title = phone ? `Call ${c.name}` : 'Call unavailable: no phone number on this record';
    callButton.onclick = () => {
      if (!phone) return;
      if (typeof window.handleCallLead === 'function') window.handleCallLead(c.name, phone);
    };
  }

  const timelineEl = document.getElementById('c360-timeline');
  timelineEl.innerHTML = '<div class="empty-state">No verified activity history is available.</div>';

  modal.classList.add('open');
};

/* ============================================================
   DEALS Pipeline
   ============================================================ */
function renderDeals() {
  const pipeline = document.getElementById('deals-pipeline');
  if (!pipeline || !window.NB) return;
  const stages = ['New','Contacted','Proposal','Negotiation','Won','Lost'];

  // window.NB.deals is the persisted list returned by /api/deals. When storage is
  // not enabled yet the pipeline says so instead of inventing records.
  const dealsState = window.NB.loadState?.deals;
  if (window.NB.dealsStorageAvailable === false) {
    pipeline.innerHTML = '<div class="empty-state" style="padding:32px;text-align:center;color:var(--text-muted);grid-column:1/-1;">Deals storage is not enabled for this workspace yet. Apply the deals migration on the server, then reload.</div>';
    return;
  }
  if (dealsState === 'loading') {
    pipeline.innerHTML = '<div class="empty-state" style="padding:32px;text-align:center;color:var(--text-muted);grid-column:1/-1;">Loading deals…</div>';
    return;
  }
  if (dealsState === 'error') {
    pipeline.innerHTML = '<div class="empty-state" style="padding:32px;text-align:center;color:var(--text-muted);grid-column:1/-1;">Deals could not be loaded. Reload the page to retry.</div>';
    return;
  }

  const allDeals = Array.isArray(window.NB.deals) ? window.NB.deals : [];
  pipeline.innerHTML = stages.map(stage => {
    const deals = allDeals.filter(d => (d.stage || 'New') === stage);
    const total = deals.reduce((acc, d) => {
      const value = parseDealAmount(d.amount);
      return value === null ? acc : acc + value;
    }, 0);
    const colClass = stage === 'Won' ? 'pipeline-col won' : stage === 'Lost' ? 'pipeline-col lost' : 'pipeline-col';
    return `
      <div class="${colClass}">
        <div class="pipeline-col-header">
          <div class="pipeline-col-title">
            <span>${stage}</span>
            <span class="kanban-count">${deals.length}</span>
          </div>
          <div class="pipeline-col-total">${deals.length > 0 ? formatINR(total) : '—'}</div>
        </div>
        <div class="pipeline-cards">
          ${deals.map(d => `
            <div class="deal-card">
              <div class="deal-card-name">${nbEsc(d.title || 'Untitled deal')}</div>
              <div class="deal-card-customer">${nbEsc(d.customer_name || '—')}</div>
              <div class="deal-card-body">
                <div class="deal-card-amount">${formatINR(parseDealAmount(d.amount))}</div>
              </div>
              <div class="deal-card-footer">
                <span class="deal-prob">${nbEsc(d.currency || 'INR')}</span>
                <div class="assigned-chip">
                  <span style="font-size:0.75rem;color:var(--text-muted);">${nbEsc(d.created_at ? new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}
window.renderDeals = renderDeals;

/* ============================================================
   CALLS Table
   ============================================================ */
function renderCalls() {
  const tbody = document.getElementById('calls-tbody');
  if (!tbody || !window.NB || !window.NB.calls) return;
  tbody.innerHTML = window.NB.calls.map(c => {
    const dirIcon = c.dir === 'in'
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 7 23 1 17 1"/><line x1="16" y1="8" x2="23" y2="1"/><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.08 4.18 2 2 0 0 1 5.06 2h3"/></svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 7 1 1 7 1"/><line x1="8" y1="8" x2="1" y2="1"/><path d="M2 16.92v3a2 2 0 0 0 2.18 2 19.79 19.79 0 0 0 15.74-15.74A2 2 0 0 0 17.92 2h-3"/></svg>`;
    const statusColor = c.status === 'Completed' ? 'var(--status-success)' : c.status === 'No Answer' ? 'var(--status-warning)' : 'var(--status-danger)';
    return `
      <tr>
        <td><div class="call-direction ${c.dir}">${dirIcon} ${c.dir === 'in' ? 'Incoming' : 'Outgoing'}</div></td>
        <td>${c.customer}</td>
        <td><span style="font-size:0.8125rem;color:var(--text-secondary);">${c.phone}</span></td>
        <td><span style="font-family:monospace;font-size:0.875rem;">${c.duration}</span></td>
        <td><span style="font-size:0.8125rem;font-weight:600;color:${statusColor};">${c.status}</span></td>
        <td>
          ${c.recording
            ? `<span onclick="showToast('Playing recording for ${c.customer}...', 'success')" style="display:inline-flex;align-items:center;gap:4px;font-size:0.75rem;color:var(--brand-primary);cursor:pointer;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg> Play</span>`
            : `<span style="font-size:0.75rem;color:var(--text-muted);">—</span>`
          }
        </td>
        <td style="color:var(--text-muted);font-size:0.8125rem;">${c.date}</td>
        <td>
          <div class="row-actions">
            <button class="row-action-btn" title="Add note" onclick="showToast('Call note saved for ${c.customer}', 'success')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}
window.renderCalls = renderCalls;

/* ============================================================
   ACTIVITY FEED
   ============================================================ */
function renderActivityFeed() {
  const el = document.getElementById('activity-list');
  if (!el || !window.NB || !window.NB.activityFeed) return;
  el.innerHTML = window.NB.activityFeed.map(a => {
    const parts = String(a.sub || '').split(' · ');
    const detail = a.time ? parts[0] : (parts.length > 1 ? parts.slice(0, -1).join(' · ') : parts[0]);
    const time = a.time || (parts.length > 1 ? parts[parts.length - 1] : '');

    return `
      <div class="activity-item">
        <div class="activity-icon ${a.color}">
          <i data-feather="${a.icon}"></i>
        </div>
        <div class="activity-text">
          <strong>${a.text}</strong>
          <span>${detail}</span>
        </div>
        <time class="activity-time">${time}</time>
      </div>
    `;
  }).join('');
  if (typeof feather !== 'undefined') feather.replace();
}

/* ============================================================
   TASKS
   ============================================================ */
function renderTodayTasks() {
  const el = document.getElementById('today-task-list');
  if (!el || !window.NB || !window.NB.tasks) return;
  if (!window.NB.tasks.length) {
    el.innerHTML = '<div class="empty-state" style="padding:16px;color:var(--text-muted);">No tasks yet.</div>';
    return;
  }
  el.innerHTML = window.NB.tasks.slice(0, 4).map((t, i) => `
    <div class="task-item ${t.done ? 'done' : ''}">
      <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="Mark ${nbEsc(t.title)} complete" onchange="window.toggleTask(${i}, this.checked)">
      <div class="task-info">
        <div class="task-title" style="${t.done ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${nbEsc(t.title)}</div>
        <div class="task-time">${nbEsc(t.time || 'No due time')}</div>
      </div>
      <span class="task-priority priority-${nbEsc(String(t.priority || 'normal').toLowerCase())}">${nbEsc(t.priority || 'Normal')}</span>
    </div>
  `).join('');
}
window.renderTodayTasks = renderTodayTasks;

let activeTaskFilter = 'all';
function taskMatchesFilter(task, filter) {
  if (filter === 'all') return true;
  const due = task.due_at ? new Date(task.due_at) : null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (filter === 'today') return Boolean(due && due >= startOfToday && due < endOfToday && !task.done);
  if (filter === 'week') return Boolean(due && due >= startOfToday && due < endOfWeek && !task.done);
  if (filter === 'overdue') return Boolean(due && due < startOfToday && !task.done);
  return true;
}

function renderFullTasks() {
  const el = document.getElementById('tasks-full-list');
  if (!el || !window.NB || !window.NB.tasks) return;
  const visible = window.NB.tasks.filter(task => taskMatchesFilter(task, activeTaskFilter));
  if (!visible.length) {
    el.innerHTML = '<div class="empty-state" style="padding:24px;text-align:center;color:var(--text-muted);">No tasks match this filter.</div>';
    return;
  }
  el.innerHTML = visible.map(task => {
    const index = window.NB.tasks.indexOf(task);
    const overdue = task.due_at && !task.done && new Date(task.due_at) < new Date();
    return `
    <div class="task-full-item" style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--border-light)">
      <input type="checkbox" ${task.done ? 'checked' : ''} aria-label="Mark ${nbEsc(task.title)} complete" onchange="window.toggleTask(${index}, this.checked)">
      <div class="task-full-info" style="flex:1">
        <div class="task-full-title" style="${task.done ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${nbEsc(task.title)}</div>
        <div class="task-full-meta" style="font-size:0.75rem;color:var(--text-muted)">${nbEsc(task.time || 'No due time')}${overdue ? ' · Overdue' : ''} · <span class="task-priority priority-${nbEsc(String(task.priority || 'normal').toLowerCase())}">${nbEsc(task.priority || 'Normal')}</span></div>
      </div>
      <button class="row-action-btn" title="Delete task" aria-label="Delete task ${nbEsc(task.title)}" onclick="window.deleteTask(${index})" style="color:var(--status-danger)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>
  `;
  }).join('');
}
window.renderFullTasks = renderFullTasks;

window.NB_TASKS = {
  setFilter(filter) {
    activeTaskFilter = filter || 'all';
    renderFullTasks();
  },
  refresh() { renderTodayTasks(); renderFullTasks(); }
};

window.toggleTask = async function(index, isDone) {
  const task = window.NB?.tasks?.[index];
  if (!task) return;
  if (!task.id) {
    // No server record: nothing to persist, so do not pretend the change stuck.
    showToast('This task has no server record yet and cannot be updated.', 'error');
    renderTodayTasks(); renderFullTasks();
    return;
  }
  const previousDone = task.done;
  task.done = isDone;
  task.completed_at = isDone ? new Date().toISOString() : null;
  renderTodayTasks(); renderFullTasks();
  try {
    const response = await window.NB_AUTH.apiFetch(`/api/tasks?id=${encodeURIComponent(task.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: isDone })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    showToast(isDone ? 'Task marked complete.' : 'Task reopened.', 'success');
  } catch (error) {
    task.done = previousDone;
    task.completed_at = previousDone ? (task.completed_at || new Date().toISOString()) : null;
    renderTodayTasks(); renderFullTasks();
    showToast(`Could not update task: ${error.message}`, 'error');
  }
};

window.deleteTask = async function(index) {
  const task = window.NB?.tasks?.[index];
  if (!task) return;
  if (!task.id) {
    window.NB.tasks.splice(index, 1);
    renderTodayTasks(); renderFullTasks();
    showToast('Local task removed.', 'default');
    return;
  }
  if (!window.confirm(`Delete task "${task.title}"?`)) return;
  try {
    const response = await window.NB_AUTH.apiFetch(`/api/tasks?id=${encodeURIComponent(task.id)}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    window.NB.tasks.splice(index, 1);
    renderTodayTasks(); renderFullTasks();
    showToast('Task deleted.', 'default');
  } catch (error) {
    showToast(`Could not delete task: ${error.message}`, 'error');
  }
};

/* ============================================================
   APPOINTMENTS & CALENDAR GRID
   ============================================================ */
function renderAppointments() {
  const el = document.getElementById('appt-list');
  if (!el || !window.NB) return;
  const appointmentsState = window.NB.loadState?.appointments;
  if (window.NB.appointmentsStorageAvailable === false) {
    el.innerHTML = '<div class="empty-state" style="padding:16px;text-align:center;color:var(--text-muted);">Appointments storage is not enabled for this workspace yet. Apply the appointments migration, then reload.</div>';
    return;
  }
  if (appointmentsState === 'loading') {
    el.innerHTML = '<div class="empty-state" style="padding:16px;text-align:center;color:var(--text-muted);">Loading appointments…</div>';
    return;
  }
  if (appointmentsState === 'error') {
    el.innerHTML = '<div class="empty-state" style="padding:16px;text-align:center;color:var(--text-muted);">Appointments could not be loaded. Reload the page to retry.</div>';
    return;
  }
  const list = Array.isArray(window.NB.appointments) ? window.NB.appointments : [];
  if (!list.length) {
    el.innerHTML = '<div class="empty-state" style="padding:16px;text-align:center;color:var(--text-muted);">No appointments scheduled.</div>';
    return;
  }
  el.innerHTML = list.map(a => `
    <div class="appt-item" style="padding:12px;border:1px solid var(--border-light);border-radius:var(--radius-md);margin-bottom:10px;">
      <div class="appt-title" style="font-weight:700;font-size:0.875rem;">${nbEsc(a.title || 'Appointment')}${a.customer_name ? ' — ' + nbEsc(a.customer_name) : ''}</div>
      <div class="appt-meta" style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">${nbEsc(formatApptTime(a.starts_at))}</div>
    </div>
  `).join('');
}
window.renderAppointments = renderAppointments;

function formatApptTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Date not set';
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ============================================================
   CALENDAR — one state object drives the title, the grid, the
   selected day and the Day/Week/Month views.
   ============================================================ */
const calendarState = { cursor: null, view: 'month', selectedDate: null };
window.NB_CALENDAR_STATE = calendarState;

function pad2(value) { return String(value).padStart(2, '0'); }
function isoDateOf(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; }
function parseIsoDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}
function ensureCalendarState() {
  if (!calendarState.cursor || !calendarState.selectedDate) {
    const now = new Date();
    calendarState.cursor = new Date(now.getFullYear(), now.getMonth(), 1);
    calendarState.selectedDate = isoDateOf(now);
  }
}

function calendarAppointmentsByDate() {
  const map = new Map();
  (Array.isArray(window.NB?.appointments) ? window.NB.appointments : []).forEach(appt => {
    if (!appt?.starts_at) return;
    const when = new Date(appt.starts_at);
    if (Number.isNaN(when.getTime())) return;
    const key = isoDateOf(when);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(appt);
  });
  return map;
}

function calendarCellsFor(view, anchor) {
  const todayIso = isoDateOf(new Date());
  const build = (date, inMonth) => {
    const iso = isoDateOf(date);
    return {
      iso,
      day: date.getDate(),
      inMonth,
      isToday: iso === todayIso,
      isSelected: iso === calendarState.selectedDate
    };
  };
  const cells = [];

  if (view === 'day') {
    cells.push(build(anchor, true));
    return cells;
  }

  if (view === 'week') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay());
    for (let i = 0; i < 7; i += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      cells.push(build(date, date.getMonth() === anchor.getMonth()));
    }
    return cells;
  }

  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const leading = first.getDay();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  for (let i = 0; i < totalCells; i += 1) {
    const date = new Date(first.getFullYear(), first.getMonth(), 1 - leading + i);
    cells.push(build(date, date.getMonth() === first.getMonth()));
  }
  return cells;
}

function calendarTitleFor(view, anchor, cells) {
  if (view === 'day') {
    return `${anchor.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · Day`;
  }
  if (view === 'week') {
    const first = cells[0] ? parseIsoDate(cells[0].iso) : anchor;
    const last = cells[cells.length - 1] ? parseIsoDate(cells[cells.length - 1].iso) : anchor;
    const fmt = date => date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${fmt(first)} – ${fmt(last)} · Week`;
  }
  return `${anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} · Month`;
}

function renderCalendar() {
  ensureCalendarState();
  const container = document.getElementById('cal-grid-days');
  const monthTitle = document.getElementById('cal-month-title');
  const anchor = calendarState.cursor;
  const view = calendarState.view;
  const cells = calendarCellsFor(view, anchor);
  if (monthTitle) monthTitle.textContent = calendarTitleFor(view, anchor, cells);

  // Weekday header stays meaningful in day view.
  const header = document.querySelector('.cal-grid-header');
  if (header) header.style.display = view === 'day' ? 'none' : 'grid';
  if (container) container.style.gridTemplateColumns = view === 'day' ? '1fr' : 'repeat(7, 1fr)';

  if (!container) return;
  const byDate = calendarAppointmentsByDate();
  container.innerHTML = cells.map(cell => {
    const appts = byDate.get(cell.iso) || [];
    const badge = appts.length
      ? `<div class="cal-event-badge">${nbEsc(`${appts[0].starts_at ? new Date(appts[0].starts_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''} ${appts[0].title || 'Appointment'}`.trim())}${appts.length > 1 ? ` +${appts.length - 1}` : ''}</div>`
      : '';
    const classes = ['cal-day-cell'];
    if (cell.isToday) classes.push('today');
    if (cell.isSelected) classes.push('selected');
    if (!cell.inMonth) classes.push('muted');
    const style = [
      'cursor:pointer',
      cell.isSelected && !cell.isToday ? 'outline:2px solid var(--brand-primary);outline-offset:-2px' : '',
      !cell.inMonth ? 'opacity:.35' : ''
    ].filter(Boolean).join(';');
    return `
      <div class="${classes.join(' ')}" style="${style}" role="button" tabindex="0"
           aria-label="${nbEsc(cell.iso)}${appts.length ? `, ${appts.length} appointment(s)` : ', no appointments'}"
           onclick="window.openScheduleModalForDay('${cell.iso}')"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openScheduleModalForDay('${cell.iso}');}">
        <div class="cal-day-num">${cell.day}</div>
        ${badge}
      </div>
    `;
  }).join('');
}
window.renderCalendarGrid = renderCalendar;
window.renderCalendar = renderCalendar;

window.openScheduleModalForDay = function(iso) {
  const parsed = parseIsoDate(iso) || new Date();
  calendarState.selectedDate = isoDateOf(parsed);
  if (calendarState.view === 'month') calendarState.cursor = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  else calendarState.cursor = parsed;
  renderCalendar();
  const dateInput = document.getElementById('ap-date');
  if (dateInput) dateInput.value = `${isoDateOf(parsed)}T10:00`;
  const modal = document.getElementById('modal-add-appointment');
  if (modal) modal.classList.add('open');
};

window.NB_CALENDAR = {
  setView(view) {
    if (!['day', 'week', 'month'].includes(view)) return;
    ensureCalendarState();
    calendarState.view = view;
    renderCalendar();
  },
  move(offset) {
    ensureCalendarState();
    const step = Number(offset) || 0;
    const cursor = calendarState.cursor;
    if (calendarState.view === 'month') {
      calendarState.cursor = new Date(cursor.getFullYear(), cursor.getMonth() + step, 1);
    } else if (calendarState.view === 'week') {
      calendarState.cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + step * 7);
    } else {
      calendarState.cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + step);
    }
    calendarState.selectedDate = isoDateOf(calendarState.cursor);
    renderCalendar();
  },
  today() {
    const now = new Date();
    calendarState.cursor = calendarState.view === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : now;
    calendarState.selectedDate = isoDateOf(now);
    renderCalendar();
  },
  refresh: renderCalendar
};

function renderFunnel() {
  const el = document.getElementById('funnel-wrap');
  if (!el) return;
  const leads = window.NB?.leads || [];
  const total = leads.length;
  const count = status => leads.filter(lead => lead.status === status).length;
  const stages = [
    { label:'Total Leads', val:total },
    { label:'New', val:count('New') },
    { label:'Contacted', val:count('Contacted') },
    { label:'Qualified', val:count('Qualified') },
    { label:'Won', val:count('Won'), type:'won' },
    { label:'Lost', val:count('Lost'), type:'lost' }
  ].map(stage => ({ ...stage, pct: total ? (stage.val / total) * 100 : 0 }));
  el.innerHTML = stages.map(stage => `
    <div class="funnel-col">
      <div class="funnel-val">${stage.val}</div>
      <div class="funnel-bar ${stage.type || ''}" style="height:${Math.max(stage.pct, 3)}%"></div>
      <div class="funnel-lbl">${stage.label}</div>
    </div>
  `).join('');
}
window.renderFunnel = renderFunnel;

/* ============================================================
   REPORTS — computed only from the signed-in organization's
   records. Values show "—" until data is loaded so a loading
   state is never confused with a genuine zero.
   ============================================================ */
function renderReports() {
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  const leads = Array.isArray(window.NB?.leads) ? window.NB.leads : [];
  const deals = Array.isArray(window.NB?.deals) ? window.NB.deals : [];
  const conversations = Array.isArray(window.NB?.conversations) ? window.NB.conversations : [];

  const totalLeads = leads.length;
  const wonLeads = leads.filter(lead => ['Won', 'Converted'].includes(lead.status)).length;
  const leadsState = window.NB?.loadState?.leads;
  if (leadsState === 'error') {
    setText('report-conversion-rate', '—');
    setText('report-conversion-sub', 'Could not load organization data');
  } else {
    setText('report-conversion-rate', totalLeads ? `${((wonLeads / totalLeads) * 100).toFixed(1)}%` : '—');
    setText('report-conversion-sub', `${wonLeads} won of ${totalLeads} lead${totalLeads === 1 ? '' : 's'}`);
  }

  const dealsState = window.NB?.loadState?.deals;
  if (dealsState === 'unavailable' || window.NB?.dealsStorageAvailable === false) {
    setText('report-revenue', '—');
    setText('report-revenue-sub', 'Deals storage is not enabled yet');
  } else if (dealsState === 'error') {
    setText('report-revenue', '—');
    setText('report-revenue-sub', 'Could not load deals');
  } else if (dealsState === 'loading') {
    setText('report-revenue', '…');
    setText('report-revenue-sub', 'Loading deals…');
  } else {
    const closedDeals = deals.filter(deal => deal.stage === 'Won');
    const revenue = closedDeals.reduce((total, deal) => {
      const value = parseDealAmount(deal.amount);
      return value === null ? total : total + value;
    }, 0);
    setText('report-revenue', formatINR(revenue));
    setText('report-revenue-sub', `across ${closedDeals.length} closed deal${closedDeals.length === 1 ? '' : 's'}`);
  }

  const monthStart = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  })();
  const newCustomers = leads
    .filter(lead => ['Won', 'Converted'].includes(lead.status))
    .filter(lead => lead.created_at && new Date(lead.created_at) >= monthStart).length;
  setText('report-growth', `+${newCustomers}`);
  setText('report-growth-sub', 'new customers this month');

  const sentMessages = conversations.reduce((total, conversation) => total + (conversation.messages || [])
    .filter(message => (message.dir || message.direction) === 'out' || message.direction === 'outbound').length, 0);
  setText('report-messages', String(sentMessages));
  setText('report-messages-sub', sentMessages ? 'outbound messages in loaded conversations' : 'No outbound messages yet');
}
window.renderReports = renderReports;

/* ============================================================
   CALL WEBHOOK — MacroDroid mobile calling
   ============================================================ */
// The MacroDroid webhook URL is a server-side secret, held only in the server's
// MACRODROID_WEBHOOK_URL environment variable. It must never ship to the browser,
// so the browser only ever calls the authenticated proxy below.
const CALL_WEBHOOK_API = '/api/trigger-call';

/**
 * Resolve the signed-in Supabase access token from this app's own auth code.
 *
 * /api/trigger-call is protected by requireOrgAccess(), so the call button has
 * to present a real session JWT. It previously sent none, which made every call
 * fail with 401 "Authentication required".
 *
 * window.NB_AUTH.getAccessToken() comes from nextbright-crm/js/auth.js and reads
 * the live Supabase session. window.supabaseConfig.getSessionToken() is checked
 * as well so the same file works on the root app. No token and no webhook URL is
 * ever hard-coded here.
 */
async function getCallAccessToken() {
  try {
    if (window.NB_AUTH && typeof window.NB_AUTH.getAccessToken === 'function') {
      const token = await window.NB_AUTH.getAccessToken();
      if (token) return token;
    }
  } catch (error) {
    console.warn('[Call Webhook] could not read the session token:', error.message);
  }

  try {
    if (window.supabaseConfig && typeof window.supabaseConfig.getSessionToken === 'function') {
      const token = window.supabaseConfig.getSessionToken();
      if (token) return token;
    }
  } catch (error) {
    console.warn('[Call Webhook] could not read the stored session token:', error.message);
  }

  return '';
}

async function requestServerCallWebhook(name, phone) {
  // Fail before the network call: an unauthenticated request would only ever
  // come back 401, and the operator deserves a "sign in" prompt instead.
  const token = await getCallAccessToken();
  if (!token) {
    const error = new Error('Please sign in to place calls.');
    error.status = 401;
    error.noSession = true;
    throw error;
  }

  const response = await fetch(CALL_WEBHOOK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ name, phone })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || `Call webhook returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function triggerCallWebhook(name, phone) {
  const targetName = String(name || 'contact').trim() || 'contact';
  const targetPhone = String(phone || '').trim();

  if (!targetPhone) throw new Error('No phone number is available for this contact.');
  // Do not fire a real phone automation from file:// automated test pages.
  if (window.location.protocol === 'file:' && navigator.webdriver) {
    return { success: true, skipped: true, reason: 'automated-file-protocol' };
  }

  // Always go through the authenticated server-side proxy. There is deliberately
  // no direct browser fallback, because that would require exposing the URL.
  return requestServerCallWebhook(targetName, targetPhone);
}
window.triggerCallWebhook = triggerCallWebhook;

/* ============================================================
   ACTION HANDLERS (Call, Message, Delete Lead)
   ============================================================ */
window.handleCallLead = function(name, phone) {
  const targetName = String(name || 'contact').trim() || 'contact';
  const targetPhone = String(phone || '').trim();

  if (!targetPhone) {
    if (typeof showToast === 'function') {
      showToast(`Cannot call ${targetName}: no phone number is available for this record.`, 'error');
    }
    return Promise.resolve({ success: false, error: 'Missing phone number' });
  }

  if (typeof showToast === 'function') {
    showToast(`Requesting call to ${targetName} (${targetPhone})…`, 'info');
  }

  return triggerCallWebhook(targetName, targetPhone)
    .then(result => {
      if (!result?.skipped && typeof showToast === 'function') {
        showToast(`Call request sent to mobile for ${targetName} (${targetPhone})`, 'success');
      }
      return result;
    })
    .catch(error => {
      console.error('[Call Webhook]', error);
      if (typeof showToast === 'function') {
        // A missing session is not a webhook failure, so do not report it as
        // one - say what the operator actually has to do.
        showToast(
          error?.noSession
            ? `Calling ${targetName}: please sign in to place calls.`
            : `Calling ${targetName}: mobile webhook failed (${error.message})`,
          'error'
        );
      }
      return { success: false, error: error.message };
    });
};

window.handleMessageLead = function(name) {
  if (typeof switchView === 'function') {
    switchView('messages');
  }
  // Conversations are created by the messaging backend when a real WhatsApp/social
  // message arrives. Earlier builds fabricated an inbox entry with a made-up
  // inbound message, which vanished on reload and polluted the inbox.
  const existing = (window.NB?.conversations || []).find(c => String(c.name || '').toLowerCase() === String(name || '').toLowerCase());
  if (existing) {
    if (typeof window.openConversation === 'function') window.openConversation(existing.id || existing.key);
    showToast(`Opened conversation with ${name}.`, 'info');
  } else {
    showToast(`No conversation with ${name} yet. One appears here once they message you on a connected channel.`, 'info');
  }
};

window.handleDeleteLead = async function(id) {
  if (!window.NB || !window.NB.leads) return;
  const index = window.NB.leads.findIndex(l => String(l.id) === String(id));
  if (index === -1) return;
  const lead = window.NB.leads[index];
  if (!window.confirm(`Delete lead "${lead.name}"? This removes it from the server.`)) return;
  try {
    const response = await window.NB_AUTH.apiFetch(`/api/leads?id=${encodeURIComponent(lead.id)}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    window.NB.leads.splice(index, 1);
    renderLeadsTable();
    renderRecentLeads();
    renderKanban();
    renderFunnel();
    if (typeof window.updateWorkspaceMetrics === 'function') window.updateWorkspaceMetrics();
    showToast(`Lead "${lead.name}" deleted.`, 'default');
  } catch (error) {
    showToast(`Could not delete lead: ${error.message}`, 'error');
  }
};

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  renderRecentLeads();
  renderLeadsTable();
  renderCustomers();
  renderDeals();
  renderCalls();
  renderActivityFeed();
  renderTodayTasks();
  renderFullTasks();
  renderAppointments();
  renderCalendarGrid();
  renderFunnel();
  renderReports();

  setTimeout(() => {
    if (typeof feather !== 'undefined') feather.replace();
  }, 100);
});
