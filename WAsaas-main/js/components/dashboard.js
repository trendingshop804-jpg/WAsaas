/* ==========================================================================
   NexusLead AI - Executive Dashboard Component
   ========================================================================== */

class DashboardComponent {
  init() {
    this.currentTimeRange = '24h'; // Default: Last 24 Hours
    this.renderMetrics();
    this.renderFunnel();
    this.renderActivityStream();
    this.bindEvents();

    window.appState.on('*', () => {
      this.renderMetrics();
      this.renderFunnel();
      this.renderActivityStream();
    });
  }

  bindEvents() {
    // Quick action buttons
    document.querySelectorAll('[data-action="quick-discover"]').forEach(btn => {
      btn.addEventListener('click', () => window.navigationComponent.switchView('discovery'));
    });
    document.querySelectorAll('[data-action="quick-campaign"]').forEach(btn => {
      btn.addEventListener('click', () => window.navigationComponent.switchView('campaigns'));
    });
    document.querySelectorAll('[data-action="quick-inbox"]').forEach(btn => {
      btn.addEventListener('click', () => window.navigationComponent.switchView('inbox'));
    });
    document.querySelectorAll('[data-action="quick-workflow"]').forEach(btn => {
      btn.addEventListener('click', () => window.navigationComponent.switchView('workflows'));
    });

    // Time filter buttons
    document.querySelectorAll('.time-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.time-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTimeRange = btn.dataset.range;
        this.renderMetrics();
        this.renderFunnel();
        this.renderActivityStream();
      });
    });
  }

  /**
   * Get the date threshold based on current time range filter.
   * Returns a Date object or null for "all time".
   */
  getTimeThreshold() {
    const now = new Date();
    switch (this.currentTimeRange) {
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case 'all':
      default:
        return null;
    }
  }

  /**
   * Check if a date is within the current time range.
   */
  isWithinTimeRange(dateStr) {
    const threshold = this.getTimeThreshold();
    if (!threshold) return true; // All time
    if (!dateStr) return true; // Include items without dates
    return new Date(dateStr) >= threshold;
  }

  renderMetrics() {
    const leads = (window.appState.get('leads') || []).filter(l => this.isWithinTimeRange(l.createdAt || l.created_at));
    const campaigns = (window.appState.get('campaigns') || []).filter(c => this.isWithinTimeRange(c.createdAt || c.created_at));
    const org = window.appState.getCurrentOrg();

    const totalLeads = leads.length;
    const contactedLeads = leads.filter(l => l.status !== 'New').length;
    const repliedLeads = leads.filter(l => ['Replied', 'Qualified', 'Proposal', 'Negotiation', 'Won'].includes(l.status)).length;
    const qualifiedLeads = leads.filter(l => ['Qualified', 'Proposal', 'Negotiation', 'Won'].includes(l.status)).length;
    const wonLeads = leads.filter(l => l.status === 'Won').length;

    let totalSent = 0;
    let totalDelivered = 0;
    campaigns.forEach(c => {
      totalSent += (c.sentCount || 0);
      totalDelivered += (c.deliveredCount || 0);
    });

    const responseRate = contactedLeads > 0 ? ((repliedLeads / contactedLeads) * 100).toFixed(1) : '0.0';
    const conversionRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0.0';

    // Update KPI UI elements
    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl('kpi-total-leads', totalLeads);
    setEl('kpi-contacted', contactedLeads);
    setEl('kpi-replies', repliedLeads);
    setEl('kpi-qualified', qualifiedLeads);
    setEl('kpi-won', wonLeads);
    setEl('kpi-messages-sent', totalSent);
    setEl('kpi-response-rate', responseRate + '%');
    setEl('kpi-conversion-rate', conversionRate + '%');
    setEl('kpi-credits-used', `${org.creditsUsed} / ${org.creditsLimit}`);

    // Update Follow-up priority widget on dashboard
    if (window.followUpsComponent) {
      const cats = window.followUpsComponent.categorizeLeads();
      const heading = document.getElementById('dash-followup-heading');
      const subtext = document.getElementById('dash-followup-subtext');
      if (heading) {
        heading.textContent = `Follow-Up Priorities: ${cats.today.length} Due Today • ${cats.overdue.length} Overdue`;
      }
      if (subtext) {
        subtext.textContent = cats.overdue.length > 0
          ? `⚠️ Attention: You have ${cats.overdue.length} overdue follow-up tasks requiring immediate contact!`
          : `You have ${cats.today.length} follow-ups scheduled for today. Click to launch your daily outreach queue.`;
      }
    }
  }

  renderFunnel() {
    const leads = (window.appState.get('leads') || []).filter(l => this.isWithinTimeRange(l.createdAt || l.created_at));
    const total = leads.length || 1;
    const contacted = leads.filter(l => l.status !== 'New').length;
    const replied = leads.filter(l => ['Replied', 'Qualified', 'Proposal', 'Negotiation', 'Won'].includes(l.status)).length;
    const qualified = leads.filter(l => ['Qualified', 'Proposal', 'Negotiation', 'Won'].includes(l.status)).length;
    const won = leads.filter(l => l.status === 'Won').length;

    const setBar = (id, count) => {
      const bar = document.getElementById(id);
      if (bar) {
        const pct = Math.max(10, Math.min(100, Math.round((count / total) * 100)));
        bar.style.height = `${pct}%`;
        bar.setAttribute('data-val', count);
      }
    };

    setBar('funnel-bar-total', total);
    setBar('funnel-bar-contacted', contacted);
    setBar('funnel-bar-replied', replied);
    setBar('funnel-bar-qualified', qualified);
    setBar('funnel-bar-won', won);
  }

  renderActivityStream() {
    const list = document.getElementById('dashboard-activity-list');
    if (!list) return;

    const logs = (window.appState.get('auditLogs') || [])
      .filter(log => this.isWithinTimeRange(log.timestamp))
      .slice(0, 5);
    list.innerHTML = logs.map(log => `
      <div class="activity-item">
        <div class="activity-icon" style="background: rgba(37, 211, 102, 0.15); color: #25d366;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <div class="activity-content">
          <div class="activity-title">${this.escapeHtml(log.action)} - <span style="font-weight: 400; color: var(--text-secondary);">${this.escapeHtml(log.entity)}</span></div>
          <div class="activity-time">${new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${this.escapeHtml(log.actor)}</div>
        </div>
      </div>
    `).join('');
  }

  renderReferenceBottom() {
    const leadsBody = document.getElementById('dashboard-recent-leads');
    const tasksList = document.getElementById('dashboard-todays-tasks');
    const leads = (window.appState.get('leads') || []).slice(0, 5);

    if (leadsBody) {
      leadsBody.innerHTML = leads.map((lead, index) => {
        const name = this.escapeHtml(lead.contactName || lead.name || lead.companyName || 'New lead');
        const phone = this.escapeHtml(lead.phone || lead.phoneNumber || '—');
        const source = this.escapeHtml(lead.source || 'Website');
        const status = this.escapeHtml(lead.status || 'New');
        const initials = name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
        return `<tr><td><span class="reference-lead-avatar avatar-${index % 5}">${initials}</span><strong>${name}</strong></td><td>${phone}</td><td>${source}</td><td><span class="reference-status status-${status.toLowerCase().replace(/[^a-z]/g, '')}">${status}</span></td></tr>`;
      }).join('') || '<tr><td colspan="4" class="reference-empty">No leads yet — add your first lead to get started.</td></tr>';
    }

    if (tasksList) {
      const labels = leads.slice(0, 4).map((lead, index) => ({
        text: index === 0 ? `Follow up with ${lead.contactName || lead.name || 'new lead'}` : index === 1 ? `Send WhatsApp message to ${lead.contactName || lead.name || 'lead'}` : `Review ${lead.contactName || lead.name || 'lead'} profile`,
        time: ['10:00 AM', '11:30 AM', '02:00 PM', '04:00 PM'][index],
        done: index === 0,
      }));
      tasksList.innerHTML = labels.map(task => `<div class="reference-task"><span class="reference-check ${task.done ? 'done' : ''}">${task.done ? '✓' : ''}</span><div><strong>${this.escapeHtml(task.text)}</strong><small>${task.time}</small></div></div>`).join('') || '<div class="reference-empty">No tasks scheduled for today.</div>';
    }
  }
  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
}

window.dashboardComponent = new DashboardComponent();
