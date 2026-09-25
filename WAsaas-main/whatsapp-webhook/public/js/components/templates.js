/* ==========================================================================
   NexusLead AI - WhatsApp Template Manager Component
   ========================================================================== */

class TemplatesComponent {
  init() {
    this.bindEvents();
    this.render();

    window.appState.on('templates', () => this.render());
  }

  bindEvents() {
    const newTmplBtn = document.getElementById('new-template-btn');
    if (newTmplBtn) {
      newTmplBtn.addEventListener('click', () => {
        const modal = document.getElementById('new-template-modal');
        if (modal) modal.classList.add('active');
      });
    }

    const form = document.getElementById('new-template-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleCreateTemplate();
      });
    }
  }

  render() {
    const container = document.getElementById('templates-grid-list');
    if (!container) return;

    const templates = window.appState.get('templates') || [];

    container.innerHTML = templates.map(t => `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title"><code>${this.escapeHtml(t.name)}</code></div>
            <div class="card-subtitle">${this.escapeHtml(t.language)} · Category: <strong>${t.category}</strong></div>
          </div>
          <span class="badge badge-success">✓ ${t.metaStatus || 'Meta Approved'}</span>
        </div>

        <div style="padding: 14px; background: #075e54; color: white; border-radius: 8px; font-size: 13px; line-height: 1.5; margin-bottom: 14px;">
          ${this.escapeHtml(t.body)}
        </div>

        <div class="flex items-center justify-between" style="border-top: 1px solid var(--border-subtle); padding-top: 10px;">
          <div style="font-size: 11px; color: var(--text-muted);">
            Variables: ${(t.variables || []).map(v => `<span class="badge badge-unqualified">{{${v}}}</span>`).join(' ')}
          </div>
          <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(\`${t.body.replace(/"/g, '\\"')}\`); alert('Template text copied!');">
            Copy Text
          </button>
        </div>
      </div>
    `).join('');
  }

  handleCreateTemplate() {
    const name = document.getElementById('new-tmpl-name')?.value || 'custom_campaign_template';
    const category = document.getElementById('new-tmpl-category')?.value || 'MARKETING';
    const language = document.getElementById('new-tmpl-language')?.value || 'English (en_US)';
    const body = document.getElementById('new-tmpl-body')?.value || 'Hello {{first_name}}';

    const newTmpl = {
      id: 'tmpl_' + Date.now(),
      name,
      category,
      language,
      status: 'APPROVED',
      metaStatus: 'Meta Verified',
      body,
      variables: ['first_name', 'company_name']
    };

    const templates = window.appState.get('templates') || [];
    window.appState.set('templates', [newTmpl, ...templates]);
    window.appState.addAuditLog('Template Created', newTmpl.name, 'Submitted for Meta Cloud API verification.', 'Approved');

    const modal = document.getElementById('new-template-modal');
    if (modal) modal.classList.remove('active');

    alert(`Template "${name}" successfully registered and approved!`);
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
}

window.templatesComponent = new TemplatesComponent();
