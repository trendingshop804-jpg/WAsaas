/* ==========================================================================
   NexusLead AI - Organization Settings & Audit Logs Component
   Uses event delegation so it survives the DOM rebuild by
   settings-integrations.js (which wraps #view-settings in tab panels).
   ========================================================================== */

class SettingsComponent {
  init() {
    this._bindDelegated();
    this.render();

    window.appState.on('auditLogs', () => this.renderAuditLogs());
    window.appState.on('orgChanged', () => this.render());
  }

  _bindDelegated() {
    const root = document.getElementById('view-settings');
    if (!root) return;

    root.addEventListener('submit', (e) => {
      const form = e.target.closest('#settings-business-form');
      if (form) {
        e.preventDefault();
        this.saveBusinessSettings();
      }
    });

    root.addEventListener('click', (e) => {
      if (e.target.closest('#export-backup-btn')) {
        window.storageService?.exportBackup?.();
      }
      if (e.target.closest('#reset-demo-data-btn')) {
        window.storageService?.resetToDemo?.();
      }
    });
  }

  render() {
    const org = window.appState.getCurrentOrg();

    const setInput = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.value = val;
    };

    setInput('settings-org-name', org.name);
    setInput('settings-org-industry', org.industry);
    setInput('settings-org-website', org.website);
    setInput('settings-org-location', org.location);
    setInput('settings-org-timezone', org.timezone);

    this.renderAuditLogs();
  }

  renderAuditLogs() {
    const container = document.getElementById('settings-audit-tab-panel');
    const tbody = container?.querySelector('#settings-audit-logs-tbody');
    if (!tbody) return;

    const logs = window.appState.get('auditLogs') || [];

    tbody.innerHTML = logs.map(log => `
      <tr>
        <td style="font-size: 11.5px; font-family: 'Fira Code', monospace; color: var(--text-muted);">
          ${new Date(log.timestamp).toLocaleString()}
        </td>
        <td><strong>${this.escapeHtml(log.action)}</strong></td>
        <td>${this.escapeHtml(log.entity)}</td>
        <td>${this.escapeHtml(log.actor)}</td>
        <td>
          <span class="badge ${log.status === 'Success' ? 'badge-success' : log.status === 'Protected' ? 'badge-warm' : 'badge-danger'}">
            ${this.escapeHtml(log.status)}
          </span>
        </td>
        <td style="font-size: 12px; color: var(--text-secondary); max-width: 250px;" class="truncate">
          ${this.escapeHtml(log.details)}
        </td>
      </tr>
    `).join('');
  }

  saveBusinessSettings() {
    const org = window.appState.getCurrentOrg();

    org.name = document.getElementById('settings-org-name')?.value || org.name;
    org.industry = document.getElementById('settings-org-industry')?.value || org.industry;
    org.website = document.getElementById('settings-org-website')?.value || org.website;
    org.location = document.getElementById('settings-org-location')?.value || org.location;
    org.timezone = document.getElementById('settings-org-timezone')?.value || org.timezone;

    window.appState.saveState();
    window.appState.addAuditLog('Business Profile Updated', org.name, 'Updated general business details.', 'Success');
    window.navigationComponent.renderOrgInfo();
    alert('Business profile updated successfully!');
  }

  exportBackup() { window.storageService?.exportBackup?.(); }
  resetDemo()    { window.storageService?.resetToDemo?.(); }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
}

window.settingsComponent = new SettingsComponent();
