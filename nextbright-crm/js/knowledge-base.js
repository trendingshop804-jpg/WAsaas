/* =============================================================================
   knowledge-base.js — NextBright CRM
   AI Grounded Knowledge Base Management & Category Filtering
   ============================================================================= */

'use strict';

(function () {
  const DEFAULT_ENTRIES = [
    {
      id: 'kb-1',
      category: 'company',
      title: 'NextBright CRM Overview',
      content: 'NextBright CRM is a multi-tenant AI automation platform supporting WhatsApp Cloud API, Instagram Graph API, Twilio Voice Calls, and lead pipeline tracking.',
      keywords: ['nextbright', 'crm', 'saas', 'overview'],
      is_active: true,
      created_at: new Date(Date.now() - 86400000 * 5).toISOString()
    },
    {
      id: 'kb-2',
      category: 'pricing',
      title: 'Subscription Pricing & Packages',
      content: 'Starter Plan: $49/mo (includes 1,000 monthly messages & CRM pipeline). Enterprise Plan: $149/mo (includes unlimited AI auto-replies, multi-agent support, and priority SLA).',
      keywords: ['pricing', 'cost', 'plans', 'enterprise', 'starter'],
      is_active: true,
      created_at: new Date(Date.now() - 86400000 * 4).toISOString()
    },
    {
      id: 'kb-3',
      category: 'faq',
      title: 'Working Hours & Location',
      content: 'Our support team operates Monday through Friday from 9:00 AM to 6:00 PM EST. Headquartered at 100 Tech Park Way, Suite 400, San Francisco, CA.',
      keywords: ['hours', 'location', 'address', 'support', 'timing'],
      is_active: true,
      created_at: new Date(Date.now() - 86400000 * 3).toISOString()
    },
    {
      id: 'kb-4',
      category: 'booking',
      title: 'Demo & Appointment Instructions',
      content: 'Customers can request a live 1-on-1 demo by sharing their full name, company, email, and preferred date/time slot.',
      keywords: ['demo', 'booking', 'appointment', 'schedule'],
      is_active: true,
      created_at: new Date(Date.now() - 86400000 * 2).toISOString()
    }
  ];

  let currentCategory = 'all';

  function getEntries() {
    try {
      const stored = localStorage.getItem('nb_knowledge_base');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    localStorage.setItem('nb_knowledge_base', JSON.stringify(DEFAULT_ENTRIES));
    return DEFAULT_ENTRIES;
  }

  function saveEntries(entries) {
    try {
      localStorage.setItem('nb_knowledge_base', JSON.stringify(entries));
    } catch (e) {}
  }

  function initKnowledgeBase() {
    renderKnowledgeGrid();
    setupEventListeners();
  }

  function setupEventListeners() {
    const tabs = document.querySelectorAll('#kb-category-tabs .tab-item, [data-kb-category]');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        tabs.forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentCategory = e.currentTarget.dataset.kbCategory || 'all';
        renderKnowledgeGrid();
      });
    });

    const searchInput = document.getElementById('kb-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderKnowledgeGrid();
      });
    }

    const createBtn = document.getElementById('btn-add-kb-entry');
    if (createBtn) {
      createBtn.addEventListener('click', openCreateModal);
    }

    const form = document.getElementById('form-create-kb-entry');
    if (form) {
      form.addEventListener('submit', handleCreateSubmit);
    }
  }

  function renderKnowledgeGrid() {
    const container = document.getElementById('kb-entries-grid');
    if (!container) return;

    let entries = getEntries();
    const searchVal = (document.getElementById('kb-search-input')?.value || '').toLowerCase();

    if (currentCategory !== 'all') {
      entries = entries.filter(e => e.category === currentCategory);
    }

    if (searchVal) {
      entries = entries.filter(e =>
        e.title.toLowerCase().includes(searchVal) ||
        e.content.toLowerCase().includes(searchVal) ||
        (e.keywords && e.keywords.some(k => String(k).toLowerCase().includes(searchVal)))
      );
    }

    if (entries.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 48px; text-align: center; background: white; border-radius: 12px; border: 1px dashed var(--border-light);">
          <div style="font-size: 3rem; margin-bottom: 12px;">📚</div>
          <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 6px;">No Knowledge Base Entries</h3>
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 16px;">Add company details, FAQs, pricing and policies to ground AI auto-replies accurately.</p>
          <button class="btn btn-primary" onclick="document.getElementById('btn-add-kb-entry')?.click()">
            <i data-feather="plus"></i> Add Knowledge Entry
          </button>
        </div>
      `;
      if (window.feather) feather.replace();
      return;
    }

    container.innerHTML = entries.map(entry => {
      let badgeClass = 'badge-primary';
      if (entry.category === 'pricing') badgeClass = 'badge-success';
      else if (entry.category === 'faq') badgeClass = 'badge-info';
      else if (entry.category === 'booking') badgeClass = 'badge-warning';

      return `
        <div class="kb-card" style="background: white; border-radius: 12px; border: 1px solid var(--border-light); padding: 20px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
              <strong style="font-size: 1.05rem; color: var(--text-dark);">${escapeHtml(entry.title)}</strong>
              <span class="badge ${badgeClass}" style="text-transform: capitalize;">${entry.category}</span>
            </div>

            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 14px; line-height: 1.5; white-space: pre-line;">
              ${escapeHtml(entry.content)}
            </p>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-light); padding-top: 12px; font-size: 0.75rem; color: var(--text-muted);">
            <span>Added ${new Date(entry.created_at).toLocaleDateString()}</span>
            <button class="btn btn-secondary btn-sm" style="color: var(--status-danger);" onclick="window.NextBrightKB.deleteEntry('${entry.id}')">
              <i data-feather="trash-2"></i> Delete
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.feather) feather.replace();
  }

  function openCreateModal() {
    const modal = document.getElementById('modal-create-kb-entry');
    if (modal) modal.style.display = 'flex';
  }

  function closeCreateModal() {
    const modal = document.getElementById('modal-create-kb-entry');
    if (modal) modal.style.display = 'none';
  }

  async function handleCreateSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('kb-title-input')?.value || 'New Knowledge Entry';
    const category = document.getElementById('kb-category-select')?.value || 'general';
    const content = document.getElementById('kb-content-input')?.value || '';

    const entries = getEntries();
    const newEntry = {
      id: 'kb-' + Date.now(),
      category,
      title,
      content,
      keywords: [category, title.toLowerCase()],
      is_active: true,
      created_at: new Date().toISOString()
    };

    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = window.supabaseConfig?.accessToken || localStorage.getItem('sb-access-token') || '';
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/knowledge-base?action=save', {
        method: 'POST',
        headers,
        body: JSON.stringify({ entry: newEntry })
      });
    } catch (err) {}

    entries.unshift(newEntry);
    saveEntries(entries);
    closeCreateModal();
    renderKnowledgeGrid();

    if (window.showToast) window.showToast(`Knowledge Entry "${title}" added!`, 'success');
  }

  function deleteEntry(id) {
    if (!confirm('Are you sure you want to delete this knowledge base entry?')) return;
    let entries = getEntries();
    entries = entries.filter(e => e.id !== id);
    saveEntries(entries);
    renderKnowledgeGrid();

    if (window.showToast) window.showToast('Knowledge entry deleted', 'default');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.NextBrightKB = {
    init: initKnowledgeBase,
    deleteEntry,
    closeModal: closeCreateModal
  };

  document.addEventListener('DOMContentLoaded', () => {
    initKnowledgeBase();
  });
})();
