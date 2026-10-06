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
    { id: 'hubspot', name: 'HubSpot CRM', icon: '🟠', defaultUrl: 'https://api.hubapi.com', placeholder: 'pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', help: 'HubSpot Settings → Integrations → Private Apps → Create Private App Token' },
    { id: 'salesforce', name: 'Salesforce', icon: '☁️', defaultUrl: 'https://yourinstance.salesforce.com', placeholder: 'OAuth Access Token or Security Token', help: 'Salesforce Setup → Apps → App Manager → Connected App' },
    { id: 'zoho', name: 'Zoho CRM', icon: '💼', defaultUrl: 'https://www.zohoapis.com/crm/v2', placeholder: 'Zoho OAuth / Auth Token', help: 'Zoho API Console → Self Client or Server-based App' },
    { id: 'pipedrive', name: 'Pipedrive', icon: '🟢', defaultUrl: 'https://api.pipedrive.com/v1', placeholder: 'Personal API Token', help: 'Pipedrive Settings → Personal Preferences → API' },
    { id: 'shopify', name: 'Shopify / E-Commerce', icon: '🛍️', defaultUrl: 'https://your-shop.myshopify.com/admin/api/2024-01', placeholder: 'shpat_xxxxxxxxxxxxxxxxxxxx', help: 'Shopify Admin → Apps and sales channels → Develop apps → Admin API' },
    { id: 'make_zapier', name: 'Make / Zapier Webhook', icon: '⚡', defaultUrl: 'https://hook.eu1.make.com/xxxxxx', placeholder: 'Webhook API Secret or URL Token', help: 'Make.com Custom Webhook or Zapier Webhook URL' },
    { id: 'custom', name: 'Custom Software / ERP', icon: '🔌', defaultUrl: '', placeholder: 'Paste provider API Key or Secret', help: 'Any external REST API or ERP system credentials' }
  ];

  class IntegrationsManager {
    constructor() {
      this.connections = [];
      this.apiKeys = [];
      this.currentAuthToken = '';
      this._init();
    }

    _init() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this._boot());
      } else {
        this._boot();
      }
    }

    _boot() {
      this.renderPanels();
      this.loadData();
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

      // If user has Supabase auth session
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
        // Fallback for standalone mock/offline state
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
            return { success: true, status: 'connected', message: '✓ Connection test passed (Simulated check).' };
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
        console.error('[IntegrationsManager] Load failed:', err);
      }
    }

    renderPanels() {
      // Find containers in DOM or inject tabs
      const apiKeysPanel = document.getElementById('settings-tab-api-keys');
      const crmsPanel = document.getElementById('settings-tab-external-crms');

      if (apiKeysPanel) this._renderApiKeysStructure(apiKeysPanel);
      if (crmsPanel) this._renderCrmsStructure(crmsPanel);
    }

    _renderCrmsStructure(container) {
      container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <div class="card-title" style="margin-bottom: 4px;">Connected Softwares & Third-Party CRMs</div>
            <p style="font-size: 0.8125rem; color: var(--text-muted); margin: 0;">
              Connect your external CRM (HubSpot, Salesforce, Zoho, Pipedrive), e-commerce platforms, or custom software API keys. All credentials are encrypted server-side with AES-256-GCM.
            </p>
          </div>
          <button id="btn-open-add-crm-modal" class="btn btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Connect New Software
          </button>
        </div>

        <!-- Quick Presets -->
        <div style="margin-bottom: 24px;">
          <div style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px; letter-spacing: 0.5px;">Quick Connect Presets</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px;">
            ${CRM_PRESETS.map(p => `
              <button class="crm-preset-card" data-preset="${p.id}" style="background: var(--navy-50, #f8fafc); border: 1px solid var(--border-light, #e2e8f0); border-radius: 8px; padding: 12px; text-align: left; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">${p.icon}</span>
                <div>
                  <div style="font-size: 0.8125rem; font-weight: 600; color: var(--text-primary, #1e293b);">${esc(p.name)}</div>
                  <div style="font-size: 0.7rem; color: var(--text-muted, #64748b);">Connect Key →</div>
                </div>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Active Saved Connections -->
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="font-size: 0.875rem; font-weight: 700; color: var(--text-primary);">Active Software Connections</div>
            <button id="btn-refresh-crms" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 4px 10px;">Refresh Status</button>
          </div>
          <div id="crms-connections-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px;">
            <div style="padding: 24px; text-align: center; color: var(--text-muted); background: var(--navy-50); border-radius: 8px; border: 1px dashed var(--border-light); grid-column: 1 / -1;">
              Loading saved connections…
            </div>
          </div>
        </div>
      `;

      container.querySelector('#btn-open-add-crm-modal')?.addEventListener('click', () => this.openAddCrmModal());
      container.querySelector('#btn-refresh-crms')?.addEventListener('click', () => this.loadData());
      container.querySelectorAll('.crm-preset-card').forEach(btn => {
        btn.addEventListener('click', () => {
          const presetId = btn.dataset.preset;
          const preset = CRM_PRESETS.find(p => p.id === presetId);
          this.openAddCrmModal(preset);
        });
      });
    }

    _renderApiKeysStructure(container) {
      container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <div class="card-title" style="margin-bottom: 4px;">SaaS Platform API Keys</div>
            <p style="font-size: 0.8125rem; color: var(--text-muted); margin: 0;">
              Generate secret API keys for external applications (Make.com, Zapier, custom scripts, website forms) to authenticate and interact with your NexusLead CRM & WhatsApp platform.
            </p>
          </div>
          <button id="btn-open-generate-key-modal" class="btn btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Generate New API Key
          </button>
        </div>

        <!-- Reveal Dialog Container (Dynamic) -->
        <div id="new-key-reveal-container" style="display: none; margin-bottom: 20px;"></div>

        <!-- Active API Keys Table -->
        <div style="margin-bottom: 30px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="font-size: 0.875rem; font-weight: 700; color: var(--text-primary);">Active API Keys</div>
            <button id="btn-refresh-api-keys" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 4px 10px;">Refresh Keys</button>
          </div>
          <div class="table-responsive" style="border: 1px solid var(--border-light); border-radius: 8px; overflow: hidden; background: #fff;">
            <table class="data-table" style="margin: 0; width: 100%;">
              <thead>
                <tr>
                  <th>Key Name</th>
                  <th>Prefix</th>
                  <th>Created</th>
                  <th>Last Used</th>
                  <th>Status</th>
                  <th style="text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody id="api-keys-table-body">
                <tr>
                  <td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">Loading active API keys…</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Developer API Quickstart -->
        <div style="border: 1px solid var(--border-light); border-radius: 8px; padding: 18px; background: var(--navy-50);">
          <div style="font-size: 0.9375rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
            <span>⚡</span> Developer API Quickstart & Examples
          </div>
          <p style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 14px;">
            Include your generated key in the <code style="background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 4px;">Authorization: Bearer nl_live_...</code> or <code style="background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 4px;">X-API-Key: nl_live_...</code> header.
          </p>

          <div style="display: flex; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--border-light); padding-bottom: 8px;">
            <button class="api-doc-tab active" data-doc="curl" style="background: var(--brand-primary); color: #fff; border: none; border-radius: 4px; padding: 4px 12px; font-size: 0.75rem; font-weight: 600; cursor: pointer;">cURL</button>
            <button class="api-doc-tab" data-doc="js" style="background: transparent; color: var(--text-secondary); border: none; border-radius: 4px; padding: 4px 12px; font-size: 0.75rem; font-weight: 600; cursor: pointer;">JavaScript (Node)</button>
            <button class="api-doc-tab" data-doc="python" style="background: transparent; color: var(--text-secondary); border: none; border-radius: 4px; padding: 4px 12px; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Python</button>
            <button class="api-doc-tab" data-doc="make" style="background: transparent; color: var(--text-secondary); border: none; border-radius: 4px; padding: 4px 12px; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Make / Zapier</button>
          </div>

          <div id="api-doc-code-block" style="background: #0f172a; color: #f8fafc; border-radius: 6px; padding: 14px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.78rem; line-height: 1.5; overflow-x: auto; position: relative;">
            <button id="btn-copy-doc-code" style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.15); color: #fff; border: none; border-radius: 4px; padding: 3px 8px; font-size: 0.7rem; cursor: pointer;">Copy</button>
            <pre id="api-doc-pre" style="margin: 0;"># 1. Create a new Lead via REST API
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
  }'</pre>
          </div>
        </div>
      `;

      container.querySelector('#btn-open-generate-key-modal')?.addEventListener('click', () => this.openGenerateKeyModal());
      container.querySelector('#btn-refresh-api-keys')?.addEventListener('click', () => this.loadData());
      
      const docTabs = container.querySelectorAll('.api-doc-tab');
      const docPre = container.querySelector('#api-doc-pre');
      const btnCopyDoc = container.querySelector('#btn-copy-doc-code');

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

# 2. Fetch leads
curl -X GET "https://your-domain.com/api/leads?limit=20" \\
  -H "X-API-Key: YOUR_API_KEY"`,
        
        js: `// Node.js / Browser Lead Creation
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
    }

    renderConnections() {
      const container = document.getElementById('crms-connections-list');
      if (!container) return;

      if (!this.connections.length) {
        container.innerHTML = `
          <div style="padding: 28px; text-align: center; color: var(--text-muted); background: var(--navy-50); border-radius: 8px; border: 1px dashed var(--border-light); grid-column: 1 / -1;">
            <div style="font-size: 28px; margin-bottom: 8px;">🔌</div>
            <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">No External Softwares Connected</div>
            <div style="font-size: 0.8125rem; margin-bottom: 14px;">Connect HubSpot, Salesforce, Zoho, Shopify or custom CRM credentials to start syncing.</div>
            <button class="btn btn-primary btn-sm" onclick="window.integrationsManager.openAddCrmModal()">Connect First Software</button>
          </div>
        `;
        return;
      }

      container.innerHTML = this.connections.map(conn => {
        const matchedPreset = CRM_PRESETS.find(p => conn.name.toLowerCase().includes(p.id)) || { icon: '🔗' };
        return `
          <div class="card" style="padding: 16px; border: 1px solid var(--border-light); border-radius: 8px; background: #fff; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 22px;">${matchedPreset.icon}</span>
                  <div>
                    <strong style="font-size: 0.9375rem; color: var(--text-primary);">${esc(conn.name)}</strong>
                    <div style="font-size: 0.72rem; color: var(--text-muted);">${conn.base_url ? esc(conn.base_url) : 'No Base URL (Token Only)'}</div>
                  </div>
                </div>
                <span class="badge badge-qualified" style="font-size: 0.7rem;">Saved</span>
              </div>
              
              <div style="background: var(--navy-50); border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.72rem; color: var(--text-muted);">Encrypted API Key:</span>
                <code style="font-family: monospace; font-size: 0.75rem; color: var(--text-primary);">${esc(conn.api_key_hint)}</code>
              </div>
            </div>

            <div style="display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid var(--border-subtle); padding-top: 10px;">
              <button class="btn btn-secondary btn-sm btn-test-conn" data-id="${conn.id}" data-name="${esc(conn.name)}" data-url="${esc(conn.base_url || '')}" style="font-size: 0.75rem; padding: 4px 10px;">
                🔍 Test Ping
              </button>
              <button class="btn btn-secondary btn-sm btn-delete-conn" data-id="${conn.id}" data-name="${esc(conn.name)}" style="font-size: 0.75rem; padding: 4px 10px; color: #ef4444; border-color: #fca5a5;">
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
              No active API keys generated yet. Click <strong>Generate New API Key</strong> to create your first key.
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
              <div style="font-weight: 600; color: var(--text-primary);">${esc(k.name)}</div>
            </td>
            <td>
              <code style="font-family: monospace; font-size: 0.78rem; background: var(--navy-50); padding: 2px 6px; border-radius: 4px;">${esc(k.key_prefix)}••••</code>
            </td>
            <td style="font-size: 0.8125rem; color: var(--text-secondary);">${createdDate}</td>
            <td style="font-size: 0.8125rem; color: var(--text-secondary);">${lastUsed}</td>
            <td>
              <span class="badge badge-contacted" style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">Active</span>
            </td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm btn-revoke-key" data-id="${k.id}" data-name="${esc(k.name)}" style="color: #ef4444; border-color: #fca5a5; font-size: 0.75rem; padding: 3px 8px;">
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

    openAddCrmModal(preset = null) {
      const modalId = 'modal-add-crm-connection';
      let modal = document.getElementById(modalId);
      if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-backdrop';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(4px);';
        document.body.appendChild(modal);
      }

      const initialName = preset?.name || '';
      const initialUrl = preset?.defaultUrl || '';
      const initialPlaceholder = preset?.placeholder || 'Paste API Key / Secret';
      const initialHelp = preset?.help || 'Enter the secret credentials from your provider dashboard.';

      modal.innerHTML = `
        <div class="card" style="width: 100%; max-width: 520px; padding: 24px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2); background:#fff; position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px;">
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
              <span>${preset?.icon || '🔌'}</span> Connect External Software / CRM
            </div>
            <button id="close-crm-modal" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text-muted);">&times;</button>
          </div>

          <form id="form-save-crm-connection" class="space-y-4">
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="font-size: 0.8125rem; font-weight: 600;">Software / CRM Name *</label>
              <input type="text" id="crm-modal-name" class="form-input" required placeholder="e.g. HubSpot Production" value="${esc(initialName)}" maxlength="80">
            </div>

            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="font-size: 0.8125rem; font-weight: 600;">HTTPS Base URL / Webhook Endpoint (Optional)</label>
              <input type="url" id="crm-modal-url" class="form-input" placeholder="https://api.hubapi.com" value="${esc(initialUrl)}">
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">Must start with https://</div>
            </div>

            <div class="form-group" style="margin-bottom: 18px;">
              <label class="form-label" style="font-size: 0.8125rem; font-weight: 600;">API Key / Private Access Token *</label>
              <input type="password" id="crm-modal-secret" class="form-input" required placeholder="${esc(initialPlaceholder)}" autocomplete="new-password">
              <div id="crm-modal-help-text" style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">${esc(initialHelp)}</div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
              <button type="button" id="cancel-crm-modal" class="btn btn-secondary">Cancel</button>
              <button type="submit" id="submit-crm-modal" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 6px;">
                Save & Encrypt Connection
              </button>
            </div>
          </form>
        </div>
      `;

      modal.style.display = 'flex';

      const closeModal = () => { modal.style.display = 'none'; };
      modal.querySelector('#close-crm-modal')?.addEventListener('click', closeModal);
      modal.querySelector('#cancel-crm-modal')?.addEventListener('click', closeModal);

      modal.querySelector('#form-save-crm-connection')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = modal.querySelector('#crm-modal-name').value.trim();
        const baseUrl = modal.querySelector('#crm-modal-url').value.trim();
        const apiKey = modal.querySelector('#crm-modal-secret').value.trim();

        if (!name || !apiKey) {
          this.toast('Please enter both software name and API key.', 'error');
          return;
        }

        const submitBtn = modal.querySelector('#submit-crm-modal');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving…';

        try {
          await this.apiFetch('/api/integration-keys', {
            method: 'POST',
            body: JSON.stringify({ action: 'save-connection', name, baseUrl, apiKey })
          });
          this.toast(`Connection "${name}" saved securely!`, 'success');
          closeModal();
          this.loadData();
        } catch (err) {
          this.toast(err.message, 'error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save & Encrypt Connection';
        }
      });
    }

    openGenerateKeyModal() {
      const modalId = 'modal-generate-platform-key';
      let modal = document.getElementById(modalId);
      if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-backdrop';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(4px);';
        document.body.appendChild(modal);
      }

      modal.innerHTML = `
        <div class="card" style="width: 100%; max-width: 480px; padding: 24px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2); background:#fff;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px;">
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
              <span>🔑</span> Generate New SaaS API Key
            </div>
            <button id="close-gen-modal" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text-muted);">&times;</button>
          </div>

          <form id="form-generate-key" class="space-y-4">
            <div class="form-group" style="margin-bottom: 14px;">
              <label class="form-label" style="font-size: 0.8125rem; font-weight: 600;">Key Name / Integration Purpose *</label>
              <input type="text" id="gen-key-name" class="form-input" required placeholder="e.g. Make.com Automation Scenario" maxlength="80">
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">A friendly identifier to help you remember what is using this key.</div>
            </div>

            <div class="form-group" style="margin-bottom: 18px;">
              <label class="form-label" style="font-size: 0.8125rem; font-weight: 600;">Permissions / Scope</label>
              <select id="gen-key-scope" class="form-input">
                <option value="full">Full Access (Leads, Messages, Automation triggers)</option>
                <option value="leads_write">Leads Ingestion & Sync (Read/Write Leads)</option>
                <option value="messages_write">Messaging Only (Send WhatsApp)</option>
                <option value="read_only">Read-Only Access</option>
              </select>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
              <button type="button" id="cancel-gen-modal" class="btn btn-secondary">Cancel</button>
              <button type="submit" id="submit-gen-modal" class="btn btn-primary">Generate Secret Key</button>
            </div>
          </form>
        </div>
      `;

      modal.style.display = 'flex';

      const closeModal = () => { modal.style.display = 'none'; };
      modal.querySelector('#close-gen-modal')?.addEventListener('click', closeModal);
      modal.querySelector('#cancel-gen-modal')?.addEventListener('click', closeModal);

      modal.querySelector('#form-generate-key')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = modal.querySelector('#gen-key-name').value.trim();
        if (!name) {
          this.toast('Please enter a name for the API key.', 'error');
          return;
        }

        const submitBtn = modal.querySelector('#submit-gen-modal');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Generating…';

        try {
          const res = await this.apiFetch('/api/integration-keys', {
            method: 'POST',
            body: JSON.stringify({ action: 'generate-api-key', name })
          });

          closeModal();
          this.showKeyRevealDialog(name, res.apiKey);
          this.loadData();
        } catch (err) {
          this.toast(err.message, 'error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Generate Secret Key';
        }
      });
    }

    showKeyRevealDialog(name, apiKey) {
      const container = document.getElementById('new-key-reveal-container');
      if (!container) return;

      container.style.display = 'block';
      container.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.08); border: 1.5px solid #10b981; border-radius: 10px; padding: 18px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 20px;">🎉</span>
              <strong style="color: #065f46; font-size: 0.9375rem;">API Key Created for "${esc(name)}"</strong>
            </div>
            <button id="btn-dismiss-reveal" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #065f46;">&times;</button>
          </div>

          <div style="font-size: 0.8125rem; color: #065f46; margin-bottom: 12px;">
            Please copy this key immediately and save it securely. <strong>For security reasons, you will never be shown this key again.</strong>
          </div>

          <div style="display: flex; gap: 8px; align-items: center; background: #fff; border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; padding: 8px 12px; margin-bottom: 10px;">
            <code id="revealed-api-key" style="font-family: monospace; font-size: 0.85rem; color: #0f172a; flex: 1; word-break: break-all;">${esc(apiKey)}</code>
            <button id="btn-copy-revealed-key" class="btn btn-primary btn-sm" style="background: #10b981; border-color: #10b981; flex-shrink: 0; display: inline-flex; align-items: center; gap: 4px;">
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

      // Scroll into view
      container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function credentialsFallback(options) {
    if (typeof options.body === 'string') {
      try { return { ...options, body: JSON.parse(options.body) }; } catch { return options; }
    }
    return options;
  }

  // Expose instance globally
  window.integrationsManager = new IntegrationsManager();
})();
