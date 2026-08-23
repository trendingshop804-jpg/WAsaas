/* ==========================================================================
   NexusLead AI - Application Bootstrapper & Lifecycle Orchestrator
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  console.log('⚡ Initializing NexusLead AI SaaS Platform...');

  // Initialize Core Services & Components
  if (window.navigationComponent) window.navigationComponent.init();
  if (window.dashboardComponent) window.dashboardComponent.init();
  if (window.discoveryComponent) window.discoveryComponent.init();
  if (window.leadImportComponent) window.leadImportComponent.init();
  if (window.crmComponent) window.crmComponent.init();
  if (window.whatsappConnectComponent) window.whatsappConnectComponent.init();
  if (window.campaignsComponent) window.campaignsComponent.init();
  if (window.aiGeneratorComponent) window.aiGeneratorComponent.init();
  if (window.followUpsComponent) window.followUpsComponent.init();
  if (window.aiAgentComponent) window.aiAgentComponent.init();
  if (window.workflowBuilderComponent) window.workflowBuilderComponent.init();
  if (window.inboxComponent) window.inboxComponent.init();
  if (window.templatesComponent) window.templatesComponent.init();
  if (window.analyticsComponent) window.analyticsComponent.init();
  if (window.teamComponent) window.teamComponent.init();
  if (window.settingsComponent) window.settingsComponent.init();
  if (window.billingComponent) window.billingComponent.init();
  if (window.onboardingComponent) window.onboardingComponent.init();

  // Generic modal close handlers
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-backdrop');
      if (modal) modal.classList.remove('active');
    });
  });

  // Global search handler
  const globalSearch = document.getElementById('global-search-input');
  if (globalSearch) {
    globalSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = globalSearch.value.trim();
        if (query) {
          window.navigationComponent.switchView('crm');
          const crmSearch = document.getElementById('crm-search-filter');
          if (crmSearch) {
            crmSearch.value = query;
            crmSearch.dispatchEvent(new Event('input'));
          }
        }
      }
    });
  }

  // Multi-tenant Org Switcher click in modal
  document.querySelectorAll('.org-switch-item').forEach(item => {
    item.addEventListener('click', () => {
      const orgId = item.getAttribute('data-org-id');
      if (orgId) {
        window.appState.switchOrg(orgId);
        const modal = document.getElementById('org-switch-modal');
        if (modal) modal.classList.remove('active');
      }
    });
  });

  console.log('✓ NexusLead AI Platform Ready & Operational.');
});
