/* ==========================================================================
   NexusLead AI - Storage & Backup Service
   ========================================================================== */

class StorageService {
  exportBackup() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.appState.state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `nexuslead_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  importBackup(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && parsed.leads && parsed.campaigns) {
        window.appState.state = parsed;
        window.appState.saveState();
        window.location.reload();
      } else {
        alert('Invalid backup file structure.');
      }
    } catch (e) {
      alert('Error parsing JSON backup file: ' + e.message);
    }
  }

  resetToDemo() {
    if (confirm('Reset entire platform back to default demo dataset? This will clear any local edits.')) {
      localStorage.removeItem('nexuslead_state_v1');
      window.location.reload();
    }
  }

  clearFakeData() {
    if (confirm('Delete all fake/demo data? This will clear demo leads, conversations, campaigns, products, orders, and demo rules, giving you a clean empty workspace.')) {
      const emptyState = {
        fakeDataCleared: true,
        currentOrgId: 'org_main',
        currentUser: window.appState.state?.currentUser || { name: 'Owner', role: 'Super Admin' },
        organizations: window.appState.state?.organizations || [{ id: 'org_main', name: 'My Business' }],
        leads: [],
        conversations: [],
        campaigns: [],
        products: [],
        orders: [],
        followUps: [],
        aiAgents: [],
        instagramReplyRules: [],
        instagramDmRules: [],
        instagramScheduledPosts: [],
        auditLogs: [
          {
            id: 'log_' + Date.now(),
            timestamp: new Date().toISOString(),
            action: 'Demo Data Deleted',
            entity: 'System State',
            actor: 'User',
            details: 'All fake demo data deleted by user.',
            status: 'Success'
          }
        ]
      };
      window.appState.state = emptyState;
      window.appState.saveState();
      window.location.reload();
    }
  }
}

window.storageService = new StorageService();
