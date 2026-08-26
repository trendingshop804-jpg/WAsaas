/* ==========================================================================
   NexusLead AI - 7-Step Guided Onboarding Wizard Component
   ========================================================================== */

class OnboardingComponent {
  constructor() {
    this.currentStep = 1;
    this.totalSteps = 7;
  }

  init() {
    this.bindEvents();
    this.render();
  }

  bindEvents() {
    // Open Onboarding Wizard Modal
    const startWizardBtn = document.getElementById('start-onboarding-wizard-btn');
    if (startWizardBtn) {
      startWizardBtn.addEventListener('click', () => {
        const modal = document.getElementById('onboarding-wizard-modal');
        if (modal) {
          this.currentStep = 1;
          this.render();
          modal.classList.add('active');
        }
      });
    }

    const nextBtn = document.getElementById('onboarding-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.nextStep());
    }

    const prevBtn = document.getElementById('onboarding-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.prevStep());
    }
  }

  render() {
    const titleEl = document.getElementById('onboarding-step-title');
    const descEl = document.getElementById('onboarding-step-desc');
    const bodyEl = document.getElementById('onboarding-step-body');
    const progressEl = document.getElementById('onboarding-progress-bar');
    const stepCountEl = document.getElementById('onboarding-step-count');
    const prevBtn = document.getElementById('onboarding-prev-btn');
    const nextBtn = document.getElementById('onboarding-next-btn');

    if (stepCountEl) stepCountEl.textContent = `Step ${this.currentStep} of ${this.totalSteps}`;
    if (progressEl) progressEl.style.width = `${(this.currentStep / this.totalSteps) * 100}%`;

    if (prevBtn) prevBtn.style.display = this.currentStep === 1 ? 'none' : 'inline-flex';
    if (nextBtn) nextBtn.textContent = this.currentStep === this.totalSteps ? 'Finish & Launch Platform 🚀' : 'Next Step →';

    const steps = [
      {
        title: 'Step 1: Set Up Business Profile',
        desc: 'Define your company name, industry, and timezone for smart scheduling.',
        content: `
          <div class="form-group">
            <label class="form-label">Business Name</label>
            <input type="text" class="form-input" value="Nexus Growth Labs">
          </div>
          <div class="form-group">
            <label class="form-label">Target Industry</label>
            <input type="text" class="form-input" value="Healthcare, Clinics, B2B Services">
          </div>
        `
      },
      {
        title: 'Step 2: Connect WhatsApp & Instagram',
        desc: 'One-click connection to your WhatsApp Business and Instagram accounts via Facebook.',
        content: '<div id="onboarding-meta-step"></div>',
        onRender: () => {
          const container = document.getElementById('onboarding-meta-step');
          if (container && window.metaOnboardingComponent) {
            window.metaOnboardingComponent.state = 'idle';
            window.metaOnboardingComponent.render(container);
          }
        }
      },
      {
        title: 'Step 3: Discover & Import Leads',
        desc: 'Find compliant B2B prospects or upload your existing CSV client database.',
        content: `
          <div style="padding: 14px; background: var(--bg-tertiary); border-radius: 8px; font-size: 13px;">
            ✓ Pre-loaded with verified leads across Kerala, Bangalore & Chennai.<br>
            ✓ Automated deduplication and phone format normalization active.
          </div>
        `
      },
      {
        title: 'Step 4: Create Outreach Campaign',
        desc: 'Select approved Meta templates and configure sending rate limits.',
        content: `
          <div class="form-group">
            <label class="form-label">Selected Outreach Template</label>
            <input type="text" class="form-input" value="healthcare_appointment_intro_v2 (Approved)" readonly>
          </div>
          <div class="form-group">
            <label class="form-label">Safe Daily Sending Limit</label>
            <input type="number" class="form-input" value="150">
          </div>
        `
      },
      {
        title: 'Step 5: Configure 3-Touch Follow-Ups',
        desc: 'Set up automated sequences that automatically pause when prospect replies.',
        content: `
          <div style="padding: 12px; background: var(--bg-tertiary); border-radius: 8px; font-size: 12.5px;">
            <strong>Sequence Engine Active:</strong><br>
            Day 0: Initial Hook → Day 1: Case Study → Day 3: Break-up note.<br>
            <span style="color: var(--status-success); font-weight: 600;">✓ Auto-stops on customer response or STOP keyword.</span>
          </div>
        `
      },
      {
        title: 'Step 6: Activate AI Sales Agent',
        desc: 'Train your AI bot on pricing rules, FAQs, and qualification criteria.',
        content: `
          <div class="form-group">
            <label class="form-label">AI Sales Model</label>
            <input type="text" class="form-input" value="Gemini 3.7 Flash (High Accuracy, Anti-Hallucination)" readonly>
          </div>
          <div style="font-size: 12px; color: var(--brand-whatsapp);">
            ✓ Strict guardrails preventing unverified pricing and guarantees.
          </div>
        `
      },
      {
        title: 'Step 7: Launch Automation Operating System',
        desc: 'Your end-to-end AI sales machine is fully configured and ready!',
        content: `
          <div style="text-align: center; padding: 20px;">
            <div style="font-size: 40px; margin-bottom: 10px;">🚀</div>
            <h3 style="margin-bottom: 6px;">Ready to Scale Outbound Sales!</h3>
            <p style="font-size: 13px; color: var(--text-secondary);">
              Your workspace is armed with automated lead discovery, AI scoring, WhatsApp dispatch, and live multi-touch workflows.
            </p>
          </div>
        `
      }
    ];

    const cur = steps[this.currentStep - 1];
    if (titleEl) titleEl.textContent = cur.title;
    if (descEl) descEl.textContent = cur.desc;
    if (bodyEl) bodyEl.innerHTML = cur.content;
    if (cur.onRender) cur.onRender();
  }

  nextStep() {
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
      this.render();
    } else {
      const modal = document.getElementById('onboarding-wizard-modal');
      if (modal) modal.classList.remove('active');
      window.navigationComponent.switchView('dashboard');
      alert('Welcome to NexusLead AI! Your automated sales operating system is live.');
    }
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.render();
    }
  }
}

window.onboardingComponent = new OnboardingComponent();
