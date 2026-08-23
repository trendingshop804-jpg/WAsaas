/* ==========================================================================
   NexusLead AI - Subscription Billing & Usage Metering Component
   ========================================================================== */

class BillingComponent {
  init() {
    this.bindEvents();
    this.render();

    window.appState.on('orgChanged', () => this.render());
  }

  bindEvents() {
    document.querySelectorAll('.billing-upgrade-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tier = btn.getAttribute('data-tier');
        this.handlePlanUpgrade(tier);
      });
    });
  }

  render() {
    const org = window.appState.getCurrentOrg();
    const currentTier = org.tier || 'scale';

    const leadsUsed = org.leadsCount || 1284;
    const leadsLimit = currentTier === 'starter' ? 1000 : currentTier === 'growth' ? 5000 : 25000;
    const leadsPct = Math.min(100, Math.round((leadsUsed / leadsLimit) * 100));

    const creditsUsed = org.creditsUsed || 1420;
    const creditsLimit = org.creditsLimit || 10000;
    const creditsPct = Math.min(100, Math.round((creditsUsed / creditsLimit) * 100));

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl('billing-current-plan-badge', org.plan);
    setEl('billing-lead-usage-text', `${leadsUsed} / ${leadsLimit} Leads (${leadsPct}%)`);
    setEl('billing-msg-usage-text', `${creditsUsed} / ${creditsLimit} WhatsApp Messages (${creditsPct}%)`);

    const leadBar = document.getElementById('billing-lead-bar');
    if (leadBar) leadBar.style.width = `${leadsPct}%`;

    const msgBar = document.getElementById('billing-msg-bar');
    if (msgBar) msgBar.style.width = `${creditsPct}%`;

    // Highlight current active plan card
    document.querySelectorAll('.billing-plan-card').forEach(card => {
      const cardTier = card.getAttribute('data-tier');
      const btn = card.querySelector('.billing-upgrade-btn');
      if (cardTier === currentTier) {
        card.style.borderColor = 'var(--brand-whatsapp)';
        card.style.boxShadow = '0 0 20px rgba(37, 211, 102, 0.2)';
        if (btn) {
          btn.textContent = 'Current Active Plan';
          btn.disabled = true;
          btn.className = 'btn btn-secondary w-full';
        }
      } else {
        card.style.borderColor = 'var(--border-subtle)';
        card.style.boxShadow = 'none';
        if (btn) {
          btn.textContent = 'Upgrade to ' + cardTier.toUpperCase();
          btn.disabled = false;
          btn.className = 'btn btn-primary w-full';
        }
      }
    });
  }

  handlePlanUpgrade(tier) {
    const org = window.appState.getCurrentOrg();
    org.tier = tier;
    org.plan = tier === 'starter' ? 'Starter Plan' : tier === 'growth' ? 'Growth Plan' : 'Scale Plan';
    org.creditsLimit = tier === 'starter' ? 1000 : tier === 'growth' ? 5000 : 25000;
    window.appState.saveState();
    window.appState.addAuditLog('Subscription Plan Updated', org.plan, `Upgraded organization subscription to ${org.plan}.`, 'Success');
    window.navigationComponent.renderOrgInfo();
    this.render();
    alert(`Congratulations! Successfully upgraded to the ${org.plan}!`);
  }
}

window.billingComponent = new BillingComponent();
