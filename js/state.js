/* ==========================================================================
   NexusLead AI - Central Reactive State Store & Event Bus
   ========================================================================== */

class StateStore {
  constructor() {
    this.listeners = new Map();
    this.state = this.loadInitialState();
  }

  loadInitialState() {
    const saved = localStorage.getItem('nexuslead_state_v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.organizations && window.DEMO_DATA.organizations) {
          const primaryOrg = window.DEMO_DATA.organizations[0];
          const existing = parsed.organizations.find(o => o.id === primaryOrg.id);
          if (existing) {
            existing.name = primaryOrg.name;
            existing.whatsappConnected = primaryOrg.whatsappConnected;
            existing.whatsappNumber = primaryOrg.whatsappNumber;
            existing.whatsappProvider = primaryOrg.whatsappProvider;
            existing.phoneId = primaryOrg.phoneId;
            existing.whatsappToken = primaryOrg.whatsappToken;
            existing.wabaId = primaryOrg.wabaId;
          }
        }
        return { ...window.DEMO_DATA, ...parsed };
      } catch (e) {
        console.warn('Could not parse saved state, using demo data', e);
      }
    }
    return JSON.parse(JSON.stringify(window.DEMO_DATA));
  }

  saveState() {
    try {
      localStorage.setItem('nexuslead_state_v1', JSON.stringify(this.state));
    } catch (e) {
      console.error('Failed to save state to localStorage', e);
    }
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    this.state[key] = value;
    this.saveState();
    this.emit(key, value);
    this.emit('*', { key, value });
  }

  update(key, fn) {
    const nextVal = fn(this.state[key]);
    this.set(key, nextVal);
    return nextVal;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event).delete(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in state listener for ${event}:`, err);
        }
      });
    }
  }

  getCurrentOrg() {
    return this.state.organizations.find(o => o.id === this.state.currentOrgId) || this.state.organizations[0];
  }

  switchOrg(orgId) {
    const org = this.state.organizations.find(o => o.id === orgId);
    if (org) {
      this.state.currentOrgId = orgId;
      this.saveState();
      this.emit('orgChanged', org);
      this.emit('*', { key: 'currentOrgId', value: orgId });
    }
  }

  addAuditLog(action, entity, details, status = 'Success') {
    const newLog = {
      id: 'log_' + Date.now(),
      timestamp: new Date().toISOString(),
      action,
      entity,
      actor: this.state.currentUser ? this.state.currentUser.name : 'System',
      details,
      status
    };
    this.update('auditLogs', logs => [newLog, ...(logs || [])]);
  }

  toggleKillSwitch() {
    const org = this.getCurrentOrg();
    const isPaused = !org.isPaused;
    org.isPaused = isPaused;
    this.saveState();
    this.addAuditLog(
      isPaused ? 'Emergency Kill-Switch Engaged' : 'Emergency Kill-Switch Disengaged',
      'All Active Workflows & Campaigns',
      isPaused ? 'User clicked PAUSE ALL AUTOMATIONS. All outbound queues frozen.' : 'Automations resumed by owner.',
      isPaused ? 'Paused' : 'Active'
    );
    this.emit('killSwitchChanged', isPaused);
  }
}

window.appState = new StateStore();
