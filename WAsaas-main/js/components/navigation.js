/* ==========================================================================
   NexusLead AI - Navigation & Shell Component
   ========================================================================== */

class NavigationComponent {
  init() {
    this.bindEvents();
    this.renderOrgInfo();
  }

  bindEvents() {
    // Navigation item clicks
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = item.getAttribute('data-view');
        if (targetView) {
          this.switchView(targetView);
        }
      });
    });

    // Theme toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Emergency Kill Switch
    const killSwitchBtn = document.getElementById('global-kill-switch-btn');
    if (killSwitchBtn) {
      killSwitchBtn.addEventListener('click', () => {
        window.appState.toggleKillSwitch();
      });
    }

    // Listen for state changes
    window.appState.on('killSwitchChanged', (isPaused) => {
      this.updateKillSwitchUI(isPaused);
    });

    window.appState.on('orgChanged', () => {
      this.renderOrgInfo();
    });

    // Org Switcher Modal trigger
    const orgSelector = document.getElementById('sidebar-org-btn');
    if (orgSelector) {
      orgSelector.addEventListener('click', () => {
        this.openOrgModal();
      });
    }
  }

  switchView(viewName) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (activeNav) activeNav.classList.add('active');

    document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
    const activePanel = document.getElementById(`view-${viewName}`);
    if (activePanel) {
      activePanel.classList.add('active');
      window.scrollTo(0, 0);
      window.appState.emit('viewChanged', viewName);
    }
  }

  renderOrgInfo() {
    const org = window.appState.getCurrentOrg();
    const orgNameEl = document.getElementById('current-org-name');
    const orgPlanEl = document.getElementById('current-org-plan');
    if (orgNameEl) orgNameEl.textContent = org.name;
    if (orgPlanEl) orgPlanEl.textContent = org.plan;

    this.updateKillSwitchUI(org.isPaused);
  }

  updateKillSwitchUI(isPaused) {
    const banner = document.getElementById('kill-switch-banner');
    const killBtn = document.getElementById('global-kill-switch-btn');
    if (banner) {
      banner.style.display = isPaused ? 'flex' : 'none';
    }
    if (killBtn) {
      if (isPaused) {
        killBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          RESUME AUTOMATIONS
        `;
        killBtn.style.background = '#10b981';
      } else {
        killBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
          PAUSE ALL AUTOMATIONS
        `;
        killBtn.style.background = '#dc2626';
      }
    }
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
      themeIcon.innerHTML = next === 'light'
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
    }
  }

  openOrgModal() {
    const modal = document.getElementById('org-switch-modal');
    if (modal) modal.classList.add('active');
  }
}

window.navigationComponent = new NavigationComponent();
