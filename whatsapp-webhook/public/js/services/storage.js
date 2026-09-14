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
}

window.storageService = new StorageService();
