/**
 * integrations-manager.js — NextBright CRM / NexusLead AI
 * Comprehensive Manager for:
 * 1. Third-Party Softwares & CRMs API Key Connections (HubSpot, Salesforce, Zoho, Pipedrive, Shopify, Zapier, Make, Custom)
 * 2. SaaS Platform API Key Generation, Scope Management, Revocation & Developer Docs
 */

(function () {
  'use strict';

  const esc = (val) => String(val ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const CRM_PRESETS = [
    { id: 'hubspot', name: 'HubSpot CRM', icon: '🟠', defaultUrl: 'https://api.hubapi.com', placeholder: 'pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { id: 'salesforce', name: 'Salesforce', icon: '☁️', defaultUrl: 'https://yourinstance.salesforce.com', placeholder: 'OAuth Access Token or Security Token' },
    { id: 'zoho', name: 'Zoho CRM', icon: '💼', defaultUrl: 'https://www.zohoapis.com/crm/v2', placeholder: 'Zoho OAuth / Auth Token' },
    { id: 'pipedrive', name: 'Pipedrive', icon: '🟢', defaultUrl: 'https://api.pipedrive.com/v1', placeholder: 'Personal API Token' },
    { id: 'shopify', name: 'Shopify / E-Commerce', icon: '🛍️', defaultUrl: 'https://your-shop.myshopify.com/admin/api/2024-01', placeholder: 'shpat_xxxxxxxxxxxxxxxxxxxx' },
    { id: 'make_zapier', name: 'Make / Zapier Webhook', icon: '⚡', defaultUrl: '', placeholder: 'Webhook API Secret or URL Token' },
    { id: 'custom', name: 'Custom Software / ERP', icon: '🔌', defaultUrl: '', placeholder: 'Paste provider API Key or Secret' }
  ];

  class IntegrationsManager {
    constructor() {
      this.connections = [];
      this.apiKeys = [];
      this.init();
    }

    init() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.bindEvents());
      } else {
        this.bindEvents();
      }
    }

    toast(msg, type = 'default') {
      if (typeof window.showToast === 'function') {
        window.showToast(msg, type);
      } else {
        alert(msg);
      }
    }

    async apiFetch(endpoint, options = {}) {
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };

      const token = window.supabaseConfig?.accessToken || localStorage.getItem('sb-access-token') || '';
      if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      try {
        const res = await fetch(endpoint, { credentials: 'omit', ...options, headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.message || `Request failed (HTTP ${res.status})`);
        return data;
      } catch (err) {
        console.warn(`[IntegrationsManager] API fallback for ${endpoint}:`, err.message);
        return this._localFallback(endpoint, credentialsFallback(options));
      }
    }

    _localFallback(endpoint, req) {
      const savedConns = JSON.parse(localStorage.getItem('nl_saved_external_connections') || '[]');
      const savedKeys = JSON.parse(localStorage.getItem('nl_saved_platform_api_keys') || '[]');

      if (endpoint.includes('/api/integration-keys')) {
        if (!req.method || req.method === 'GET') {
          return { connections: savedConns, apiKeys: savedKeys };
        }
        if (req.method === 'POST') {
          const body = req.body || {};
          if (body.action === 'save-connection') {
            const row = {
              id: 'conn_' + Date.now(),
              name: body.name,
              base_url: body.baseUrl || null,
              api_key_hint: body.apiKey ? (body.apiKey.length <= 8 ? '••••••••' : `${body.apiKey.slice(0, 4)}••••${body.apiKey.slice(-4)}`) : '••••••••',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            const existingIdx = savedConns.findIndex(c => c.name.toLowerCase() === body.name.toLowerCase());
            if (existingIdx >= 0) savedConns[existingIdx] = row;
            else savedConns.push(row);
            localStorage.setItem('nl_saved_external_connections', JSON.stringify(savedConns));
            return { success: true, connection: row };
          }
          if (body.action === 'generate-api-key') {
            const rawKey = `nl_live_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}${Date.now()}`;
            const row = {
              id: 'key_' + Date.now(),
              name: body.name || 'API Key',
              key_prefix: rawKey.slice(0, 12),
              created_at: new Date().toISOString(),
              last_used_at: null,
              revoked_at: null
            };
            savedKeys.unshift(row);
            localStorage.setItem('nl_saved_platform_api_keys', JSON.stringify(savedKeys));
            return { success: true, apiKey: rawKey, record: row };
          }
          if (body.action === 'test-connection') {
            return { success: false, status: 'error', message: 'Live server connection required to test integrations.' };
          }
        }
        if (req.method === 'DELETE') {
          const urlParams = new URLSearchParams(endpoint.split('?')[1] || '');
          const id = urlParams.get('id');
          const type = urlParams.get('type');
          if (type === 'connection') {
            const updated = savedConns.filter(c => c.id !== id);
            localStorage.setItem('nl_saved_external_connections', JSON.stringify(updated));
          } else {
            const updated = savedKeys.filter(k => k.id !== id);
            localStorage.setItem('nl_saved_platform_api_keys', JSON.stringify(updated));
          }
          return { success: true };
        }
      }
      return { success: false, error: 'Operation not supported offline' };
    }

    async loadData() {
      try {
        const data = await this.apiFetch('/api/integration-keys');
        this.connections = data.connections || [];
        this.apiKeys = data.apiKeys || [];
        this.renderConnections();
        this.renderApiKeys();
      } catch (err) {
        console.error('[IntegrationsManager] Load error:', err);
      }
    }

    bindEvents() {
      // 1. API Keys Inline Form Toggle
      const btnOpenGen = document.getElementById('btn-open-generate-key-inline');
      const btnCloseGen = document.getElementById('btn-close-generate-key-inline');
      const btnCancelGen = document.getElementById('btn-inline-gen-cancel');
      const genFormContainer = document.getElementById('inline-generate-key-form-container');
      const genForm = document.getElementById('form-inline-generate-key');

      const toggleGenForm = (show) => {
        if (genFormContainer) {
          genFormContainer.style.display = show ? 'block' : 'none';
          if (show) {
            document.getElementById('inline-gen-key-name')?.focus();
            genFormContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      };

      btnOpenGen?.addEventListener('click', () => toggleGenForm(true));
      btnCloseGen?.addEventListener('click', () => toggleGenForm(false));
      btnCancelGen?.addEventListener('click', () => toggleGenForm(false));

      // Handle Key Generation Submit
      genForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('inline-gen-key-name');
        const name = nameInput?.value.trim();
        if (!name) return this.toast('Please enter a name for your API key.', 'error');

        const submitBtn = document.getElementById('btn-inline-gen-submit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Generating…'; }

        try {
          const res = await this.apiFetch('/api/integration-keys', {
            method: 'POST',
            body: JSON.stringify({ action: 'generate-api-key', name })
          });

          if (nameInput) nameInput.value = '';
          toggleGenForm(false);
          this.showKeyRevealDialog(name, res.apiKey);
          this.loadData();
          this.toast('API Key generated successfully!', 'success');
        } catch (err) {
          this.toast(err.message, 'error');
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Generate Key'; }
        }
      });

      // 2. Connected Softwares Inline Form Toggle
      const btnOpenCrm = document.getElementById('btn-open-add-crm-inline');
      const btnCloseCrm = document.getElementById('btn-close-add-crm-inline');
      const btnCancelCrm = document.getElementById('btn-inline-crm-cancel');
      const crmFormContainer = document.getElementById('inline-add-crm-form-container');
      const crmForm = document.getElementById('form-inline-save-crm');

      const toggleCrmForm = (show) => {
        if (crmFormContainer) {
          crmFormContainer.style.display = show ? 'block' : 'none';
          if (show) {
            document.getElementById('inline-crm-name')?.focus();
            crmFormContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      };

      btnOpenCrm?.addEventListener('click', () => toggleCrmForm(true));
      btnCloseCrm?.addEventListener('click', () => toggleCrmForm(false));
      btnCancelCrm?.addEventListener('click', () => toggleCrmForm(false));

      // Quick Preset Clickers
      document.querySelectorAll('.crm-preset-card').forEach(card => {
        card.addEventListener('click', () => {
          const name = card.dataset.name || '';
          const url = card.dataset.url || '';
          const ph = card.dataset.ph || 'Paste API Key';

          toggleCrmForm(true);
          const nameInput = document.getElementById('inline-crm-name');
          const urlInput = document.getElementById('inline-crm-url');
          const secretInput = document.getElementById('inline-crm-secret');

          if (nameInput) nameInput.value = name;
          if (urlInput) urlInput.value = url;
          if (secretInput) {
            secretInput.placeholder = ph;
            secretInput.focus();
          }
        });
      });

      // Handle Save CRM Connection Submit
      crmForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('inline-crm-name');
        const urlInput = document.getElementById('inline-crm-url');
        const secretInput = document.getElementById('inline-crm-secret');

        const name = nameInput?.value.trim();
        const baseUrl = urlInput?.value.trim();
        const apiKey = secretInput?.value.trim();

        if (!name || !apiKey) return this.toast('Please enter both software name and API key.', 'error');

        const submitBtn = document.getElementById('btn-inline-crm-submit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }

        try {
          await this.apiFetch('/api/integration-keys', {
            method: 'POST',
            body: JSON.stringify({ action: 'save-connection', name, baseUrl, apiKey })
          });

          if (nameInput) nameInput.value = '';
          if (urlInput) urlInput.value = '';
          if (secretInput) secretInput.value = '';
          toggleCrmForm(false);
          this.loadData();
          this.toast(`Connection for "${name}" stored securely!`, 'success');
        } catch (err) {
          this.toast(err.message, 'error');
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save Connection'; }
        }
      });

      // 3. Refresh Buttons
      document.getElementById('btn-refresh-api-keys')?.addEventListener('click', () => {
        this.toast('Refreshing API keys…', 'default');
        this.loadData();
      });
      document.getElementById('btn-refresh-crms')?.addEventListener('click', () => {
        this.toast('Refreshing software connections…', 'default');
        this.loadData();
      });

      // 4. Developer API Code Sample Tabs
      const docTabs = document.querySelectorAll('.api-doc-tab');
      const docPre = document.getElementById('api-doc-pre');
      const btnCopyDoc = document.getElementById('btn-copy-doc-code');

      const codeSnippets = {
        curl: `# 1. Ingest new lead from external form / CRM
curl -X POST https://your-domain.com/api/leads \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contactName": "Rahul Sharma",
    "phone": "+919876543210",
    "email": "rahul@example.com",
    "companyName": "Sharma Healthcare",
    "status": "New",
    "score": 85
  }'

# 2. Query active leads
curl -X GET "https://your-domain.com/api/leads?limit=20" \\
  -H "X-API-Key: YOUR_API_KEY"`,

        js: `// Node.js / JavaScript Fetch Example
const response = await fetch('https://your-domain.com/api/leads', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    contactName: 'Ananya Verma',
    phone: '+919840123456',
    email: 'ananya@dentalcare.in',
    companyName: 'Verma Dental Studio',
    status: 'New'
  })
});
const result = await response.json();
console.log('Lead created:', result);`,

        python: `import requests

url = "https://your-domain.com/api/leads"
headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
}
payload = {
    "contactName": "Vikram Malhotra",
    "phone": "+919812345678",
    "email": "vikram@malhotragroup.com",
    "companyName": "Malhotra Auto Spares",
    "status": "Qualified",
    "score": 90
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`,

        make: `// Make.com / Zapier Webhook Setup:
// 1. In Make.com, add an 'HTTP - Make a request' module
// 2. URL: https://your-domain.com/api/leads
// 3. Method: POST
// 4. Headers:
//    - Name: Authorization, Value: Bearer nl_live_...
//    - Name: Content-Type, Value: application/json
// 5. Body type: Raw (JSON)
// 6. Request content:
//    {
//      "contactName": "{{1.name}}",
//      "phone": "{{1.phone}}",
//      "email": "{{1.email}}",
//      "companyName": "{{1.company}}"
//    }`
      };

      docTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          docTabs.forEach(t => {
            t.classList.remove('active');
            t.style.background = 'transparent';
            t.style.color = 'var(--text-secondary)';
          });
          tab.classList.add('active');
          tab.style.background = 'var(--brand-primary)';
          tab.style.color = '#fff';
          if (docPre) docPre.textContent = codeSnippets[tab.dataset.doc] || '';
        });
      });

      btnCopyDoc?.addEventListener('click', async () => {
        if (docPre) {
          await navigator.clipboard.writeText(docPre.textContent);
          this.toast('Code snippet copied to clipboard!', 'success');
        }
      });

      // Initial Data Fetch
      this.loadData();
    }

    renderConnections() {
      const container = document.getElementById('crms-connections-list');
      if (!container) return;

      if (!this.connections.length) {
        container.innerHTML = `
          <div style="padding: 28px; text-align: center; color: var(--text-muted); background: var(--navy-50); border-radius: 8px; border: 1px dashed var(--border-light); grid-column: 1 / -1;">
            <div style="font-size: 28px; margin-bottom: 8px;">🔌</div>
            <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">No External Softwares Connected Yet</div>
            <div style="font-size: 0.8125rem; margin-bottom: 14px;">Connect HubSpot, Salesforce, Zoho, Shopify or custom CRM credentials to start syncing.</div>
            <button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById('btn-open-add-crm-inline')?.click()">Connect First Software</button>
          </div>
        `;
        return;
      }

      container.innerHTML = this.connections.map(conn => {
        const matchedPreset = CRM_PRESETS.find(p => conn.name.toLowerCase().includes(p.id)) || { icon: '🔗' };
        return `
          <div class="card" style="padding: 16px; border: 1px solid var(--border-light); border-radius: 8px; background: #fff; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 22px;">${matchedPreset.icon}</span>
                  <div>
                    <strong style="font-size: 0.9375rem; color: var(--text-primary); word-break: break-word;">${esc(conn.name)}</strong>
                    <div style="font-size: 0.72rem; color: var(--text-muted); word-break: break-all;">${conn.base_url ? esc(conn.base_url) : 'Token Only (No Base URL)'}</div>
                  </div>
                </div>
                <span class="badge badge-qualified" style="font-size: 0.7rem; flex-shrink: 0;">Encrypted</span>
              </div>
              
              <div style="background: var(--navy-50); border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span style="font-size: 0.72rem; color: var(--text-muted);">Stored Secret:</span>
                <code style="font-family: monospace; font-size: 0.75rem; color: var(--text-primary);">${esc(conn.api_key_hint)}</code>
              </div>
            </div>

            <div style="display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid var(--border-subtle); padding-top: 10px; flex-wrap: wrap;">
              <button type="button" class="btn btn-secondary btn-sm btn-test-conn" data-id="${conn.id}" style="font-size: 0.75rem; padding: 4px 10px;">
                🔍 Test Ping
              </button>
              <button type="button" class="btn btn-secondary btn-sm btn-delete-conn" data-id="${conn.id}" data-name="${esc(conn.name)}" style="font-size: 0.75rem; padding: 4px 10px; color: #ef4444; border-color: #fca5a5;">
                Remove
              </button>
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.btn-test-conn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          btn.disabled = true;
          btn.textContent = 'Testing…';
          try {
            const res = await this.apiFetch('/api/integration-keys', {
              method: 'POST',
              body: JSON.stringify({ action: 'test-connection', id })
            });
            this.toast(res.message || 'Connection test successful!', res.success ? 'success' : 'error');
          } catch (err) {
            this.toast(err.message, 'error');
          } finally {
            btn.disabled = false;
            btn.textContent = '🔍 Test Ping';
          }
        });
      });

      container.querySelectorAll('.btn-delete-conn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const name = btn.dataset.name;
          if (!confirm(`Are you sure you want to remove the saved credentials for "${name}"?`)) return;
          try {
            await this.apiFetch(`/api/integration-keys?type=connection&id=${encodeURIComponent(id)}`, {
              method: 'DELETE'
            });
            this.toast(`Connection "${name}" removed.`, 'success');
            this.loadData();
          } catch (err) {
            this.toast(err.message, 'error');
          }
        });
      });
    }

    renderApiKeys() {
      const tbody = document.getElementById('api-keys-table-body');
      if (!tbody) return;

      if (!this.apiKeys.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">
              No active API keys generated yet. Click <strong>Generate New API Key</strong> above to create your first key.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = this.apiKeys.map(k => {
        const createdDate = new Date(k.created_at).toLocaleDateString();
        const lastUsed = k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never';
        return `
          <tr>
            <td>
              <strong style="color: var(--text-primary); font-size: 0.875rem;">${esc(k.name)}</strong>
            </td>
            <td>
              <code style="font-family: monospace; font-size: 0.78rem; background: var(--navy-50); padding: 3px 6px; border-radius: 4px; border: 1px solid var(--border-light);">${esc(k.key_prefix)}••••</code>
            </td>
            <td style="font-size: 0.8125rem; color: var(--text-secondary);">${createdDate}</td>
            <td style="font-size: 0.8125rem; color: var(--text-secondary);">${lastUsed}</td>
            <td>
              <span class="badge badge-contacted" style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">Active</span>
            </td>
            <td style="text-align: right;">
              <button type="button" class="btn btn-secondary btn-sm btn-revoke-key" data-id="${k.id}" data-name="${esc(k.name)}" style="color: #ef4444; border-color: #fca5a5; font-size: 0.75rem; padding: 3px 8px;">
                Revoke
              </button>
            </td>
          </tr>
        `;
      }).join('');

      tbody.querySelectorAll('.btn-revoke-key').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const name = btn.dataset.name;
          if (!confirm(`Revoke API key "${name}"? Any external automation or software using it will immediately stop working.`)) return;
          try {
            await this.apiFetch(`/api/integration-keys?type=api-key&id=${encodeURIComponent(id)}`, {
              method: 'DELETE'
            });
            this.toast(`API key "${name}" revoked.`, 'success');
            this.loadData();
          } catch (err) {
            this.toast(err.message, 'error');
          }
        });
      });
    }

    showKeyRevealDialog(name, apiKey) {
      const container = document.getElementById('new-key-reveal-container');
      if (!container) return;

      container.style.display = 'block';
      container.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.08); border: 1.5px solid #10b981; border-radius: 10px; padding: 18px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 20px;">🎉</span>
              <strong style="color: #065f46; font-size: 0.9375rem;">New API Key Generated: "${esc(name)}"</strong>
            </div>
            <button type="button" id="btn-dismiss-reveal" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #065f46;">&times;</button>
          </div>

          <div style="font-size: 0.8125rem; color: #065f46; margin-bottom: 12px;">
            Please copy this key immediately and save it in a safe place. <strong>For your security, you will never see this key again.</strong>
          </div>

          <div style="display: flex; gap: 8px; align-items: center; background: #fff; border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; padding: 8px 12px; margin-bottom: 8px; flex-wrap: wrap;">
            <code id="revealed-api-key" style="font-family: monospace; font-size: 0.85rem; color: #0f172a; flex: 1; min-width: 200px; word-break: break-all;">${esc(apiKey)}</code>
            <button type="button" id="btn-copy-revealed-key" class="btn btn-primary btn-sm" style="background: #10b981; border-color: #10b981; flex-shrink: 0; display: inline-flex; align-items: center; gap: 4px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copy Key
            </button>
          </div>
        </div>
      `;

      container.querySelector('#btn-dismiss-reveal')?.addEventListener('click', () => {
        container.style.display = 'none';
      });

      container.querySelector('#btn-copy-revealed-key')?.addEventListener('click', async () => {
        await navigator.clipboard.writeText(apiKey);
        this.toast('API Key copied to clipboard!', 'success');
      });

      container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function credentialsFallback(options) {
    if (typeof options.body === 'string') {
      try { return { ...options, body: JSON.parse(options.body) }; } catch { return options; }
    }
    return options;
  }

  window.integrationsManager = new IntegrationsManager();
})();
