/* ==========================================================================
   NexusLead AI — Meta Onboarding Component
   Client-facing "Continue with Facebook" onboarding step
   Official Meta button styling, plain-language trust signals, auto-connect flow
   ========================================================================== */

class MetaOnboardingComponent {
  constructor() {
    this.state = 'idle'; // idle | connecting | picker | success | error
    this.discovery = null;
    this.selectedWaba = null;
    this.selectedIg = [];
  }

  init() {
    this._injectStyles();
  }

  /* ── Render the onboarding step ───────────────────────────────────── */
  render(containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = this._stepHTML();
    this._bindEvents(containerEl);
  }

  _stepHTML() {
    return `
      <div class="meta-onboarding-step" id="meta-onboarding-step">
        <div class="meta-onboarding-header">
          <div class="meta-onboarding-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </div>
          <h3 class="meta-onboarding-title">Connect Your WhatsApp & Instagram</h3>
          <p class="meta-onboarding-subtitle">
            Connect your WhatsApp Business and Instagram accounts in one step. We'll never post or send messages without your permission.
          </p>
        </div>

        <div class="meta-onboarding-body" id="meta-onboarding-body">
          ${this._bodyHTML()}
        </div>

        <div class="meta-onboarding-trust">
          <button class="meta-trust-toggle" id="meta-trust-toggle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Why do we need this access?
          </button>
          <div class="meta-trust-content" id="meta-trust-content" style="display: none;">
            <div class="meta-trust-item">
              <strong>WhatsApp Business Management</strong>
              <span>Read your business profile and send/receive messages on your behalf.</span>
            </div>
            <div class="meta-trust-item">
              <strong>Instagram Basic</strong>
              <span>Read your Instagram Professional account profile and media.</span>
            </div>
            <div class="meta-trust-item">
              <strong>Pages Show List</strong>
              <span>See which Facebook Pages you manage (to find linked WhatsApp/Instagram).</span>
            </div>
            <div class="meta-trust-footer">
              We never post content, never message anyone without your campaign rules, and you can disconnect anytime from Settings.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _bodyHTML() {
    switch (this.state) {
      case 'connecting':
        return `
          <div class="meta-connecting">
            <div class="meta-spinner"></div>
            <span>Connecting to Facebook...</span>
          </div>
        `;
      case 'picker':
        return this._pickerHTML();
      case 'success':
        return this._successHTML();
      case 'error':
        return `
          <div class="meta-error">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <span>Connection failed. Please try again or contact support.</span>
          </div>
          <button class="meta-btn-facebook" id="meta-retry-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            Try Again
          </button>
        `;
      default:
        return `
          <button class="meta-btn-facebook" id="meta-connect-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            Continue with Facebook
          </button>
        `;
    }
  }

  _pickerHTML() {
    if (!this.discovery) return '';
    const wabaOptions = [];
    this.discovery.wabas.forEach((waba, wabaIdx) => {
      waba.phoneNumbers.forEach((phone, phoneIdx) => {
        wabaOptions.push(`
          <label class="meta-picker-option">
            <input type="radio" name="meta-waba" value="${wabaIdx}-${phoneIdx}" ${wabaOptions.length === 0 ? 'checked' : ''}>
            <div class="meta-picker-option-content">
              <div class="meta-picker-option-title">${phone.display_phone_number}</div>
              <div class="meta-picker-option-sub">${waba.wabaName}</div>
            </div>
          </label>
        `);
      });
    });

    const igOptions = this.discovery.instagram.map((ig, i) => `
      <label class="meta-picker-option">
        <input type="checkbox" name="meta-ig" value="${i}" ${i === 0 ? 'checked' : ''}>
        <div class="meta-picker-option-content">
          <div class="meta-picker-option-title">@${ig.username}</div>
          <div class="meta-picker-option-sub">${ig.pageName}</div>
        </div>
      </label>
    `).join('');

    return `
      <div class="meta-picker">
        <div class="meta-picker-section">
          <div class="meta-picker-section-title">Which WhatsApp number should we connect?</div>
          <div class="meta-picker-options">${wabaOptions.join('')}</div>
        </div>
        ${igOptions ? `
        <div class="meta-picker-section">
          <div class="meta-picker-section-title">Connect Instagram? <span class="meta-picker-optional">(optional)</span></div>
          <div class="meta-picker-options">${igOptions}</div>
        </div>` : ''}
        <button class="meta-btn-primary" id="meta-picker-confirm">Connect Selected Accounts</button>
      </div>
    `;
  }

  _successHTML() {
    const org = window.appState.getCurrentOrg();
    return `
      <div class="meta-success">
        <div class="meta-success-item">
          <div class="meta-success-icon whatsapp">✓</div>
          <div class="meta-success-content">
            <div class="meta-success-label">WhatsApp Connected</div>
            <div class="meta-success-value">${org.whatsappNumber || 'Connected'}</div>
          </div>
        </div>
        ${org.instagramUsername ? `
        <div class="meta-success-item">
          <div class="meta-success-icon instagram">✓</div>
          <div class="meta-success-content">
            <div class="meta-success-label">Instagram Connected</div>
            <div class="meta-success-value">@${org.instagramUsername}</div>
          </div>
        </div>` : ''}
        <div class="meta-success-note">
          You can change or disconnect these anytime from Settings → Integrations.
        </div>
      </div>
    `;
  }

  /* ── Event Binding ─────────────────────────────────────────────────── */
  _bindEvents(container) {
    const connectBtn = container.querySelector('#meta-connect-btn');
    if (connectBtn) {
      connectBtn.addEventListener('click', () => this._startConnection(container));
    }

    const retryBtn = container.querySelector('#meta-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        this.state = 'idle';
        this._rerender(container);
      });
    }

    const trustToggle = container.querySelector('#meta-trust-toggle');
    const trustContent = container.querySelector('#meta-trust-content');
    if (trustToggle && trustContent) {
      trustToggle.addEventListener('click', () => {
        const isVisible = trustContent.style.display !== 'none';
        trustContent.style.display = isVisible ? 'none' : 'block';
        trustToggle.classList.toggle('expanded', !isVisible);
      });
    }

    const pickerConfirm = container.querySelector('#meta-picker-confirm');
    if (pickerConfirm) {
      pickerConfirm.addEventListener('click', () => this._confirmPicker(container));
    }
  }

  /* ── Connection Flow ───────────────────────────────────────────────── */
  async _startConnection(container) {
    if (!window.supabaseConfig?.isSupabaseConfigured()) {
      this._showDemoConnect(container);
      return;
    }

    const metaAppId = window.supabaseConfig.metaAppId;
    if (!metaAppId) {
      this.state = 'error';
      this._rerender(container);
      return;
    }

    this.state = 'connecting';
    this._rerender(container);

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
          await this._handleLoginSuccess(response.authResponse.accessToken, container);
        } else {
          this.state = 'idle';
          this._rerender(container);
        }
      }, {
        scope: 'whatsapp_business_management,whatsapp_business_messaging,instagram_basic,instagram_manage_messages,pages_show_list,pages_read_engagement'
      });
    } catch (err) {
      this.state = 'error';
      this._rerender(container);
    }
  }

  async _handleLoginSuccess(accessToken, container) {
    try {
      const org = window.appState.getCurrentOrg();
      const edgeUrl = window.supabaseConfig.getEdgeFunctionUrl('meta-oauth-exchange');
      if (!edgeUrl) throw new Error('Edge function URL not configured');

      const response = await fetch(edgeUrl, {
        method: 'POST',
        headers: window.supabaseConfig.getAuthHeaders(),
        body: JSON.stringify({
          accessToken,
          organizationId: org.id,
          mode: 'auto'
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Connection failed');

      if (result.autoConnected) {
        this._applyConnectionResult(result);
        this.state = 'success';
      } else if (result.needsPicker) {
        this.discovery = result;
        this.state = 'picker';
      } else {
        this.state = 'error';
      }
      this._rerender(container);
    } catch (err) {
      this.state = 'error';
      this._rerender(container);
    }
  }

  async _confirmPicker(container) {
    const body = container.querySelector('#meta-onboarding-body');
    const selectedWaba = body.querySelector('input[name="meta-waba"]:checked');
    const selectedIg = Array.from(body.querySelectorAll('input[name="meta-ig"]:checked'));

    if (!selectedWaba && selectedIg.length === 0) return;

    const [wabaIdx, phoneIdx] = selectedWaba ? selectedWaba.value.split('-').map(Number) : [0, 0];
    const igIndices = selectedIg.map(input => Number(input.value));

    try {
      const org = window.appState.getCurrentOrg();
      const edgeUrl = window.supabaseConfig.getEdgeFunctionUrl('meta-oauth-exchange');
      if (!edgeUrl) return;

      const response = await fetch(edgeUrl, {
        method: 'POST',
        headers: window.supabaseConfig.getAuthHeaders(),
        body: JSON.stringify({
          accessToken: this.discovery.long_lived_token,
          organizationId: org.id,
          mode: 'save_selected',
          wabaIndex: wabaIdx,
          phoneIndex: phoneIdx,
          instagramIndices: igIndices
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed');

      this._applyConnectionResult(result);
      this.state = 'success';
      this._rerender(container);
    } catch (err) {
      this.state = 'error';
      this._rerender(container);
    }
  }

  _applyConnectionResult(result) {
    const org = window.appState.getCurrentOrg();

    if (result.saved?.whatsapp && this.discovery?.wabas?.length > 0) {
      org.whatsappConnected = true;
      const waba = this.discovery.wabas[0];
      if (waba?.phoneNumbers?.[0]) {
        org.whatsappNumber = waba.phoneNumbers[0].display_phone_number;
        org.whatsappProvider = 'Meta Cloud API (Official OAuth)';
        org.phoneId = waba.phoneNumbers[0].id;
        org.wabaId = waba.wabaId;
      }
      window.appState.emit('whatsappConnectionChanged', { status: 'CONNECTED' });
    }

    if (result.saved?.instagram > 0 && this.discovery?.instagram?.length > 0) {
      const ig = this.discovery.instagram[0];
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
  }

  _showDemoConnect(container) {
    this.discovery = {
      long_lived_token: 'demo_token',
      wabas: [{
        wabaId: 'DEMO_WABA',
        wabaName: 'Demo Business',
        phoneNumbers: [{ id: 'DEMO_PH', display_phone_number: '+1 555-0123', verified_name: 'Demo Business' }]
      }],
      instagram: [{ instagramBusinessId: 'DEMO_IG', username: 'demo_business', pageId: 'DEMO_PAGE', pageName: 'Demo Page' }]
    };
    this.state = 'picker';
    this._rerender(container);
  }

  /* ── Helpers ───────────────────────────────────────────────────────── */
  _rerender(container) {
    const body = container.querySelector('#meta-onboarding-body');
    if (body) {
      body.innerHTML = this._bodyHTML();
      this._bindEvents(container);
    }
  }

  _loadFbSdk() {
    return new Promise((resolve, reject) => {
      if (window.FB) return resolve();
      window.fbAsyncInit = () => resolve();
      try {
        const id = 'facebook-jssdk';
        if (document.getElementById(id)) return resolve();
        const fjs = document.getElementsByTagName('script')[0];
        const js = document.createElement('script');
        js.id = id;
        js.src = 'https://connect.facebook.net/en_US/sdk.js';
        fjs.parentNode.insertBefore(js, fjs);
      } catch (err) {
        reject(new Error('Failed to load Meta SDK: ' + err.message));
      }
    });
  }

  /* ── Styles ────────────────────────────────────────────────────────── */
  _injectStyles() {
    if (document.getElementById('meta-onboarding-styles')) return;
    const style = document.createElement('style');
    style.id = 'meta-onboarding-styles';
    style.textContent = `
      .meta-onboarding-step {
        max-width: 480px;
        margin: 0 auto;
        text-align: center;
        padding: 24px 16px;
      }

      .meta-onboarding-header { margin-bottom: 28px; }

      .meta-onboarding-icon {
        width: 56px;
        height: 56px;
        margin: 0 auto 16px;
        border-radius: 16px;
        background: linear-gradient(135deg, #25d366 0%, #128c7e 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
      }

      .meta-onboarding-title {
        font-size: 20px;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0 0 8px;
      }

      .meta-onboarding-subtitle {
        font-size: 14px;
        color: var(--text-secondary);
        line-height: 1.5;
        margin: 0;
      }

      .meta-onboarding-body { margin-bottom: 20px; }

      /* Facebook Button — Official Meta Branding */
      .meta-btn-facebook {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 12px 28px;
        background: #1877F2;
        color: white;
        border: none;
        border-radius: 6px;
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
        box-shadow: 0 2px 8px rgba(24, 119, 242, 0.3);
        letter-spacing: 0.01em;
      }

      .meta-btn-facebook:hover {
        background: #166FE5;
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(24, 119, 242, 0.4);
      }

      .meta-btn-facebook:active {
        transform: translateY(0);
      }

      .meta-btn-facebook svg {
        width: 22px;
        height: 22px;
        flex-shrink: 0;
      }

      /* Primary Button */
      .meta-btn-primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 24px;
        background: linear-gradient(135deg, #128c7e, #25d366);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 14px rgba(37, 211, 102, 0.25);
        width: 100%;
      }

      .meta-btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 22px rgba(37, 211, 102, 0.38);
      }

      /* Connecting State */
      .meta-connecting {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 20px;
        color: var(--text-secondary);
        font-size: 14px;
      }

      .meta-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--border-subtle);
        border-top-color: #1877F2;
        border-radius: 50%;
        animation: meta-spin 0.8s linear infinite;
      }

      @keyframes meta-spin {
        to { transform: rotate(360deg); }
      }

      /* Picker */
      .meta-picker {
        text-align: left;
      }

      .meta-picker-section {
        margin-bottom: 20px;
      }

      .meta-picker-section-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--text-primary);
        margin-bottom: 10px;
      }

      .meta-picker-optional {
        font-weight: 400;
        color: var(--text-muted);
        font-size: 12px;
      }

      .meta-picker-options {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .meta-picker-option {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-subtle);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .meta-picker-option:hover {
        border-color: var(--brand-whatsapp);
        background: rgba(37, 211, 102, 0.05);
      }

      .meta-picker-option input {
        width: 18px;
        height: 18px;
        accent-color: #25d366;
        flex-shrink: 0;
      }

      .meta-picker-option-content { flex: 1; }

      .meta-picker-option-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
      }

      .meta-picker-option-sub {
        font-size: 12px;
        color: var(--text-muted);
        margin-top: 2px;
      }

      /* Success State */
      .meta-success {
        text-align: left;
      }

      .meta-success-item {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 16px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-subtle);
        border-radius: 10px;
        margin-bottom: 10px;
      }

      .meta-success-icon {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        font-weight: 700;
        color: white;
        flex-shrink: 0;
      }

      .meta-success-icon.whatsapp { background: #25d366; }
      .meta-success-icon.instagram { background: linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888); }

      .meta-success-content { flex: 1; }

      .meta-success-label {
        font-size: 12px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-weight: 600;
      }

      .meta-success-value {
        font-size: 15px;
        font-weight: 700;
        color: var(--text-primary);
        margin-top: 2px;
      }

      .meta-success-note {
        font-size: 12px;
        color: var(--text-muted);
        text-align: center;
        margin-top: 12px;
        padding: 8px;
      }

      /* Error State */
      .meta-error {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 8px;
        color: #ef4444;
        font-size: 13px;
        margin-bottom: 16px;
      }

      /* Trust Section */
      .meta-onboarding-trust {
        border-top: 1px solid var(--border-subtle);
        padding-top: 16px;
      }

      .meta-trust-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: none;
        border: none;
        color: var(--text-muted);
        font-size: 12.5px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
        transition: all 0.2s;
      }

      .meta-trust-toggle:hover {
        color: var(--text-secondary);
        background: var(--bg-tertiary);
      }

      .meta-trust-toggle.expanded {
        color: var(--text-secondary);
      }

      .meta-trust-content {
        text-align: left;
        margin-top: 12px;
        padding: 14px;
        background: var(--bg-tertiary);
        border-radius: 8px;
        border: 1px solid var(--border-subtle);
      }

      .meta-trust-item {
        margin-bottom: 10px;
      }

      .meta-trust-item:last-child { margin-bottom: 0; }

      .meta-trust-item strong {
        display: block;
        font-size: 12.5px;
        color: var(--text-primary);
        margin-bottom: 2px;
      }

      .meta-trust-item span {
        font-size: 12px;
        color: var(--text-muted);
        line-height: 1.4;
      }

      .meta-trust-footer {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid var(--border-subtle);
        font-size: 11.5px;
        color: var(--text-muted);
        font-style: italic;
      }
    `;
    document.head.appendChild(style);
  }
}

window.metaOnboardingComponent = new MetaOnboardingComponent();
