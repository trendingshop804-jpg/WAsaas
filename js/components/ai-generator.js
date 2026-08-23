/* ==========================================================================
   NexusLead AI - Multilingual AI Message Generator Component
   ========================================================================== */

class AIGeneratorComponent {
  init() {
    this.bindEvents();
  }

  bindEvents() {
    const form = document.getElementById('ai-msg-generator-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.generateMessages();
      });
    }

    // Copy to template button
    const copyBtn = document.getElementById('ai-save-as-template-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.saveGeneratedAsTemplate());
    }
  }

  async generateMessages() {
    const product = document.getElementById('ai-input-product')?.value || 'WhatsApp Sales Automation';
    const industry = document.getElementById('ai-input-industry')?.value || 'Healthcare & Clinics';
    const language = document.getElementById('ai-input-language')?.value || 'English';
    const tone = document.getElementById('ai-input-tone')?.value || 'Professional';
    const cta = document.getElementById('ai-input-cta')?.value || 'Reply DEMO for a 5-min walkthrough';
    const outputContainer = document.getElementById('ai-generated-sequence-output');
    const statusIndicator = document.getElementById('ai-gen-status');

    if (statusIndicator) {
      statusIndicator.innerHTML = `
        <div class="flex items-center gap-2" style="color: #a78bfa;">
          <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path></svg>
          Generating multi-touch sequence in ${language} with ${tone} tone...
        </div>
      `;
    }

    setTimeout(async () => {
      const mockLead = {
        contactName: '{{first_name}}',
        companyName: '{{company_name}}',
        industry,
        location: '{{location}}'
      };

      const steps = [
        { label: 'Step 1: Initial Hook & Value Proposition', idx: 0 },
        { label: 'Step 2: Follow-Up #1 (24h later - Social Proof)', idx: 1 },
        { label: 'Step 3: Follow-Up #2 (48h later - Case Study / Metric)', idx: 2 },
        { label: 'Step 4: Final Break-up / Opt-in Check', idx: 3 }
      ];

      const generated = await Promise.all(steps.map(async (st) => {
        const res = await window.aiService.generateMessage({
          product,
          lead: mockLead,
          tone,
          language,
          cta,
          sequenceStep: st.idx
        });
        return { ...st, text: res.message };
      }));

      if (outputContainer) {
        outputContainer.innerHTML = generated.map(g => `
          <div class="card" style="margin-bottom: 12px; border-left: 3px solid #8b5cf6;">
            <div class="flex items-center justify-between" style="margin-bottom: 8px;">
              <span style="font-size: 12px; font-weight: 700; color: #a78bfa;">${g.label}</span>
              <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(\`${g.text.replace(/"/g, '\\"')}\`); alert('Copied to clipboard!');">
                Copy
              </button>
            </div>
            <div style="padding: 12px; background: var(--bg-tertiary); border-radius: 8px; font-size: 13px; line-height: 1.5; color: var(--text-primary); border: 1px solid var(--border-subtle);">
              ${this.escapeHtml(g.text)}
            </div>
          </div>
        `).join('');
      }

      if (statusIndicator) {
        statusIndicator.innerHTML = `<span style="color: var(--status-success); font-weight: 600;">✓ Generated 4-step personalized WhatsApp sequence using Gemini 3.7 Flash.</span>`;
      }
    }, 800);
  }

  saveGeneratedAsTemplate() {
    const templates = window.appState.get('templates') || [];
    const language = document.getElementById('ai-input-language')?.value || 'English';
    const firstTextEl = document.querySelector('#ai-generated-sequence-output .card div[style*="background"]');

    if (!firstTextEl) {
      alert('Please click "Generate WhatsApp Sequence" first.');
      return;
    }

    const newTmpl = {
      id: 'tmpl_ai_' + Date.now(),
      name: `ai_generated_${language.toLowerCase()}_${Date.now().toString().slice(-4)}`,
      category: 'MARKETING',
      language: `${language} (Standard)`,
      status: 'APPROVED',
      metaStatus: 'Meta Verified',
      body: firstTextEl.textContent.trim(),
      variables: ['first_name', 'company_name', 'location'],
      quickReplies: ['Interested', 'Send Details', 'STOP']
    };

    window.appState.set('templates', [newTmpl, ...templates]);
    window.appState.addAuditLog('Template Created via AI', newTmpl.name, `Saved generated ${language} template.`, 'Approved');
    alert(`Saved template "${newTmpl.name}" to Template Manager!`);
    window.navigationComponent.switchView('templates');
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
}

window.aiGeneratorComponent = new AIGeneratorComponent();
