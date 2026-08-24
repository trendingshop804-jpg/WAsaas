/* ==========================================================================
   NexusLead AI - Multilingual AI Message Generator Component
   ========================================================================== */

class AIGeneratorComponent {
  init() {
    this.bindEvents();
    this.bindPromptStudio();
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

  bindPromptStudio() {
    const studioForm = document.getElementById('prompt-studio-form');
    if (!studioForm) return;

    studioForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.generateCustomSystemPrompt();
    });

    const copyBtn = document.getElementById('prompt-studio-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const code = document.getElementById('prompt-studio-code')?.textContent || '';
        navigator.clipboard.writeText(code);
        alert('Copied System Prompt to clipboard!');
      });
    }

    const deployBtn = document.getElementById('prompt-studio-deploy-btn');
    if (deployBtn) {
      deployBtn.addEventListener('click', () => {
        const code = document.getElementById('prompt-studio-code')?.textContent || '';
        if (window.aiService) {
          window.aiService.systemPrompt = code;
          alert('Successfully deployed as Active System Prompt for OpenRouter AI Agent!');
        }
      });
    }
  }

  generateCustomSystemPrompt() {
    const biz = document.getElementById('studio-input-biz')?.value || 'Apex IT Services - Software & Tech';
    const services = document.getElementById('studio-input-services')?.value || 'Websites, Custom SaaS, Cloud Infra, AI Automation';
    const pricing = document.getElementById('studio-input-pricing')?.value || 'Scope-based Custom Pricing';
    const lang = document.getElementById('studio-input-lang')?.value || 'English, Tamil, Malayalam';
    const goal = document.getElementById('studio-input-goal')?.value || 'Book Google Meet & Collect Advance Payment';

    const serviceList = services.split(',').map(s => `- ${s.trim()}: [${pricing}]`).join('\n');

    const promptText = `SYSTEM_PROMPT = """
=== 1. ROLE & IDENTITY ===
You are a Senior Technical Sales Executive representing ${biz}.
Your sole mission is to understand client requirements, demonstrate maximum business value, handle objections with precision, and CLOSE deals fast on WhatsApp.

OUR SERVICES & OFFERINGS:
${serviceList}

=== 2. THINKING FRAMEWORK (INTERNAL EXECUTION) ===
For every inbound customer message, process your response internally through these 3 steps:

STEP A: UNDERSTAND
- Identify client needs across services (${services}).
- Detect customer language (${lang}) and respond in the EXACT same language naturally.

STEP B: HANDLE OBJECTIONS
- If "Costly": Position software & automation as a 24/7 asset that cuts operational costs and boosts revenue, not an expense.
- If "Need Time": Offer a free demo / quick 5-min video, or create urgency with limited availability.

STEP C: CLOSE
- Primary Goal (${goal}):
  1. Early Stage: Ask 1 qualifying question to capture project requirements.
  2. Warm Stage: Propose a quick 15-minute Google Meet consultation call.
  3. Hot Stage: Share booking link or advance invoice payment link to lock in the project.

=== 3. STRICT OUTPUT CONSTRAINTS ===
- Length: STRICTLY under 3 sentences (50 words max).
- Tone: Professional, authoritative, and direct.
- Formatting: Clean WhatsApp text with *bolding* on key metrics.
- Closing CTA: ALWAYS end with a direct question.

OUTPUT ONLY THE FINAL WHATSAPP MESSAGE TO THE CLIENT.
"""`;

    const codeEl = document.getElementById('prompt-studio-code');
    const container = document.getElementById('prompt-studio-output');
    if (codeEl && container) {
      codeEl.textContent = promptText;
      container.style.display = 'block';
      container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }


  async generateMessages() {
    const product = document.getElementById('ai-input-product')?.value || 'WhatsApp Sales Automation';
    const industry = document.getElementById('ai-input-industry')?.value || 'Healthcare & Clinics';
    const selectedModel = document.getElementById('ai-input-model')?.value || 'deepseek/deepseek-r1';
    const language = document.getElementById('ai-input-language')?.value || 'English';
    const tone = document.getElementById('ai-input-tone')?.value || 'Professional';
    const cta = document.getElementById('ai-input-cta')?.value || 'Reply DEMO for a 5-min walkthrough';
    const outputContainer = document.getElementById('ai-generated-sequence-output');
    const statusIndicator = document.getElementById('ai-gen-status');

    if (window.aiService) {
      window.aiService.selectedModel = selectedModel;
    }

    if (statusIndicator) {
      statusIndicator.innerHTML = `
        <div class="flex items-center gap-2" style="color: #a78bfa;">
          <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path></svg>
          Connecting to OpenRouter.ai API (${selectedModel})...
        </div>
      `;
    }

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
      return { ...st, text: res.message, provider: res.provider || 'OpenRouter.ai' };
    }));

    if (outputContainer) {
      outputContainer.innerHTML = generated.map(g => `
        <div class="card" style="margin-bottom: 12px; border-left: 3px solid #8b5cf6;">
          <div class="flex items-center justify-between" style="margin-bottom: 8px;">
            <span style="font-size: 12px; font-weight: 700; color: #a78bfa;">${g.label}</span>
            <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(\`${g.text.replace(/`/g, '\\`').replace(/"/g, '\\"')}\`); alert('Copied to clipboard!');">
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
      statusIndicator.innerHTML = `<span style="color: var(--status-success); font-weight: 600;">✓ Generated 4-step sequence powered by OpenRouter.ai (${selectedModel}).</span>`;
    }
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
