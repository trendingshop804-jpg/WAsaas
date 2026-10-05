/* Generic CRM/software credentials and issued API keys. */
(function () {
  'use strict';

  const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const toast = (message, type = 'info') => { if (window.settingsIntegrationsComponent?._toast) window.settingsIntegrationsComponent._toast(message, type); else alert(message); };
  const request = (path = '', init = {}) => {
    if (!window.apiClient?.apiFetchJson) return Promise.reject(new Error('Please sign in to manage integration keys.'));
    return window.apiClient.apiFetchJson(`/api/integration-keys${path}`, init);
  };

  function render(data) {
    const connections = data.connections || [];
    const keys = data.apiKeys || [];
    const rows = (items, kind) => items.map(item => `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--border-subtle)"><div style="min-width:0;flex:1"><strong>${esc(item.name)}</strong><span style="margin-left:8px;color:var(--text-muted);font-family:monospace;font-size:12px">${esc(kind === 'connection' ? item.api_key_hint : `${item.key_prefix}••••`)}</span><div style="font-size:12px;color:var(--text-muted)">${kind === 'connection' ? esc(item.base_url || 'No base URL set') : `Created ${new Date(item.created_at).toLocaleDateString()}`}</div></div><button class="btn-remove-key external-api-remove" data-id="${item.id}" data-type="${kind}">${kind === 'connection' ? 'Remove' : 'Revoke'}</button></div>`).join('');
    document.getElementById('external-api-connections').innerHTML = connections.length ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:7px">Saved integrations</div>${rows(connections, 'connection')}` : '<div style="margin-top:14px;font-size:13px;color:var(--text-muted)">No custom integrations saved yet.</div>';
    document.getElementById('platform-api-keys').innerHTML = keys.length ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:7px">Active API keys</div>${rows(keys, 'api-key')}` : '<div style="margin-top:14px;font-size:13px;color:var(--text-muted)">No generated API keys yet.</div>';
    document.querySelectorAll('.external-api-remove').forEach(button => button.addEventListener('click', async () => {
      if (!confirm(button.dataset.type === 'api-key' ? 'Revoke this API key? Any software using it will stop working.' : 'Remove this saved integration?')) return;
      try { await request(`?type=${encodeURIComponent(button.dataset.type)}&id=${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' }); toast('Removed successfully.'); load(); } catch (error) { toast(error.message, 'error'); }
    }));
  }

  async function load() {
    try { render(await request()); } catch (error) { document.getElementById('external-api-connections').innerHTML = `<div style="margin-top:14px;color:var(--text-muted);font-size:13px">${esc(error.message || 'Could not load integrations.')}</div>`; }
  }

  function mount() {
    const grid = document.getElementById('integrations-cards-grid');
    if (!grid || document.getElementById('external-api-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'external-api-panel'; panel.style.cssText = 'margin-bottom:20px;grid-column:1 / -1;';
    panel.innerHTML = `<div class="card" style="padding:20px 24px"><div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap"><div><div style="font-size:16px;font-weight:700;color:var(--text-primary)">Other CRM & software</div><div style="font-size:13px;color:var(--text-secondary);margin-top:4px">Save an API key for any CRM or software connector. Credentials are encrypted and never shown again.</div></div><button id="external-api-refresh" class="btn btn-secondary btn-sm">Refresh</button></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-top:16px;align-items:end"><label style="display:grid;gap:5px;font-size:12px;color:var(--text-muted)">Software / CRM name<input id="external-api-name" class="form-input" maxlength="80" placeholder="e.g. Salesforce"></label><label style="display:grid;gap:5px;font-size:12px;color:var(--text-muted)">HTTPS base URL (optional)<input id="external-api-url" class="form-input" type="url" placeholder="https://api.example.com"></label><label style="display:grid;gap:5px;font-size:12px;color:var(--text-muted)">API key<input id="external-api-secret" class="form-input" type="password" autocomplete="off" placeholder="Paste provider API key"></label><button id="external-api-save" class="btn btn-primary btn-sm" style="height:38px">Save integration</button></div><div id="external-api-connections" style="margin-top:16px"></div><div style="border-top:1px solid var(--border-subtle);margin:22px 0 18px"></div><div style="font-size:16px;font-weight:700;color:var(--text-primary)">Your NexusLead API keys</div><div style="font-size:13px;color:var(--text-secondary);margin-top:4px">Generate a key for Zapier, Make, or your own software to call the NexusLead API. Copy it now — it is displayed once only.</div><div style="display:flex;gap:10px;margin-top:14px;align-items:end;flex-wrap:wrap"><label style="display:grid;gap:5px;font-size:12px;color:var(--text-muted);min-width:240px">Key name<input id="platform-api-key-name" class="form-input" maxlength="80" placeholder="e.g. Make production"></label><button id="platform-api-key-generate" class="btn btn-primary btn-sm" style="height:38px">Generate API key</button></div><div id="platform-api-key-reveal" style="display:none;margin-top:14px"></div><div id="platform-api-keys" style="margin-top:16px"></div></div>`;
    grid.insertAdjacentElement('beforebegin', panel);
    document.getElementById('external-api-refresh').addEventListener('click', load);
    document.getElementById('external-api-save').addEventListener('click', async () => {
      const name = document.getElementById('external-api-name'), baseUrl = document.getElementById('external-api-url'), apiKey = document.getElementById('external-api-secret');
      if (!name.value.trim() || !apiKey.value.trim()) return toast('Enter the software name and its API key.', 'error');
      try { await request('', { method: 'POST', body: JSON.stringify({ action: 'save-connection', name: name.value, baseUrl: baseUrl.value, apiKey: apiKey.value }) }); name.value = ''; baseUrl.value = ''; apiKey.value = ''; toast('Integration API key stored securely.', 'success'); load(); } catch (error) { toast(error.message, 'error'); }
    });
    document.getElementById('platform-api-key-generate').addEventListener('click', async () => {
      const name = document.getElementById('platform-api-key-name'); if (!name.value.trim()) return toast('Enter a name for the API key.', 'error');
      try { const data = await request('', { method: 'POST', body: JSON.stringify({ action: 'generate-api-key', name: name.value }) }); name.value = ''; const reveal = document.getElementById('platform-api-key-reveal'); reveal.style.display = 'block'; reveal.innerHTML = `<div style="padding:12px;border:1px solid rgba(52,211,153,.45);background:rgba(52,211,153,.08);border-radius:8px"><strong style="display:block;margin-bottom:6px">Copy this API key now — it will not be shown again.</strong><code style="display:block;overflow-wrap:anywhere;color:var(--text-primary)">${esc(data.apiKey)}</code><button id="copy-platform-api-key" class="btn btn-secondary btn-sm" style="margin-top:10px">Copy key</button></div>`; document.getElementById('copy-platform-api-key').addEventListener('click', async () => { await navigator.clipboard.writeText(data.apiKey); toast('API key copied.', 'success'); }); toast('New API key generated.', 'success'); load(); } catch (error) { toast(error.message, 'error'); }
    });
    load();
  }

  window.addEventListener('DOMContentLoaded', () => setTimeout(mount, 0));
})();
