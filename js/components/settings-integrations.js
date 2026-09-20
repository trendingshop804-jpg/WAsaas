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

/* ── Meta App Configuration ───────────────────────────────────────────────
   Replace these values with your actual Meta App credentials.
   Alternatively, set them in js/services/supabase-config.js
   (metaAppId and whatsappConfigId fields). */

const META_APP_ID = window.supabaseConfig?.metaAppId || '';        // Your Meta App ID
const META_CONFIG_ID = window.supabaseConfig?.whatsappConfigId || '';  // WhatsApp Embedded Signup Config ID
const META_IG_CONFIG_ID = window.supabaseConfig?.instagramConfigId || ''; // Instagram Business Login Config ID (optional)

class SettingsIntegrationsComponent {
  constructor() {
    /* ── Integration definitions ────────────────────────────────────── */
    this.integrations = [
      {
        id: 'whatsapp_business',
        type: 'oauth',
        accent: 'whatsapp',
        logoClass: 'whatsapp',
        logoEmoji: '💬',
        name: 'WhatsApp Business',
        description: 'Connect your Meta WhatsApp Business Account (WABA) via OAuth to send & receive messages at scale.',
        helpText: 'Requires a verified Meta Business Account. Your WABA number must be approved at Tier-2 or above. <a href="https://business.facebook.com/wa/manage/home/" target="_blank" rel="noopener">Open Meta Business Manager →</a>',
        status: 'disconnected',
        dbId: null,
        maskedValue: null,
      },
      {
        id: 'instagram_business',
        type: 'oauth',
        accent: 'instagram',
        logoClass: 'instagram',
        logoEmoji: '📸',
        name: 'Instagram Business',
        description: 'Connect your Instagram Professional account via Meta OAuth to manage DMs, auto-reply to comments, and schedule posts.',
        helpText: 'Your Instagram account must be a <strong>Professional Account</strong> linked to a <strong>Facebook Page</strong>. <a href="https://www.facebook.com/help/1543466699359073" target="_blank" rel="noopener">How to link Instagram to a Facebook Page →</a>',
        status: 'disconnected',
        dbId: null,
        maskedValue: null,  // stores @username when connected
        instagramBusinessId: null,
        instagramPageId: null,
      },
      {
        id: 'openai_api_key',
        type: 'api_key',
        accent: 'openai',
        logoClass: 'openai',
        logoEmoji: '🤖',
        name: 'OpenAI API Key',
        description: 'Optional. Provide your own key to bypass the platform default and use your own billing quota.',
        helpText: 'Find your secret key in the <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">OpenAI API Keys dashboard →</a>. Keys start with <code>sk-</code>. The platform default is used when no key is saved.',
        placeholder: 'sk-proj-…',
        status: 'disconnected',
        dbId: null,
        maskedValue: null,
      },
      {
        id: 'stripe_api_key',
        type: 'api_key',
        accent: 'stripe',
        logoClass: 'stripe',
        logoEmoji: '💳',
        name: 'Stripe Secret Key',
        description: 'Connect Stripe to process payments and sync subscription data with NexusLead billing.',
        helpText: 'Copy your secret key from the <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener">Stripe Developers → API Keys →</a> page. Use the <strong>live</strong> key for production.',
        placeholder: 'sk_live_…',
        status: 'disconnected',
        dbId: null,
        maskedValue: null,
      },
      {
        id: 'hubspot_api_key',
        type: 'api_key',
        accent: 'hubspot',
        logoClass: 'hubspot',
        logoEmoji: '🟠',
        name: 'HubSpot Private App Token',
        description: 'Sync leads and contacts bi-directionally with HubSpot CRM.',
        helpText: 'Create a Private App in your <a href="https://app.hubspot.com/private-apps/" target="_blank" rel="noopener">HubSpot account → Settings → Private Apps →</a> and copy the access token.',
        placeholder: 'pat-na1-…',
        status: 'disconnected',
        dbId: null,
        maskedValue: null,
      },
    ];

    /* Load persisted masks from localStorage (masked only, never raw) */
    this._loadFromStorage();
  }

  init() {
    this._injectToastContainer();
    this._buildIntegrationsPanel();
    this._buildWhatsAppDebugPanel();
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

    // Align Instagram Business card status with active appState on boot
    const igCard = this.integrations.find(i => i.id === 'instagram_business');
    if (igCard && org.instagramConnected) {
      igCard.status = 'connected';
      igCard.maskedValue = org.instagramUsername ? `@${org.instagramUsername}` : 'Instagram Connected';
      igCard.instagramBusinessId = org.instagramBusinessId || null;
      igCard.instagramPageId = org.instagramPageId || null;
    }

    // Sync WhatsApp changes dynamically
    window.appState.on('whatsappConnectionChanged', (state) => {
      const currentOrg = window.appState.getCurrentOrg();
      const waInt = this.integrations.find(i => i.id === 'whatsapp_business');
      if (waInt) {
        if (currentOrg.whatsappConnected) {
          waInt.status = 'connected';
          waInt.maskedValue = currentOrg.whatsappNumber || 'WABA Connected';
        } else {
          waInt.status = 'disconnected';
          waInt.maskedValue = null;
        }
      }
      this._renderCards();
    });

    // Sync Instagram changes dynamically
    window.appState.on('instagramConnectionChanged', (state) => {
      const currentOrg = window.appState.getCurrentOrg();
      const igInt = this.integrations.find(i => i.id === 'instagram_business');
      if (igInt) {
        if (currentOrg.instagramConnected) {
          igInt.status = 'connected';
          igInt.maskedValue = currentOrg.instagramUsername ? `@${currentOrg.instagramUsername}` : 'Instagram Connected';
          igInt.instagramBusinessId = currentOrg.instagramBusinessId || null;
          igInt.instagramPageId = currentOrg.instagramPageId || null;
        } else {
          igInt.status = 'disconnected';
          igInt.maskedValue = null;
          igInt.instagramBusinessId = null;
          igInt.instagramPageId = null;
        }
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

  /* ══════════════════════════════════════════════════════════════════════
     WHATSAPP AUTOMATION DEBUG DASHBOARD
     Injected just before the integrations grid so it's always visible in
     the WhatsApp / Integrations settings tab.
     NEVER displays secrets, tokens, or credentials.
     ══════════════════════════════════════════════════════════════════════ */
  _buildWhatsAppDebugPanel() {
    /* Find the container that wraps the integrations grid */
    const grid = document.getElementById('integrations-cards-grid');
    if (!grid || document.getElementById('wa-automation-debug-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'wa-automation-debug-panel';
    panel.style.cssText = 'grid-column: 1 / -1; margin-bottom: 4px;';
    panel.innerHTML = `
      <div class="card" style="border-left: 4px solid var(--brand-whatsapp); padding: 20px 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 22px;">📊</span>
            <div>
              <div style="font-weight: 700; font-size: 15px; color: var(--text-primary);">WhatsApp Automation Status</div>
              <div style="font-size: 12px; color: var(--text-muted);">Live scheduler health · No credentials are shown here</div>
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button id="wa-debug-refresh-btn" class="btn btn-secondary btn-sm" style="font-size: 12px; gap: 6px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              Refresh
            </button>
            <button id="wa-debug-test-btn" class="btn btn-primary btn-sm" style="font-size: 12px; background: var(--brand-whatsapp); border-color: var(--brand-whatsapp);">
              🚀 Send Test WhatsApp
            </button>
          </div>
        </div>

        <!-- Status Grid -->
        <div id="wa-debug-status-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px;">
          <div class="wa-debug-stat" style="background: var(--bg-tertiary); border-radius: 8px; padding: 12px 14px; border: 1px solid var(--border-subtle);">
            <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">WhatsApp Connection</div>
            <div id="wa-stat-connection" style="font-size: 13px; font-weight: 700;">Checking…</div>
          </div>
          <div class="wa-debug-stat" style="background: var(--bg-tertiary); border-radius: 8px; padding: 12px 14px; border: 1px solid var(--border-subtle);">
            <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">Scheduler</div>
            <div id="wa-stat-scheduler" style="font-size: 13px; font-weight: 700;">Checking…</div>
          </div>
          <div class="wa-debug-stat" style="background: var(--bg-tertiary); border-radius: 8px; padding: 12px 14px; border: 1px solid var(--border-subtle);">
            <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">Last Scheduler Run</div>
            <div id="wa-stat-last-run" style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">—</div>
          </div>
          <div class="wa-debug-stat" style="background: var(--bg-tertiary); border-radius: 8px; padding: 12px 14px; border: 1px solid var(--border-subtle);">
            <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">Sent Today</div>
            <div id="wa-stat-sent-today" style="font-size: 20px; font-weight: 800; color: #34d399;">—</div>
          </div>
          <div class="wa-debug-stat" style="background: var(--bg-tertiary); border-radius: 8px; padding: 12px 14px; border: 1px solid var(--border-subtle);">
            <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">Failed Today</div>
            <div id="wa-stat-failed-today" style="font-size: 20px; font-weight: 800; color: #f87171;">—</div>
          </div>
          <div class="wa-debug-stat" style="background: var(--bg-tertiary); border-radius: 8px; padding: 12px 14px; border: 1px solid var(--border-subtle);">
            <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">Pending</div>
            <div id="wa-stat-pending" style="font-size: 20px; font-weight: 800; color: #60a5fa;">—</div>
          </div>
        </div>

        <!-- Recent Log Events -->
        <div style="margin-bottom: 8px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">Recent Scheduler Activity</div>
          <div id="wa-debug-log" style="max-height: 200px; overflow-y: auto; font-size: 11.5px; font-family: monospace; background: rgba(0,0,0,0.25); border-radius: 6px; padding: 10px; color: var(--text-secondary); border: 1px solid var(--border-subtle);">
            Loading logs…
          </div>
        </div>

        <!-- Test Send Modal -->
        <div id="wa-test-send-modal" style="display: none; margin-top: 16px; padding: 16px; background: rgba(37,211,102,0.07); border: 1px solid rgba(37,211,102,0.25); border-radius: 8px;">
          <div style="font-weight: 600; font-size: 13px; color: var(--text-primary); margin-bottom: 10px;">Send Test WhatsApp Message</div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
            This will call the real Meta WhatsApp Cloud API using your configured credentials and send an actual message to the phone number below.
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <input type="text" id="wa-test-phone-input" class="form-input" style="width: 200px; height: 36px; font-size: 13px;" placeholder="+91 98765 43210" />
            <input type="text" id="wa-test-template-input" class="form-input" style="width: 180px; height: 36px; font-size: 13px;" placeholder="Template name" value="hello_world" />
            <button id="wa-test-send-confirm-btn" class="btn btn-primary btn-sm" style="background: var(--brand-whatsapp); border-color: var(--brand-whatsapp);">Confirm & Send</button>
            <button id="wa-test-send-cancel-btn" class="btn btn-secondary btn-sm">Cancel</button>
          </div>
          <div id="wa-test-send-result" style="margin-top: 10px; font-size: 12.5px; display: none;"></div>
        </div>
      </div>
    `;
    grid.insertAdjacentElement('beforebegin', panel);

    // Bind events
    document.getElementById('wa-debug-refresh-btn')?.addEventListener('click', () => this._refreshWhatsAppDebug());
    document.getElementById('wa-debug-test-btn')?.addEventListener('click', () => this._toggleTestSendPanel());
    document.getElementById('wa-test-send-cancel-btn')?.addEventListener('click', () => {
      const modal = document.getElementById('wa-test-send-modal');
      if (modal) modal.style.display = 'none';
    });
    document.getElementById('wa-test-send-confirm-btn')?.addEventListener('click', () => this._executeTestSend());

    // Auto-load stats on mount
    this._refreshWhatsAppDebug();
  }

  _toggleTestSendPanel() {
    const modal = document.getElementById('wa-test-send-modal');
    if (!modal) return;
    const isVisible = modal.style.display !== 'none';
    modal.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      const resultEl = document.getElementById('wa-test-send-result');
      if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
    }
  }

  async _refreshWhatsAppDebug() {
    const refreshBtn = document.getElementById('wa-debug-refresh-btn');
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Loading…';
    }

    try {
      // ── 1. Check WhatsApp connection via /api/test-connection ──────────
      let connStatus = '<span style="color:#f87171;">✗ Not Connected</span>';
      let schedulerStatus = '<span style="color:#f87171;">✗ Not Running</span>';

      try {
        const connRes = await fetch('/api/test-connection');
        if (connRes.ok) {
          const connData = await connRes.json();
          if (connData.connected) {
            connStatus = `<span style="color:#34d399;">✓ Connected</span>`;
            schedulerStatus = `<span style="color:#34d399;">✓ Running (Hourly)</span>`;
          } else {
            connStatus = `<span style="color:#f87171;">✗ ${this._escHtml(connData.status || 'Not Connected')}</span>`;
            schedulerStatus = '<span style="color:#f87171;">✗ Config Missing</span>';
          }
        }
      } catch (e) {
        connStatus = '<span style="color:#fbbf24;">⚠ API Unreachable (dev server?)</span>';
        schedulerStatus = '<span style="color:#fbbf24;">⚠ Unknown</span>';
      }

      const connEl = document.getElementById('wa-stat-connection');
      const schedEl = document.getElementById('wa-stat-scheduler');
      if (connEl) connEl.innerHTML = connStatus;
      if (schedEl) schedEl.innerHTML = schedulerStatus;

      // ── 2. Load stats from Supabase (if connected) ────────────────────
      if (window.authService?.supabase) {
        const sb = window.authService.supabase;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartIso = todayStart.toISOString();

        // Count messages sent today
        const { count: sentCount } = await sb
          .from('follow_up_messages')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'Sent')
          .gte('sent_at', todayStartIso);

        // Count messages failed today
        const { count: failedCount } = await sb
          .from('follow_up_messages')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'Failed')
          .gte('created_at', todayStartIso);

        // Count pending leads with follow-up due
        const { count: pendingCount } = await sb
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('follow_up_enabled', true)
          .not('follow_up_status', 'in', '("Paused","Completed")')
          .eq('opted_out', false);

        const sentEl = document.getElementById('wa-stat-sent-today');
        const failEl = document.getElementById('wa-stat-failed-today');
        const pendEl = document.getElementById('wa-stat-pending');
        if (sentEl) sentEl.textContent = sentCount ?? '—';
        if (failEl) failEl.textContent = failedCount ?? '—';
        if (pendEl) pendEl.textContent = pendingCount ?? '—';

        // Load recent automation log entries
        const { data: logs } = await sb
          .from('whatsapp_automation_logs')
          .select('event, details, created_at, run_id')
          .order('created_at', { ascending: false })
          .limit(30);

        const logEl = document.getElementById('wa-debug-log');
        const lastRunEl = document.getElementById('wa-stat-last-run');

        if (logs && logs.length > 0) {
          // Find the most recent execution_started event for last run timestamp
          const lastRun = logs.find(l => l.event === 'execution_started' || l.event === 'execution_complete');
          if (lastRun && lastRunEl) {
            const d = new Date(lastRun.created_at);
            lastRunEl.textContent = d.toLocaleString();
          }

          if (logEl) {
            logEl.innerHTML = logs.map(log => {
              const ts = new Date(log.created_at).toLocaleTimeString();
              const eventColor = {
                message_sent:           '#34d399',
                message_failed:         '#f87171',
                execution_started:      '#60a5fa',
                execution_complete:     '#a78bfa',
                due_followups_found:    '#fbbf24',
                lead_claimed:           '#94a3b8',
                message_attempted:      '#94a3b8',
                meta_response_received: '#34d399',
                stale_locks_released:   '#fbbf24',
              }[log.event] || '#94a3b8';

              return `<div style="padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                <span style="color: #475569;">${ts}</span>
                <span style="color: ${eventColor}; font-weight: 600;"> [${this._escHtml(log.event)}]</span>
                ${log.details ? `<span style="color: #64748b;"> — ${this._escHtml(log.details)}</span>` : ''}
              </div>`;
            }).join('');
          }
        } else {
          if (logEl) logEl.textContent = 'No scheduler activity recorded yet. The cron runs hourly.';
          if (lastRunEl) lastRunEl.textContent = 'Never';
        }

      } else {
        // Not connected to Supabase — show placeholders
        ['wa-stat-sent-today', 'wa-stat-failed-today', 'wa-stat-pending'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '—';
        });
        const logEl = document.getElementById('wa-debug-log');
        if (logEl) logEl.textContent = 'Connect to Supabase to see scheduler logs.';
      }
    } catch (err) {
      console.warn('[WADebug] Refresh error:', err.message);
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Refresh`;
      }
    }
  }

  async _executeTestSend() {
    const phoneInput    = document.getElementById('wa-test-phone-input');
    const templateInput = document.getElementById('wa-test-template-input');
    const resultEl      = document.getElementById('wa-test-send-result');
    const confirmBtn    = document.getElementById('wa-test-send-confirm-btn');

    const phone    = phoneInput?.value?.trim();
    const template = templateInput?.value?.trim() || 'hello_world';

    if (!phone) {
      if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.innerHTML = '<span style="color:#f87171;">⚠️ Please enter a phone number.</span>';
      }
      return;
    }

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Sending…';
    }
    if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }

    try {
      // Call the backend Edge function directly — credentials stay server-side
      const response = await fetch('/api/send-whatsapp-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          templateName: template,
          stage:        'Test Message',
          // Use a synthetic leadId so the API can look up / create the lead
          direct_phone: phone,
        }),
      });

      const data = await response.json();

      if (resultEl) {
        resultEl.style.display = 'block';
        if (response.ok && data.success) {
          resultEl.innerHTML = `<span style="color:#34d399;">✅ Test WhatsApp message sent successfully via Meta Cloud API.<br>Message ID: ${this._escHtml(data.whatsappMessageId || 'N/A')}</span>`;
          this._toast('Test WhatsApp Sent ✅', 'Real message dispatched via Meta Cloud API.', 'success');
        } else {
          const errMsg = data?.error || 'Unknown error from API.';
          const hint = errMsg.toLowerCase().includes('not configured') || data?.missing
            ? '<br><strong>Hint:</strong> Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in Vercel → Settings → Environment Variables.'
            : '';
          resultEl.innerHTML = `<span style="color:#f87171;">❌ Test failed: ${this._escHtml(errMsg)}${hint}</span>`;
          this._toast('Test Failed ⚠️', errMsg, 'error');
        }
      }
    } catch (err) {
      if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.innerHTML = `<span style="color:#f87171;">❌ Network error: ${this._escHtml(err.message)}. Is the dev server running?</span>`;
      }
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm & Send';
      }
    }
  }

  _escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
      connected: 'Connected',
      disconnected: 'Not Connected',
      error: 'Error',
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

    /* OAuth connect button — Facebook branding for WhatsApp, Instagram branding for IG */
    const oauthSection = ig.type === 'oauth' && !isConnected ? (
      ig.id === 'instagram_business' ? `
      <button class="btn-oauth-connect btn-meta-instagram" id="btn-oauth-${ig.id}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="none">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="white" opacity="0.15"/>
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" fill="white"/>
        </svg>
        Connect with Instagram
      </button>` : `
      <button class="btn-oauth-connect btn-meta-facebook" id="btn-oauth-${ig.id}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        Continue with Facebook
      </button>`
    ) : '';

    /* Connected account display */
    let connectedAccountBlock = '';
    if (ig.type === 'oauth' && isConnected) {
      if (ig.id === 'instagram_business') {
        connectedAccountBlock = `
        <div class="connected-account-display" id="connected-account-${ig.id}">
          <div class="connected-account-info instagram">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            <span class="connected-account-value">${ig.maskedValue || 'Instagram Connected'}</span>
          </div>
        </div>`;
      } else {
        connectedAccountBlock = `
        <div class="connected-account-display" id="connected-account-${ig.id}">
          <div class="connected-account-info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            <span class="connected-account-value">${ig.maskedValue || 'WhatsApp Connected'}</span>
          </div>
        </div>`;
      }
    }

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
        const inp = document.getElementById(`api-key-input-${ig.id}`);
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
        } else if (ig.id === 'instagram_business') {
          this._handleInstagramEmbeddedSignup();
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

    const input = document.getElementById(`api-key-input-${integrationId}`);
    const saveBtn = document.getElementById(`btn-save-${integrationId}`);
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

        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: window.supabaseConfig.getAuthHeaders(),
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);

        ig.dbId = data.id || ig.dbId;
        maskedValue = data.masked_value;
      } else {
        /* ── Demo fallback (no Supabase project configured) ──────────── */
        await this._simulateApiCall(900);
        maskedValue = this._generateMask(rawValue);
      }

      ig.maskedValue = maskedValue;
      ig.status = 'connected';

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

    if (!confirm(`Disconnect ${ig.name}? This cannot be undone.`)) return;

    try {
      if (integrationId === 'whatsapp_business') {
        window.whatsappService.disconnect();

      } else if (integrationId === 'instagram_business') {
        /* ── Instagram disconnect: clear DB row + appState ──────────── */
        const org = window.appState.getCurrentOrg();
        if (window.supabaseConfig?.isSupabaseConfigured() && org.id) {
          const res = await fetch('/api/instagram?action=disconnect', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              organizationId: org.id,
              instagramBusinessId: ig.instagramBusinessId || org.instagramBusinessId
            })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok && data.error) throw new Error(data.error);
        }

        /* Clear local app state */
        org.instagramConnected = false;
        org.instagramUsername = null;
        org.instagramBusinessId = null;
        org.instagramPageId = null;
        window.appState.saveState();
        window.appState.emit('instagramConnectionChanged', { status: 'DISCONNECTED' });

        ig.status = 'disconnected';
        ig.maskedValue = null;
        ig.instagramBusinessId = null;
        ig.instagramPageId = null;
        ig.dbId = null;
        this._removeFromStorage(ig.id);

      } else {
        if (window.supabaseConfig?.isSupabaseConfigured() && ig.dbId) {
          const fnUrl = window.supabaseConfig.getEdgeFunctionUrl(
            window.supabaseConfig.integrationsFunctionName
          );
          const res = await fetch(`${fnUrl}?id=${encodeURIComponent(ig.dbId)}`, {
            method: 'DELETE',
            headers: window.supabaseConfig.getAuthHeaders(),
          });
          const data = await res.json();
          if (!res.ok && data.error) throw new Error(data.error);
        } else {
          await this._simulateApiCall(600);
        }

        ig.status = 'disconnected';
        ig.maskedValue = null;
        ig.dbId = null;
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
    const ig = this.integrations.find(i => i.id === integrationId);
    const testBtn = document.getElementById(`btn-test-${integrationId}`);
    const resultEl = document.getElementById(`test-result-${integrationId}`);
    const statusBadge = document.getElementById(`status-badge-${integrationId}`);

    if (!ig) return;

    if (testBtn) {
      testBtn.disabled = true;
      testBtn.innerHTML = `<span class="spinner-xs"></span> Testing…`;
    }
    if (statusBadge) {
      statusBadge.className = 'integration-status-badge testing';
      statusBadge.textContent = 'Testing…';
    }
    if (resultEl) {
      resultEl.className = 'test-result-inline';
      resultEl.textContent = '';
    }

    let success, msg;

    try {
      if (window.supabaseConfig?.isSupabaseConfigured() && ig.dbId) {
        /* ── Real Edge Function test call ────────────────────────────── */
        const fnUrl = window.supabaseConfig.getEdgeFunctionUrl(
          window.supabaseConfig.integrationsFunctionName
        );
        const res = await fetch(`${fnUrl}/test`, {
          method: 'POST',
          headers: window.supabaseConfig.getAuthHeaders(),
          body: JSON.stringify({ key_id: ig.dbId }),
        });
        const data = await res.json();
        success = data.ok;
        msg = data.message;
      } else {
        /* ── Demo simulation ─────────────────────────────────────────── */
        await this._simulateApiCall(1400);
        success = Math.random() > 0.1;   // 90% success rate in demo
        const messages = {
          whatsapp_business: { ok: 'WABA token valid · Tier-2 (1,000 msg/day)', err: 'Invalid token or WABA account suspended' },
          openai_api_key: { ok: 'API key valid · gpt-4o accessible', err: 'Unauthorized — check key or billing status' },
          stripe_api_key: { ok: 'Live key authenticated · account active', err: 'Invalid key or restricted permissions' },
          hubspot_api_key: { ok: 'Access token valid · CRM scope granted', err: 'Token expired or missing CRM scope' },
        };
        msg = success
          ? (messages[integrationId]?.ok || 'Connection successful')
          : (messages[integrationId]?.err || 'Connection failed');
      }
    } catch (err) {
      success = false;
      msg = `Network error: ${err.message}`;
    }

    /* Update status badge */
    ig.status = success ? 'connected' : 'error';
    if (statusBadge) {
      statusBadge.className = `integration-status-badge ${ig.status}`;
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
      const res = await fetch(fnUrl, {
        method: 'GET',
        headers: window.supabaseConfig.getAuthHeaders(),
      });

      if (!res.ok) return;

      const { keys } = await res.json();
      if (!Array.isArray(keys)) return;

      /* Merge server state into local integration definitions */
      keys.forEach(row => {
        const ig = this.integrations.find(i => i.id === row.key_name);
        if (ig) {
          ig.status = 'connected';
          ig.maskedValue = row.masked_value;
          ig.dbId = row.id;
        }
      });

      this._renderCards();
    } catch (_) { /* Network unavailable — silently ignore */ }

    /* ── Also fetch Instagram connection status from Supabase ─────── */
    try {
      const org = window.appState.getCurrentOrg();
      if (!org?.id || !window.supabaseConfig?.isSupabaseConfigured()) return;

      // Use the anon key + user JWT to query instagram_connections (RLS-protected)
      const headers = window.supabaseConfig.getAuthHeaders();
      const sbUrl = `${window.supabaseConfig.projectUrl}/rest/v1/instagram_connections?organization_id=eq.${encodeURIComponent(org.id)}&is_active=eq.true&select=id,instagram_business_id,instagram_username,page_id&limit=1`;
      const igRes = await fetch(sbUrl, {
        headers: { ...headers, 'apikey': window.supabaseConfig.anonKey }
      });
      if (!igRes.ok) return;

      const igRows = await igRes.json();
      const igCard = this.integrations.find(i => i.id === 'instagram_business');
      if (igCard && Array.isArray(igRows) && igRows.length > 0) {
        const row = igRows[0];
        igCard.status = 'connected';
        igCard.maskedValue = row.instagram_username ? `@${row.instagram_username}` : 'Instagram Connected';
        igCard.instagramBusinessId = row.instagram_business_id;
        igCard.instagramPageId = row.page_id;
        igCard.dbId = row.id;

        /* Sync into appState so Instagram Manager also picks it up */
        const currentOrg = window.appState.getCurrentOrg();
        if (!currentOrg.instagramConnected) {
          currentOrg.instagramConnected = true;
          currentOrg.instagramUsername = row.instagram_username || null;
          currentOrg.instagramBusinessId = row.instagram_business_id;
          currentOrg.instagramPageId = row.page_id;
          window.appState.saveState();
          window.appState.emit('instagramConnectionChanged', { status: 'CONNECTED' });
        }
        this._renderCards();
      }
    } catch (_) { /* silently ignore */ }
  }

  _handleInstagramEmbeddedSignup() {
    if (window.instagramManagerComponent?.openManualConnectModal) {
      window.instagramManagerComponent.openManualConnectModal();
    } else {
      const modal = document.getElementById('ig-manual-connect-modal');
      if (modal) {
        modal.classList.add('active');
        modal.style.display = '';
      } else {
        if (window.navigationComponent) {
          window.navigationComponent.switchView('instagram');
        }
      }
    }
  }

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
      error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
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

      window.fbAsyncInit = () => {
        console.log('[FB Connect] fbAsyncInit called');
        this._initFb();
        resolve();
      };

      const script = document.createElement('script');
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.onerror = (err) => {
        console.error('[FB Connect] Failed to load FB SDK script');
        reject(err);
      };
      document.body.appendChild(script);
    });
  }

  _initFb() {
    const appId = META_APP_ID;
    console.log('[FB Connect] Initializing FB with appId:', appId || '(empty)');

    if (!appId) {
      console.warn('[FB Connect] No Meta App ID configured - FB will not be initialized');
      return;
    }

    window.FB.init({
      appId: appId,
      autoLogAppEvents: true,
      xfbml: true,
      version: 'v26.0'
    });
    window.FB.__initialized = true;
    console.log('[FB Connect] FB.init() called successfully');
  }

  _bindFbMessageListener() {
    window.addEventListener('message', (event) => {
      if (!event.origin.endsWith('facebook.com')) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          console.log('[FB Connect] message event:', data);
          if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA' || data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
            const { phone_number_id, waba_id, business_id } = data.data;
            window.__wa_signup_result = { phone_number_id, waba_id, business_id };
          }
          if (data.event === 'CANCEL') {
            this._waSignupError = data.data?.error_message || 'Signup cancelled';
            window.__wa_signup_cancelled = true;
          }
        }
      } catch (e) {
        console.log('[FB Connect] message event:', event.data);
      }
    });
  }

  async _handleEmbeddedSignup() {
    console.log('[FB Connect] Button clicked, starting connection...');

    if (!META_APP_ID || !META_CONFIG_ID) {
      console.error('[FB Connect] Meta App ID or Config ID not configured');
      this._toast('Meta App credentials not configured. Please set META_APP_ID and META_CONFIG_ID.', 'error');
      return;
    }

    if (!window.supabaseConfig?.isSupabaseConfigured()) {
      console.log('[FB Connect] Supabase not configured');
      this._toast('Supabase not configured. Please set up your environment.', 'error');
      return;
    }

    const btn = document.getElementById('btn-oauth-whatsapp_business');
    const originalBtnText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-xs"></span> Connecting…`;
    }

    try {
      await this._loadFbSdk();

      if (typeof window.FB === 'undefined' || !window.FB.__initialized) {
        this._initFb();
      }

      if (typeof window.FB === 'undefined' || !window.FB.__initialized) {
        throw new Error('Facebook SDK failed to initialize');
      }

      console.log('[FB Connect] Calling FB.login...');

      window.FB.login(function (response) {
        console.log('[FB Connect] FB.login response:', response);

        if (!response.authResponse) {
          console.log('[FB Connect] User cancelled login or did not fully authorize.');
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnText;
          }
          return;
        }

        const code = response.authResponse.code;
        console.log('[FB Connect] Got auth code');

        const edgeUrl = window.supabaseConfig.getEdgeFunctionUrl('meta-oauth-exchange');
        console.log('[FB Connect] Edge function URL:', edgeUrl);

        if (!edgeUrl) {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnText;
          }
          this._toast('Edge function URL not configured', 'error');
          return;
        }

        const org = window.appState.getCurrentOrg();
        fetch(edgeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, organizationId: org.id })
        })
          .then(res => res.json())
          .then(data => {
            console.log('[FB Connect] Edge function response:', data);
            if (data.error) throw new Error(data.error);

            const org = window.appState.getCurrentOrg();
            org.whatsappConnected = true;
            org.whatsappNumber = data.phone_number || 'WhatsApp Connected';
            org.wabaId = data.waba_id;
            org.whatsappProvider = 'Meta Embedded Signup';
            window.appState.saveState();
            window.appState.emit('whatsappConnectionChanged', { status: 'CONNECTED' });

            this._toast('WhatsApp connected successfully!', 'success');
            this._renderCards();
          })
          .catch(err => {
            console.error('[FB Connect] Error:', err);
            this._toast(err.message || 'Failed to complete connection', 'error');
            if (btn) {
              btn.disabled = false;
              btn.innerHTML = originalBtnText;
            }
          });
      }.bind(this), {
        config_id: META_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {}
        }
      });
    } catch (err) {
      console.error('[FB Connect] Connection error:', err);
      this._toast(err.message || 'Failed to start connection', 'error');

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     INSTAGRAM EMBEDDED SIGNUP
     Requests Instagram-specific scopes and exchanges the token for a
     long-lived user token via the existing meta-oauth-exchange function.
     ══════════════════════════════════════════════════════════════════════ */
  async _handleInstagramEmbeddedSignup() {
    console.log('[IG Connect] Button clicked, starting Instagram connection...');

    const metaAppId = window.supabaseConfig?.metaAppId || META_APP_ID || '1480548923617105';
    const igConfigId = window.supabaseConfig?.instagramConfigId || META_IG_CONFIG_ID || '4616502125294134';

    if (!metaAppId) {
      this._toast('Meta App ID not configured. Please set META_APP_ID in your environment.', 'error');
      return;
    }

    if (!window.supabaseConfig?.isSupabaseConfigured()) {
      this._toast('Supabase not configured. Please set up your environment.', 'error');
      return;
    }

    const btn = document.getElementById('btn-oauth-instagram_business');
    const originalBtnText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-xs"></span> Connecting…`;
    }

    const restoreBtn = () => {
      if (btn) { btn.disabled = false; btn.innerHTML = originalBtnText; }
    };

    try {
      await this._loadFbSdk();

      if (typeof window.FB === 'undefined' || !window.FB.__initialized) {
        this._initFb();
      }

      if (typeof window.FB === 'undefined' || !window.FB.__initialized) {
        throw new Error('Facebook SDK failed to initialize');
      }

      // Instagram-specific scope set
      const igScopes = 'instagram_basic,instagram_manage_messages,pages_show_list,pages_manage_metadata,business_management';

      // Build the FB.login options — use embedded signup config if available
      const loginOptions = igConfigId
        ? {
          config_id: igConfigId,
          response_type: 'code',
          override_default_response_type: true,
          extras: { setup: {} }
        }
        : { scope: igScopes, return_scopes: true };

      console.log('[IG Connect] Calling FB.login with options:', loginOptions);

      window.FB.login((response) => {
        console.log('[IG Connect] FB.login response:', response);

        if (!response.authResponse) {
          console.log('[IG Connect] User cancelled or did not authorize.');
          restoreBtn();
          return;
        }

        const accessToken = response.authResponse.accessToken;
        const code = response.authResponse.code;

        if (!accessToken && !code) {
          this._toast('No access token or authorization code received from Facebook.', 'error');
          restoreBtn();
          return;
        }

        const edgeUrl = window.supabaseConfig.getEdgeFunctionUrl('meta-oauth-exchange');
        if (!edgeUrl) {
          this._toast('Edge function URL not configured.', 'error');
          restoreBtn();
          return;
        }

        const org = window.appState.getCurrentOrg();

        const reqBody = code
          ? { code, organizationId: org.id, mode: 'code_exchange' }
          : { accessToken, organizationId: org.id, mode: 'auto' };

        fetch(edgeUrl, {
          method: 'POST',
          headers: window.supabaseConfig.getAuthHeaders(),
          body: JSON.stringify(reqBody)
        })
          .then(async res => {
            const text = await res.text();
            let data;
            try {
              data = JSON.parse(text);
            } catch (_) {
              throw new Error(`Server returned non-JSON response (${res.status}): ${text.slice(0, 100)}`);
            }
            if (!res.ok || data.error) {
              throw new Error(data?.error || `Edge function error (${res.status})`);
            }
            return data;
          })
          .then(data => {
            console.log('[IG Connect] Edge function response:', data);

            const igAccounts = data.instagram || [];

            if (igAccounts.length === 0) {
              // Clear, actionable error for the most common failure case
              throw new Error(
                'No Instagram Business Account found linked to your Facebook Pages. ' +
                'Please go to your Facebook Page Settings → Instagram → and link your Instagram Professional Account first.'
              );
            }

            // Apply connection state from first Instagram account
            const ig = igAccounts[0];
            const currentOrg = window.appState.getCurrentOrg();
            currentOrg.instagramConnected = true;
            currentOrg.instagramUsername = ig.username;
            currentOrg.instagramBusinessId = ig.instagramBusinessId;
            currentOrg.instagramPageId = ig.pageId;
            window.appState.saveState();
            window.appState.emit('instagramConnectionChanged', { status: 'CONNECTED', account: ig });
            window.appState.addAuditLog(
              'Instagram Connected',
              ig.username || 'Instagram',
              `Connected Instagram account @${ig.username} (Page: ${ig.pageName}).`,
              'Connected'
            );

            // Update card immediately
            const igCard = this.integrations.find(i => i.id === 'instagram_business');
            if (igCard) {
              igCard.status = 'connected';
              igCard.maskedValue = `@${ig.username}`;
              igCard.instagramBusinessId = ig.instagramBusinessId;
              igCard.instagramPageId = ig.pageId;
            }

            this._toast(`Instagram @${ig.username} connected successfully!`, 'success');
            this._renderCards();
          })
          .catch(err => {
            console.error('[IG Connect] Error:', err);
            // Show the "link your Instagram" message prominently
            const isLinkingError = err.message.includes('No Instagram Business Account');
            this._toast(
              isLinkingError
                ? '⚠️ No Instagram Business Account found. Please link your Instagram Professional Account to a Facebook Page first, then try again.'
                : (err.message || 'Failed to connect Instagram'),
              'error'
            );
            restoreBtn();
          });
      }, loginOptions);
    } catch (err) {
      console.error('[IG Connect] Connection error:', err);
      this._toast(err.message || 'Failed to start Instagram connection', 'error');
      restoreBtn();
    }
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
          ig.status = data.status || 'disconnected';
          ig.maskedValue = data.maskedValue || null;
          ig.dbId = data.dbId || null;
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
