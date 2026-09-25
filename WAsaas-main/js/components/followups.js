/* ==========================================================================
   NexusLead AI - Lead Follow-Up Management Component
   Handles:
     - Daily Follow-up Dashboard (Today, Overdue, Upcoming, New, Interested, Won)
     - Follow-up Actions (Call, WhatsApp, Email, Mark Contacted, Schedule Follow-up)
     - Personalized Message Generator (Stages & Tones with AI/Template Fallback)
     - Follow-up History Timeline & Persistence
     - Toast Notifications & Topbar Reminders
   ========================================================================== */

class FollowUpsComponent {
  constructor() {
    this.activeTab = 'today'; // 'today', 'overdue', 'upcoming', 'new', 'interested', 'won', 'all'
    this.filterSearch = '';
    this.filterStatus = 'all';
    this.filterSort = 'next_date';
    this.activeModalLead = null;
    this.activeMsgGenLead = null;
    this.selectedStage = 'First Follow-up';
    this.selectedTone = 'Professional';
    this.generatedMsgText = '';
  }

  init() {
    this.bindEvents();
    this.render();
    this.updateTopbarReminders();

    // Subscribe to state changes
    window.appState.on('leads', () => {
      this.render();
      this.updateTopbarReminders();
    });

    window.appState.on('viewChanged', (view) => {
      if (view === 'followups' || view === 'dashboard') {
        this.render();
        this.updateTopbarReminders();
      }
    });
  }

  bindEvents() {
    // Topbar refresh button in view-followups
    const refreshBtn = document.getElementById('followup-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        window.appState.saveState();
        this.render();
        this.showToast('Follow-up Queue Refreshed', 'Latest leads and schedules synchronized.', 'success');
      });
    }

    // Auto Followup: Run Now button (panel)
    document.addEventListener('click', (e) => {
      if (e.target.closest('#auto-followup-run-btn') || e.target.closest('#followup-run-auto-btn')) {
        e.preventDefault();
        this.runDailyFollowup('followup');
      }
      if (e.target.closest('#auto-followup-welcome-btn')) {
        e.preventDefault();
        this.runDailyFollowup('welcome');
      }
    });

    // Add Lead Button in view-followups
    const newLeadBtn = document.getElementById('followup-new-lead-btn');
    if (newLeadBtn) {
      newLeadBtn.addEventListener('click', () => {
        window.navigationComponent.switchView('crm');
        const openAddLeadBtn = document.getElementById('open-add-lead-modal-btn');
        if (openAddLeadBtn) openAddLeadBtn.click();
      });
    }
  }

  getTodayStr() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getLeadFollowUpDate(lead) {
    if (!lead) return '';
    const raw = lead.next_followup_at || lead.next_follow_up_date || lead.followup_date || lead.follow_up_date;
    if (!raw) return '';
    if (raw.includes('T')) return raw.split('T')[0];
    return raw;
  }

  getLeadName(lead) {
    return lead.contactName || lead.name || 'Unnamed Prospect';
  }

  getLeadCompany(lead) {
    return lead.companyName || lead.company || '';
  }

  getLeadProduct(lead) {
    return lead.interested_in || lead.interestedProduct || lead.industry || 'Sales Automation';
  }

  getLeadStatus(lead) {
    return lead.status || 'New';
  }

  getLeadsList() {
    return window.appState.get('leads') || [];
  }

  // Categorize leads by date and status
  categorizeLeads() {
    const leads = this.getLeadsList();
    const todayStr = this.getTodayStr();

    const today = [];
    const overdue = [];
    const upcoming = [];
    const newLeads = [];
    const interested = [];
    const won = [];

    leads.forEach(lead => {
      const status = this.getLeadStatus(lead);
      const fDate = this.getLeadFollowUpDate(lead);

      if (status === 'New') newLeads.push(lead);
      if (status === 'Interested') interested.push(lead);
      if (status === 'Won') won.push(lead);

      if (fDate) {
        if (fDate === todayStr) {
          today.push(lead);
        } else if (fDate < todayStr && status !== 'Won' && status !== 'Lost') {
          overdue.push(lead);
        } else if (fDate > todayStr) {
          upcoming.push(lead);
        }
      }
    });

    return {
      total: leads.length,
      today,
      overdue,
      upcoming,
      newLeads,
      interested,
      won,
    };
  }

  // Update topbar notification reminder badge
  updateTopbarReminders() {
    const cats = this.categorizeLeads();
    const reminderBtn = document.getElementById('topbar-followup-reminder');
    if (!reminderBtn) return;

    if (cats.today.length === 0 && cats.overdue.length === 0) {
      reminderBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>All Follow-ups Caught Up</span>
      `;
      reminderBtn.className = 'btn btn-secondary btn-sm';
      reminderBtn.style.color = 'var(--status-success)';
      reminderBtn.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    } else {
      let badgeHtml = `<span>📅 ${cats.today.length} Today</span>`;
      if (cats.overdue.length > 0) {
        badgeHtml += `<span style="background: rgba(239,68,68,0.2); color: #f87171; padding: 2px 6px; border-radius: 4px; font-weight:700;">⚠️ ${cats.overdue.length} Overdue</span>`;
      }
      reminderBtn.innerHTML = badgeHtml;
      reminderBtn.className = 'btn btn-secondary btn-sm';
      reminderBtn.style.border = cats.overdue.length > 0 ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid var(--brand-whatsapp)';
    }
  }

  // Main render method
  render() {
    const container = document.getElementById('followups-container');
    if (!container) return;

    const cats = this.categorizeLeads();
    const todayStr = this.getTodayStr();

    // Determine filtered list based on active tab
    let displayList = [];
    if (this.activeTab === 'today') displayList = cats.today;
    else if (this.activeTab === 'overdue') displayList = cats.overdue;
    else if (this.activeTab === 'upcoming') displayList = cats.upcoming;
    else if (this.activeTab === 'new') displayList = cats.newLeads;
    else if (this.activeTab === 'interested') displayList = cats.interested;
    else if (this.activeTab === 'won') displayList = cats.won;
    else displayList = this.getLeadsList();

    // Apply Search Filter
    if (this.filterSearch.trim()) {
      const q = this.filterSearch.toLowerCase();
      displayList = displayList.filter(l =>
        this.getLeadName(l).toLowerCase().includes(q) ||
        this.getLeadCompany(l).toLowerCase().includes(q) ||
        (l.phone && l.phone.toLowerCase().includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q))
      );
    }

    // Apply Status Dropdown Filter
    if (this.filterStatus !== 'all') {
      displayList = displayList.filter(l => this.getLeadStatus(l) === this.filterStatus);
    }

    // Apply Sort Order
    displayList.sort((a, b) => {
      if (this.filterSort === 'next_date') {
        const da = this.getLeadFollowUpDate(a);
        const db = this.getLeadFollowUpDate(b);
        if (!da) return 1;
        if (!db) return -1;
        return da.localeCompare(db);
      }
      if (this.filterSort === 'newest') {
        return new Date(b.createdDate || b.created_at || 0) - new Date(a.createdDate || a.created_at || 0);
      }
      if (this.filterSort === 'oldest') {
        return new Date(a.createdDate || a.created_at || 0) - new Date(b.createdDate || b.created_at || 0);
      }
      return 0;
    });

    // Render HTML Output
    container.innerHTML = `
      <!-- Metric Summary Cards Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 20px;">
        <div class="card followup-kpi-card ${this.activeTab === 'today' ? 'active' : ''}" onclick="window.followUpsComponent.switchTab('today')" style="cursor: pointer; border-left: 4px solid var(--brand-whatsapp);">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Follow-ups Today</div>
          <div style="font-size: 24px; font-weight: 800; color: var(--text-primary); margin-top: 4px;">${cats.today.length}</div>
          <div style="font-size: 11px; color: var(--brand-whatsapp); font-weight: 600; margin-top: 2px;">Due ${todayStr}</div>
        </div>

        <div class="card followup-kpi-card ${this.activeTab === 'overdue' ? 'active' : ''}" onclick="window.followUpsComponent.switchTab('overdue')" style="cursor: pointer; border-left: 4px solid #ef4444;">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Overdue Follow-ups</div>
          <div style="font-size: 24px; font-weight: 800; color: ${cats.overdue.length > 0 ? '#f87171' : 'var(--text-primary)'}; margin-top: 4px;">${cats.overdue.length}</div>
          <div style="font-size: 11px; color: #f87171; font-weight: 600; margin-top: 2px;">${cats.overdue.length > 0 ? '⚠️ Action Required' : '0 Overdue'}</div>
        </div>

        <div class="card followup-kpi-card ${this.activeTab === 'upcoming' ? 'active' : ''}" onclick="window.followUpsComponent.switchTab('upcoming')" style="cursor: pointer; border-left: 4px solid #3b82f6;">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Upcoming</div>
          <div style="font-size: 24px; font-weight: 800; color: var(--text-primary); margin-top: 4px;">${cats.upcoming.length}</div>
          <div style="font-size: 11px; color: #60a5fa; font-weight: 600; margin-top: 2px;">Scheduled Future</div>
        </div>

        <div class="card followup-kpi-card ${this.activeTab === 'new' ? 'active' : ''}" onclick="window.followUpsComponent.switchTab('new')" style="cursor: pointer; border-left: 4px solid #06b6d4;">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">New Leads</div>
          <div style="font-size: 24px; font-weight: 800; color: var(--text-primary); margin-top: 4px;">${cats.newLeads.length}</div>
          <div style="font-size: 11px; color: #22d3ee; font-weight: 600; margin-top: 2px;">Fresh Prospects</div>
        </div>

        <div class="card followup-kpi-card ${this.activeTab === 'interested' ? 'active' : ''}" onclick="window.followUpsComponent.switchTab('interested')" style="cursor: pointer; border-left: 4px solid #a855f7;">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Interested</div>
          <div style="font-size: 24px; font-weight: 800; color: var(--text-primary); margin-top: 4px;">${cats.interested.length}</div>
          <div style="font-size: 11px; color: #c084fc; font-weight: 600; margin-top: 2px;">High Intent</div>
        </div>

        <div class="card followup-kpi-card ${this.activeTab === 'won' ? 'active' : ''}" onclick="window.followUpsComponent.switchTab('won')" style="cursor: pointer; border-left: 4px solid #10b981;">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Won Deals</div>
          <div style="font-size: 24px; font-weight: 800; color: var(--text-primary); margin-top: 4px;">${cats.won.length}</div>
          <div style="font-size: 11px; color: #34d399; font-weight: 600; margin-top: 2px;">Converted Deals</div>
        </div>
      </div>

      <!-- Segmented Navigation Tabs & Controls -->
      <div class="card" style="padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; justify-between: space-between; flex-wrap: wrap; gap: 12px;">
          <!-- Tabs -->
          <div class="crm-view-switch">
            <button class="crm-view-btn ${this.activeTab === 'today' ? 'active' : ''}" onclick="window.followUpsComponent.switchTab('today')">
              📅 Today (${cats.today.length})
            </button>
            <button class="crm-view-btn ${this.activeTab === 'overdue' ? 'active' : ''}" onclick="window.followUpsComponent.switchTab('overdue')">
              ⚠️ Overdue (${cats.overdue.length})
            </button>
            <button class="crm-view-btn ${this.activeTab === 'upcoming' ? 'active' : ''}" onclick="window.followUpsComponent.switchTab('upcoming')">
              ⏳ Upcoming (${cats.upcoming.length})
            </button>
            <button class="crm-view-btn ${this.activeTab === 'new' ? 'active' : ''}" onclick="window.followUpsComponent.switchTab('new')">
              ✨ New (${cats.newLeads.length})
            </button>
            <button class="crm-view-btn ${this.activeTab === 'interested' ? 'active' : ''}" onclick="window.followUpsComponent.switchTab('interested')">
              ⭐ Interested (${cats.interested.length})
            </button>
            <button class="crm-view-btn ${this.activeTab === 'all' ? 'active' : ''}" onclick="window.followUpsComponent.switchTab('all')">
              All Leads (${cats.total})
            </button>
          </div>

          <!-- Search & Controls -->
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <input type="text" id="followup-search-input" class="form-input" style="width: 220px; height: 36px; font-size: 12px;" placeholder="Search name, phone, email..." value="${this.escapeHtml(this.filterSearch)}">

            <select id="followup-status-select" class="form-input" style="width: 140px; height: 36px; font-size: 12px;">
              <option value="all" ${this.filterStatus === 'all' ? 'selected' : ''}>All Statuses</option>
              <option value="New" ${this.filterStatus === 'New' ? 'selected' : ''}>New</option>
              <option value="Contacted" ${this.filterStatus === 'Contacted' ? 'selected' : ''}>Contacted</option>
              <option value="Replied" ${this.filterStatus === 'Replied' ? 'selected' : ''}>Replied</option>
              <option value="Qualified" ${this.filterStatus === 'Qualified' ? 'selected' : ''}>Qualified</option>
              <option value="Follow-up" ${this.filterStatus === 'Follow-up' ? 'selected' : ''}>Follow-up</option>
              <option value="Interested" ${this.filterStatus === 'Interested' ? 'selected' : ''}>Interested</option>
              <option value="Won" ${this.filterStatus === 'Won' ? 'selected' : ''}>Won</option>
              <option value="Lost" ${this.filterStatus === 'Lost' ? 'selected' : ''}>Lost</option>
            </select>

            <select id="followup-sort-select" class="form-input" style="width: 150px; height: 36px; font-size: 12px;">
              <option value="next_date" ${this.filterSort === 'next_date' ? 'selected' : ''}>Sort: Next Follow-up</option>
              <option value="newest" ${this.filterSort === 'newest' ? 'selected' : ''}>Sort: Newest First</option>
              <option value="oldest" ${this.filterSort === 'oldest' ? 'selected' : ''}>Sort: Oldest First</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Lead Cards Container -->
      ${displayList.length === 0 ? `
        <div class="card" style="padding: 40px; text-align: center; background: var(--bg-tertiary);">
          <div style="font-size: 36px; margin-bottom: 10px;">🎉</div>
          <h3 style="font-size: 16px; font-weight: 700; color: var(--text-primary);">No leads in this queue</h3>
          <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
            ${this.activeTab === 'today' ? 'All scheduled follow-ups for today are complete!' : 'Try selecting another tab or clearing search filters.'}
          </p>
        </div>
      ` : `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px;">
          ${displayList.map(lead => this.renderLeadCard(lead, todayStr)).join('')}
        </div>
      `}
    `;

    this.bindDynamicEvents();
  }

  renderLeadCard(lead, todayStr) {
    const name = this.getLeadName(lead);
    const company = this.getLeadCompany(lead);
    const product = this.getLeadProduct(lead);
    const status = this.getLeadStatus(lead);
    const fDate = this.getLeadFollowUpDate(lead);
    const isOverdue = fDate && fDate < todayStr && status !== 'Won' && status !== 'Lost';
    const isToday = fDate === todayStr;

    const isAutomationPaused = lead.follow_up_status === 'Paused' || lead.status === 'REPLIED';
    const isAutomationEnabled = lead.follow_up_enabled !== false;
    const currentStage = lead.follow_up_stage || 'First Follow-up';
    const currentFollowUpStatus = lead.follow_up_status || (isAutomationPaused ? 'Paused' : 'Scheduled');

    const statusBadgeClass =
      status === 'Won' ? 'badge-success' :
      status === 'Interested' || status === 'Qualified' ? 'badge-whatsapp' :
      status === 'Contacted' || status === 'Replied' ? 'badge-warm' : 'badge-cold';

    return `
      <div class="card" style="position: relative; display: flex; flex-direction: column; justify-content: space-between; border-top: 3px solid ${isOverdue ? '#ef4444' : isToday ? 'var(--brand-whatsapp)' : 'var(--border-medium)'};">
        <div>
          <!-- Header -->
          <div class="flex items-center justify-between" style="margin-bottom: 8px;">
            <div>
              <div style="font-weight: 700; font-size: 15px; color: var(--text-primary); cursor: pointer;" onclick="window.followUpsComponent.viewLeadDrawer('${lead.id}')">
                ${this.escapeHtml(name)}
              </div>
              ${company ? `<div style="font-size: 12px; color: var(--text-secondary);">${this.escapeHtml(company)}</div>` : ''}
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
              <span class="badge ${statusBadgeClass}">${status}</span>
              <span class="badge ${isAutomationPaused ? 'badge-warm' : 'badge-whatsapp'}" style="font-size: 10px;">
                ${isAutomationPaused ? '⏸ Auto Paused' : '⚡ Auto ON'}
              </span>
            </div>
          </div>

          <!-- Customer Replied Automation Paused Banner -->
          ${isAutomationPaused ? `
            <div style="margin: 6px 0; padding: 6px 10px; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; font-size: 11.5px; color: #fbbf24; display: flex; items-center; justify-between; gap: 6px;">
              <span>💬 Customer replied — follow-up automation paused.</span>
              <button class="btn btn-secondary btn-sm" onclick="window.followUpsComponent.toggleAutomation('${lead.id}', true)" style="font-size: 10px; padding: 2px 6px; height: auto;">
                Resume
              </button>
            </div>
          ` : ''}

          <!-- Product / Service Tag -->
          ${product ? `
            <div style="margin: 6px 0; padding: 4px 10px; background: var(--bg-tertiary); border-radius: 6px; font-size: 12px; color: var(--text-secondary); display: inline-flex; items-center; gap: 6px; border: 1px solid var(--border-subtle);">
              <span style="color: var(--brand-whatsapp);">🏷️</span>
              <span style="font-weight: 600; color: var(--text-primary);">${this.escapeHtml(product)}</span>
            </div>
          ` : ''}

          <!-- Contact Details -->
          <div style="font-size: 12px; color: var(--text-secondary); margin: 6px 0; display: flex; flex-direction: column; gap: 3px;">
            ${lead.phone ? `<div>📞 <span style="font-family: monospace; color: var(--text-primary); font-weight: 600;">${this.escapeHtml(lead.phone)}</span></div>` : '<div style="color: #f87171; italic; font-weight: 600;">⚠️ Phone number is missing</div>'}
            ${lead.email ? `<div>✉️ <span>${this.escapeHtml(lead.email)}</span></div>` : ''}
          </div>

          <!-- Schedule & Stage Info -->
          <div style="margin: 8px 0; padding: 8px 10px; background: rgba(0,0,0,0.15); border-radius: 8px; font-size: 11.5px; display: flex; flex-direction: column; gap: 3px;">
            <div class="flex items-center justify-between">
              <span style="color: var(--text-muted);">Stage:</span>
              <span style="font-weight: 700; color: var(--brand-whatsapp);">${this.escapeHtml(currentStage)}</span>
            </div>

            <div class="flex items-center justify-between">
              <span style="color: var(--text-muted);">Next Date:</span>
              <span style="font-weight: 700; color: ${isOverdue ? '#f87171' : isToday ? 'var(--brand-whatsapp)' : 'var(--text-primary)'};">
                ${fDate ? (isOverdue ? `⚠️ ${fDate} (Overdue)` : isToday ? `📅 ${fDate} (Today)` : fDate) : 'Not scheduled'}
              </span>
            </div>

            <div class="flex items-center justify-between">
              <span style="color: var(--text-muted);">Sending Status:</span>
              <span style="font-weight: 600; color: ${currentFollowUpStatus === 'Sent' ? '#34d399' : currentFollowUpStatus === 'Failed' ? '#f87171' : 'var(--text-secondary)'};">
                ${currentFollowUpStatus}
              </span>
            </div>
          </div>

          <!-- Notes preview -->
          ${lead.notes || lead.scoreReason ? `
            <div style="font-size: 11px; color: var(--text-muted); font-style: italic; background: var(--bg-tertiary); padding: 6px 8px; border-radius: 6px; margin-bottom: 8px; border-left: 2px solid var(--border-medium);">
              "${this.escapeHtml((lead.notes || lead.scoreReason).substring(0, 90))}${ (lead.notes || lead.scoreReason).length > 90 ? '...' : '' }"
            </div>
          ` : ''}
        </div>

        <!-- Action Toolbar -->
        <div>
          <!-- Automation Controls Row -->
          <div style="margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px border-subtle; display: flex; gap: 4px; flex-wrap: wrap;">
            ${isAutomationPaused ? `
              <button class="btn btn-secondary btn-sm" onclick="window.followUpsComponent.toggleAutomation('${lead.id}', true)" style="font-size: 11px; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);">
                ▶️ Resume Automation
              </button>
            ` : `
              <button class="btn btn-secondary btn-sm" onclick="window.followUpsComponent.toggleAutomation('${lead.id}', false)" style="font-size: 11px; background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);">
                ⏸ Pause Automation
              </button>
            `}
            <button class="btn btn-secondary btn-sm" onclick="window.followUpsComponent.promptSendTestMessage('${lead.id}')" style="font-size: 11px; background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3);" title="Send Test WhatsApp Message">
              🚀 Send Test Message
            </button>
          </div>

          <!-- Bottom Action Buttons Row -->
          <div style="display: flex; items-center; justify-between; gap: 6px; flex-wrap: wrap;">
            <div style="display: flex; gap: 4px;">
              <button class="btn btn-secondary btn-sm" onclick="window.followUpsComponent.openContactModal('${lead.id}')" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 700;" title="Mark Contacted / Schedule Next">
                ✓ Contacted
              </button>
              <button class="btn btn-secondary btn-sm" onclick="window.followUpsComponent.openMessageModal('${lead.id}')" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3);" title="Generate Message">
                ✍️ AI Message
              </button>
            </div>

            <div style="display: flex; gap: 4px;">
              <button class="btn btn-secondary btn-sm btn-icon" onclick="window.followUpsComponent.triggerCall('${lead.id}')" title="Call Lead">
                📞
              </button>
              <button class="btn btn-secondary btn-sm btn-icon" onclick="window.followUpsComponent.triggerWhatsApp('${lead.id}')" title="Open WhatsApp Chat">
                💬
              </button>
              <button class="btn btn-secondary btn-sm btn-icon" onclick="window.followUpsComponent.triggerEmail('${lead.id}')" title="Send Email">
                ✉️
              </button>
              <button class="btn btn-secondary btn-sm btn-icon" onclick="window.followUpsComponent.viewLeadDrawer('${lead.id}')" title="View Lead Details">
                👁️
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  bindDynamicEvents() {
    const searchInput = document.getElementById('followup-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterSearch = e.target.value;
        this.render();
      });
    }

    const statusSelect = document.getElementById('followup-status-select');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        this.filterStatus = e.target.value;
        this.render();
      });
    }

    const sortSelect = document.getElementById('followup-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.filterSort = e.target.value;
        this.render();
      });
    }
  }

  switchTab(tab) {
    this.activeTab = tab;
    this.render();
  }

  // Action Handlers
  triggerCall(leadId) {
    const leads = this.getLeadsList();
    const lead = leads.find(l => l.id === leadId);
    if (!lead || !lead.phone) {
      this.showToast('Call Action Failed', 'Phone number is not available for this lead.', 'warning');
      return;
    }
    window.location.href = `tel:${lead.phone.replace(/[^0-9+]/g, '')}`;
    this.logHistory(lead.id, `Voice call initiated to ${lead.phone}`, 'Call', 'Follow-up');
  }

  triggerWhatsApp(leadId) {
    const leads = this.getLeadsList();
    const lead = leads.find(l => l.id === leadId);
    if (!lead || !lead.phone) {
      this.showToast('WhatsApp Failed', 'Phone number is not available for this lead.', 'warning');
      return;
    }
    const cleanPhone = lead.phone.replace(/[^0-9]/g, '');
    const defaultMsg = `Hi ${this.getLeadName(lead)}, following up regarding our discussion about ${this.getLeadProduct(lead)}.`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(defaultMsg)}`;
    window.open(url, '_blank');
    this.showToast('Opening WhatsApp', 'WhatsApp chat opened. Remember to send the message in WhatsApp.', 'info');
    this.logHistory(lead.id, defaultMsg, 'WhatsApp', 'Follow-up');
  }

  triggerEmail(leadId) {
    const leads = this.getLeadsList();
    const lead = leads.find(l => l.id === leadId);
    if (!lead || !lead.email) {
      this.showToast('Email Failed', 'Email address is not available for this lead.', 'warning');
      return;
    }
    const subject = `Follow-up regarding ${this.getLeadProduct(lead)}`;
    const body = `Hi ${this.getLeadName(lead)},\n\nFollowing up on our conversation regarding ${this.getLeadProduct(lead)}. Please let me know when you have time for a quick chat.\n\nBest regards,`;
    window.location.href = `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    this.logHistory(lead.id, body, 'Email', 'Follow-up');
  }

  viewLeadDrawer(leadId) {
    if (window.crmComponent && window.crmComponent.openLeadDrawer) {
      const leads = this.getLeadsList();
      const lead = leads.find(l => l.id === leadId);
      if (lead) window.crmComponent.openLeadDrawer(lead);
    }
  }

  // Modal: Mark Contacted / Schedule Next Date
  openContactModal(leadId) {
    const leads = this.getLeadsList();
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    this.activeModalLead = lead;
    const modal = document.getElementById('followup-contact-modal');
    if (!modal) return;

    // Populate modal form
    document.getElementById('modal-lead-name').textContent = this.getLeadName(lead);

    // Default next date to +3 days
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    const dateInput = document.getElementById('modal-next-date-input');
    if (dateInput) dateInput.value = defaultDate.toISOString().split('T')[0];

    const statusSelect = document.getElementById('modal-status-select');
    if (statusSelect) statusSelect.value = lead.status === 'New' ? 'Contacted' : lead.status;

    modal.classList.add('active');
  }

  setQuickPresetDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const dateInput = document.getElementById('modal-next-date-input');
    if (dateInput) dateInput.value = d.toISOString().split('T')[0];
  }

  saveContactModal() {
    if (!this.activeModalLead) return;
    const leadId = this.activeModalLead.id;
    const leads = this.getLeadsList();
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const dateInput = document.getElementById('modal-next-date-input');
    const statusSelect = document.getElementById('modal-status-select');
    const noteInput = document.getElementById('modal-note-input');

    const nextDate = dateInput ? dateInput.value : '';
    const newStatus = statusSelect ? statusSelect.value : lead.status;
    const extraNote = noteInput ? noteInput.value.trim() : '';

    const now = new Date().toISOString();
    lead.last_contacted_at = now;
    lead.lastContacted = now;
    lead.next_followup_at = nextDate;
    lead.next_follow_up_date = nextDate;
    lead.followup_date = nextDate;
    lead.status = newStatus;
    lead.followup_count = (lead.followup_count || 0) + 1;

    if (extraNote) {
      lead.notes = (lead.notes ? lead.notes + '\n\n' : '') + `[${new Date().toLocaleDateString()} Contact Logged] ${extraNote}`;
    }

    // Persist to window.appState & Supabase
    window.appState.saveState();
    this.syncLeadToSupabase(lead);

    this.logHistory(lead.id, `Contact logged. Next follow-up set for ${nextDate}. ${extraNote}`, 'Mark Contacted', 'Scheduled');
    this.showToast('Follow-up Scheduled', `Marked ${this.getLeadName(lead)} as contacted. Next follow-up: ${nextDate}.`, 'success');

    const modal = document.getElementById('followup-contact-modal');
    if (modal) modal.classList.remove('active');
    this.activeModalLead = null;
    this.render();
  }

  // Modal: Personalized Message Generator
  openMessageModal(leadId) {
    const leads = this.getLeadsList();
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    this.activeMsgGenLead = lead;
    const modal = document.getElementById('followup-message-modal');
    if (!modal) return;

    document.getElementById('msgmodal-lead-name').textContent = `${this.getLeadName(lead)} (${this.getLeadCompany(lead) || 'Company'})`;

    this.updateGeneratedMessageText();
    modal.classList.add('active');
  }

  updateGeneratedMessageText() {
    if (!this.activeMsgGenLead) return;
    const lead = this.activeMsgGenLead;
    const name = this.getLeadName(lead);
    const company = this.getLeadCompany(lead) ? ` at ${this.getLeadCompany(lead)}` : '';
    const product = this.getLeadProduct(lead);

    const templates = {
      'First Follow-up': {
        Professional: `Dear ${name}, following up regarding our previous conversation about ${product}${company}. Please let me know if you have any questions or would like to schedule a call to discuss further.`,
        Friendly: `Hi ${name}, just following up regarding our previous conversation about ${product}! Please let me know if you have any questions or would like to continue.`,
        'Short Sales': `Hi ${name}, quick check-in regarding ${product}! Are you ready to get started this week?`,
        Polite: `Hello ${name}, I hope this message finds you well. Reaching out to follow up on our discussion about ${product}. Take your time to review and let me know how you'd like to proceed.`
      },
      'Second Follow-up': {
        Professional: `Dear ${name}, I wanted to check if you had a chance to review the details we provided for ${product}${company}. Please let me know if you need any additional information.`,
        Friendly: `Hi ${name}, checking in to see if you reviewed the details for ${product}! Let me know if I can help answer any questions.`,
        'Short Sales': `Hi ${name}, checking in! We have availability to onboard ${company || 'your team'} for ${product} this week. Shall we reserve your spot?`,
        Polite: `Hello ${name}, following up on our previous note regarding ${product}. Happy to provide any extra info whenever convenient.`
      },
      'Final Follow-up': {
        Professional: `Dear ${name}, following up one last time regarding ${product}. Feel free to reach out whenever you are ready to proceed.`,
        Friendly: `Hi ${name}, just checking in one last time regarding our previous conversation about ${product}. Feel free to reach out whenever you're ready!`,
        'Short Sales': `Hi ${name}, last check-in from my side regarding ${product}. If you're still interested, reply YES and we can take care of it right away!`,
        Polite: `Hello ${name}, this will be my final check-in for now regarding ${product}. Whenever the time is right, I will be here to assist.`
      }
    };

    const text = templates[this.selectedStage]?.[this.selectedTone] || templates['First Follow-up']['Friendly'];
    this.generatedMsgText = text;

    const textarea = document.getElementById('msgmodal-textarea');
    if (textarea) textarea.value = text;
  }

  onStageOrToneChange(type, value) {
    if (type === 'stage') this.selectedStage = value;
    if (type === 'tone') this.selectedTone = value;
    this.updateGeneratedMessageText();
  }

  copyGeneratedMessage() {
    const textarea = document.getElementById('msgmodal-textarea');
    const text = textarea ? textarea.value : this.generatedMsgText;
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
      this.showToast('Message Copied!', 'Copied to clipboard and saved to history.', 'success');
      if (this.activeMsgGenLead) {
        this.logHistory(this.activeMsgGenLead.id, text, 'Copied', this.selectedStage);
      }
    }).catch(() => {
      this.showToast('Copy Failed', 'Unable to copy text to clipboard.', 'warning');
    });
  }

  sendWhatsAppFromModal() {
    const textarea = document.getElementById('msgmodal-textarea');
    const text = textarea ? textarea.value : this.generatedMsgText;
    if (!this.activeMsgGenLead || !this.activeMsgGenLead.phone) {
      this.showToast('WhatsApp Failed', 'Phone number is not available for this lead.', 'warning');
      return;
    }
    const cleanPhone = this.activeMsgGenLead.phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    this.showToast('Opening WhatsApp', 'WhatsApp chat opened. Confirm and send in WhatsApp.', 'info');
    this.logHistory(this.activeMsgGenLead.id, text, 'WhatsApp', this.selectedStage);
  }

  sendEmailFromModal() {
    const textarea = document.getElementById('msgmodal-textarea');
    const text = textarea ? textarea.value : this.generatedMsgText;
    if (!this.activeMsgGenLead || !this.activeMsgGenLead.email) {
      this.showToast('Email Failed', 'Email address is not available for this lead.', 'warning');
      return;
    }
    const subject = `Follow-up regarding ${this.getLeadProduct(this.activeMsgGenLead)}`;
    window.location.href = `mailto:${this.activeMsgGenLead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    this.logHistory(this.activeMsgGenLead.id, text, 'Email', this.selectedStage);
  }

  // -------------------------------------------------------------------------
  // Automation Toggle: pause or resume automatic WhatsApp follow-ups
  // -------------------------------------------------------------------------
  async toggleAutomation(leadId, enable) {
    const leads = this.getLeadsList();
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const newEnabled = Boolean(enable);
    const newStatus = newEnabled ? 'Scheduled' : 'Paused';

    lead.follow_up_enabled = newEnabled;
    lead.follow_up_status = newStatus;
    window.appState.saveState();

    // Persist to Supabase
    if (window.authService && window.authService.supabase) {
      const { error } = await window.authService.supabase
        .from('leads')
        .update({ follow_up_enabled: newEnabled, follow_up_status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', leadId);

      if (error) {
        console.warn('[FollowUpsComponent] toggleAutomation Supabase error:', error.message);
        this.showToast('Sync Warning', 'Local state updated but Supabase sync failed.', 'warning');
      }
    }

    const label = newEnabled ? '▶️ Automation Resumed' : '⏸ Automation Paused';
    const desc = newEnabled
      ? `Automatic WhatsApp follow-ups will resume for ${this.getLeadName(lead)}.`
      : `Automatic follow-ups paused for ${this.getLeadName(lead)}. You can re-enable anytime.`;
    this.showToast(label, desc, newEnabled ? 'success' : 'warning');
    this.render();
  }

  // -------------------------------------------------------------------------
  // Test Message: confirm dialog before calling the API endpoint
  // -------------------------------------------------------------------------
  promptSendTestMessage(leadId) {
    const leads = this.getLeadsList();
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    if (!lead.phone) {
      this.showToast('Cannot Send Test', 'This lead has no phone number on record.', 'warning');
      return;
    }

    const name = this.getLeadName(lead);
    const confirmed = window.confirm(
      `Send a test WhatsApp message to ${name} (${lead.phone}) via the Meta Cloud API?\n\n` +
      `This will use your configured WhatsApp credentials and will appear as a real message on the recipient's phone.`
    );

    if (confirmed) {
      this.executeTestMessage(leadId);
    }
  }

  async executeTestMessage(leadId) {
    const leads = this.getLeadsList();
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    this.showToast('Sending…', `Dispatching WhatsApp test message to ${this.getLeadName(lead)}…`, 'info');

    try {
      const response = await fetch('/api/send-whatsapp-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          templateName: 'followup_message',
          stage: 'Test Message',
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        this.showToast('Test Message Sent ✅', `WhatsApp message delivered. ID: ${data.whatsappMessageId || 'N/A'}`, 'success');
        this.logHistory(lead.id, 'Test WhatsApp message sent via Meta Cloud API.', 'WhatsApp', 'Test Message');
        this.render();
      } else {
        const errMsg = data?.error || 'Unknown error from API.';
        // Graceful handling for unconfigured credentials
        if (response.status === 503 || errMsg.toLowerCase().includes('not configured')) {
          this.showToast('API Not Configured', 'WhatsApp credentials are not set up yet. Add WHATSAPP_ACCESS_TOKEN and PHONE_NUMBER_ID to your .env file.', 'warning');
        } else {
          this.showToast('Send Failed ⚠️', errMsg, 'warning');
        }
      }
    } catch (err) {
      console.error('[FollowUpsComponent] executeTestMessage error:', err);
      this.showToast('Network Error', 'Could not reach the API endpoint. Is the dev server running?', 'warning');
    }
  }

  // Save entry to follow-up history
  logHistory(leadId, message, channel, stage = 'Follow-up') {
    const leads = this.getLeadsList();
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    if (!lead.followupHistory) lead.followupHistory = [];
    const entry = {
      id: 'fhis_' + Date.now(),
      timestamp: new Date().toISOString(),
      message,
      channel,
      stage
    };

    lead.followupHistory.unshift(entry);
    window.appState.saveState();

    // Sync to Supabase `follow_up_messages` table if Supabase is connected
    if (window.authService && window.authService.supabase) {
      const user = window.authService.getUser();
      if (user) {
        window.authService.supabase
          .from('follow_up_messages')
          .insert([{
            user_id: user.id,
            lead_id: lead.id,
            message,
            stage,
            channel,
            created_at: entry.timestamp
          }])
          .then(({ error }) => {
            if (error) console.warn('[FollowUpsComponent] Supabase history insert warning:', error.message);
          });
      }
    }
  }

  // Sync updated lead to Supabase
  async syncLeadToSupabase(lead) {
    if (window.authService && window.authService.supabase) {
      const user = window.authService.getUser();
      if (user) {
        const payload = {
          user_id: user.id,
          name: this.getLeadName(lead),
          contact_name: this.getLeadName(lead),
          phone: lead.phone || null,
          email: lead.email || null,
          company: this.getLeadCompany(lead) || null,
          company_name: this.getLeadCompany(lead) || 'General',
          status: lead.status || 'New',
          follow_up_date: this.getLeadFollowUpDate(lead) || null,
          next_follow_up_date: this.getLeadFollowUpDate(lead) || null,
          last_contacted_at: lead.last_contacted_at || null,
          updated_at: new Date().toISOString()
        };

        window.authService.supabase
          .from('leads')
          .upsert([payload])
          .then(({ error }) => {
            if (error) console.warn('[FollowUpsComponent] Supabase lead sync warning:', error.message);
          });
      }
    }
  }

  // Toast Notification System
  showToast(title, desc, type = 'info') {
    let container = document.getElementById('toast-notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-notification-container';
      container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; max-width: 360px; pointer-events: none;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const borderColor = type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#3b82f6';
    const icon = type === 'success' ? '✓' : type === 'warning' ? '⚠️' : 'ℹ️';

    toast.style.cssText = `
      pointer-events: auto;
      background: var(--bg-secondary, #0f172a);
      border: 1px solid ${borderColor};
      border-left: 4px solid ${borderColor};
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      color: var(--text-primary, #fff);
      font-size: 12.5px;
      transition: all 0.3s ease;
    `;

    toast.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 2px;">${icon} ${this.escapeHtml(title)}</div>
      ${desc ? `<div style="color: var(--text-secondary, #94a3b8); font-size: 11.5px;">${this.escapeHtml(desc)}</div>` : ''}
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // -------------------------------------------------------------------------
  // AI Auto Daily Followup Runner
  // Calls /api/daily-followup to send WhatsApp messages to all due leads
  // -------------------------------------------------------------------------
  async runDailyFollowup(type = 'followup') {
    const runBtn = document.getElementById('auto-followup-run-btn');
    const headerBtn = document.getElementById('followup-run-auto-btn');
    const welcomeBtn = document.getElementById('auto-followup-welcome-btn');
    const resultEl = document.getElementById('auto-followup-result');
    const badgeEl = document.getElementById('auto-followup-status-badge');

    const isWelcome = type === 'welcome';
    const activeBtn = isWelcome ? welcomeBtn : runBtn;

    // UI: Loading state
    if (activeBtn) {
      activeBtn.disabled = true;
      activeBtn.textContent = isWelcome ? '⏳ Sending Welcome Messages…' : '⏳ Processing Due Followups…';
    }
    if (headerBtn && !isWelcome) {
      headerBtn.disabled = true;
      headerBtn.textContent = '⏳ Processing…';
    }
    if (badgeEl) {
      badgeEl.innerHTML = `<span class="badge" style="background: rgba(245,158,11,0.2); color: #fbbf24; font-weight: 700;">⏳ Running…</span>`;
    }
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div style="background: rgba(96,165,250,0.1); border: 1px solid rgba(96,165,250,0.3); border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #93c5fd; display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 18px; animation: spin 1s linear infinite; display: inline-block;">⚙️</span>
          <span>${isWelcome ? 'Sending Welcome WhatsApp messages to new leads via Meta Cloud API…' : 'Finding due follow-up leads and sending WhatsApp messages via Meta Cloud API…'}</span>
        </div>
      `;
    }

    const url = isWelcome ? '/api/daily-followup?action=welcome' : '/api/daily-followup';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: window.appState?.state?.leads || [] })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const { processed = 0, sent = 0, failed = 0, paused = 0, completed = 0, status, message } = data;

        // Skipped (not configured)
        if (status === 'Skipped') {
          if (resultEl) {
            resultEl.innerHTML = `
              <div style="background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: 8px; padding: 14px 16px; font-size: 13px;">
                <div style="font-weight: 700; color: #fbbf24; margin-bottom: 6px;">⚠️ WhatsApp Not Configured</div>
                <div style="color: var(--text-secondary); font-size: 12.5px; line-height: 1.6;">
                  ${message || 'Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to your .env file to enable auto sending.'}
                </div>
                <div style="margin-top: 10px; font-size: 12px; color: var(--text-muted);">
                  📁 Edit <code style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">.env</code> → add your Meta WhatsApp credentials → restart the server.
                </div>
              </div>
            `;
          }
          if (badgeEl) {
            badgeEl.innerHTML = `<span class="badge" style="background: rgba(245,158,11,0.2); color: #fbbf24; font-weight: 700;">⚠️ Not Configured</span>`;
          }
        } else {
          // Success
          const isAllSent = sent > 0;
          const resultColor = isAllSent ? '#34d399' : '#93c5fd';

          if (resultEl) {
            resultEl.innerHTML = `
              <div style="background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.3); border-radius: 8px; padding: 14px 16px;">
                <div style="font-weight: 700; font-size: 14px; color: #34d399; margin-bottom: 10px;">
                  ✅ ${isWelcome ? 'Welcome Messages' : 'Daily Followup'} Run Complete
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; font-size: 12.5px;">
                  <div style="background: var(--bg-tertiary); border-radius: 6px; padding: 8px 12px; text-align: center;">
                    <div style="color: var(--text-muted); font-size: 11px;">Processed</div>
                    <div style="font-size: 20px; font-weight: 800; color: var(--text-primary);">${processed}</div>
                  </div>
                  <div style="background: var(--bg-tertiary); border-radius: 6px; padding: 8px 12px; text-align: center;">
                    <div style="color: var(--text-muted); font-size: 11px;">✅ Sent</div>
                    <div style="font-size: 20px; font-weight: 800; color: #34d399;">${sent}</div>
                  </div>
                  ${!isWelcome ? `
                  <div style="background: var(--bg-tertiary); border-radius: 6px; padding: 8px 12px; text-align: center;">
                    <div style="color: var(--text-muted); font-size: 11px;">⏸ Paused</div>
                    <div style="font-size: 20px; font-weight: 800; color: #fbbf24;">${paused}</div>
                  </div>
                  <div style="background: var(--bg-tertiary); border-radius: 6px; padding: 8px 12px; text-align: center;">
                    <div style="color: var(--text-muted); font-size: 11px;">🏁 Completed</div>
                    <div style="font-size: 20px; font-weight: 800; color: #60a5fa;">${completed}</div>
                  </div>
                  ` : ''}
                  <div style="background: var(--bg-tertiary); border-radius: 6px; padding: 8px 12px; text-align: center;">
                    <div style="color: var(--text-muted); font-size: 11px;">❌ Failed</div>
                    <div style="font-size: 20px; font-weight: 800; color: #f87171;">${failed}</div>
                  </div>
                </div>
                ${processed === 0 ? `<div style="margin-top: 10px; font-size: 12.5px; color: var(--text-secondary);">ℹ️ No due leads found — all followups are up to date or paused.</div>` : ''}
                <div style="margin-top: 8px; font-size: 11.5px; color: var(--text-muted);">Last run: ${new Date().toLocaleString()}</div>
              </div>
            `;
          }
          if (badgeEl) {
            badgeEl.innerHTML = `<span class="badge" style="background: rgba(16,185,129,0.2); color: #34d399; font-weight: 700;">✅ Last run: ${sent} sent</span>`;
          }

          this.showToast(
            isWelcome ? '📩 Welcome Messages Sent' : '🤖 Auto Followup Complete',
            `Processed: ${processed} | Sent: ${sent} | Failed: ${failed}`,
            sent > 0 ? 'success' : 'info'
          );

          // Refresh the lead queue display
          this.render();
        }
      } else {
        const errMsg = data.error || `Server returned HTTP ${res.status}`;
        if (resultEl) {
          resultEl.innerHTML = `
            <div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #f87171;">
              <strong>❌ Followup Run Failed:</strong> ${this.escapeHtml(errMsg)}
            </div>
          `;
        }
        if (badgeEl) {
          badgeEl.innerHTML = `<span class="badge badge-unqualified">❌ Run Failed</span>`;
        }
        this.showToast('Auto Followup Failed', errMsg, 'warning');
      }
    } catch (err) {
      const errMsg = err.message || 'Network error';
      if (resultEl) {
        resultEl.innerHTML = `
          <div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #f87171;">
            <strong>❌ Network Error:</strong> ${this.escapeHtml(errMsg)}<br>
            <span style="font-size: 12px; color: var(--text-muted); margin-top: 4px; display: block;">Make sure the dev server is running at localhost:3000.</span>
          </div>
        `;
      }
      if (badgeEl) {
        badgeEl.innerHTML = `<span class="badge badge-unqualified">❌ Connection Error</span>`;
      }
      this.showToast('Connection Error', 'Could not reach /api/daily-followup. Is the server running?', 'warning');
    } finally {
      if (activeBtn) {
        activeBtn.disabled = false;
        activeBtn.textContent = isWelcome ? '📩 Send Welcome to New Leads' : '▶ Run Now (Send Due Followups)';
      }
      if (headerBtn && !isWelcome) {
        headerBtn.disabled = false;
        headerBtn.textContent = '🤖 Run AI Auto Followup';
      }
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

window.followUpsComponent = new FollowUpsComponent();
