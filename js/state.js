/* Tenant-scoped client state. Production never starts from bundled records. */
(function () {
  'use strict';

  function emptyState() {
    return {
      currentUser: null, currentOrgId: null, organizations: [],
      leads: [], conversations: [], campaigns: [], products: [], orders: [],
      followUps: [], tasks: [], aiAgents: [], instagramReplyRules: [],
      instagramDmRules: [], instagramScheduledPosts: [], auditLogs: [],
      customers: [], deals: {}, calls: [], activityFeed: [], appointments: []
    };
  }

  class StateStore {
    constructor() { this.listeners = new Map(); this.cacheKey = null; this.state = emptyState(); }
    configureScope({ userId, organization } = {}) {
      const nextKey = userId && organization?.id ? `nextbright:workspace:v2:${userId}:${organization.id}` : null;
      if (nextKey === this.cacheKey) return;
      this.clear({ preserveUser: false });
      this.cacheKey = nextKey;
      if (!nextKey) return;
      try {
        const saved = JSON.parse(sessionStorage.getItem(nextKey) || 'null');
        if (saved && typeof saved === 'object') this.state = { ...emptyState(), ...saved };
      } catch (_) { sessionStorage.removeItem(nextKey); }
      this.state.currentUser = { id: userId };
      this.state.currentOrgId = organization.id;
      this.state.organizations = [organization];
      this.emit('*', { key: 'workspace', value: organization });
    }
    clear({ preserveUser = false } = {}) {
      const currentUser = preserveUser ? this.state.currentUser : null;
      this.state = emptyState();
      this.state.currentUser = currentUser;
      this.cacheKey = null;
      this.emit('*', { key: 'workspace-cleared', value: null });
    }
    saveState() { if (this.cacheKey) sessionStorage.setItem(this.cacheKey, JSON.stringify(this.state)); }
    get(key) { return this.state[key]; }
    set(key, value) { this.state[key] = value; this.saveState(); this.emit(key, value); this.emit('*', { key, value }); }
    update(key, fn) { const value = fn(this.state[key]); this.set(key, value); return value; }
    on(event, callback) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event).add(callback); return () => this.listeners.get(event).delete(callback); }
    emit(event, data) { this.listeners.get(event)?.forEach(callback => { try { callback(data); } catch (error) { console.error('State listener error:', error); } }); }
    getCurrentOrg() { return this.state.organizations.find(org => org.id === this.state.currentOrgId) || null; }
    switchOrg(orgId) { if (this.state.organizations.some(org => org.id === orgId)) this.set('currentOrgId', orgId); }
    addAuditLog(action, entity, details, status = 'Success') { this.update('auditLogs', logs => [{ id: `log_${Date.now()}`, timestamp: new Date().toISOString(), action, entity, details, status, actor: this.state.currentUser?.name || 'System' }, ...(logs || [])]); }
    toggleKillSwitch() { const org = this.getCurrentOrg(); if (!org) return; org.isPaused = !org.isPaused; this.saveState(); this.emit('killSwitchChanged', org.isPaused); }
  }

  window.appState = new StateStore();
  window.NB = window.NB || {};
  Object.assign(window.NB, { leads: [], customers: [], deals: {}, calls: [], conversations: [], activityFeed: [], tasks: [], appointments: [] });
})();