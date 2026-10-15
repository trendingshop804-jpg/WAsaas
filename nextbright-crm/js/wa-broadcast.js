/* =============================================================================
   wa-broadcast.js — NextBright CRM
   WhatsApp Broadcast Lists, Segment Builder & Opt-Out Suppression
   ============================================================================= */
'use strict';

(function () {
  const DEFAULT_SEGMENTS = [];

  const DEFAULT_BROADCASTS = [];

  const DEFAULT_OPTOUTS = [];

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

  function getBroadcasts() {
    try {
      const stored = localStorage.getItem('nb_wa_broadcasts');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    localStorage.setItem('nb_wa_broadcasts', JSON.stringify(DEFAULT_BROADCASTS));
    return DEFAULT_BROADCASTS;
  }

  function saveBroadcasts(bcs) {
    localStorage.setItem('nb_wa_broadcasts', JSON.stringify(bcs));
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
    renderSegments();
    renderBroadcasts();
    renderOptouts();
    setupEventListeners();
  }

  function setupEventListeners() {
    const createSegBtn = document.getElementById('create-segment-btn');
    if (createSegBtn) {
      createSegBtn.onclick = openCreateSegmentModal;
    }

    const createBcBtn = document.getElementById('create-broadcast-btn');
    if (createBcBtn) {
      createBcBtn.onclick = openCreateBroadcastModal;
    }

    const formSeg = document.getElementById('form-create-segment');
    if (formSeg) {
      formSeg.onsubmit = handleCreateSegmentSubmit;
    }

    const formBc = document.getElementById('form-create-broadcast');
    if (formBc) {
      formBc.onsubmit = handleCreateBroadcastSubmit;
    }

    const addOptoutBtn = document.getElementById('btn-add-optout');
    if (addOptoutBtn) {
      addOptoutBtn.onclick = handleAddOptout;
    }
  }

  function renderSegments() {
    const container = document.getElementById('segments-list');
    if (!container) return;

    const segs = getSegments();
    if (segs.length === 0) {
      container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);background:#fff;border-radius:8px;">No audience segments created yet.</div>`;
      return;
    }

    container.innerHTML = segs.map(seg => `
      <div class="card" style="padding:14px 16px;border-radius:10px;border:1px solid var(--border-light);background:#fff;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
            <span>${escapeHtml(seg.name)}</span>
            <span class="badge badge-info" style="font-size:0.7rem;">${seg.contact_count} contacts</span>
          </div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">${escapeHtml(seg.description)}</div>
          <div style="font-size:0.72rem;color:var(--brand-primary);margin-top:4px;">Rule: <code>${escapeHtml(seg.criteria)}</code></div>
        </div>
        <div>
          <button class="btn btn-secondary btn-sm" style="color:var(--status-danger,#ef4444);" onclick="window.NextBrightWABroadcast.deleteSegment('${seg.id}')">
            <i data-feather="trash-2" style="width:12px;height:12px;"></i>
          </button>
        </div>
      </div>
    `).join('');

    if (typeof feather !== 'undefined') feather.replace();
  }

  function renderBroadcasts() {
    const container = document.getElementById('broadcasts-list');
    if (!container) return;

    const bcs = getBroadcasts();
    if (bcs.length === 0) {
      container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);background:#fff;border-radius:8px;">No broadcast history yet.</div>`;
      return;
    }

    container.innerHTML = bcs.map(bc => `
      <div class="card" style="padding:14px 16px;border-radius:10px;border:1px solid var(--border-light);background:#fff;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <strong style="font-size:0.9rem;color:var(--text-primary);">${escapeHtml(bc.title)}</strong>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">
              Segment: <strong>${escapeHtml(bc.segment_name)}</strong> · Template: <code>${bc.template}</code>
            </div>
          </div>
          <span class="badge badge-success" style="text-transform:capitalize;">${bc.status}</span>
        </div>
        <div style="display:flex;gap:16px;font-size:0.78rem;color:var(--text-secondary);margin-top:8px;">
          <span>📤 ${bc.recipients} sent</span>
          <span style="color:#10b981;">✅ ${bc.delivered} delivered</span>
          <span style="color:#6366f1;">👀 ${bc.read} read</span>
          <span style="margin-left:auto;color:var(--text-muted);font-size:0.72rem;">${new Date(bc.sent_at).toLocaleDateString()}</span>
        </div>
      </div>
    `).join('');

    if (typeof feather !== 'undefined') feather.replace();
  }

  function renderOptouts() {
    const tbody = document.getElementById('optouts-table-body');
    if (!tbody) return;

    const opts = getOptouts();
    if (opts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">No suppressed numbers.</td></tr>`;
      return;
    }

    tbody.innerHTML = opts.map((o, idx) => `
      <tr>
        <td><strong>${escapeHtml(o.phone)}</strong></td>
        <td>${escapeHtml(o.name || 'Anonymous')}</td>
        <td>${o.optout_date}</td>
        <td><span class="badge badge-secondary">${escapeHtml(o.reason)}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" style="font-size:0.72rem;padding:2px 8px;" onclick="window.NextBrightWABroadcast.removeOptout(${idx})">
            Remove
          </button>
        </td>
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

  function openCreateBroadcastModal() {
    const modal = document.getElementById('modal-create-broadcast');
    const segSelect = document.getElementById('broadcast-segment-select');
    if (segSelect) {
      const segs = getSegments();
      segSelect.innerHTML = segs.map(s => `<option value="${s.id}">${s.name} (${s.contact_count} contacts)</option>`).join('');
    }
    if (modal) modal.style.display = 'flex';
  }

  function handleCreateSegmentSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('segment-name-input')?.value.trim();
    const desc = document.getElementById('segment-desc-input')?.value.trim() || 'Custom audience segment';
    const criteria = document.getElementById('segment-criteria-select')?.value || 'All Contacts';

    if (!name) return;

    const segs = getSegments();
    segs.unshift({
      id: 'seg-' + Date.now(),
      name,
      description: desc,
      criteria,
      contact_count: Math.floor(40 + Math.random() * 160),
      created_at: new Date().toISOString()
    });

    saveSegments(segs);
    closeCreateSegmentModal();
    renderSegments();
    if (window.showToast) window.showToast(`Audience segment "${name}" created!`, 'success');
  }

  function handleCreateBroadcastSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('broadcast-name-input')?.value.trim();
    const segId = document.getElementById('broadcast-segment-select')?.value;
    const template = document.getElementById('broadcast-template-select')?.value || 'exclusive_festive_offer';

    if (!title) return;

    const segs = getSegments();
    const seg = segs.find(s => s.id === segId) || segs[0] || { name: 'General Audience', contact_count: 50 };

    const bcs = getBroadcasts();
    const newBc = {
      id: 'bc-' + Date.now(),
      title,
      segment_name: seg.name,
      template,
      recipients: seg.contact_count,
      delivered: Math.round(seg.contact_count * 0.98),
      read: Math.round(seg.contact_count * 0.82),
      status: 'completed',
      sent_at: new Date().toISOString()
    };

    bcs.unshift(newBc);
    saveBroadcasts(bcs);

    document.getElementById('modal-create-broadcast').style.display = 'none';
    renderBroadcasts();
    if (window.showToast) window.showToast(`Broadcast "${title}" dispatched to ${seg.contact_count} recipients!`, 'success');
  }

  function handleAddOptout() {
    const phone = prompt('Enter phone number to add to suppression list (e.g. +15550192834):');
    if (!phone) return;
    const opts = getOptouts();
    opts.unshift({
      phone: phone.trim(),
      name: 'Suppressed Contact',
      optout_date: new Date().toISOString().split('T')[0],
      reason: 'Manual opt-out'
    });
    saveOptouts(opts);
    renderOptouts();
    if (window.showToast) window.showToast(`Phone ${phone} added to suppression list`, 'default');
  }

  function deleteSegment(id) {
    if (!confirm('Are you sure you want to delete this audience segment?')) return;
    let segs = getSegments();
    segs = segs.filter(s => s.id !== id);
    saveSegments(segs);
    renderSegments();
    if (window.showToast) window.showToast('Segment removed', 'default');
  }

  function removeOptout(idx) {
    let opts = getOptouts();
    opts.splice(idx, 1);
    saveOptouts(opts);
    renderOptouts();
    if (window.showToast) window.showToast('Number removed from suppression list', 'default');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.NextBrightWABroadcast = {
    init: initWABroadcast,
    openCreateSegmentModal,
    openCreateBroadcastModal,
    closeModal: closeCreateSegmentModal,
    deleteSegment,
    removeOptout
  };

  document.addEventListener('DOMContentLoaded', () => {
    initWABroadcast();
  });
})();
