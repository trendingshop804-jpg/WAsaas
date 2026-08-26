/* ==========================================================================
   NexusLead AI - WhatsApp Connections & Provider Hub
   Supports:
     - Method A1: Meta Permanent Access Token / System User (Recommended)
     - Method A2: Official Facebook Login OAuth Dialog (Popup)
     - Method A3: Sandbox Simulator
     - Method B:  Authorized QR Gateway Provider
   ========================================================================== */

class WhatsAppConnectComponent {
  constructor() {
    this.currentMethod = 'meta'; // 'meta' or 'qr'
    this.qrState = 'IDLE'; // 'IDLE', 'QR_GENERATING', 'WAITING_FOR_SCAN', 'CONNECTING', 'CONNECTED', 'EXPIRED'
    this.metaMode = 'token'; // 'token' | 'real' | 'simulated'
    this.metaAccessToken = null;
  }

  init() {
    this.bindEvents();
    this.render();

    window.appState.on('whatsappConnectionChanged', () => this.render());
    window.appState.on('orgChanged', () => this.render());
  }

  bindEvents() {
    // Method selector tabs (Meta vs QR)
    document.querySelectorAll('.wa-method-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.wa-method-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentMethod = tab.getAttribute('data-method');
        this.render();
      });
    });

    // Method A: Open Meta OAuth Modal
    const metaConnectBtn = document.getElementById('connect-meta-oauth-btn');
    if (metaConnectBtn) {
      metaConnectBtn.addEventListener('click', () => this.openMetaOAuthModal());
    }

    // Method A: Mode toggling inside modal (Token vs FB OAuth vs Simulated)
    document.addEventListener('click', (e) => {
      if (e.target.id === 'meta-btn-mode-token') {
        this.switchMetaMode('token');
      } else if (e.target.id === 'meta-btn-mode-real') {
        this.switchMetaMode('real');
      } else if (e.target.id === 'meta-btn-mode-sim') {
        this.switchMetaMode('simulated');
      }
    });

    // Method A: Real Meta Login button trigger (OAuth popup)
    document.addEventListener('click', async (e) => {
      if (e.target.closest('#meta-real-login-btn')) {
        await this.handleRealMetaLogin();
      }
    });

    // Method A: Real Meta Dropdowns cascading
    document.addEventListener('change', async (e) => {
      if (e.target.id === 'meta-real-business-select') {
        await this.handleBusinessSelection();
      } else if (e.target.id === 'meta-real-waba-select') {
        await this.handleWABASelection();
      }
    });

    // Method A: Meta Modal Submit
    const metaModalSubmit = document.getElementById('meta-oauth-submit-btn');
    if (metaModalSubmit) {
      metaModalSubmit.addEventListener('click', () => this.handleMetaOAuthSubmit());
    }

    // Method B: Generate QR Code button
    const generateQrBtn = document.getElementById('generate-qr-btn');
    if (generateQrBtn) {
      generateQrBtn.addEventListener('click', () => this.startQRGeneration());
    }

    // Method B: Refresh QR button
    const refreshQrBtn = document.getElementById('refresh-qr-btn');
    if (refreshQrBtn) {
      refreshQrBtn.addEventListener('click', () => this.startQRGeneration());
    }

    // Method B: Simulate phone scan button
    const simulateScanBtn = document.getElementById('simulate-qr-scan-btn');
    if (simulateScanBtn) {
      simulateScanBtn.addEventListener('click', () => this.handleSimulateQRScan());
    }

    // Disconnect buttons
    document.querySelectorAll('.wa-disconnect-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Disconnect your active WhatsApp connection? All outbound live campaigns will be paused.')) {
          window.whatsappService.disconnect();
        }
      });
    });
  }

  render() {
    const org = window.appState.getCurrentOrg();
    const isConnected = org.whatsappConnected;

    const metaView = document.getElementById('wa-method-meta-view');
    const qrView = document.getElementById('wa-method-qr-view');

    if (metaView) metaView.style.display = this.currentMethod === 'meta' ? 'block' : 'none';
    if (qrView) qrView.style.display = this.currentMethod === 'qr' ? 'block' : 'none';

    // Status Banner
    const statusBanner = document.getElementById('wa-global-status-banner');
    if (statusBanner) {
      if (isConnected) {
        statusBanner.className = 'card';
        statusBanner.style.borderColor = 'rgba(37, 211, 102, 0.4)';
        statusBanner.style.background = 'rgba(37, 211, 102, 0.06)';
        statusBanner.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div style="width: 40px; height: 40px; border-radius: 50%; background: #25d366; color: white; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                ✓
              </div>
              <div>
                <div style="font-size: 15px; font-weight: 700; color: var(--text-primary);">WhatsApp Connected & Verified</div>
                <div style="font-size: 12.5px; color: var(--text-secondary);">
                  Active Number: <strong class="font-mono" style="color: var(--brand-whatsapp);">${org.whatsappNumber}</strong> · Provider: <strong>${org.whatsappProvider}</strong>
                </div>
              </div>
            </div>
            <button class="btn btn-outline btn-sm wa-disconnect-btn" style="border-color: var(--status-danger); color: var(--status-danger);">
              Disconnect Account
            </button>
          </div>
        `;
        // Rebind disconnect
        statusBanner.querySelector('.wa-disconnect-btn').addEventListener('click', () => {
          if (confirm('Disconnect WhatsApp?')) window.whatsappService.disconnect();
        });
      } else {
        statusBanner.className = 'card';
        statusBanner.style.borderColor = 'var(--border-subtle)';
        statusBanner.style.background = 'var(--bg-card)';
        statusBanner.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--bg-tertiary); color: var(--text-muted); display: flex; align-items: center; justify-content: center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              </div>
              <div>
                <div style="font-size: 15px; font-weight: 700; color: var(--text-primary);">No WhatsApp Account Connected</div>
                <div style="font-size: 12.5px; color: var(--text-muted);">
                  Connect via Permanent Token, Meta OAuth, or scan QR code to activate automated sales outreach.
                </div>
              </div>
            </div>
            <span class="badge badge-unqualified">Disconnected</span>
          </div>
        `;
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     META OAUTH MODAL LIFE CYCLE & TAB HANDLERS
     ══════════════════════════════════════════════════════════════════════ */
  openMetaOAuthModal() {
    const modal = document.getElementById('meta-oauth-modal');
    if (modal) {
      modal.classList.add('active');
      this.switchMetaMode('token'); // Default to recommended Permanent Token mode
    }
  }

  switchMetaMode(mode) {
    this.metaMode = mode;
    const btnToken = document.getElementById('meta-btn-mode-token');
    const btnReal  = document.getElementById('meta-btn-mode-real');
    const btnSim   = document.getElementById('meta-btn-mode-sim');

    const secToken = document.getElementById('meta-section-token');
    const secReal  = document.getElementById('meta-section-real');
    const secSim   = document.getElementById('meta-section-simulated');

    if (btnToken) btnToken.classList.toggle('active', mode === 'token');
    if (btnReal)  btnReal.classList.toggle('active', mode === 'real');
    if (btnSim)   btnSim.classList.toggle('active', mode === 'simulated');

    if (secToken) secToken.style.display = (mode === 'token') ? 'block' : 'none';
    if (secReal)  secReal.style.display  = (mode === 'real')  ? 'block' : 'none';
    if (secSim)   secSim.style.display   = (mode === 'simulated') ? 'block' : 'none';
  }

  /* ── Load Meta Facebook JS SDK dynamically ──────────────────────────── */
  _loadFbSdk() {
    return new Promise((resolve, reject) => {
      if (window.FB) return resolve();

      window.fbAsyncInit = function() {
        resolve();
      };

      try {
        const id = 'facebook-jssdk';
        if (document.getElementById(id)) return resolve();
        const fjs = document.getElementsByTagName('script')[0];
        const js = document.createElement('script');
        js.id = id;
        js.src = "https://connect.facebook.net/en_US/sdk.js";
        fjs.parentNode.insertBefore(js, fjs);
      } catch (err) {
        reject(new Error('Failed to load Meta SDK script: ' + err.message));
      }
    });
  }

  /* ── Start Meta OAuth Connection (pre-configured App ID) ─────────────── */
  async startMetaOAuthConnection() {
    if (!window.supabaseConfig || !window.supabaseConfig.isSupabaseConfigured()) {
      this._showDemoModeModal();
      return;
    }

    const metaAppId = window.supabaseConfig.metaAppId;
    if (!metaAppId) {
      alert('Meta App ID is not configured. Please set META_APP_ID in your environment.');
      return;
    }

    try {
      await this._loadFbSdk();

      FB.init({
        appId: metaAppId,
        cookie: true,
        xfbml: true,
        version: 'v21.0'
      });

      FB.login(async (response) => {
        if (response.authResponse) {
          await this._handleFbLoginSuccess(response.authResponse.accessToken);
        } else {
          console.info('[Meta OAuth]: User cancelled login or did not fully authorize.');
        }
      }, {
        scope: 'whatsapp_business_management,whatsapp_business_messaging,instagram_basic,instagram_manage_messages,pages_show_list,pages_read_engagement'
      });
    } catch (err) {
      alert('Failed to load Facebook SDK: ' + err.message);
    }
  }

  async _handleFbLoginSuccess(accessToken) {
    const discoveryResult = await this._discoverAccounts(accessToken);
    if (!discoveryResult) return;
    this._showAccountPicker(discoveryResult);
  }

  async _discoverAccounts(accessToken) {
    try {
      const org = window.appState.getCurrentOrg();
      const edgeUrl = window.supabaseConfig.getEdgeFunctionUrl('meta-oauth-exchange');
      if (!edgeUrl) return null;

      const response = await fetch(edgeUrl, {
        method: 'POST',
        headers: window.supabaseConfig.getAuthHeaders(),
        body: JSON.stringify({
          accessToken,
          organizationId: org.id,
          mode: 'discover'
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Discovery failed');
      return result;
    } catch (e) {
      alert('Account discovery failed: ' + e.message);
      return null;
    }
  }

  async _saveSelectedAccounts(encryptedToken, wabaIndex, phoneIndex, instagramIndices) {
    try {
      const org = window.appState.getCurrentOrg();
      const edgeUrl = window.supabaseConfig.getEdgeFunctionUrl('meta-oauth-exchange');
      if (!edgeUrl) return null;

      const response = await fetch(edgeUrl, {
        method: 'POST',
        headers: window.supabaseConfig.getAuthHeaders(),
        body: JSON.stringify({
          accessToken: encryptedToken,
          organizationId: org.id,
          mode: 'save_selected',
          wabaIndex,
          phoneIndex,
          instagramIndices
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed');
      return result;
    } catch (e) {
      alert('Save failed: ' + e.message);
      return null;
    }
  }

  _showAccountPicker(discovery) {
    const modal = document.getElementById('meta-account-picker-modal');
    if (!modal) {
      this._createAccountPickerModal();
      return this._showAccountPicker(discovery);
    }

    const wabaOptions = modal.querySelector('#meta-picker-waba-options');
    const igOptions = modal.querySelector('#meta-picker-ig-options');

    if (wabaOptions) {
      wabaOptions.innerHTML = '';
      let idx = 0;
      discovery.wabas.forEach((waba, wabaIdx) => {
        waba.phoneNumbers.forEach((phone, phoneIdx) => {
          wabaOptions.insertAdjacentHTML('beforeend', `
            <label class="meta-picker-option">
              <input type="radio" name="meta-waba-select" value="${wabaIdx}-${phoneIdx}" ${idx === 0 ? 'checked' : ''}>
              <div class="meta-picker-option-content">
                <div class="meta-picker-option-title">${phone.display_phone_number}</div>
                <div class="meta-picker-option-sub">${waba.wabaName} · ${phone.verified_name || 'Verified'}</div>
              </div>
            </label>
          `);
          idx++;
        });
      });
      if (idx === 0) {
        wabaOptions.innerHTML = '<div class="meta-picker-empty">No WhatsApp Business accounts found</div>';
      }
    }

    if (igOptions) {
      igOptions.innerHTML = '';
      if (discovery.instagram.length === 0) {
        igOptions.innerHTML = '<div class="meta-picker-empty">No Instagram Professional accounts linked to your Pages</div>';
      } else {
        discovery.instagram.forEach((ig, i) => {
          igOptions.insertAdjacentHTML('beforeend', `
            <label class="meta-picker-option">
              <input type="checkbox" name="meta-ig-select" value="${i}">
              <div class="meta-picker-option-content">
                <div class="meta-picker-option-title">@${ig.username}</div>
                <div class="meta-picker-option-sub">Page: ${ig.pageName}</div>
              </div>
            </label>
          `);
        });
      }
    }

    modal.discovery = discovery;
    modal.classList.add('active');

    const confirmBtn = modal.querySelector('#meta-picker-confirm-btn');
    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        const selectedWaba = modal.querySelector('input[name="meta-waba-select"]:checked');
        const selectedIg = Array.from(modal.querySelectorAll('input[name="meta-ig-select"]:checked'));

        if (!selectedWaba && selectedIg.length === 0) {
          alert('Please select at least one account to connect.');
          return;
        }

        const [wabaIdx, phoneIdx] = selectedWaba ? selectedWaba.value.split('-').map(Number) : [0, 0];
        const igIndices = selectedIg.map(input => Number(input.value));

        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="spinner-xs"></span> Connecting...';

        const result = await this._saveSelectedAccounts(
          discovery.long_lived_token,
          wabaIdx,
          phoneIdx,
          igIndices
        );

        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Connect Selected';

        if (result) {
          modal.classList.remove('active');
          this._applyConnectionResult(result, discovery);
        }
      };
    }
  }

  _createAccountPickerModal() {
    const modal = document.createElement('div');
    modal.id = 'meta-account-picker-modal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-dialog meta-picker-dialog">
        <div class="modal-header">
          <h3>Select Accounts to Connect</h3>
          <button class="modal-close" data-close-modal>&times;</button>
        </div>
        <div class="modal-body">
          <div class="meta-picker-section">
            <div class="meta-picker-section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              WhatsApp Business Number
            </div>
            <div class="meta-picker-options" id="meta-picker-waba-options"></div>
          </div>
          <div class="meta-picker-section">
            <div class="meta-picker-section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
              Instagram Professional Accounts
            </div>
            <div class="meta-picker-options" id="meta-picker-ig-options"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-close-modal>Cancel</button>
          <button class="btn btn-primary" id="meta-picker-confirm-btn">Connect Selected</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  _applyConnectionResult(result, discovery) {
    const org = window.appState.getCurrentOrg();

    if (result.saved?.whatsapp && discovery.wabas?.length > 0) {
      const wabaIdx = result.saved.whatsapp ? 0 : -1;
      org.whatsappConnected = true;
      const waba = discovery.wabas[0];
      if (waba?.phoneNumbers?.[0]) {
        org.whatsappNumber = waba.phoneNumbers[0].display_phone_number;
        org.whatsappProvider = 'Meta Cloud API (Official OAuth)';
        org.phoneId = waba.phoneNumbers[0].id;
        org.wabaId = waba.wabaId;
      }
      window.appState.emit('whatsappConnectionChanged', { status: 'CONNECTED' });
    }

    if (result.saved?.instagram > 0 && discovery.instagram?.length > 0) {
      const ig = discovery.instagram[0];
      org.instagramConnected = true;
      org.instagramBusinessId = ig.instagramBusinessId;
      org.instagramUsername = ig.username;
      org.instagramPageId = ig.pageId;
      window.appState.emit('instagramConnectionChanged', { status: 'CONNECTED', account: ig });
      window.appState.addAuditLog(
        'Instagram Meta OAuth Connected',
        ig.username,
        `Linked Instagram professional account through Meta Page ${ig.pageName}.`,
        'Connected'
      );
    }

    window.appState.saveState();
    alert('Account(s) connected successfully!');
  }

  _showDemoModeModal() {
    const modal = document.getElementById('meta-demo-modal');
    if (!modal) {
      this._createDemoModal();
      return this._showDemoModeModal();
    }
    modal.classList.add('active');
  }

  _createDemoModal() {
    const modal = document.createElement('div');
    modal.id = 'meta-demo-modal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-dialog meta-demo-dialog">
        <div class="modal-header">
          <h3>Meta OAuth Connection</h3>
          <button class="modal-close" data-close-modal>&times;</button>
        </div>
        <div class="modal-body">
          <div class="demo-info-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h4>Demo Mode Active</h4>
          <p>The "Continue with Facebook" feature requires a configured Supabase project with Meta App credentials.</p>
          <p>In demo mode, you can explore the account picker UI with simulated data. Configure <code>supabase-config.js</code> and set <code>META_APP_ID</code> in your environment to enable live OAuth.</p>
          <button class="btn btn-primary" id="meta-demo-simulate-btn">Simulate Account Picker</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const simulateBtn = modal.querySelector('#meta-demo-simulate-btn');
    if (simulateBtn) {
      simulateBtn.onclick = () => {
        modal.classList.remove('active');
        this._showAccountPicker({
          long_lived_token: 'demo_token',
          wabas: [
            {
              wabaId: 'DEMO_WABA_001',
              wabaName: 'Demo Business',
              phoneNumbers: [
                { id: 'DEMO_PH_001', display_phone_number: '+1 555-0123', verified_name: 'Demo Business' }
              ]
            }
          ],
          instagram: [
            { instagramBusinessId: 'DEMO_IG_001', username: 'demo_business', pageId: 'DEMO_PAGE_001', pageName: 'Demo Business Page' }
          ]
        });
      };
    }
  }

  /* ── Handler: Trigger Login window for Facebook ──────────────────────── */
  async handleRealMetaLogin() {
    const appId = document.getElementById('meta-real-app-id')?.value.trim();
    const statusMsg = document.getElementById('meta-real-status-msg');
    const loginBtn = document.getElementById('meta-real-login-btn');

    if (!appId) {
      alert('Please enter a valid Meta App ID to authenticate.');
      return;
    }

    if (statusMsg) {
      statusMsg.style.display = 'block';
      statusMsg.style.color = 'var(--text-muted)';
      statusMsg.innerHTML = '<span class="spinner-xs"></span> Loading Meta SDK...';
    }

    try {
      await this._loadFbSdk();

      // Initialize with user's specific App ID
      FB.init({
        appId: appId,
        cookie: true,
        xfbml: true,
        version: 'v21.0'
      });

      if (statusMsg) statusMsg.innerHTML = 'Connecting to Meta dialog...';

      // Login popup with WhatsApp & Instagram permissions
      FB.login((response) => {
        if (response.authResponse) {
          this.metaAccessToken = response.authResponse.accessToken;
          if (statusMsg) {
            statusMsg.style.color = '#10b981';
            statusMsg.innerHTML = '✓ Authenticated with Meta Business!';
          }
          if (loginBtn) loginBtn.style.display = 'none';
          this.fetchRealBusinesses();
          this.exchangeAndPersistToken(response.authResponse.accessToken)
            .then(result => this.applyMetaConnectionSummary(result))
            .catch(error => console.warn('[Meta Connection Sync]:', error.message));
        } else {
          if (statusMsg) {
            statusMsg.style.color = '#ef4444';
            statusMsg.innerHTML = 'Auth failed: User cancelled or domain not in App Settings.';
          }
        }
      }, {
        scope: 'whatsapp_business_management,whatsapp_business_messaging,instagram_basic,instagram_manage_messages,pages_show_list,pages_read_engagement'
      });

    } catch (err) {
      if (statusMsg) {
        statusMsg.style.color = '#ef4444';
        statusMsg.innerHTML = `SDK Error: ${err.message}`;
      }
    }
  }

  async exchangeAndPersistToken(accessToken) {
    if (!window.supabaseConfig || !window.supabaseConfig.isSupabaseConfigured()) return;
    try {
      const org = window.appState.getCurrentOrg();
      const edgeUrl = window.supabaseConfig.getEdgeFunctionUrl('meta-oauth-exchange');
      if (!edgeUrl) return;

      const response = await fetch(edgeUrl, {
        method: 'POST',
        headers: window.supabaseConfig.getAuthHeaders(),
        body: JSON.stringify({
          accessToken,
          organizationId: org.id
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Meta connection could not be saved.');
      return result;
    } catch (e) {
      console.warn('[Meta Token Sync]:', e.message);
      throw e;
    }
  }

  applyMetaConnectionSummary(result) {
    const instagram = Array.isArray(result?.instagram) ? result.instagram[0] : null;
    const statusMsg = document.getElementById('meta-real-status-msg');
    if (!instagram) {
      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.style.color = 'var(--text-muted)';
        statusMsg.textContent = 'Meta login complete. No linked Instagram professional account was found.';
      }
      return;
    }

    const org = window.appState.getCurrentOrg();
    org.instagramConnected = true;
    org.instagramBusinessId = instagram.instagramBusinessId;
    org.instagramUsername = instagram.username;
    org.instagramPageId = instagram.pageId;
    window.appState.saveState();
    window.appState.addAuditLog(
      'Instagram Meta OAuth Connected',
      instagram.username,
      `Linked Instagram professional account through Meta Page ${instagram.pageName}.`,
      'Connected'
    );
    window.appState.emit('instagramConnectionChanged', { status: 'CONNECTED', account: instagram });

    if (statusMsg) {
      statusMsg.style.display = 'block';
      statusMsg.style.color = '#10b981';
      statusMsg.textContent = `✓ Instagram @${instagram.username} linked. Select the WhatsApp business and phone number to finish setup.`;
    }
  }

  /* ── Graph API: Fetch businesses ────────────────────────────────────── */
  async fetchRealBusinesses() {
    const statusMsg = document.getElementById('meta-real-status-msg');
    const container = document.getElementById('meta-real-details-container');
    const select = document.getElementById('meta-real-business-select');

    if (!this.metaAccessToken || !select) return;

    try {
      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.innerHTML = 'Fetching business portfolios...';
      }

      const res = await fetch(`https://graph.facebook.com/v18.0/me/businesses?access_token=${this.metaAccessToken}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error.message);

      select.innerHTML = '<option value="">-- Choose Business Account --</option>';

      if (data.data && data.data.length > 0) {
        data.data.forEach(biz => {
          select.insertAdjacentHTML('beforeend', `<option value="${biz.id}">${biz.name}</option>`);
        });
        if (container) container.style.display = 'block';
        if (statusMsg) statusMsg.style.display = 'none';
      } else {
        throw new Error('No business portfolios found associated with this Meta account.');
      }
    } catch (err) {
      if (statusMsg) {
        statusMsg.style.color = '#ef4444';
        statusMsg.innerHTML = `Error: ${err.message}`;
      }
    }
  }

  /* ── Graph API: Fetch WABAs under selected business ─────────────────── */
  async handleBusinessSelection() {
    const bizId = document.getElementById('meta-real-business-select')?.value;
    const select = document.getElementById('meta-real-waba-select');
    const statusMsg = document.getElementById('meta-real-status-msg');

    if (!bizId || !select) return;

    try {
      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.style.color = 'var(--text-muted)';
        statusMsg.innerHTML = 'Fetching WABA accounts...';
      }

      const res = await fetch(`https://graph.facebook.com/v18.0/${bizId}/client_whatsapp_business_accounts?access_token=${this.metaAccessToken}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error.message);

      select.innerHTML = '<option value="">-- Choose WABA Account --</option>';

      if (data.data && data.data.length > 0) {
        data.data.forEach(waba => {
          select.insertAdjacentHTML('beforeend', `<option value="${waba.id}">${waba.name || waba.id}</option>`);
        });
        if (statusMsg) statusMsg.style.display = 'none';
      } else {
        throw new Error('No WABA accounts found under this business portfolio.');
      }
    } catch (err) {
      if (statusMsg) {
        statusMsg.style.color = '#ef4444';
        statusMsg.innerHTML = `Error: ${err.message}`;
      }
    }
  }

  /* ── Graph API: Fetch phone numbers under WABA ──────────────────────── */
  async handleWABASelection() {
    const wabaId = document.getElementById('meta-real-waba-select')?.value;
    const select = document.getElementById('meta-real-phone-select');
    const statusMsg = document.getElementById('meta-real-status-msg');

    if (!wabaId || !select) return;

    try {
      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.style.color = 'var(--text-muted)';
        statusMsg.innerHTML = 'Fetching phone numbers...';
      }

      const res = await fetch(`https://graph.facebook.com/v18.0/${wabaId}/phone_numbers?access_token=${this.metaAccessToken}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error.message);

      select.innerHTML = '<option value="">-- Choose Phone Number --</option>';

      if (data.data && data.data.length > 0) {
        data.data.forEach(ph => {
          select.insertAdjacentHTML('beforeend', `<option value="${ph.id}" data-display-phone="${ph.display_phone_number}">${ph.display_phone_number} (${ph.verified_name || 'Verified'})</option>`);
        });
        if (statusMsg) statusMsg.style.display = 'none';
      } else {
        throw new Error('No verified phone numbers found inside this WABA.');
      }
    } catch (err) {
      if (statusMsg) {
        statusMsg.style.color = '#ef4444';
        statusMsg.innerHTML = `Error: ${err.message}`;
      }
    }
  }

  /* ── Submit Modal Details ───────────────────────────────────────────── */
  async handleMetaOAuthSubmit() {
    const modal = document.getElementById('meta-oauth-modal');
    const submitBtn = document.getElementById('meta-oauth-submit-btn');

    let wabaName, phone, providerName, tokenValue;

    if (this.metaMode === 'token') {
      const token = document.getElementById('meta-token-input')?.value.trim();
      const phoneId = document.getElementById('meta-phone-id-input')?.value.trim();
      const wabaId = document.getElementById('meta-waba-id-input')?.value.trim();
      const displayPhone = document.getElementById('meta-display-phone-input')?.value.trim();
      const tokenStatus = document.getElementById('meta-token-status-msg');

      if (!token) {
        alert('Please enter your Meta Permanent Access Token (or test token).');
        return;
      }
      if (!phoneId) {
        alert('Please enter your WhatsApp Phone Number ID.');
        return;
      }

      tokenValue = token;
      phone = displayPhone || `+91 ${phoneId.slice(-10)}`;
      wabaName = wabaId ? `WABA (${wabaId})` : `WABA (${phoneId})`;
      providerName = 'Meta Cloud API (Permanent Token)';

      // Validate token live against Graph API
      if (tokenStatus) {
        tokenStatus.style.display = 'block';
        tokenStatus.style.color = 'var(--text-muted)';
        tokenStatus.innerHTML = '<span class="spinner-xs"></span> Verifying credentials with Meta...';
      }

      try {
        const verifyRes = await fetch(`https://graph.facebook.com/v18.0/${phoneId}?access_token=${token}`);
        const verifyData = await verifyRes.json();

        if (verifyData.error) {
          if (tokenStatus) {
            tokenStatus.style.color = '#ef4444';
            tokenStatus.innerHTML = `Verification Warning: ${verifyData.error.message}`;
          }
          if (!confirm(`Meta API reported: "${verifyData.error.message}". Connect anyway?`)) {
            return;
          }
        } else {
          if (verifyData.display_phone_number) {
            phone = verifyData.display_phone_number;
          }
          if (verifyData.verified_name) {
            wabaName = `${verifyData.verified_name} (Verified WABA)`;
          }
        }
      } catch (_) {
        // Network/CORS fallback
      }

    } else if (this.metaMode === 'simulated') {
      wabaName = document.getElementById('meta-waba-select')?.value || 'Nexus Primary WABA';
      phone = document.getElementById('meta-phone-select')?.value || '+91 98401 23456';
      providerName = 'Meta Cloud API (Simulation)';
      tokenValue = `EAAG_SIMULATED_${Date.now()}`;
    } else {
      const bizSelect = document.getElementById('meta-real-business-select');
      const wabaSelect = document.getElementById('meta-real-waba-select');
      const phoneSelect = document.getElementById('meta-real-phone-select');
      const selectedPhone = phoneSelect?.options[phoneSelect.selectedIndex];
      phone = selectedPhone?.dataset.displayPhone || '';

      if (!bizSelect?.value || !wabaSelect?.value || !phoneSelect?.value || !phone) {
        alert('Please complete the Facebook login steps and select your Business, WABA, and Phone Number.');
        return;
      }

      wabaName = wabaSelect.options[wabaSelect.selectedIndex].text;
      providerName = 'Meta Cloud API (Official OAuth)';
      tokenValue = this.metaAccessToken;
    }

    if (submitBtn) {
      submitBtn.innerHTML = `Connecting to Meta Cloud...`;
      submitBtn.disabled = true;
    }

    const phoneIdVal = this.metaMode === 'token'
      ? document.getElementById('meta-phone-id-input')?.value.trim()
      : (this.metaMode === 'real' ? document.getElementById('meta-real-phone-select')?.value : null);
    const wabaIdVal  = this.metaMode === 'token' ? document.getElementById('meta-waba-id-input')?.value.trim() : (this.metaMode === 'real' ? document.getElementById('meta-real-waba-select')?.value : null);

    // Call service layer to configure organization state
    await window.whatsappService.connectMetaOAuth({ 
      wabaName, 
      phoneNumber: phone, 
      provider: providerName,
      token: tokenValue,
      phoneId: phoneIdVal,
      wabaId: wabaIdVal
    });

    if (submitBtn) {
      submitBtn.innerHTML = `Connect &amp; Authorize`;
      submitBtn.disabled = false;
    }
    if (modal) modal.classList.remove('active');

    alert(`Successfully authenticated and connected WhatsApp Business for: ${phone}!`);
  }

  /* ══════════════════════════════════════════════════════════════════════
     METHOD B: QR FLOW lifecycle
     ══════════════════════════════════════════════════════════════════════ */
  startQRGeneration() {
    const qrDisplay = document.getElementById('qr-canvas-area');
    const timerDisplay = document.getElementById('qr-expiry-timer');
    const scanSimBtn = document.getElementById('simulate-qr-scan-btn');

    window.whatsappService.startQRFlow(
      (status, data) => {
        this.qrState = status;
        if (status === 'QR_GENERATING') {
          if (qrDisplay) qrDisplay.innerHTML = `<div style="color: var(--text-muted);">Generating authorized QR session...</div>`;
        } else if (status === 'WAITING_FOR_SCAN') {
          if (qrDisplay) {
            qrDisplay.innerHTML = `
              <div style="padding: 16px; background: white; border-radius: 12px; display: inline-block;">
                <svg width="180" height="180" viewBox="0 0 200 200" fill="#0b0f19">
                  <!-- Corners -->
                  <rect x="10" y="10" width="50" height="50" fill="none" stroke="#000" stroke-width="12"/>
                  <rect x="25" y="25" width="20" height="20" fill="#000"/>
                  <rect x="140" y="10" width="50" height="50" fill="none" stroke="#000" stroke-width="12"/>
                  <rect x="155" y="25" width="20" height="20" fill="#000"/>
                  <rect x="10" y="140" width="50" height="50" fill="none" stroke="#000" stroke-width="12"/>
                  <rect x="25" y="155" width="20" height="20" fill="#000"/>
                  <!-- Data points -->
                  <rect x="75" y="20" width="12" height="12"/>
                  <rect x="95" y="20" width="12" height="12"/>
                  <rect x="115" y="20" width="12" height="12"/>
                  <rect x="75" y="45" width="12" height="12"/>
                  <rect x="105" y="45" width="12" height="12"/>
                  <rect x="75" y="70" width="12" height="12"/>
                  <rect x="95" y="70" width="12" height="12"/>
                  <rect x="115" y="70" width="12" height="12"/>
                  <rect x="140" y="70" width="12" height="12"/>
                  <rect x="165" y="70" width="12" height="12"/>
                  <rect x="20" y="75" width="12" height="12"/>
                  <rect x="45" y="75" width="12" height="12"/>
                  <rect x="20" y="105" width="12" height="12"/>
                  <rect x="75" y="105" width="12" height="12"/>
                  <rect x="100" y="105" width="12" height="12"/>
                  <rect x="125" y="105" width="12" height="12"/>
                  <rect x="155" y="105" width="12" height="12"/>
                  <rect x="75" y="135" width="12" height="12"/>
                  <rect x="105" y="135" width="12" height="12"/>
                  <rect x="135" y="135" width="12" height="12"/>
                  <rect x="165" y="135" width="12" height="12"/>
                  <rect x="75" y="165" width="12" height="12"/>
                  <rect x="115" y="165" width="12" height="12"/>
                  <rect x="145" y="165" width="12" height="12"/>
                </svg>
              </div>
            `;
          }
          if (scanSimBtn) scanSimBtn.style.display = 'inline-flex';
        } else if (status === 'SESSION_EXPIRED') {
          if (qrDisplay) {
            qrDisplay.innerHTML = `
              <div style="color: var(--status-danger); font-weight: 600;">
                QR session expired. Click "Refresh QR" to generate a new session token.
              </div>
            `;
          }
          if (scanSimBtn) scanSimBtn.style.display = 'none';
        }
      },
      (timeLeft) => {
        if (timerDisplay) {
          timerDisplay.textContent = `Expires in ${timeLeft}s`;
        }
      }
    );
  }

  handleSimulateQRScan() {
    const phoneNumber = document.getElementById('qr-phone-input')?.value || '+91 94471 88990';
    window.whatsappService.simulateQRScanSuccess(phoneNumber);
    alert(`QR Code successfully scanned by device (${phoneNumber})!`);
  }
}

window.whatsappConnectComponent = new WhatsAppConnectComponent();
