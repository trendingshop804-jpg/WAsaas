/* =============================================================================
   wa-broadcast.js — NextBright CRM
   WhatsApp Broadcast Lists, Segment Builder & Opt-Out Suppression
   ============================================================================= */

'use strict';

(function () {
  const DEFAULT_SEGMENTS = [
    {
      id: 'seg-1',
      name: 'High Score Hot Leads',
      description: 'Leads with engagement score > 80 and active status',
      criteria: 'Score > 80 AND Status == "Hot"',
      contact_count: 85,
      created_at: new Date(Date.now() - 86400000 * 10).toISOString()
    },
    {
      id: 'seg-2',
      name: 'Inbound Webhook Leads',
      description: 'Leads captured via WhatsApp incoming webhooks',
      criteria: 'Source == "WhatsApp Webhook"',
      contact_count: 240,
      created_at: new Date(Date.now() - 86400000 * 5).toISOString()
    },
    {
      id: 'seg-3',
      name: 'Unqualified Follow-up List',
      description: 'Leads pending second contact attempt',
      criteria: 'FollowupPending == true',
      contact_count: 42,
      created_at: new Date(Date.now() - 86400000 * 2).toISOString()
    }
  ];

  const DEFAULT_OPTOUTS = [
    { phone: '+15550192834', name: 'John Doe', optout_date: '2026-09-15', reason: 'Replied STOP' },
    { phone: '+919876012345', name: 'Rajesh Kumar', optout_date: '2026-09-20', reason: 'User opt-out request' }
  ];

  function getSegments() {
    try {
      const stored = localStorage.getItem('nb_wa_segments');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    localStorage.setItem('nb_wa_segments', JSON.stringify(DEFAULT_SEGMENTS));
    return DEFAULT_SEGMENTS;
  }

  function saveSegments(segs) {
    localStorage.setItem('nb_wa_segments', JSON.stringify(segs));
  }

  function getOptouts() {
    try {
      const stored = localStorage.getItem('nb_wa_optouts');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    localStorage.setItem('nb_wa_optouts', JSON.stringify(DEFAULT_OPTOUTS));
    return DEFAULT_OPTOUTS;
  }

  function saveOptouts(opts) {
    localStorage.setItem('nb_wa_optouts', JSON.stringify(opts));
  }

  function initWABroadcast() {
    renderSegmentsGrid();
    renderOptoutsTable();
    setupEventListeners();
  }

  function setupEventListeners() {
    const createSegBtn = document.getElementById('btn-create-segment');
    if (createSegBtn) {
      createSegBtn.addEventListener('click', openCreateSegmentModal);
    }

    const form = document.getElementById('form-create-segment');
    if (form) {
      form.addEventListener('submit', handleCreateSegmentSubmit);
    }

    const addOptoutBtn = document.getElementById('btn-add-optout');
    if (addOptoutBtn) {
      addOptoutBtn.addEventListener('click', handleAddOptout);
    }
  }

  function renderSegmentsGrid() {
    const container = document.getElementById('segments-grid');
    if (!container) return;

    const segs = getSegments();

    if (segs.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 32px; text-align: center; color: var(--text-muted); background: white; border-radius: 8px;">
          No segments created yet. Create a target audience segment to send targeted broadcasts.
        </div>
      `;
      return;
    }

    container.innerHTML = segs.map(seg => `
      <div class="segment-card" style="background: white; border-radius: 10px; border: 1px solid var(--border-light); padding: 16px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <strong style="font-size: 0.95rem; color: var(--text-dark);">${escapeHtml(seg.name)}</strong>
            <span class="badge badge-primary" style="font-size: 0.75rem;">${seg.contact_count} contacts</span>
          </div>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">${escapeHtml(seg.description)}</p>
          <div style="background: var(--navy-50); padding: 6px 10px; border-radius: 6px; font-family: monospace; font-size: 0.75rem; color: var(--navy-800); margin-bottom: 14px;">
            ${escapeHtml(seg.criteria)}
          </div>
        </div>
        <div style="display: flex; gap: 8px; border-top: 1px solid var(--border-light); padding-top: 12px;">
          <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="window.NextBrightWABroadcast.exportSegment('${seg.id}')">
            <i data-feather="download"></i> Export CSV
          </button>
          <button class="btn btn-secondary btn-sm" style="color: var(--status-danger);" onclick="window.NextBrightWABroadcast.deleteSegment('${seg.id}')">
            <i data-feather="trash-2"></i>
          </button>
        </div>
      </div>
    `).join('');

    if (window.feather) feather.replace();
  }

  function renderOptoutsTable() {
    const container = document.getElementById('optouts-table-body');
    if (!container) return;

    const opts = getOptouts();

    if (opts.length === 0) {
      container.innerHTML = `
        <tr><td colspan="4" style="text-align: center; padding: 24px; color: var(--text-muted);">No contacts in opt-out list</td></tr>
      `;
      return;
    }

    container.innerHTML = opts.map(o => `
      <tr>
        <td style="font-family: monospace; font-weight: 600;">${o.phone}</td>
        <td>${escapeHtml(o.name)}</td>
        <td><span class="badge badge-danger">${o.reason}</span></td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${o.optout_date}</td>
      </tr>
    `).join('');
  }

  function openCreateSegmentModal() {
    const modal = document.getElementById('modal-create-segment');
    if (modal) modal.style.display = 'flex';
  }

  function closeCreateSegmentModal() {
    const modal = document.getElementById('modal-create-segment');
    if (modal) modal.style.display = 'none';
  }

  function handleCreateSegmentSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('seg-name-input')?.value || 'New Segment';
    const description = document.getElementById('seg-desc-input')?.value || 'Target segment';
    const criteria = document.getElementById('seg-criteria-input')?.value || 'Status == Active';

    const segs = getSegments();
    const newSeg = {
      id: 'seg-' + Date.now(),
      name,
      description,
      criteria,
      contact_count: Math.floor(Math.random() * 100) + 15,
      created_at: new Date().toISOString()
    };

    segs.unshift(newSeg);
    saveSegments(segs);
    closeCreateSegmentModal();
    renderSegmentsGrid();

    if (window.showToast) window.showToast(`Audience Segment "${name}" created!`, 'success');
  }

  function handleAddOptout() {
    const phone = prompt('Enter phone number to add to WhatsApp Opt-Out suppression list:');
    if (!phone) return;

    const opts = getOptouts();
    opts.unshift({
      phone,
      name: 'Manual Suppressed Contact',
      optout_date: new Date().toISOString().split('T')[0],
      reason: 'Manual Opt-Out Add'
    });

    saveOptouts(opts);
    renderOptoutsTable();
    if (window.showToast) window.showToast(`Added ${phone} to suppression list`, 'default');
  }

  function exportSegment(id) {
    const segs = getSegments();
    const seg = segs.find(s => s.id === id);
    if (!seg) return;

    const csvContent = `Phone,Name,LeadScore,Segment\n+919876543210,Sample Lead 1,85,${seg.name}\n+919876543211,Sample Lead 2,90,${seg.name}`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${seg.name.toLowerCase().replace(/\s+/g, '_')}_contacts.csv`;
    a.click();

    if (window.showToast) window.showToast(`Exported CSV for ${seg.name}`, 'info');
  }

  function deleteSegment(id) {
    if (!confirm('Delete this segment?')) return;
    let segs = getSegments();
    segs = segs.filter(s => s.id !== id);
    saveSegments(segs);
    renderSegmentsGrid();
    if (window.showToast) window.showToast('Segment removed', 'default');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.NextBrightWABroadcast = {
    init: initWABroadcast,
    exportSegment,
    deleteSegment,
    closeModal: closeCreateSegmentModal
  };

  document.addEventListener('DOMContentLoaded', () => {
    initWABroadcast();
  });
})();
