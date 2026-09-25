/* ============================================================
   APP.JS — Main rendering logic & Action Handlers
   ============================================================ */
'use strict';

/* ============================================================
   STATUS BADGE HELPER
   ============================================================ */
function statusBadge(status) {
  const map = {
    'New':       'badge-new',
    'Contacted': 'badge-contacted',
    'Qualified': 'badge-qualified',
    'Proposal':  'badge-proposal',
    'Converted': 'badge-converted',
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
  const recentLeads = window.NB.leads.slice(0, 6);
  tbody.innerHTML = recentLeads.map(l => {
    const color = window.NB.avatarColor(l.name);
    const initials = window.NB.initials(l.name);
    return `
      <tr data-lead-id="${l.id}">
        <td>
          <div class="lead-name-cell">
            <div class="lead-avatar" style="background:${color}">${initials}</div>
            <span class="lead-name-text">${l.name}</span>
          </div>
        </td>
        <td><span class="lead-phone-text">${l.phone}</span></td>
        <td><span class="lead-source-text">${l.source}</span></td>
        <td>${statusBadge(l.status)}</td>
        <td>
          <div class="assigned-chip">
            <div class="assigned-ava">${window.NB.initials(l.assigned)}</div>
            <span>${l.assigned}</span>
          </div>
        </td>
        <td style="color:var(--text-muted);font-size:0.8125rem;">${l.lastActivity}</td>
        <td style="color:var(--text-muted);font-size:0.8125rem;">${l.date}</td>
        <td>
          <div class="row-actions">
            <button class="row-action-btn action-call" title="Call" onclick="handleCallLead('${l.name}', '${l.phone}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6 6l1.27-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </button>
            <button class="row-action-btn action-msg" title="Message" onclick="handleMessageLead('${l.name}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>
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
    return `
      <tr data-lead-id="${l.id}">
        <td><input type="checkbox" style="accent-color:var(--brand-primary)"></td>
        <td>
          <div class="lead-name-cell">
            <div class="lead-avatar" style="background:${color}">${initials}</div>
            <div>
              <div class="lead-name-text">${l.name}</div>
            </div>
          </div>
        </td>
        <td><span class="lead-phone-text">${l.phone}</span></td>
        <td><span class="lead-source-text">${l.source}</span></td>
        <td>${statusBadge(l.status)}</td>
        <td>
          <div class="assigned-chip">
            <div class="assigned-ava">${window.NB.initials(l.assigned)}</div>
            <span>${l.assigned}</span>
          </div>
        </td>
        <td style="color:var(--text-muted);font-size:0.8125rem;">${l.lastActivity}</td>
        <td style="color:var(--text-muted);font-size:0.8125rem;">${l.date}</td>
        <td>
          <div class="row-actions">
            <button class="row-action-btn" title="Call" onclick="handleCallLead('${l.name}', '${l.phone}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6 6l1.27-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </button>
            <button class="row-action-btn" title="Message" onclick="handleMessageLead('${l.name}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
            <button class="row-action-btn" title="Delete" style="color:var(--status-danger)" onclick="handleDeleteLead(${l.id})">
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
  const stages = ['New','Contacted','Qualified','Proposal','Converted','Lost'];
  const stageColors = { New:'#2563EB', Contacted:'#10B981', Qualified:'#F59E0B', Proposal:'#7C3AED', Converted:'#059669', Lost:'#EF4444' };

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
              <div class="kanban-card-name">${l.name}</div>
              <div class="kanban-card-meta">${l.phone}</div>
              <div class="kanban-card-footer">
                <span class="badge" style="font-size:0.6875rem;padding:1px 8px;background:${stageColors[stage]}18;color:${stageColors[stage]}">${l.source}</span>
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
    return `
      <tr>
        <td>
          <div class="lead-name-cell">
            <div class="lead-avatar" style="background:${color}">${window.NB.initials(c.name)}</div>
            <span class="lead-name-text">${c.name}</span>
          </div>
        </td>
        <td><span class="lead-phone-text">${c.phone}</span></td>
        <td>${c.company}</td>
        <td><strong>${c.revenue}</strong></td>
        <td>
          <div class="assigned-chip">
            <div class="assigned-ava">${window.NB.initials(c.assigned)}</div>
            <span>${c.assigned}</span>
          </div>
        </td>
        <td style="color:var(--text-muted);font-size:0.8125rem;">${c.lastContact}</td>
        <td>
          <div class="row-actions">
            <button class="row-action-btn" title="View 360 Profile" onclick="openCustomer360('${c.name}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="row-action-btn" title="Call" onclick="handleCallLead('${c.name}', '${c.phone}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6 6l1.27-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </button>
            <button class="row-action-btn" title="Message" onclick="handleMessageLead('${c.name}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}
window.renderCustomers = renderCustomers;

window.openCustomer360 = async function(name) {
  const modal = document.getElementById('modal-customer-360');
  if (!modal) return;

  const c = window.NB.customers.find(item => item.name === name) || { name, phone: '+91 98765 43210', company: 'Client Enterprise', revenue: '₹45,000' };

  document.getElementById('c360-name').textContent = c.name;
  document.getElementById('c360-avatar').textContent = window.NB.initials(c.name);
  document.getElementById('c360-meta').textContent = `${c.company} · Phone: ${c.phone} · Total Revenue: ${c.revenue}`;

  const timelineEl = document.getElementById('c360-timeline');
  timelineEl.innerHTML = `
    <div style="padding:8px 12px;background:var(--bg-card);border:1px solid var(--border-light);border-radius:6px;">
      <strong style="color:var(--brand-primary)">Lead Created</strong> — Source: Instagram DMs (Yesterday 10:30 AM)
    </div>
    <div style="padding:8px 12px;background:var(--bg-card);border:1px solid var(--border-light);border-radius:6px;">
      <strong style="color:var(--status-success)">WhatsApp Conversation</strong> — Customer inquired about services (Yesterday 11:00 AM)
    </div>
    <div style="padding:8px 12px;background:var(--bg-card);border:1px solid var(--border-light);border-radius:6px;">
      <strong style="color:var(--status-purple)">Call Completed</strong> — Duration 04:12 by Praveenkumar (Today 09:15 AM)
    </div>
    <div style="padding:8px 12px;background:var(--bg-card);border:1px solid var(--border-light);border-radius:6px;">
      <strong style="color:var(--status-warning)">Appointment Scheduled</strong> — Consultation booked for 4:00 PM today
    </div>
  `;

  modal.classList.add('open');
};

/* ============================================================
   DEALS Pipeline
   ============================================================ */
function renderDeals() {
  const pipeline = document.getElementById('deals-pipeline');
  if (!pipeline || !window.NB || !window.NB.deals) return;
  const stages = ['New','Contacted','Proposal','Negotiation','Won','Lost'];
  pipeline.innerHTML = stages.map(stage => {
    const deals = window.NB.deals[stage] || [];
    const total = deals.reduce((acc, d) => {
      const val = parseInt(d.amount.replace(/[^0-9]/g, '')) || 0;
      return acc + val;
    }, 0);
    const colClass = stage === 'Won' ? 'pipeline-col won' : stage === 'Lost' ? 'pipeline-col lost' : 'pipeline-col';
    return `
      <div class="${colClass}">
        <div class="pipeline-col-header">
          <div class="pipeline-col-title">
            <span>${stage}</span>
            <span class="kanban-count">${deals.length}</span>
          </div>
          <div class="pipeline-col-total">${deals.length > 0 ? '₹' + (total/100).toFixed(0) + 'K' : '—'}</div>
        </div>
        <div class="pipeline-cards">
          ${deals.map(d => `
            <div class="deal-card">
              <div class="deal-card-name">${d.name}</div>
              <div class="deal-card-customer">${d.customer}</div>
              <div class="deal-card-body">
                <div class="deal-card-amount">${d.amount}</div>
              </div>
              <div class="deal-card-footer">
                <span class="deal-prob ${d.probClass}">${d.prob}</span>
                <div class="assigned-chip">
                  <div class="assigned-ava" style="width:20px;height:20px;font-size:0.5625rem;">${window.NB.initials(d.owner)}</div>
                  <span style="font-size:0.75rem;color:var(--text-muted);">${d.lastActivity}</span>
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
  el.innerHTML = window.NB.activityFeed.map(a => `
    <div class="activity-item">
      <div class="activity-icon ${a.color}">
        <i data-feather="${a.icon}"></i>
      </div>
      <div class="activity-text">
        <strong>${a.text}</strong>
        <span>${a.sub}</span>
      </div>
    </div>
  `).join('');
  if (typeof feather !== 'undefined') feather.replace();
}

/* ============================================================
   TASKS
   ============================================================ */
function renderTodayTasks() {
  const el = document.getElementById('today-task-list');
  if (!el || !window.NB || !window.NB.tasks) return;
  el.innerHTML = window.NB.tasks.map((t, i) => `
    <div class="task-item ${t.done ? 'done' : ''}">
      <input type="checkbox" ${t.done ? 'checked' : ''} onchange="window.toggleTask(${i}, this.checked)">
      <div class="task-info">
        <div class="task-title" style="${t.done ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${t.title}</div>
        <div class="task-time">${t.time}</div>
      </div>
      <span class="task-priority priority-${t.priority.toLowerCase()}">${t.priority}</span>
    </div>
  `).join('');
}
window.renderTodayTasks = renderTodayTasks;

let currentTaskFilter = 'all';

function renderFullTasks(filterMode) {
  if (filterMode) currentTaskFilter = filterMode;
  const el = document.getElementById('tasks-full-list');
  if (!el || !window.NB || !window.NB.tasks) return;

  let filtered = window.NB.tasks;
  if (currentTaskFilter === 'today') {
    filtered = window.NB.tasks.filter(t => t.time.includes('AM') || t.time.includes('PM') || t.time === '2:00 PM' || t.time === '3:00 PM' || t.time === '4:00 PM');
  } else if (currentTaskFilter === 'this-week') {
    filtered = window.NB.tasks;
  } else if (currentTaskFilter === 'overdue') {
    filtered = window.NB.tasks.filter(t => t.time === 'EOD' || t.priority === 'High');
  }

  if (filtered.length === 0) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted)">No tasks found for this filter.</div>`;
    return;
  }

  el.innerHTML = filtered.map((t) => {
    const idx = window.NB.tasks.indexOf(t);
    return `
      <div class="task-full-item" style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--border-light)">
        <input type="checkbox" ${t.done ? 'checked' : ''} onchange="window.toggleTask(${idx}, this.checked)">
        <div class="task-full-info" style="flex:1">
          <div class="task-full-title" style="${t.done ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${t.title}</div>
          <div class="task-full-meta" style="font-size:0.75rem;color:var(--text-muted)">${t.time} · <span class="task-priority priority-${t.priority.toLowerCase()}">${t.priority}</span></div>
        </div>
        <button class="row-action-btn" title="Delete Task" onclick="window.deleteTask(${idx})" style="color:var(--status-danger)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>
    `;
  }).join('');
}
window.renderFullTasks = renderFullTasks;

function initTaskFilters() {
  const container = document.getElementById('tasks-filters');
  if (!container) return;
  container.querySelectorAll('[data-task-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-task-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.taskFilter;
      renderFullTasks(filter);
    });
  });
}
window.initTaskFilters = initTaskFilters;

window.toggleTask = function(index, isDone) {
  if (window.NB && window.NB.tasks[index]) {
    window.NB.tasks[index].done = isDone;
    renderTodayTasks();
    renderFullTasks();
    if (typeof showToast === 'function') {
      showToast(isDone ? 'Task marked complete!' : 'Task reopened', 'success');
    }
  }
};

window.deleteTask = function(index) {
  if (window.NB && window.NB.tasks[index]) {
    const title = window.NB.tasks[index].title;
    window.NB.tasks.splice(index, 1);
    renderTodayTasks();
    renderFullTasks();
    if (typeof showToast === 'function') {
      showToast(`Task "${title}" deleted`, 'default');
    }
  }
};

/* ============================================================
   APPOINTMENTS & CALENDAR GRID
   ============================================================ */
function renderAppointments() {
  const el = document.getElementById('appt-list');
  if (!el || !window.NB || !window.NB.appointments) return;
  el.innerHTML = window.NB.appointments.map(a => `
    <div class="appt-item" style="padding:12px;border:1px solid var(--border-light);border-radius:var(--radius-md);margin-bottom:10px;">
      <div class="appt-title" style="font-weight:700;font-size:0.875rem;">${a.type} — ${a.customer}</div>
      <div class="appt-meta" style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">${a.date} · ${a.assigned}</div>
    </div>
  `).join('');
}
window.renderAppointments = renderAppointments;

function renderCalendarGrid() {
  const container = document.getElementById('cal-grid-days');
  if (!container) return;

  const monthTitle = document.getElementById('cal-month-title');
  if (monthTitle) monthTitle.textContent = 'September 2026';

  let html = '';
  for (let day = 1; day <= 30; day++) {
    const isToday = day === 23;
    let eventBadge = '';
    if (day === 23) eventBadge = `<div class="cal-event-badge">11:00 AM Dental Consult</div>`;
    else if (day === 24) eventBadge = `<div class="cal-event-badge">2:30 PM Car Service</div>`;
    else if (day === 28) eventBadge = `<div class="cal-event-badge">4:00 PM Consultation</div>`;

    html += `
      <div class="cal-day-cell ${isToday ? 'today' : ''}" onclick="openScheduleModalForDay(${day})">
        <div class="cal-day-num">${day}</div>
        ${eventBadge}
      </div>
    `;
  }
  container.innerHTML = html;
}
window.renderCalendarGrid = renderCalendarGrid;

window.openScheduleModalForDay = function(day) {
  const dateInput = document.getElementById('ap-date');
  if (dateInput) dateInput.value = `Sep ${day}, 2026 · 10:00 AM`;
  const modal = document.getElementById('modal-add-appointment');
  if (modal) modal.classList.add('open');
};

function renderFunnel() {
  const el = document.getElementById('funnel-wrap');
  if (!el) return;
  const stages = [
    { label:'Total Leads',  val:1245, pct:100 },
    { label:'Contacted',    val:842,  pct:68  },
    { label:'Qualified',    val:380,  pct:31  },
    { label:'Proposal',     val:180,  pct:14  },
    { label:'Won',          val:18,   pct:1.4, type:'won' },
    { label:'Lost',         val:94,   pct:8,   type:'lost'},
  ];
  el.innerHTML = stages.map(s => `
    <div class="funnel-col">
      <div class="funnel-val">${s.val}</div>
      <div class="funnel-bar ${s.type || ''}" style="height:${Math.max(s.pct, 3)}%"></div>
      <div class="funnel-lbl">${s.label}</div>
    </div>
  `).join('');
}

/* ============================================================
   ACTION HANDLERS (Call, Message, Delete Lead)
   ============================================================ */
window.handleCallLead = function(name, phone) {
  if (typeof showToast === 'function') {
    showToast(`Calling ${name} (${phone})...`, 'success');
  }
};

window.handleMessageLead = function(name) {
  if (typeof switchView === 'function') {
    switchView('messages');
  }
  if (window.NB && window.NB.conversations) {
    let conv = window.NB.conversations.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!conv) {
      conv = {
        id: Date.now(),
        name,
        initials: window.NB.initials(name),
        time: 'Just now',
        preview: 'Conversation initiated',
        messages: [{ dir: 'in', text: `Hello! Interested in your services.`, time: 'Just now' }]
      };
      window.NB.conversations.unshift(conv);
      if (typeof window.initMessages === 'function') window.initMessages();
    }
  }
};

window.handleDeleteLead = function(id) {
  if (!window.NB || !window.NB.leads) return;
  const index = window.NB.leads.findIndex(l => l.id === id);
  if (index !== -1) {
    const name = window.NB.leads[index].name;
    window.NB.leads.splice(index, 1);
    renderLeadsTable();
    renderRecentLeads();
    renderKanban();
    if (typeof showToast === 'function') {
      showToast(`Lead "${name}" deleted`, 'default');
    }
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

  setTimeout(() => {
    if (typeof feather !== 'undefined') feather.replace();
  }, 100);
});
