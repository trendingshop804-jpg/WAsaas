/* ==========================================================================
   NexusLead AI - WhatsApp Campaign Management Component
   ========================================================================== */

class CampaignsComponent {
  init() {
    this.bindEvents();
    this.render();

    window.appState.on('campaigns', () => this.render());
  }

  bindEvents() {
    // New Campaign button
    const newCampBtn = document.getElementById('new-campaign-btn');
    if (newCampBtn) {
      newCampBtn.addEventListener('click', () => this.openCampaignModal());
    }

    // Campaign Wizard Form Submit
    const campForm = document.getElementById('new-campaign-form');
    if (campForm) {
      campForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleCreateCampaign();
      });
    }

    // Template selection change in wizard
    const tmplSelect = document.getElementById('camp-template-select');
    if (tmplSelect) {
      tmplSelect.addEventListener('change', () => this.updateTemplatePreview());
    }
  }

  render() {
    const listContainer = document.getElementById('campaigns-list-grid');
    if (!listContainer) return;

    const campaigns = window.appState.get('campaigns') || [];

    listContainer.innerHTML = campaigns.map(camp => {
      const convRate = camp.totalLeads > 0 ? ((camp.wonCount / camp.totalLeads) * 100).toFixed(1) : '0.0';
      const progressPct = camp.totalLeads > 0 ? Math.min(100, Math.round((camp.sentCount / camp.totalLeads) * 100)) : 0;

      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">${this.escapeHtml(camp.name)}</div>
              <div class="card-subtitle">Template: <code>${this.escapeHtml(camp.templateName)}</code></div>
            </div>
            <span class="badge ${camp.status === 'Running' ? 'badge-success' : 'badge-purple'}">
              ${camp.status === 'Running' ? '● Running' : '🕒 Scheduled'}
            </span>
          </div>

          <div style="margin-bottom: 14px;">
            <div class="flex items-center justify-between" style="font-size: 12px; margin-bottom: 6px;">
              <span style="color: var(--text-secondary);">Campaign Dispatch Progress</span>
              <span style="font-weight: 700; color: var(--brand-whatsapp);">${camp.sentCount} / ${camp.totalLeads} Leads (${progressPct}%)</span>
            </div>
            <div style="width: 100%; height: 6px; background: var(--bg-tertiary); border-radius: var(--radius-full); overflow: hidden;">
              <div style="width: ${progressPct}%; height: 100%; background: linear-gradient(90deg, #25d366, #128c7e); border-radius: var(--radius-full);"></div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-md); text-align: center; margin-bottom: 16px;">
            <div>
              <div style="font-size: 10.5px; color: var(--text-muted);">Delivered</div>
              <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">${camp.deliveredCount}</div>
            </div>
            <div>
              <div style="font-size: 10.5px; color: var(--text-muted);">Replies</div>
              <div style="font-size: 16px; font-weight: 700; color: var(--brand-whatsapp);">${camp.replyCount}</div>
            </div>
            <div>
              <div style="font-size: 10.5px; color: var(--text-muted);">Qualified</div>
              <div style="font-size: 16px; font-weight: 700; color: #a78bfa;">${camp.qualifiedCount}</div>
            </div>
            <div>
              <div style="font-size: 10.5px; color: var(--text-muted);">Won Deals</div>
              <div style="font-size: 16px; font-weight: 700; color: var(--status-success);">${camp.wonCount}</div>
            </div>
          </div>

          <div class="flex items-center justify-between" style="border-top: 1px solid var(--border-subtle); padding-top: 12px;">
            <div style="font-size: 11.5px; color: var(--text-muted);">
              Limit: <strong>${camp.dailyLimit} msgs/day</strong> · Window: <strong>${camp.sendingWindow}</strong>
            </div>
            <div class="flex items-center gap-2">
              <button class="btn btn-secondary btn-sm" onclick="window.campaignsComponent.toggleCampaignPause('${camp.id}')">
                ${camp.status === 'Running' ? 'Pause' : 'Resume'}
              </button>
              <button class="btn btn-primary btn-sm" onclick="window.navigationComponent.switchView('analytics')">
                View ROI
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  openCampaignModal() {
    const modal = document.getElementById('new-campaign-modal');
    const select = document.getElementById('camp-template-select');
    const leadCountEl = document.getElementById('camp-available-leads-count');
    const leads = window.appState.get('leads') || [];
    const templates = window.appState.get('templates') || [];

    if (leadCountEl) leadCountEl.textContent = leads.filter(l => !l.optedOut).length;

    if (select) {
      select.innerHTML = templates.map(t => `<option value="${t.id}">${t.name} (${t.language})</option>`).join('');
      this.updateTemplatePreview();
    }

    if (modal) modal.classList.add('active');
  }

  updateTemplatePreview() {
    const select = document.getElementById('camp-template-select');
    const previewEl = document.getElementById('camp-template-preview-box');
    const templates = window.appState.get('templates') || [];
    const t = templates.find(item => item.id === select?.value) || templates[0];

    if (t && previewEl) {
      previewEl.innerHTML = `
        <div style="font-weight: 600; color: var(--brand-whatsapp); margin-bottom: 6px;">WhatsApp Message Preview (with variable interpolation):</div>
        <div style="padding: 10px; background: #075e54; color: white; border-radius: 8px; font-size: 13px;">
          ${this.escapeHtml(t.body.replace('{{first_name}}', 'Karthik').replace('{{company_name}}', 'Nexus Dental Clinic').replace('{{location}}', 'Kochi'))}
        </div>
      `;
    }
  }

  handleCreateCampaign() {
    const name = document.getElementById('camp-name-input')?.value || 'New WhatsApp Outreach';
    const templateId = document.getElementById('camp-template-select')?.value;
    const dailyLimit = parseInt(document.getElementById('camp-daily-limit')?.value || '100', 10);
    const windowHours = document.getElementById('camp-window-hours')?.value || '10:00 AM - 06:00 PM IST';
    const templates = window.appState.get('templates') || [];
    const leads = window.appState.get('leads') || [];
    const t = templates.find(item => item.id === templateId) || templates[0];

    const eligibleLeads = leads.filter(l => !l.optedOut);

    const newCamp = {
      id: 'camp_' + Date.now(),
      name,
      status: 'Running',
      connectionId: 'conn_001',
      connectionNumber: window.appState.getCurrentOrg().whatsappNumber || '+91 98401 23456',
      templateId: t.id,
      templateName: t.name,
      totalLeads: eligibleLeads.length,
      sentCount: 0,
      deliveredCount: 0,
      replyCount: 0,
      qualifiedCount: 0,
      wonCount: 0,
      dailyLimit,
      sendingWindow: windowHours,
      timezone: 'Asia/Kolkata',
      createdAt: new Date().toISOString(),
      conversionRate: 0,
      aiAgentEnabled: true
    };

    // Assign leads to campaign
    eligibleLeads.forEach(l => l.campaignId = newCamp.id);

    const campaigns = window.appState.get('campaigns') || [];
    window.appState.set('campaigns', [newCamp, ...campaigns]);

    window.appState.addAuditLog(
      'Campaign Launched',
      newCamp.name,
      `Enrolled ${eligibleLeads.length} leads with daily limit of ${dailyLimit} msgs.`,
      'Running'
    );

    const modal = document.getElementById('new-campaign-modal');
    if (modal) modal.classList.remove('active');

    alert(`Campaign "${name}" successfully created and queued for automated dispatch!`);
    this.render();
  }

  toggleCampaignPause(campId) {
    const campaigns = window.appState.get('campaigns') || [];
    const c = campaigns.find(item => item.id === campId);
    if (c) {
      c.status = c.status === 'Running' ? 'Paused' : 'Running';
      window.appState.saveState();
      window.appState.addAuditLog(
        'Campaign Status Changed',
        c.name,
        `Status switched to ${c.status}.`,
        c.status
      );
      this.render();
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
}

window.campaignsComponent = new CampaignsComponent();
