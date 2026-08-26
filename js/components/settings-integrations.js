/* ==========================================================================
   NexusLead AI — Settings & Integrations / API Keys Component
   Handles: add / update / delete / test credentials, masked display,
   WhatsApp OAuth modal, toast notifications.

   Backend wiring:
     GET  /functions/v1/manage-integration-keys          → list masked keys
     POST /functions/v1/manage-integration-keys          → save/update key
     DELETE /functions/v1/manage-integration-keys?id=…   → remove key
     POST /functions/v1/manage-integration-keys/test     → verify key live
   ========================================================================== */

class SettingsIntegrationsComponent {
  constructor() {
    /* ── Integration definitions ────────────────────────────────────── */
    this.integrations = [
      {
        id:          'whatsapp_business',
        type:        'oauth',
        accent:      'whatsapp',
        logoClass:   'whatsapp',
        logoEmoji:   '💬',
        name:        'WhatsApp Business',
        description: 'Connect your Meta WhatsApp Business Account (WABA) via OAuth to send & receive messages at scale.',
        helpText:    'Requires a verified Meta Business Account. Your WABA number must be approved at Tier-2 or above. <a href="https://business.facebook.com/wa/manage/home/" target="_blank" rel="noopener">Open Meta Business Manager →</a>',
        status:      'disconnected',
        dbId:        null,   // row id in user_integration_keys
        maskedValue: null,
        instagramUsername: null,
      },
      {
        id:          'openai_api_key',
        type:        'api_key',
        accent:      'openai',
        logoClass:   'openai',
        logoEmoji:   '🤖',
        name:        'OpenAI API Key',
        description: 'Optional. Provide your own key to bypass the platform default and use your own billing quota.',
        helpText:    'Find your secret key in the <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">OpenAI API Keys dashboard →</a>. Keys start with <code>sk-</code>. The platform default is used when no key is saved.',
        placeholder: 'sk-proj-…',
        status:      'disconnected',
        dbId:        null,
        maskedValue: null,
      },
      {
        id:          'stripe_api_key',
        type:        'api_key',
        accent:      'stripe',
        logoClass:   'stripe',
        logoEmoji:   '💳',
        name:        'Stripe Secret Key',
        description: 'Connect Stripe to process payments and sync subscription data with NexusLead billing.',
        helpText:    'Copy your secret key from the <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener">Stripe Developers → API Keys →</a> page. Use the <strong>live</strong> key for production.',
        placeholder: 'sk_live_…',
        status:      'disconnected',
        dbId:        null,
        maskedValue: null,
      },
      {
        id:          'hubspot_api_key',
        type:        'api_key',
        accent:      'hubspot',
        logoClass:   'hubspot',
        logoEmoji:   '🟠',
        name:        'HubSpot Private App Token',
        description: 'Sync leads and contacts bi-directionally with HubSpot CRM.',
        helpText:    'Create a Private App in your <a href="https://app.hubspot.com/private-apps/" target="_blank" rel="noopener">HubSpot account → Settings → Private Apps →</a> and copy the access token.',
        placeholder: 'pat-na1-…',
        status:      'disconnected',
        dbId:        null,
        maskedValue: null,
      },
    ];

    /* Load persisted masks from localStorage (masked only, never raw) */
    this._loadFromStorage();
  }

  init() {
    this._injectToastContainer();
    this._buildIntegrationsPanel();
    this._bindSettingsTabs();
    this._bindModalClose();
    this._loadFbSdk();
    this._bindFbMessageListener();

    // Align WhatsApp Business card status with active appState on boot
    const org = window.appState.getCurrentOrg();
    const wa = this.integrations.find(i => i.id === 'whatsapp_business');
    if (wa && org.whatsappConnected) {
      wa.status = 'connected';
      wa.maskedValue = org.whatsappNumber;
    }

    // Sync changes dynamically
    window.appState.on('whatsappConnectionChanged', (state) => {
      const currentOrg = window.appState.getCurrentOrg();
      const ig = this.integrations.find(i => i.id === 'whatsapp_business');
      if (ig) {
        if (currentOrg.whatsappConnected) {
          ig.status = 'connected';
          ig.maskedValue = currentOrg.whatsappNumber || 'WABA Connected';
        } else {
          ig.status = 'disconnected';
          ig.maskedValue = null;
          ig.instagramUsername = null;
        }
      }
      this._renderCards();
    });

    window.appState.on('instagramConnectionChanged', (state) => {
      const currentOrg = window.appState.getCurrentOrg();
      const ig = this.integrations.find(i => i.id === 'whatsapp_business');
      if (ig) {
        ig.instagramUsername = currentOrg.instagramUsername || null;
      }
      this._renderCards();
    });

    /* Attempt to fetch live server state (if Supabase is configured) */
    this._fetchFromServer();
  }

  /* ── Tab Switching ──────────────────────────────────────────────────── */
  _bindSettingsTabs() {
    const panel = document.getElementById('view-settings');
    if (!panel) return;

    panel.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        panel.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        panel.querySelectorAll('.settings-tab-panel').forEach(p => p.classList.remove('active'));
        const tp = document.getElementById(`settings-tab-${target}`);
        if (tp) tp.classList.add('active');
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     BUILD INTEGRATIONS PANEL
     ══════════════════════════════════════════════════════════════════════ */
  _buildIntegrationsPanel() {
    /* Render integration cards inside the static container from index.html */
    this._renderCards();
  }

  /* ── Render All Cards ───────────────────────────────────────────────── */
  _renderCards() {
    const grid = document.getElementById('integrations-cards-grid');
    if (!grid) return;
    grid.innerHTML = '';
    this.integrations.forEach(ig => {
      grid.insertAdjacentHTML('beforeend', this._cardHTML(ig));
    });
    this._bindCardEvents();
  }

  /* ── Card HTML Template ─────────────────────────────────────────────── */
  _cardHTML(ig) {
    const statusLabel = {
      connected:    'Connected',
      disconnected: 'Not Connected',
      error:        'Error',
    }[ig.status] || 'Not Connected';
    const isConnected = ig.status === 'connected';

    /* Masked key display row (only when connected) */
    const maskedBlock = isConnected ? `
      <div class="key-display-row" id="key-row-${ig.id}">
        <div class="masked-value">
          <span class="key-prefix">${this._maskedPrefix(ig.maskedValue)}</span><span class="key-stars">••••••••</span><span class="key-suffix">${this._maskedSuffix(ig.maskedValue)}</span>
        </div>
        <div class="key-display-actions">
          <button class="btn btn-secondary btn-sm" id="btn-update-${ig.id}" title="Update key">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Update
          </button>
          <button class="btn-remove-key" id="btn-remove-${ig.id}" title="Remove key">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            Remove
          </button>
        </div>
      </div>` : '';

    /* API-key input section */
    const inputSection = ig.type === 'api_key' ? `
      <div class="key-input-section ${isConnected ? '' : 'visible'}" id="input-section-${ig.id}">
        <div class="api-key-input-wrap">
          <input
            type="password"
            id="api-key-input-${ig.id}"
            class="form-input"
            placeholder="${ig.placeholder || 'Paste your API key here…'}"
            autocomplete="off"
            spellcheck="false"
          />
          <button type="button" class="api-key-toggle-visibility" id="btn-toggle-vis-${ig.id}" title="Show/hide key">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="eye-icon-${ig.id}"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn btn-primary btn-sm" id="btn-save-${ig.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Save Key
          </button>
          ${isConnected ? `<button class="btn btn-secondary btn-sm" id="btn-cancel-edit-${ig.id}">Cancel</button>` : ''}
        </div>
      </div>` : '';

    /* WhatsApp OAuth connect button */
    const oauthSection = ig.type === 'oauth' && !isConnected ? `
      <button class="btn-oauth-connect btn-meta-facebook" id="btn-oauth-${ig.id}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        Continue with Facebook
      </button>` : '';

    /* Connected account display for WhatsApp */
    const connectedAccountBlock = ig.type === 'oauth' && isConnected ? `
      <div class="connected-account-display" id="connected-account-${ig.id}">
        <div class="connected-account-info">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          <span class="connected-account-value">${ig.maskedValue || 'WhatsApp Connected'}</span>
        </div>
        ${ig.instagramUsername ? `
        <div class="connected-account-info instagram">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
          <span class="connected-account-value">@${ig.instagramUsername}</span>
        </div>` : ''}
      </div>` : '';

    /* Test Connection button + result badge (only when connected) */
    const testBtn = isConnected ? `
      <button class="btn-test-connection" id="btn-test-${ig.id}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Test Connection
      </button>
      <div class="test-result-inline" id="test-result-${ig.id}"></div>` : '';

    /* Disconnect button (connected integrations only) */
    const disconnectBtn = isConnected ? `
      <button class="btn-remove-key" id="btn-disconnect-${ig.id}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Disconnect
      </button>` : '';

    return `
    <div class="integration-card" data-accent="${ig.accent}" data-integration-id="${ig.id}">
      <div class="integration-card-header">
        <div class="integration-logo ${ig.logoClass}">${ig.logoEmoji}</div>
        <div class="integration-meta">
          <div class="integration-name">${ig.name}</div>
          <div class="integration-desc">${ig.description}</div>
        </div>
        <span class="integration-status-badge ${ig.status}" id="status-badge-${ig.id}">${statusLabel}</span>
      </div>

      ${maskedBlock}
      ${connectedAccountBlock}
      ${inputSection}
      ${oauthSection}

      <div class="integration-help-text">${ig.helpText}</div>

      <div class="integration-card-footer">
        ${testBtn}
        <div class="spacer"></div>
        ${disconnectBtn}
      </div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════════
     BIND CARD EVENTS
     ══════════════════════════════════════════════════════════════════════ */
  _bindCardEvents() {
    this.integrations.forEach(ig => {
      /* Save API key */
      document.getElementById(`btn-save-${ig.id}`)?.addEventListener('click', () => this._saveKey(ig.id));

      /* Show update input */
      document.getElementById(`btn-update-${ig.id}`)?.addEventListener('click', () => {
        document.getElementById(`input-section-${ig.id}`)?.classList.add('visible');
      });

      /* Cancel edit */
      document.getElementById(`btn-cancel-edit-${ig.id}`)?.addEventListener('click', () => {
        document.getElementById(`input-section-${ig.id}`)?.classList.remove('visible');
      });

      /* Toggle password visibility */
      document.getElementById(`btn-toggle-vis-${ig.id}`)?.addEventListener('click', () => {
        const inp  = document.getElementById(`api-key-input-${ig.id}`);
        const icon = document.getElementById(`eye-icon-${ig.id}`);
        if (!inp) return;
        const isHidden = inp.type === 'password';
        inp.type = isHidden ? 'text' : 'password';
        if (icon) {
          icon.innerHTML = isHidden
            ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`
            : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
        }
      });

      /* Remove / Disconnect */
      const removeBtn = document.getElementById(`btn-remove-${ig.id}`) || document.getElementById(`btn-disconnect-${ig.id}`);
      removeBtn?.addEventListener('click', () => this._removeKey(ig.id));

      /* Test Connection */
      document.getElementById(`btn-test-${ig.id}`)?.addEventListener('click', () => this._testConnection(ig.id));

      /* OAuth Connect */
      document.getElementById(`btn-oauth-${ig.id}`)?.addEventListener('click', () => {
        if (ig.id === 'whatsapp_business') {
          this._handleEmbeddedSignup();
        } else {
          this._openOAuthModal(ig.id);
        }
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     SAVE KEY  (real Edge Function call or demo fallback)
     ══════════════════════════════════════════════════════════════════════ */
  async _saveKey(integrationId) {
    const ig = this.integrations.find(i => i.id === integrationId);
    if (!ig) return;

    const input    = document.getElementById(`api-key-input-${integrationId}`);
    const saveBtn  = document.getElementById(`btn-save-${integrationId}`);
    if (!input) return;

    const rawValue = input.value.trim();
    if (!rawValue) {
      this._toast('Please enter an API key before saving.', 'error');
      input.focus();
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span class="spinner-xs"></span> Saving…`;
    }

    try {
      let maskedValue;

      if (window.supabaseConfig?.isSupabaseConfigured()) {
        /* ── Real Edge Function call ─────────────────────────────────── */
        const fnUrl = window.supabaseConfig.getEdgeFunctionUrl(
          window.supabaseConfig.integrationsFunctionName
        );
        const body = { key_name: integrationId, value: rawValue };
        if (ig.dbId) body.update_id = ig.dbId;

        const res  = await fetch(fnUrl, {
          method:  'POST',
          headers: window.supabaseConfig.getAuthHeaders(),
          body:    JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);

        ig.dbId      = data.id || ig.dbId;
        maskedValue  = data.masked_value;
      } else {
        /* ── Demo fallback (no Supabase project configured) ──────────── */
        await this._simulateApiCall(900);
        maskedValue = this._generateMask(rawValue);
      }

      ig.maskedValue = maskedValue;
      ig.status      = 'connected';

      /* NEVER keep the raw key in memory — clear immediately */
      input.value = '';

      this._persistToStorage(ig);
      this._toast(`${ig.name} key saved securely.`, 'success');
      this._renderCards();
    } catch (err) {
      this._toast(`Save failed: ${err.message}`, 'error');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Save Key`;
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     REMOVE / DISCONNECT KEY
     ══════════════════════════════════════════════════════════════════════ */
  async _removeKey(integrationId) {
    const ig = this.integrations.find(i => i.id === integrationId);
    if (!ig) return;

    if (!confirm(`Remove the ${ig.name} credential? This cannot be undone.`)) return;

    try {
      if (integrationId === 'whatsapp_business') {
        window.whatsappService.disconnect();
      } else {
        if (window.supabaseConfig?.isSupabaseConfigured() && ig.dbId) {
          const fnUrl = window.supabaseConfig.getEdgeFunctionUrl(
            window.supabaseConfig.integrationsFunctionName
          );
          const res  = await fetch(`${fnUrl}?id=${encodeURIComponent(ig.dbId)}`, {
            method:  'DELETE',
            headers: window.supabaseConfig.getAuthHeaders(),
          });
          const data = await res.json();
          if (!res.ok && data.error) throw new Error(data.error);
        } else {
          await this._simulateApiCall(600);
        }

        ig.status      = 'disconnected';
        ig.maskedValue = null;
        ig.dbId        = null;
        this._removeFromStorage(ig.id);
      }

      this._toast(`${ig.name} disconnected.`, 'info');
      this._renderCards();
    } catch (err) {
      this._toast(`Remove failed: ${err.message}`, 'error');
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     TEST CONNECTION
     ══════════════════════════════════════════════════════════════════════ */
  async _testConnection(integrationId) {
    const ig          = this.integrations.find(i => i.id === integrationId);
    const testBtn     = document.getElementById(`btn-test-${integrationId}`);
    const resultEl    = document.getElementById(`test-result-${integrationId}`);
    const statusBadge = document.getElementById(`status-badge-${integrationId}`);

    if (!ig) return;

    if (testBtn) {
      testBtn.disabled = true;
      testBtn.innerHTML = `<span class="spinner-xs"></span> Testing…`;
    }
    if (statusBadge) {
      statusBadge.className   = 'integration-status-badge testing';
      statusBadge.textContent = 'Testing…';
    }
    if (resultEl) {
      resultEl.className   = 'test-result-inline';
      resultEl.textContent = '';
    }

    let success, msg;

    try {
      if (window.supabaseConfig?.isSupabaseConfigured() && ig.dbId) {
        /* ── Real Edge Function test call ────────────────────────────── */
        const fnUrl = window.supabaseConfig.getEdgeFunctionUrl(
          window.supabaseConfig.integrationsFunctionName
        );
        const res  = await fetch(`${fnUrl}/test`, {
          method:  'POST',
          headers: window.supabaseConfig.getAuthHeaders(),
          body:    JSON.stringify({ key_id: ig.dbId }),
        });
        const data = await res.json();
        success = data.ok;
        msg     = data.message;
      } else {
        /* ── Demo simulation ─────────────────────────────────────────── */
        await this._simulateApiCall(1400);
        success = Math.random() > 0.1;   // 90% success rate in demo
        const messages = {
          whatsapp_business: { ok: 'WABA token valid · Tier-2 (1,000 msg/day)',        err: 'Invalid token or WABA account suspended'       },
          openai_api_key:    { ok: 'API key valid · gpt-4o accessible',                err: 'Unauthorized — check key or billing status'     },
          stripe_api_key:    { ok: 'Live key authenticated · account active',          err: 'Invalid key or restricted permissions'          },
          hubspot_api_key:   { ok: 'Access token valid · CRM scope granted',           err: 'Token expired or missing CRM scope'            },
        };
        msg = success
          ? (messages[integrationId]?.ok  || 'Connection successful')
          : (messages[integrationId]?.err || 'Connection failed');
      }
    } catch (err) {
      success = false;
      msg     = `Network error: ${err.message}`;
    }

    /* Update status badge */
    ig.status = success ? 'connected' : 'error';
    if (statusBadge) {
      statusBadge.className   = `integration-status-badge ${ig.status}`;
      statusBadge.textContent = success ? 'Connected' : 'Error';
    }

    /* Show inline result */
    if (resultEl) {
      resultEl.className = `test-result-inline visible ${success ? 'success' : 'error'}`;
      resultEl.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          ${success
            ? '<polyline points="20 6 9 17 4 12"/>'
            : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'}
        </svg>
        ${msg}`;
      setTimeout(() => { if (resultEl) resultEl.className = 'test-result-inline'; }, 6000);
    }

    /* Restore test button */
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        Test Connection`;
    }

    this._toast(msg, success ? 'success' : 'error');
  }

  /* ══════════════════════════════════════════════════════════════════════
     FETCH LIVE SERVER STATE (on init, if Supabase configured)
     ══════════════════════════════════════════════════════════════════════ */
  async _fetchFromServer() {
    if (!window.supabaseConfig?.isSupabaseConfigured()) {
      /* Show a subtle info banner when running in demo mode */
      const banner = document.getElementById('integrations-server-banner');
      if (banner) {
        banner.style.display = 'block';
        banner.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span><strong>Demo mode</strong> — Supabase credentials not configured. Keys are stored locally and simulated. Configure <code>supabase-config.js</code> to enable encrypted cloud storage.</span>`;
      }
      return;
    }

    try {
      const fnUrl = window.supabaseConfig.getEdgeFunctionUrl(
        window.supabaseConfig.integrationsFunctionName
      );
      const res  = await fetch(fnUrl, {
        method:  'GET',
        headers: window.supabaseConfig.getAuthHeaders(),
      });

      if (!res.ok) return;

      const { keys } = await res.json();
      if (!Array.isArray(keys)) return;

      /* Merge server state into local integration definitions */
      keys.forEach(row => {
        const ig = this.integrations.find(i => i.id === row.key_name);
        if (ig) {
          ig.status      = 'connected';
          ig.maskedValue = row.masked_value;
          ig.dbId        = row.id;
        }
      });

      this._renderCards();
    } catch (_) { /* Network unavailable — silently ignore */ }
  }

  /* Obsolete local simulated OAuth modal methods removed. 
     Now delegates to the global whatsappConnectComponent for connection state. */

  /* ══════════════════════════════════════════════════════════════════════
     TOAST NOTIFICATION SYSTEM
     ══════════════════════════════════════════════════════════════════════ */
  _injectToastContainer() {
    if (!document.getElementById('settings-toast-container')) {
      document.body.insertAdjacentHTML('beforeend', `<div class="settings-toast-container" id="settings-toast-container"></div>`);
    }
  }

  _toast(message, type = 'info') {
    const container = document.getElementById('settings-toast-container');
    if (!container) return;

    const icons = {
      success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
      error:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      info:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    };

    const el = document.createElement('div');
    el.className = `settings-toast ${type}`;
    el.innerHTML = `${icons[type] || icons.info} ${message}`;
    container.appendChild(el);

    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 280);
    }, 4200);
  }

  /* ══════════════════════════════════════════════════════════════════════
     MODAL CLOSE (global delegation)
     ══════════════════════════════════════════════════════════════════════ */
  _bindModalClose() {
    document.addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-close-modal')) {
        e.target.closest('.modal-backdrop')?.classList.remove('active');
      }
      if (e.target.classList.contains('modal-backdrop')) {
        e.target.classList.remove('active');
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     FACEBOOK SDK — Embedded Signup for WhatsApp
     ══════════════════════════════════════════════════════════════════════ */
  _loadFbSdk() {
    return new Promise((resolve, reject) => {
      if (window.FB && window.FB.__initialized) {
        console.log('[FB Connect] FB SDK already loaded and initialized');
        return resolve();
      }

      if (window.FB && !window.FB.__initialized) {
        console.log('[FB Connect] FB exists but not initialized, initializing...');
        this._initFb();
        return resolve();
      }

      console.log('[FB Connect] Loading FB SDK script...');
      const script = document.createElement('script');
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.onload = () => {
        console.log('[FB Connect] FB SDK script loaded');
        this._initFb();
        resolve();
      };
      script.onerror = (err) => {
        console.error('[FB Connect] Failed to load FB SDK script');
        reject(err);
      };
      document.body.appendChild(script);
    });
  }

  _initFb() {
    const appId = window.supabaseConfig?.metaAppId || '';
    console.log('[FB Connect] Initializing FB with appId:', appId || '(empty)');

    if (!appId) {
      console.warn('[FB Connect] No Meta App ID configured - FB will not be initialized');
      return;
    }

    window.FB.init({
      appId: appId,
      autoLogAppEvents: true,
      xfbml: false,
      version: 'v21.0'
    });
    window.FB.__initialized = true;
    console.log('[FB Connect] FB.init() called successfully');
  }

  _bindFbMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.origin !== 'https://www.facebook.com') return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          if (data.event === 'FINISH') {
            const { phone_number_id, waba_id } = data.data;
            window.__wa_signup_result = { phone_number_id, waba_id };
          }
          if (data.event === 'CANCEL' || data.event === 'ERROR') {
            this._waSignupError = data.data?.error_message || 'Signup cancelled';
            window.__wa_signup_cancelled = true;
          }
        }
      } catch (e) {}
    });
  }

  async _handleEmbeddedSignup() {
    console.log('[FB Connect] Button clicked, starting connection...');

    if (!window.supabaseConfig?.isSupabaseConfigured()) {
      console.log('[FB Connect] Supabase not configured');
      this._toast('Supabase not configured. Please set up your environment.', 'error');
      return;
    }

    const configId = window.supabaseConfig?.whatsappConfigId;
    console.log('[FB Connect] Config ID:', configId);

    if (!configId) {
      console.log('[FB Connect] WhatsApp config ID missing');
      this._toast('WhatsApp config ID not configured.', 'error');
      return;
    }

    console.log('[FB Connect] FB object exists:', typeof window.FB);
    if (typeof window.FB === 'undefined') {
      console.log('[FB Connect] FB SDK not loaded, loading now...');
      await this._loadFbSdk();
    }

    if (typeof window.FB === 'undefined' || !window.FB.__initialized) {
      console.log('[FB Connect] FB not initialized, initializing...');
      this._initFb();
    }

    if (typeof window.FB === 'undefined' || !window.FB.__initialized) {
      console.error('[FB Connect] FB failed to initialize - check Meta App ID');
      this._toast('Facebook SDK failed to initialize. Check Meta App ID configuration.', 'error');
      return;
    }

    window.__wa_signup_result = null;
    window.__wa_signup_cancelled = false;
    this._waSignupError = null;

    const timeout = setTimeout(() => {
      console.log('[FB Connect] Connection timed out');
      this._toast('Connection timed out, please try again', 'error');
    }, 60000);

    console.log('[FB Connect] Calling FB.login...');

    window.FB.login((response) => {
      console.log('[FB Connect] FB.login response:', response);

      if (!response.authResponse) {
        clearTimeout(timeout);
        console.log('[FB Connect] Login cancelled or failed');
        this._toast('Login was cancelled or failed', 'error');
        return;
      }

      const code = response.authResponse.code;
      console.log('[FB Connect] Got auth code:', code);

      const waitForSignupData = setInterval(async () => {
        if (window.__wa_signup_cancelled) {
          clearInterval(waitForSignupData);
          clearTimeout(timeout);
          this._toast(this._waSignupError || 'Signup cancelled', 'error');
          return;
        }

        if (window.__wa_signup_result) {
          clearInterval(waitForSignupData);
          clearTimeout(timeout);
          const { waba_id, phone_number_id } = window.__wa_signup_result;
          delete window.__wa_signup_result;

          try {
            const org = window.appState.getCurrentOrg();
            const edgeUrl = window.supabaseConfig.getEdgeFunctionUrl('meta-oauth-exchange');
            console.log('[FB Connect] Edge function URL:', edgeUrl);

            if (!edgeUrl) throw new Error('Edge function URL not configured');

            console.log('[FB Connect] Calling edge function...');
            const res = await fetch(edgeUrl, {
              method: 'POST',
              headers: window.supabaseConfig.getAuthHeaders(),
              body: JSON.stringify({
                mode: 'embedded_signup',
                code,
                wabaId: waba_id,
                phoneNumberId: phone_number_id,
                organizationId: org.id
              })
            });

            const data = await res.json();
            console.log('[FB Connect] Edge function response:', data);

            if (!res.ok || !data.success) {
              throw new Error(data.error || 'Failed to complete connection');
            }

            const currentOrg = window.appState.getCurrentOrg();
            currentOrg.whatsappConnected = true;
            currentOrg.whatsappNumber = data.phone_number;
            currentOrg.wabaId = data.waba_id;
            currentOrg.whatsappProvider = 'Meta Embedded Signup';
            window.appState.saveState();
            window.appState.emit('whatsappConnectionChanged', { status: 'CONNECTED' });
            this._toast(`WhatsApp connected: ${data.phone_number}`, 'success');
            this._renderCards();
          } catch (err) {
            console.error('[FB Connect] Edge function error:', err);
            this._toast(err.message || 'Failed to complete connection', 'error');
          }
        }
      }, 500);
    }, {
      config_id: configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: {
        setup: {},
        feature: 'whatsapp_embedded_signup',
        sessionInfoVersion: '3'
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     HELPERS
     ══════════════════════════════════════════════════════════════════════ */

  /** Generate a client-side masked representation for demo mode */
  _generateMask(raw) {
    if (!raw || raw.length < 5) return '••••';
    const prefix = raw.slice(0, 6);
    const suffix = raw.slice(-4);
    return `${prefix}••••••••${suffix}`;
  }

  /** Extract prefix portion from a stored masked value for display */
  _maskedPrefix(masked) {
    if (!masked) return '';
    // Handle both backend format (prefix••••••••suffix) and legacy
    const parts = masked.split('••••••••');
    if (parts.length >= 2) return parts[0];
    return masked.length > 10 ? masked.slice(0, 6) : masked.slice(0, 3);
  }

  /** Extract suffix portion from a stored masked value for display */
  _maskedSuffix(masked) {
    if (!masked) return '';
    const parts = masked.split('••••••••');
    if (parts.length >= 2) return parts[parts.length - 1];
    return masked.length > 6 ? masked.slice(-4) : masked.slice(-2);
  }

  _simulateApiCall(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /* ── localStorage helpers (only persist MASKED value, never raw key) ── */
  _persistToStorage(ig) {
    try {
      const stored = JSON.parse(localStorage.getItem('nexuslead_integrations') || '{}');
      stored[ig.id] = { status: ig.status, maskedValue: ig.maskedValue, dbId: ig.dbId };
      localStorage.setItem('nexuslead_integrations', JSON.stringify(stored));
    } catch (_) { /* ignore */ }
  }

  _removeFromStorage(id) {
    try {
      const stored = JSON.parse(localStorage.getItem('nexuslead_integrations') || '{}');
      delete stored[id];
      localStorage.setItem('nexuslead_integrations', JSON.stringify(stored));
    } catch (_) { /* ignore */ }
  }

  _loadFromStorage() {
    try {
      const stored = JSON.parse(localStorage.getItem('nexuslead_integrations') || '{}');
      Object.entries(stored).forEach(([id, data]) => {
        const ig = this.integrations.find(i => i.id === id);
        if (ig) {
          ig.status      = data.status      || 'disconnected';
          ig.maskedValue = data.maskedValue  || null;
          ig.dbId        = data.dbId         || null;
        }
      });
    } catch (_) { /* ignore */ }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Bootstrap
   ══════════════════════════════════════════════════════════════════════════ */
window.settingsIntegrationsComponent = new SettingsIntegrationsComponent();

/* Initialise after DOM + other scripts are ready */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.settingsIntegrationsComponent.init();
  });
} else {
  /* Defer slightly so other view-panel scripts finish first */
  setTimeout(() => window.settingsIntegrationsComponent.init(), 180);
}
