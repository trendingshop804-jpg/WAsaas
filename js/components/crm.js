/* ==========================================================================
   NexusLead AI - Lead CRM Component (Table, Kanban, Pipeline, Detail Drawer)
   ========================================================================== */

class CRMComponent {
  constructor() {
    this.currentViewMode = 'table'; // 'table', 'kanban', 'pipeline'
    this.selectedLeadIds = new Set();
    this.activeDrawerLead = null;
    this.filterSearch = '';
    this.filterCategory = 'all';
    this.pipelineStages = [
      'New',
      'Contacted',
      'Replied',
      'Qualified',
      'Proposal',
      'Negotiation',
      'Won',
      'Lost'
    ];
  }

  init() {
    this.bindEvents();
    this.render();

    window.appState.on('leads', () => this.render());
    window.appState.on('viewChanged', (view) => {
      if (view === 'crm') this.render();
    });
  }

  bindEvents() {
    // View Switcher (Table / Kanban / Pipeline)
    document.querySelectorAll('.crm-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.crm-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentViewMode = btn.getAttribute('data-mode');
        this.render();
      });
    });

    // CRM Search Filter
    const searchInput = document.getElementById('crm-search-filter');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterSearch = e.target.value.toLowerCase();
        this.render();
      });
    }

    // Score Filter Pills
    document.querySelectorAll('.crm-score-filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.crm-score-filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.filterCategory = pill.getAttribute('data-category');
        this.render();
      });
    });

    // Close Drawer
    const closeDrawerBtn = document.getElementById('close-lead-drawer-btn');
    const drawerBackdrop = document.getElementById('lead-drawer-backdrop');
    if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', () => this.closeLeadDrawer());
    if (drawerBackdrop) drawerBackdrop.addEventListener('click', () => this.closeLeadDrawer());

    // Bulk action triggers
    const bulkMsgBtn = document.getElementById('bulk-send-msg-btn');
    if (bulkMsgBtn) {
      bulkMsgBtn.addEventListener('click', () => this.handleBulkMessage());
    }

    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    if (bulkDeleteBtn) {
      bulkDeleteBtn.addEventListener('click', () => this.handleBulkDelete());
    }

    // Lead drawer note submit
    const noteForm = document.getElementById('drawer-add-note-form');
    if (noteForm) {
      noteForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.addDrawerNote();
      });
    }
  }

  getFilteredLeads() {
    const leads = window.appState.get('leads') || [];
    return leads.filter(lead => {
      const matchesSearch = !this.filterSearch ||
        lead.contactName.toLowerCase().includes(this.filterSearch) ||
        lead.companyName.toLowerCase().includes(this.filterSearch) ||
        lead.phone.includes(this.filterSearch) ||
        lead.location.toLowerCase().includes(this.filterSearch);

      const matchesCategory = this.filterCategory === 'all' || lead.scoreCategory === this.filterCategory;

      return matchesSearch && matchesCategory;
    });
  }

  render() {
    const tableContainer = document.getElementById('crm-table-view-container');
    const kanbanContainer = document.getElementById('crm-kanban-view-container');
    const pipelineContainer = document.getElementById('crm-pipeline-view-container');

    if (tableContainer) tableContainer.style.display = this.currentViewMode === 'table' ? 'block' : 'none';
    if (kanbanContainer) kanbanContainer.style.display = this.currentViewMode === 'kanban' ? 'flex' : 'none';
    if (pipelineContainer) pipelineContainer.style.display = this.currentViewMode === 'pipeline' ? 'block' : 'none';

    if (this.currentViewMode === 'table') {
      this.renderTableView();
    } else if (this.currentViewMode === 'kanban') {
      this.renderKanbanView();
    } else if (this.currentViewMode === 'pipeline') {
      this.renderPipelineView();
    }
  }

  renderTableView() {
    const tbody = document.getElementById('crm-leads-tbody');
    if (!tbody) return;

    const filtered = this.getFilteredLeads();

    tbody.innerHTML = filtered.map(lead => `
      <tr class="${this.selectedLeadIds.has(lead.id) ? 'selected' : ''}">
        <td>
          <input type="checkbox" class="lead-row-cb" data-id="${lead.id}" ${this.selectedLeadIds.has(lead.id) ? 'checked' : ''}>
        </td>
        <td>
          <div style="font-weight: 700; color: var(--text-primary); cursor: pointer;" onclick="window.crmComponent.openLeadDrawer('${lead.id}')">
            ${this.escapeHtml(lead.contactName)}
          </div>
          <div style="font-size: 11.5px; color: var(--text-muted);">${this.escapeHtml(lead.jobTitle || 'Decision Maker')}</div>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-primary);">${this.escapeHtml(lead.companyName)}</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">${this.escapeHtml(lead.industry)}</div>
        </td>
        <td>
          <div class="flex items-center gap-2">
            <span class="badge ${lead.optedOut ? 'badge-danger' : 'badge-whatsapp'} font-mono">${this.escapeHtml(lead.phone)}</span>
            ${lead.optedOut ? '<span style="font-size: 10px; color: var(--status-danger); font-weight:700;">OPTED OUT</span>' : ''}
          </div>
        </td>
        <td>${this.escapeHtml(lead.location)}</td>
        <td>
          <span class="badge badge-${lead.scoreCategory}">
            ${lead.scoreCategory === 'hot' ? '🔥' : lead.scoreCategory === 'warm' ? '🟠' : lead.scoreCategory === 'cold' ? '🔵' : '⚪'}
            ${lead.score}/100
          </span>
        </td>
        <td>
          <select class="form-select" style="padding: 3px 8px; font-size: 12px; width: auto;" onchange="window.crmComponent.updateLeadStatus('${lead.id}', this.value)">
            ${this.pipelineStages.map(st => `<option value="${st}" ${lead.status === st ? 'selected' : ''}>${st}</option>`).join('')}
          </select>
        </td>
        <td>
          <div style="font-size: 12px; color: var(--text-secondary);">${lead.lastContacted ? new Date(lead.lastContacted).toLocaleDateString() : 'Never'}</div>
        </td>
        <td>
          <div class="flex items-center gap-1">
            <button class="btn btn-secondary btn-sm btn-icon" title="View & Edit Details" onclick="window.crmComponent.openLeadDrawer('${lead.id}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button class="btn btn-primary btn-sm btn-icon" title="Open WhatsApp Chat" onclick="window.crmComponent.openWhatsAppChat('${lead.id}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </button>
            <button class="btn btn-outline btn-sm btn-icon" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.25);" title="Delete Contact & Chat" onclick="window.crmComponent.deleteLead('${lead.id}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    // Bind checkboxes
    document.querySelectorAll('.lead-row-cb').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-id');
        if (e.target.checked) this.selectedLeadIds.add(id);
        else this.selectedLeadIds.delete(id);
        this.updateBulkActionBar();
      });
    });

    const selectAll = document.getElementById('select-all-leads-cb');
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        filtered.forEach(l => {
          if (e.target.checked) this.selectedLeadIds.add(l.id);
          else this.selectedLeadIds.delete(l.id);
        });
        this.renderTableView();
        this.updateBulkActionBar();
      });
    }
  }

  renderKanbanView() {
    const kanbanContainer = document.getElementById('crm-kanban-view-container');
    if (!kanbanContainer) return;

    const filtered = this.getFilteredLeads();

    kanbanContainer.innerHTML = this.pipelineStages.map(stage => {
      const stageLeads = filtered.filter(l => (l.status || 'New') === stage);
      return `
        <div class="kanban-column" ondragover="event.preventDefault()" ondrop="window.crmComponent.handleKanbanDrop(event, '${stage}')">
          <div class="kanban-col-header">
            <div class="kanban-col-title">
              <span>${stage}</span>
              <span class="kanban-count">${stageLeads.length}</span>
            </div>
          </div>
          <div class="kanban-cards-container">
            ${stageLeads.map(lead => `
              <div class="kanban-card" draggable="true" ondragstart="window.crmComponent.handleKanbanDragStart(event, '${lead.id}')" onclick="window.crmComponent.openLeadDrawer('${lead.id}')">
                <div class="kanban-card-title">${this.escapeHtml(lead.contactName)}</div>
                <div class="kanban-card-company">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
                  ${this.escapeHtml(lead.companyName)}
                </div>
                <div class="kanban-card-meta">
                  <span class="badge badge-${lead.scoreCategory}">🔥 ${lead.score}/100</span>
                  <span style="font-size: 11px; color: var(--text-muted);">${this.escapeHtml(lead.location.split(',')[0])}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  renderPipelineView() {
    const pipelineContainer = document.getElementById('crm-pipeline-view-container');
    if (!pipelineContainer) return;

    const filtered = this.getFilteredLeads();

    pipelineContainer.innerHTML = `
      <div class="pipeline-track">
        ${this.pipelineStages.map(stage => {
          const count = filtered.filter(l => (l.status || 'New') === stage).length;
          return `
            <div class="pipeline-step">
              <div class="pipeline-step-name">${stage}</div>
              <div class="pipeline-step-count">${count} Deals</div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="card">
        <h4 style="margin-bottom: 14px;">Pipeline Conversion Velocity</h4>
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
          Average time from Discovery to Qualified lead is currently <strong>18 hours</strong> via AI conversational automation.
        </p>
      </div>
    `;
  }

  handleKanbanDragStart(e, leadId) {
    e.dataTransfer.setData('text/plain', leadId);
  }

  handleKanbanDrop(e, newStatus) {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain');
    if (leadId) {
      this.updateLeadStatus(leadId, newStatus);
    }
  }

  updateLeadStatus(leadId, newStatus) {
    const leads = window.appState.get('leads') || [];
    const lead = leads.find(l => l.id === leadId);
    if (lead) {
      lead.status = newStatus;
      window.appState.saveState();
      window.appState.addAuditLog(
        'Lead Status Changed',
        `${lead.contactName} (${lead.companyName})`,
        `Stage moved to ${newStatus}.`,
        'Success'
      );
      this.render();
    }
  }

  openLeadDrawer(leadId) {
    const lead = (window.appState.get('leads') || []).find(l => l.id === leadId);
    if (!lead) return;

    this.activeDrawerLead = lead;

    const drawer = document.getElementById('lead-detail-drawer');
    const backdrop = document.getElementById('lead-drawer-backdrop');

    // Populate drawer UI
    const setDrawer = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setDrawer('drawer-contact-name', lead.contactName);
    setDrawer('drawer-job-title', lead.jobTitle || 'Primary Decision Maker');
    setDrawer('drawer-company', lead.companyName);
    setDrawer('drawer-phone', lead.phone);
    setDrawer('drawer-email', lead.email || 'N/A');
    setDrawer('drawer-location', lead.location);
    setDrawer('drawer-industry', lead.industry);
    setDrawer('drawer-website', lead.website || 'N/A');
    setDrawer('drawer-score-badge', `Score: ${lead.score}/100 (${lead.scoreCategory.toUpperCase()})`);
    setDrawer('drawer-ai-summary', lead.aiSummary || 'AI profile analyzed. Ready for automated outbound sequence.');

    // Status Select
    const statusSelect = document.getElementById('drawer-status-select');
    if (statusSelect) {
      statusSelect.value = lead.status || 'New';
      statusSelect.onchange = (e) => this.updateLeadStatus(lead.id, e.target.value);
    }

    // Render Timeline
    const timelineList = document.getElementById('drawer-timeline-list');
    if (timelineList) {
      timelineList.innerHTML = `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-header">
            <span class="timeline-title">Lead Created via ${this.escapeHtml(lead.source)}</span>
            <span class="timeline-time">${new Date(lead.createdDate).toLocaleDateString()}</span>
          </div>
          <div class="timeline-desc">Initial discovery and automated data normalization complete.</div>
        </div>
        ${lead.lastContacted ? `
          <div class="timeline-item">
            <div class="timeline-dot" style="background: var(--brand-primary);"></div>
            <div class="timeline-header">
              <span class="timeline-title">WhatsApp Outreach Dispatched</span>
              <span class="timeline-time">${new Date(lead.lastContacted).toLocaleTimeString()}</span>
            </div>
            <div class="timeline-desc">Personalized message delivered via campaign sequence.</div>
          </div>
        ` : ''}
      `;
    }

    // Render Notes
    const notesEl = document.getElementById('drawer-notes-display');
    if (notesEl) {
      notesEl.textContent = lead.notes || 'No custom notes added yet.';
    }

    if (drawer) drawer.classList.add('active');
    if (backdrop) backdrop.classList.add('active');
  }

  closeLeadDrawer() {
    const drawer = document.getElementById('lead-detail-drawer');
    const backdrop = document.getElementById('lead-drawer-backdrop');
    if (drawer) drawer.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');
    this.activeDrawerLead = null;
  }

  addDrawerNote() {
    const noteInput = document.getElementById('drawer-new-note-input');
    if (this.activeDrawerLead && noteInput && noteInput.value.trim()) {
      this.activeDrawerLead.notes = (this.activeDrawerLead.notes ? this.activeDrawerLead.notes + '\n\n' : '') +
        `[${new Date().toLocaleDateString()}] ${noteInput.value.trim()}`;
      window.appState.saveState();
      document.getElementById('drawer-notes-display').textContent = this.activeDrawerLead.notes;
      noteInput.value = '';
    }
  }

  openWhatsAppChat(leadId) {
    this.closeLeadDrawer();
    window.navigationComponent.switchView('inbox');
    window.inboxComponent.selectConversationByLeadId(leadId);
  }

  updateBulkActionBar() {
    const bar = document.getElementById('crm-bulk-actions-bar');
    const countEl = document.getElementById('selected-leads-count');
    if (bar) {
      bar.style.display = this.selectedLeadIds.size > 0 ? 'flex' : 'none';
    }
    if (countEl) {
      countEl.textContent = this.selectedLeadIds.size;
    }
  }

  handleBulkMessage() {
    const count = this.selectedLeadIds.size;
    if (count === 0) return;
    window.navigationComponent.switchView('campaigns');
    alert(`Starting campaign wizard with ${count} pre-selected CRM leads!`);
  }

  deleteLead(leadId) {
    const leads = window.appState.get('leads') || [];
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    if (confirm(`Are you sure you want to delete contact "${lead.contactName}" (${lead.phone})?`)) {
      const normalizeDigits = (p) => String(p || '').replace(/[^0-9]/g, '').slice(-10);
      const leadDigits = normalizeDigits(lead.phone);

      const updatedLeads = leads.filter(l => l.id !== leadId);
      window.appState.set('leads', updatedLeads);

      // Clean up linked conversation
      let convs = window.appState.get('conversations') || [];
      convs = convs.filter(c => c.leadId !== leadId && (!leadDigits || normalizeDigits(c.phone) !== leadDigits));
      window.appState.set('conversations', convs);

      window.appState.addAuditLog('Lead Deleted', lead.contactName, `Deleted contact ${lead.phone}.`, 'Success');
      this.closeLeadDrawer();
      this.render();
    }
  }

  cleanupDuplicateAccounts() {
    const leads = window.appState.get('leads') || [];
    const normalizeDigits = (p) => {
      if (!p) return '';
      const digits = String(p).replace(/[^0-9]/g, '');
      return digits.length >= 10 ? digits.slice(-10) : digits;
    };

    const seenPhones = new Set();
    const uniqueLeads = [];
    let dupCount = 0;

    for (const lead of leads) {
      const pKey = normalizeDigits(lead.phone);
      if (pKey) {
        if (seenPhones.has(pKey)) {
          dupCount++;
          continue;
        }
        seenPhones.add(pKey);
      }
      uniqueLeads.push(lead);
    }

    if (dupCount > 0) {
      window.appState.set('leads', uniqueLeads);

      // Also clean up duplicate conversations
      const convs = window.appState.get('conversations') || [];
      const seenConvPhones = new Set();
      const uniqueConvs = [];
      for (const c of convs) {
        const cKey = normalizeDigits(c.phone) || c.leadId || c.id;
        if (cKey) {
          if (seenConvPhones.has(cKey)) continue;
          seenConvPhones.add(cKey);
        }
        uniqueConvs.push(c);
      }
      window.appState.set('conversations', uniqueConvs);

      window.appState.addAuditLog('Duplicate Leads Cleaned', `${dupCount} duplicates removed`, 'Cleaned up duplicate accounts.', 'Success');
      alert(`Cleaned up ${dupCount} duplicate lead accounts & conversations!`);
      this.render();
    } else {
      alert('No duplicate accounts found. All phone numbers are unique.');
    }
  }

  handleBulkDelete() {
    const count = this.selectedLeadIds.size;
    if (confirm(`Are you sure you want to delete ${count} selected leads?`)) {
      const normalizeDigits = (p) => String(p || '').replace(/[^0-9]/g, '').slice(-10);
      let leads = window.appState.get('leads') || [];
      const selectedPhones = new Set();

      for (const l of leads) {
        if (this.selectedLeadIds.has(l.id)) {
          const d = normalizeDigits(l.phone);
          if (d) selectedPhones.add(d);
        }
      }

      leads = leads.filter(l => !this.selectedLeadIds.has(l.id));
      window.appState.set('leads', leads);

      // Clean up linked conversations
      let convs = window.appState.get('conversations') || [];
      convs = convs.filter(c => !this.selectedLeadIds.has(c.leadId) && (!normalizeDigits(c.phone) || !selectedPhones.has(normalizeDigits(c.phone))));
      window.appState.set('conversations', convs);

      window.appState.addAuditLog('Bulk Leads Deleted', `${count} leads removed`, 'Deleted selected contacts.', 'Success');
      this.selectedLeadIds.clear();
      this.updateBulkActionBar();
      this.render();
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
}

window.crmComponent = new CRMComponent();
