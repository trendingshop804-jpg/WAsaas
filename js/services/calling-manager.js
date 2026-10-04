/* ==========================================================================
   NexusLead AI - Call Center Manager (Frontend)
   Connects to api/trigger-call.js unified calling hub.
   ========================================================================== */

class CallingManager {
  constructor() {
    this.isActive = false;
    this.currentCall = null;
    this.timerInterval = null;
    this.timerSeconds = 0;
  }

  async init() {
    this.bindDialPadEvents();
    this.setupGlobalCallListeners();
    await this.loadSettings();
    await this.loadCallHistory();
    this.setupRealtimeSubscription();

    // Auto-refresh when user navigates to Call Center view
    if (window.appState && window.appState.on) {
      window.appState.on('viewChanged', (viewName) => {
        if (viewName === 'calls') {
          this.loadSettings();
          this.loadCallHistory();
        }
      });
    }
  }

  /**
   * Dialpad key tones + input
   */
  bindDialPadEvents() {
    const input = document.getElementById('dialpad-number-input');
    if (!input) return;

    document.querySelectorAll('.dialpad-key').forEach(key => {
      key.addEventListener('click', () => {
        const val = key.getAttribute('data-key');
        if (val && input) {
          input.value += val;
          // DTMF-like click sound
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 440 + parseInt(val || '0') * 40;
            gain.gain.value = 0.08;
            osc.start();
            osc.stop(ctx.currentTime + 0.08);
          } catch (_) { /* no audio context */ }
        }
      });
    });

    // Delete button
    const delBtn = document.getElementById('dialpad-del-btn');
    if (delBtn) delBtn.addEventListener('click', () => { input.value = input.value.slice(0, -1); });

    // Clear button
    const clearBtn = document.getElementById('dialpad-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', () => { input.value = ''; });

    // Paste button
    const pasteBtn = document.getElementById('dialpad-paste-btn');
    if (pasteBtn) {
      pasteBtn.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          input.value = text.replace(/[^\d+\s()-]/g, '').trim();
        } catch (_) { /* clipboard denied */ }
      });
    }

    // Call button
    const callBtn = document.getElementById('dialpad-call-btn');
    if (callBtn) {
      callBtn.addEventListener('click', () => {
        const phone = input.value.trim();
        if (phone) this.initiateCall(phone);
      });
    }

    // Call history filter
    const filterSelect = document.getElementById('calls-filter-select');
    if (filterSelect) {
      filterSelect.addEventListener('change', () => this.loadCallHistory());
    }
  }

  /**
   * Global click-to-call from any CRM view
   */
  setupGlobalCallListeners() {
    document.addEventListener('click', (e) => {
      const callBtn = e.target.closest('[data-call-phone]');
      if (callBtn) {
        e.preventDefault();
        const phone = callBtn.getAttribute('data-call-phone');
        if (phone) this.initiateCall(phone, callBtn.getAttribute('data-call-name') || '');
      }
    });

    // End call button on floating panel
    const endCallBtn = document.getElementById('active-call-end-btn');
    if (endCallBtn) {
      endCallBtn.addEventListener('click', () => this.endCall());
    }

    // Incoming call modal buttons
    const acceptBtn = document.getElementById('incoming-accept-btn');
    const rejectBtn = document.getElementById('incoming-reject-btn');
    if (acceptBtn) acceptBtn.addEventListener('click', () => this.acceptIncoming());
    if (rejectBtn) rejectBtn.addEventListener('click', () => this.rejectIncoming());
  }

  /**
   * Initiate outbound call
   */
  async initiateCall(phone, name = '') {
    if (this.isActive) {
      this.showToast('A call is already in progress', 'warning');
      return;
    }

    try {
      const token = await this.getToken();
      const resp = await fetch('/api/trigger-call?action=dial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ phone, name })
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        this.showToast(data.error || 'Failed to initiate call', 'error');
        return;
      }

      this.currentCall = {
        id: data.call?.id || null,
        phone,
        name: name || phone,
        provider: data.provider || 'macrodroid',
        status: 'initiated',
        startedAt: Date.now()
      };
      this.isActive = true;
      this.showActiveCallPanel();
      this.startTimer();
      this.showToast('Call initiated via ' + (data.provider || 'MacroDroid'), 'success');

      // Refresh history
      setTimeout(() => this.loadCallHistory(), 2000);
    } catch (err) {
      console.error('[CallingManager] Dial failed:', err);
      this.showToast('Call failed: ' + err.message, 'error');
    }
  }

  /**
   * End active call
   */
  async endCall() {
    if (!this.isActive) return;

    try {
      if (this.currentCall?.id) {
        const token = await this.getToken();
        await fetch('/api/trigger-call?action=hangup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ callId: this.currentCall.id })
        });
      }
    } catch (_) { /* best-effort */ }

    this.stopTimer();
    this.isActive = false;
    this.currentCall = null;
    this.hideActiveCallPanel();
    this.loadCallHistory();
  }

  /**
   * Accept incoming call (UI only — actual answer is on the device)
   */
  acceptIncoming() {
    const modal = document.getElementById('incoming-call-modal');
    if (modal) modal.style.display = 'none';
    this.showToast('Answering call on device...', 'info');
  }

  /**
   * Reject incoming call
   */
  rejectIncoming() {
    const modal = document.getElementById('incoming-call-modal');
    if (modal) modal.style.display = 'none';
  }

  /**
   * Timer for active call
   */
  startTimer() {
    this.timerSeconds = 0;
    const timerEl = document.getElementById('active-call-timer');
    this.timerInterval = setInterval(() => {
      this.timerSeconds++;
      if (timerEl) {
        const m = Math.floor(this.timerSeconds / 60).toString().padStart(2, '0');
        const s = (this.timerSeconds % 60).toString().padStart(2, '0');
        timerEl.textContent = `${m}:${s}`;
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timerSeconds = 0;
    const timerEl = document.getElementById('active-call-timer');
    if (timerEl) timerEl.textContent = '00:00';
  }

  /**
   * Active call floating panel
   */
  showActiveCallPanel() {
    const panel = document.getElementById('active-call-panel');
    if (!panel) return;
    const nameEl = document.getElementById('active-call-contact');
    const phoneEl = document.getElementById('active-call-phone');
    if (nameEl) nameEl.textContent = this.currentCall?.name || 'Unknown';
    if (phoneEl) phoneEl.textContent = this.currentCall?.phone || '';
    panel.classList.add('open');
  }

  hideActiveCallPanel() {
    const panel = document.getElementById('active-call-panel');
    if (panel) panel.classList.remove('open');
  }

  /**
   * Load call history from API
   */
  async loadCallHistory() {
    const tbody = document.getElementById('calls-tbody');
    if (!tbody) return;

    try {
      const token = await this.getToken();
      const filterEl = document.getElementById('calls-filter-select');
      const direction = filterEl?.value || '';
      let url = '/api/trigger-call?action=history&limit=50';
      if (direction && direction !== 'all') url += `&direction=${direction}`;

      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      const calls = data.calls || [];

      if (calls.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#6b7280;padding:32px;">No call history yet</td></tr>';
        return;
      }

      tbody.innerHTML = calls.map(c => {
        const dirIcon = c.direction === 'inbound'
          ? '<span style="color:#6366f1">↙ In</span>'
          : '<span style="color:#10b981">↗ Out</span>';
        const statusColor = { completed: '#10b981', failed: '#ef4444', 'no-answer': '#f59e0b', ringing: '#6366f1', initiated: '#3b82f6' }[c.status] || '#6b7280';
        const dur = c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}:${(c.duration_seconds % 60).toString().padStart(2, '0')}` : '--';
        const time = c.started_at ? new Date(c.started_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '--';

        return `<tr>
          <td>${dirIcon}</td>
          <td>${c.contact_name || '--'}</td>
          <td style="font-family:monospace;font-size:13px">${c.phone_number || '--'}</td>
          <td>${dur}</td>
          <td><span style="color:${statusColor};font-weight:600;text-transform:capitalize">${c.status || '--'}</span></td>
          <td><span class="call-provider-badge">${c.provider || '--'}</span></td>
          <td>${time}</td>
          <td><button class="btn btn-sm" data-call-phone="${c.phone_number || ''}" data-call-name="${c.contact_name || ''}" title="Redial">📞</button></td>
        </tr>`;
      }).join('');
    } catch (err) {
      console.error('[CallingManager] History load failed:', err);
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#ef4444;padding:20px;">Failed to load call history</td></tr>';
    }
  }

  /**
   * Load provider settings
   */
  async loadSettings() {
    try {
      const token = await this.getToken();
      const resp = await fetch('/api/trigger-call?action=settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      const providers = data.providers || {};

      const macroStatus = document.getElementById('provider-macrodroid-status');
      const twilioStatus = document.getElementById('provider-twilio-status');

      if (macroStatus) {
        macroStatus.textContent = providers.macrodroid?.configured ? '✅ Connected' : '❌ Not configured';
        macroStatus.style.color = providers.macrodroid?.configured ? '#10b981' : '#ef4444';
      }
      if (twilioStatus) {
        twilioStatus.textContent = providers.twilio?.configured ? '✅ Connected' : '❌ Not configured';
        twilioStatus.style.color = providers.twilio?.configured ? '#10b981' : '#ef4444';
      }
    } catch (_) { /* silent */ }
  }

  /**
   * Supabase Realtime for inbound calls
   */
  setupRealtimeSubscription() {
    try {
      if (!window.authService?.supabase) return;
      const supabase = window.authService.supabase;

      supabase
        .channel('calls-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, (payload) => {
          const call = payload.new;
          if (call?.direction === 'inbound' && call?.status === 'ringing') {
            this.showIncomingCall(call);
          }
          this.loadCallHistory();
        })
        .subscribe();
    } catch (_) { /* realtime unavailable */ }
  }

  /**
   * Show incoming call modal
   */
  showIncomingCall(call) {
    const modal = document.getElementById('incoming-call-modal');
    if (!modal) return;

    const nameEl = document.getElementById('incoming-caller-name');
    const phoneEl = document.getElementById('incoming-caller-phone');
    if (nameEl) nameEl.textContent = call.contact_name || 'Unknown Caller';
    if (phoneEl) phoneEl.textContent = call.phone_number || '';

    modal.style.display = 'flex';
  }

  /**
   * Get auth token
   */
  async getToken() {
    if (window.NB_AUTH?.getAccessToken) {
      return await window.NB_AUTH.getAccessToken();
    }
    if (window.authService?.getAccessToken) {
      return await window.authService.getAccessToken();
    }
    return '';
  }

  /**
   * Toast notification
   */
  showToast(message, type = 'info') {
    if (window.showToast) {
      window.showToast(message, type);
    } else {
      console.log(`[Call ${type}]`, message);
    }
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.callingManager = new CallingManager();
    window.callingManager.init();
  });
} else {
  window.callingManager = new CallingManager();
  window.callingManager.init();
}
