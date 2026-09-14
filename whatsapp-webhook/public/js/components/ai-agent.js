/* ==========================================================================
   NexusLead AI - AI Sales Agent Configuration & Knowledge Base Component
   ========================================================================== */

class AIAgentComponent {
  init() {
    this.bindEvents();
    this.render();
  }

  bindEvents() {
    const form = document.getElementById('ai-agent-config-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveConfig();
      });
    }

    // Add FAQ button
    const addFaqBtn = document.getElementById('add-faq-btn');
    if (addFaqBtn) {
      addFaqBtn.addEventListener('click', () => this.addFaqItem());
    }
  }

  render() {
    const config = window.appState.get('aiAgentConfig') || {};

    const setInput = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.value = val;
    };

    setInput('ai-agent-biz-name', config.businessName);
    setInput('ai-agent-industry', config.industry);
    setInput('ai-agent-pricing', config.pricingRules);
    setInput('ai-agent-tone-select', config.tone || 'Professional & Consultative');

    // Render Qualification Questions
    const questionsContainer = document.getElementById('ai-agent-questions-list');
    if (questionsContainer && config.qualificationQuestions) {
      questionsContainer.innerHTML = config.qualificationQuestions.map((q, idx) => `
        <div class="flex items-center gap-2" style="margin-bottom: 8px;">
          <span style="font-weight: 700; color: #8b5cf6;">Q${idx + 1}:</span>
          <input type="text" class="form-input ai-qual-q-input" value="${this.escapeHtml(q)}">
          <button type="button" class="btn btn-secondary btn-sm btn-icon" onclick="this.parentElement.remove()">✕</button>
        </div>
      `).join('');
    }

    // Render FAQs
    const faqContainer = document.getElementById('ai-agent-faqs-list');
    if (faqContainer && config.faqs) {
      faqContainer.innerHTML = config.faqs.map((faq, idx) => `
        <div class="card" style="padding: 12px; margin-bottom: 10px;">
          <div class="form-group" style="margin-bottom: 6px;">
            <label class="form-label" style="font-size: 11px;">Question</label>
            <input type="text" class="form-input ai-faq-q" value="${this.escapeHtml(faq.q)}">
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" style="font-size: 11px;">Verified Answer (Guardrail Rule)</label>
            <textarea class="form-textarea ai-faq-a" style="min-height: 50px;">${this.escapeHtml(faq.a)}</textarea>
          </div>
        </div>
      `).join('');
    }
  }

  addFaqItem() {
    const faqContainer = document.getElementById('ai-agent-faqs-list');
    if (faqContainer) {
      const div = document.createElement('div');
      div.className = 'card';
      div.style.padding = '12px';
      div.style.marginBottom = '10px';
      div.innerHTML = `
        <div class="form-group" style="margin-bottom: 6px;">
          <label class="form-label" style="font-size: 11px;">Question</label>
          <input type="text" class="form-input ai-faq-q" placeholder="e.g. Do you support multi-location franchises?">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-size: 11px;">Verified Answer</label>
          <textarea class="form-textarea ai-faq-a" style="min-height: 50px;" placeholder="Yes, our scale plan supports unlimited branches."></textarea>
        </div>
      `;
      faqContainer.appendChild(div);
    }
  }

  saveConfig() {
    const config = window.appState.get('aiAgentConfig') || {};

    config.businessName = document.getElementById('ai-agent-biz-name')?.value || config.businessName;
    config.industry = document.getElementById('ai-agent-industry')?.value || config.industry;
    config.pricingRules = document.getElementById('ai-agent-pricing')?.value || config.pricingRules;
    config.tone = document.getElementById('ai-agent-tone-select')?.value || config.tone;

    // Collect questions
    const qInputs = document.querySelectorAll('.ai-qual-q-input');
    config.qualificationQuestions = Array.from(qInputs).map(i => i.value.trim()).filter(Boolean);

    // Collect FAQs
    const faqCards = document.querySelectorAll('#ai-agent-faqs-list .card');
    config.faqs = Array.from(faqCards).map(card => ({
      q: card.querySelector('.ai-faq-q')?.value || '',
      a: card.querySelector('.ai-faq-a')?.value || ''
    })).filter(f => f.q.trim().length > 0);

    window.appState.set('aiAgentConfig', config);
    window.appState.addAuditLog('AI Agent Config Saved', 'Knowledge Base & Guardrails', 'Updated sales agent configuration parameters.', 'Success');

    alert('AI Sales Agent knowledge base and qualification rules saved successfully!');
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
}

window.aiAgentComponent = new AIAgentComponent();
