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
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    localStorage.setItem('nb_knowledge_base', JSON.stringify(DEFAULT_ENTRIES));
    return DEFAULT_ENTRIES;
  }

  function saveEntries(entries) {
    try {
      localStorage.setItem('nb_knowledge_base', JSON.stringify(entries));
    } catch (e) {}
  }

  async function fetchBackendEntries() {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = window.supabaseConfig?.accessToken || localStorage.getItem('sb-access-token') || '';
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/knowledge-base?action=list', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.entries) && data.entries.length > 0) {
          saveEntries(data.entries);
          renderKnowledgeGrid();
        }
      }
    } catch (_) {}
  }

  function initKnowledgeBase() {
    renderKnowledgeGrid();
    setupEventListeners();
    fetchBackendEntries();
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
      createBtn.addEventListener('click', () => openCreateModal());
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
    const searchVal = (document.getElementById('kb-search-input')?.value || '').toLowerCase().trim();

    if (currentCategory !== 'all') {
      entries = entries.filter(e => e.category === currentCategory);
    }

    if (searchVal) {
      entries = entries.filter(e =>
        (e.title && e.title.toLowerCase().includes(searchVal)) ||
        (e.content && e.content.toLowerCase().includes(searchVal)) ||
        (e.keywords && e.keywords.some(k => String(k).toLowerCase().includes(searchVal)))
      );
    }

    if (entries.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 48px; text-align: center; background: white; border-radius: 12px; border: 1px dashed var(--border-light);">
          <div style="font-size: 3rem; margin-bottom: 12px;">📚</div>
          <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 6px;">No Knowledge Base Entries Found</h3>
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 16px;">Add company details, FAQs, pricing and policies to ground AI auto-replies accurately.</p>
          <button type="button" class="btn btn-primary" onclick="window.NextBrightKB.openModal()">
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
      else if (entry.category === 'company') badgeClass = 'badge-primary';

      return `
        <div class="kb-card" data-kb-id="${entry.id}">
          <div class="kb-card-body">
            <div class="kb-card-header">
              <strong class="kb-card-title">${escapeHtml(entry.title)}</strong>
              <span class="badge ${badgeClass}" style="text-transform: capitalize;">${entry.category}</span>
            </div>

            <p class="kb-card-content">
              ${escapeHtml(entry.content)}
            </p>
          </div>

          <div class="kb-card-footer">
            <span class="kb-card-date">Added ${new Date(entry.created_at).toLocaleDateString()}</span>
            <div class="kb-card-actions">
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.NextBrightKB.openModal('${entry.id}')" title="Edit Article">
                <i data-feather="edit-2"></i> Edit
              </button>
              <button type="button" class="btn btn-secondary btn-sm btn-delete-kb" style="color: var(--status-danger);" onclick="window.NextBrightKB.deleteEntry('${entry.id}')" title="Delete Article">
                <i data-feather="trash-2"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.feather) feather.replace();
  }

  function openCreateModal(id) {
    const modal = document.getElementById('modal-create-kb-entry');
    const idInput = document.getElementById('kb-id-input');
    const titleInput = document.getElementById('kb-title-input');
    const catSelect = document.getElementById('kb-category-select');
    const contentInput = document.getElementById('kb-content-input');
    const modalTitle = document.getElementById('modal-kb-title');
    const submitBtn = document.getElementById('btn-save-kb-submit');

    if (id) {
      const entries = getEntries();
      const entry = entries.find(e => e.id === id);
      if (entry) {
        if (idInput) idInput.value = entry.id;
        if (titleInput) titleInput.value = entry.title || '';
        if (catSelect) catSelect.value = entry.category || 'company';
        if (contentInput) contentInput.value = entry.content || '';
        if (modalTitle) modalTitle.textContent = 'Edit Knowledge Base Entry';
        if (submitBtn) submitBtn.innerHTML = '<i data-feather="check"></i> Update Entry';
      }
    } else {
      if (idInput) idInput.value = '';
      if (titleInput) titleInput.value = '';
      if (catSelect) catSelect.value = 'company';
      if (contentInput) contentInput.value = '';
      if (modalTitle) modalTitle.textContent = 'Add Knowledge Base Entry';
      if (submitBtn) submitBtn.innerHTML = '<i data-feather="check"></i> Save Entry';
    }

    if (modal) modal.style.display = 'flex';
    if (window.feather) feather.replace();
  }

  function closeCreateModal() {
    const modal = document.getElementById('modal-create-kb-entry');
    if (modal) modal.style.display = 'none';
  }

  async function handleCreateSubmit(e) {
    e.preventDefault();
    const idInput = document.getElementById('kb-id-input');
    const editingId = idInput?.value?.trim() || '';
    const title = document.getElementById('kb-title-input')?.value?.trim() || 'New Knowledge Entry';
    const category = document.getElementById('kb-category-select')?.value || 'company';
    const content = document.getElementById('kb-content-input')?.value?.trim() || '';

    const entries = getEntries();
    let entryToSave;

    if (editingId) {
      const existing = entries.find(e => e.id === editingId);
      if (existing) {
        existing.title = title;
        existing.category = category;
        existing.content = content;
        existing.keywords = [category, title.toLowerCase()];
        existing.updated_at = new Date().toISOString();
        entryToSave = existing;
      }
    }

    if (!entryToSave) {
      entryToSave = {
        id: 'kb-' + Date.now(),
        category,
        title,
        content,
        keywords: [category, title.toLowerCase()],
        is_active: true,
        created_at: new Date().toISOString()
      };
      entries.unshift(entryToSave);
    }

    saveEntries(entries);
    closeCreateModal();
    renderKnowledgeGrid();

    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = window.supabaseConfig?.accessToken || localStorage.getItem('sb-access-token') || '';
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/knowledge-base?action=save', {
        method: 'POST',
        headers,
        body: JSON.stringify({ entry: entryToSave })
      });
    } catch (err) {}

    const actionText = editingId ? 'updated' : 'added';
    if (window.showToast) window.showToast(`Knowledge Entry "${title}" ${actionText}!`, 'success');
  }

  async function deleteEntry(id) {
    if (typeof window.confirm === 'function') {
      if (!confirm('Are you sure you want to delete this knowledge base entry?')) return;
    }
    let entries = getEntries();
    entries = entries.filter(e => e.id !== id);
    saveEntries(entries);
    renderKnowledgeGrid();

    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = window.supabaseConfig?.accessToken || localStorage.getItem('sb-access-token') || '';
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch(`/api/knowledge-base?action=delete&id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers
      });
    } catch (_) {}

    if (window.showToast) window.showToast('Knowledge entry deleted', 'default');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.NextBrightKB = {
    init: initKnowledgeBase,
    openModal: openCreateModal,
    editEntry: openCreateModal,
    deleteEntry,
    closeModal: closeCreateModal,
    getEntries,
    refresh: fetchBackendEntries
  };

  document.addEventListener('DOMContentLoaded', () => {
    initKnowledgeBase();
  });
})();
