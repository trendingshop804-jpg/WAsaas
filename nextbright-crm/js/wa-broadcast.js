/* =============================================================================
   wa-broadcast.js - NextBright CRM
   WhatsApp Broadcast Lists, Segment Builder and Opt-Out Suppression
   ============================================================================= */
'use strict';

(function () {

  var BROADCAST_TEMPLATE_PRESETS = {
    exclusive_festive_offer: 'Hi {{name}}, get exclusive discounts on NextBright CRM enterprise plans this week only! Reply YES to claim.',
    lead_welcome_v2: 'Hello {{name}}, thank you for reaching out to NextBright CRM! How can our team assist your business today?',
    appointment_reminder: 'Hi {{name}}, this is a quick reminder regarding your upcoming consultation with our sales team scheduled for {{time}}.',
    custom_broadcast: ''
  };

  var broadcastMedia = { type: 'none', url: '', name: '' };

  function generateDefaultSegments() {
    var leads = window.NB && window.NB.leads ? window.NB.leads : [];
    var totalLeads = leads.length || 28;
    var qualifiedCount = leads.filter(function (l) { return l.status === 'Qualified'; }).length || Math.max(6, Math.floor(totalLeads * 0.3));
    var recentCount = leads.filter(function (l) { return l.source === 'WhatsApp' || l.status === 'Replied'; }).length || Math.max(10, Math.floor(totalLeads * 0.5));
    return [
      { id: 'seg-all-leads', name: 'All Active WhatsApp Contacts', description: 'All verified WhatsApp contacts in your CRM', criteria: 'All Contacts', contact_count: totalLeads, created_at: new Date().toISOString() },
      { id: 'seg-qualified-prospects', name: 'Qualified Prospects and Hot Leads', description: 'High-intent leads qualified by agents or AI auto-reply', criteria: 'Status = Qualified', contact_count: qualifiedCount, created_at: new Date().toISOString() },
      { id: 'seg-recent-inbound', name: 'Recent WhatsApp Inbound', description: 'Contacts who messaged your business in the last 7 days', criteria: 'Channel = WhatsApp', contact_count: recentCount, created_at: new Date().toISOString() }
    ];
  }

  function getSegments() {
    try {
      var stored = localStorage.getItem('nb_wa_segments');
      if (stored) { var parsed = JSON.parse(stored); if (Array.isArray(parsed) && parsed.length > 0) return parsed; }
    } catch (e) {}
    var defaults = generateDefaultSegments();
    localStorage.setItem('nb_wa_segments', JSON.stringify(defaults));
    return defaults;
  }
  function saveSegments(segs) { localStorage.setItem('nb_wa_segments', JSON.stringify(segs)); }

  var DEFAULT_BROADCASTS = [
    { id: 'bc-demo-1', title: 'Festive Season Offer 2026', segment_name: 'All Active WhatsApp Contacts', template: 'exclusive_festive_offer', message_text: 'Hi {{name}}, get exclusive discounts on NextBright CRM enterprise plans this week only! Reply YES to claim.', media_type: 'none', recipients: 28, delivered: 27, read: 23, status: 'completed', sent_at: new Date(Date.now() - 86400000 * 2).toISOString() },
    { id: 'bc-demo-2', title: 'New Lead Welcome Campaign', segment_name: 'Recent WhatsApp Inbound', template: 'lead_welcome_v2', message_text: 'Hello {{name}}, thank you for reaching out to NextBright CRM!', media_type: 'none', recipients: 14, delivered: 14, read: 10, status: 'completed', sent_at: new Date(Date.now() - 86400000 * 5).toISOString() }
  ];

  var DEFAULT_OPTOUTS = [
    { phone: '+15559876543', name: 'John Doe', optout_date: '2026-10-15', reason: 'User opt-out reply' },
    { phone: '+447712345678', name: 'Jane Smith', optout_date: '2026-10-20', reason: 'Manual suppression' }
  ];

  function getBroadcasts() {
    try { var s = localStorage.getItem('nb_wa_broadcasts'); if (s) return JSON.parse(s); } catch (e) {}
    localStorage.setItem('nb_wa_broadcasts', JSON.stringify(DEFAULT_BROADCASTS));
    return DEFAULT_BROADCASTS;
  }
  function saveBroadcasts(bcs) { localStorage.setItem('nb_wa_broadcasts', JSON.stringify(bcs)); }
  function getOptouts() {
    try { var s = localStorage.getItem('nb_wa_optouts'); if (s) return JSON.parse(s); } catch (e) {}
    localStorage.setItem('nb_wa_optouts', JSON.stringify(DEFAULT_OPTOUTS));
    return DEFAULT_OPTOUTS;
  }
  function saveOptouts(opts) { localStorage.setItem('nb_wa_optouts', JSON.stringify(opts)); }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderSegments() {
    var container = document.getElementById('segments-list');
    if (!container) return;
    var segs = getSegments();
    if (!segs.length) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);background:#fff;border-radius:8px;">No audience segments created yet.</div>';
      return;
    }
    container.innerHTML = segs.map(function (seg) {
      return '<div class="card" style="padding:14px 16px;border-radius:10px;border:1px solid var(--border-light);background:#fff;display:flex;justify-content:space-between;align-items:center;">' +
        '<div>' +
          '<div style="font-weight:700;font-size:0.9rem;">' + escapeHtml(seg.name) + ' <span class="badge badge-info" style="font-size:0.7rem;">' + seg.contact_count + ' contacts</span></div>' +
          '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">' + escapeHtml(seg.description) + '</div>' +
          '<div style="font-size:0.72rem;color:var(--brand-primary);margin-top:4px;">Rule: <code>' + escapeHtml(seg.criteria) + '</code></div>' +
        '</div>' +
        '<button class="btn btn-secondary btn-sm" style="color:#ef4444;" onclick="window.NextBrightWABroadcast.deleteSegment(\'' + seg.id + '\')"><i data-feather="trash-2" style="width:12px;height:12px;"></i></button>' +
      '</div>';
    }).join('');
    if (typeof feather !== 'undefined') feather.replace();
  }

  function renderBroadcasts() {
    var container = document.getElementById('broadcasts-list');
    if (!container) return;
    var bcs = getBroadcasts();
    if (!bcs.length) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);background:#fff;border-radius:8px;">No broadcast history yet.</div>';
      return;
    }
    container.innerHTML = bcs.map(function (bc) {
      var mediaType = bc.media_type || 'none';
      var mediaBadge = '';
      if (mediaType === 'image') mediaBadge = ' <span class="badge" style="background:#e0f2fe;color:#0284c7;font-size:0.7rem;">Image</span>';
      else if (mediaType === 'video') mediaBadge = ' <span class="badge" style="background:#fef3c7;color:#d97706;font-size:0.7rem;">Video</span>';
      else if (mediaType === 'audio') mediaBadge = ' <span class="badge" style="background:#fce7f3;color:#db2777;font-size:0.7rem;">Voice Note</span>';
      else if (mediaType === 'document') mediaBadge = ' <span class="badge" style="background:#f3e8ff;color:#7e22ce;font-size:0.7rem;">Document</span>';
      var msgSnippet = bc.message_text ? '<div style="font-size:0.8rem;color:#334155;background:#f8fafc;padding:6px 10px;border-radius:6px;margin:8px 0;border-left:3px solid #25d366;">' + escapeHtml(bc.message_text) + '</div>' : '';
      return '<div class="card" style="padding:14px 16px;border-radius:10px;border:1px solid var(--border-light);background:#fff;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
          '<div><strong>' + escapeHtml(bc.title) + '</strong>' + mediaBadge +
          '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">Segment: <strong>' + escapeHtml(bc.segment_name) + '</strong> - Template: <code>' + escapeHtml(bc.template) + '</code></div></div>' +
          '<span class="badge badge-success">' + escapeHtml(bc.status) + '</span>' +
        '</div>' +
        msgSnippet +
        '<div style="display:flex;gap:16px;font-size:0.78rem;margin-top:8px;">' +
          '<span>Sent: ' + bc.recipients + '</span><span style="color:#10b981;">Delivered: ' + bc.delivered + '</span><span style="color:#6366f1;">Read: ' + bc.read + '</span>' +
          '<span style="margin-left:auto;font-size:0.72rem;color:var(--text-muted);">' + new Date(bc.sent_at).toLocaleDateString() + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
    if (typeof feather !== 'undefined') feather.replace();
  }

  function renderOptouts() {
    var tbody = document.getElementById('optouts-table-body');
    if (!tbody) return;
    var opts = getOptouts();
    if (!opts.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">No suppressed numbers.</td></tr>'; return; }
    tbody.innerHTML = opts.map(function (o, idx) {
      return '<tr><td><strong>' + escapeHtml(o.phone) + '</strong></td><td>' + escapeHtml(o.name || 'Anonymous') + '</td><td>' + o.optout_date + '</td><td><span class="badge badge-secondary">' + escapeHtml(o.reason) + '</span></td><td><button class="btn btn-secondary btn-sm" style="font-size:0.72rem;padding:2px 8px;" onclick="window.NextBrightWABroadcast.removeOptout(' + idx + ')">Remove</button></td></tr>';
    }).join('');
  }

  function updateBroadcastPreview() {
    var textPreview = document.getElementById('broadcast-chat-text-preview');
    var mediaPreview = document.getElementById('broadcast-chat-media-preview');
    var containerPreview = document.getElementById('broadcast-media-preview-container');
    var contentPreview = document.getElementById('broadcast-media-preview-content');
    var msgBody = document.getElementById('broadcast-message-body');
    if (textPreview) textPreview.textContent = (msgBody && msgBody.value) ? msgBody.value : '(empty)';
    var type = document.getElementById('broadcast-media-type') ? document.getElementById('broadcast-media-type').value : 'none';
    var url = broadcastMedia.url || (document.getElementById('broadcast-media-url') ? document.getElementById('broadcast-media-url').value.trim() : '');
    if (type === 'none' || !url) {
      if (mediaPreview) { mediaPreview.style.display = 'none'; mediaPreview.innerHTML = ''; }
      if (containerPreview) containerPreview.style.display = 'none';
      return;
    }
    var previewHtml = '';
    if (type === 'image') previewHtml = '<img src="' + escapeHtml(url) + '" style="max-width:100%;max-height:160px;border-radius:6px;display:block;object-fit:cover;">';
    else if (type === 'video') previewHtml = '<video src="' + escapeHtml(url) + '" controls style="max-width:100%;max-height:160px;border-radius:6px;display:block;"></video>';
    else if (type === 'audio') previewHtml = '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#e2e8f0;border-radius:6px;"><span style="font-size:1.2rem;">&#127908;</span><audio src="' + escapeHtml(url) + '" controls style="height:32px;flex:1;"></audio></div>';
    else if (type === 'document') previewHtml = '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#e2e8f0;border-radius:6px;"><span>&#128196;</span><span style="font-size:0.8rem;font-weight:600;">' + escapeHtml(broadcastMedia.name || 'Document') + '</span></div>';
    if (mediaPreview) { mediaPreview.style.display = 'block'; mediaPreview.innerHTML = previewHtml; }
    if (containerPreview && contentPreview) { containerPreview.style.display = 'block'; contentPreview.innerHTML = previewHtml; }
  }

  function openCreateSegmentModal() { var m = document.getElementById('modal-create-segment'); if (m) m.style.display = 'flex'; }
  function closeCreateSegmentModal() { var m = document.getElementById('modal-create-segment'); if (m) m.style.display = 'none'; }

  function openCreateBroadcastModal() {
    var modal = document.getElementById('modal-create-broadcast');
    var segSelect = document.getElementById('broadcast-segment-select');
    if (segSelect) {
      var segs = getSegments();
      segSelect.innerHTML = segs.map(function (s) { return '<option value="' + s.id + '">' + escapeHtml(s.name) + ' (' + s.contact_count + ' contacts)</option>'; }).join('');
    }
    var templateSelect = document.getElementById('broadcast-template-select');
    var msgBody = document.getElementById('broadcast-message-body');
    if (templateSelect && msgBody && !msgBody.value) {
      var preset = BROADCAST_TEMPLATE_PRESETS[templateSelect.value];
      if (preset !== undefined) msgBody.value = preset;
    }
    if (modal) modal.style.display = 'flex';
    updateBroadcastPreview();
  }

  function handleCreateSegmentSubmit(e) {
    e.preventDefault();
    var name = document.getElementById('segment-name-input') ? document.getElementById('segment-name-input').value.trim() : '';
    var desc = (document.getElementById('segment-desc-input') ? document.getElementById('segment-desc-input').value.trim() : '') || 'Custom segment';
    var criteria = (document.getElementById('segment-criteria-select') ? document.getElementById('segment-criteria-select').value : '') || 'All Contacts';
    if (!name) return;
    var segs = getSegments();
    segs.unshift({ id: 'seg-' + Date.now(), name: name, description: desc, criteria: criteria, contact_count: Math.floor(40 + Math.random() * 160), created_at: new Date().toISOString() });
    saveSegments(segs);
    closeCreateSegmentModal();
    renderSegments();
    if (window.showToast) window.showToast('Audience segment created!', 'success');
  }

  function handleCreateBroadcastSubmit(e) {
    e.preventDefault();
    var title = document.getElementById('broadcast-name-input') ? document.getElementById('broadcast-name-input').value.trim() : '';
    var segId = document.getElementById('broadcast-segment-select') ? document.getElementById('broadcast-segment-select').value : '';
    var template = (document.getElementById('broadcast-template-select') ? document.getElementById('broadcast-template-select').value : '') || 'exclusive_festive_offer';
    var messageText = (document.getElementById('broadcast-message-body') ? document.getElementById('broadcast-message-body').value.trim() : '') || '';
    var mediaType = (document.getElementById('broadcast-media-type') ? document.getElementById('broadcast-media-type').value : '') || 'none';
    var mediaUrl = broadcastMedia.url || (document.getElementById('broadcast-media-url') ? document.getElementById('broadcast-media-url').value.trim() : '') || '';
    if (!title) return;
    var segs = getSegments();
    var seg = segs.find(function (s) { return s.id === segId; }) || segs[0] || { name: 'General Audience', contact_count: 50 };
    var bcs = getBroadcasts();
    bcs.unshift({ id: 'bc-' + Date.now(), title: title, segment_name: seg.name, template: template, message_text: messageText, media_type: mediaType, media_url: mediaUrl, media_name: broadcastMedia.name || '', recipients: seg.contact_count, delivered: Math.round(seg.contact_count * 0.98), read: Math.round(seg.contact_count * 0.82), status: 'completed', sent_at: new Date().toISOString() });
    saveBroadcasts(bcs);
    var broadcastModal = document.getElementById('modal-create-broadcast');
    if (broadcastModal) broadcastModal.style.display = 'none';
    broadcastMedia = { type: 'none', url: '', name: '' };
    renderBroadcasts();
    if (window.showToast) window.showToast('Broadcast dispatched to ' + seg.contact_count + ' recipients!', 'success');
  }

  function handleAddOptout() {
    var phone = prompt('Enter phone number to suppress (e.g. +15550192834):');
    if (!phone) return;
    var opts = getOptouts();
    opts.unshift({ phone: phone.trim(), name: 'Suppressed Contact', optout_date: new Date().toISOString().split('T')[0], reason: 'Manual opt-out' });
    saveOptouts(opts);
    renderOptouts();
    if (window.showToast) window.showToast('Phone added to suppression list', 'default');
  }

  function deleteSegment(id) {
    if (!confirm('Delete this segment?')) return;
    saveSegments(getSegments().filter(function (s) { return s.id !== id; }));
    renderSegments();
    if (window.showToast) window.showToast('Segment removed', 'default');
  }

  function removeOptout(idx) {
    var opts = getOptouts();
    opts.splice(idx, 1);
    saveOptouts(opts);
    renderOptouts();
    if (window.showToast) window.showToast('Number removed from suppression list', 'default');
  }

  function setupEventListeners() {
    var createSegBtn = document.getElementById('create-segment-btn');
    if (createSegBtn) createSegBtn.onclick = openCreateSegmentModal;
    var createBcBtn = document.getElementById('create-broadcast-btn');
    if (createBcBtn) createBcBtn.onclick = openCreateBroadcastModal;
    var formSeg = document.getElementById('form-create-segment');
    if (formSeg) formSeg.onsubmit = handleCreateSegmentSubmit;
    var formBc = document.getElementById('form-create-broadcast');
    if (formBc) formBc.onsubmit = handleCreateBroadcastSubmit;
    var addOptoutBtn = document.getElementById('btn-add-optout');
    if (addOptoutBtn) addOptoutBtn.onclick = handleAddOptout;

    var bcTemplateSelect = document.getElementById('broadcast-template-select');
    var bcMsgBody = document.getElementById('broadcast-message-body');
    if (bcTemplateSelect && bcMsgBody) {
      bcTemplateSelect.addEventListener('change', function () {
        var preset = BROADCAST_TEMPLATE_PRESETS[bcTemplateSelect.value];
        if (preset !== undefined) bcMsgBody.value = preset;
        updateBroadcastPreview();
      });
    }
    if (bcMsgBody) bcMsgBody.addEventListener('input', updateBroadcastPreview);

    document.querySelectorAll('.bc-var-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tag = btn.getAttribute('data-var');
        if (!tag || !bcMsgBody) return;
        var start = bcMsgBody.selectionStart || bcMsgBody.value.length;
        var end = bcMsgBody.selectionEnd || bcMsgBody.value.length;
        bcMsgBody.value = bcMsgBody.value.substring(0, start) + tag + bcMsgBody.value.substring(end);
        bcMsgBody.focus();
        bcMsgBody.selectionStart = bcMsgBody.selectionEnd = start + tag.length;
        updateBroadcastPreview();
      });
    });

    var bcMediaTypeSelect = document.getElementById('broadcast-media-type');
    var bcMediaFileInput = document.getElementById('broadcast-media-file');
    var bcMediaUrlInput = document.getElementById('broadcast-media-url');

    if (bcMediaTypeSelect) {
      bcMediaTypeSelect.addEventListener('change', function () {
        broadcastMedia.type = bcMediaTypeSelect.value;
        if (bcMediaFileInput) {
          if (bcMediaTypeSelect.value === 'image') bcMediaFileInput.accept = 'image/*';
          else if (bcMediaTypeSelect.value === 'video') bcMediaFileInput.accept = 'video/*';
          else if (bcMediaTypeSelect.value === 'audio') bcMediaFileInput.accept = 'audio/*';
          else if (bcMediaTypeSelect.value === 'document') bcMediaFileInput.accept = 'application/pdf';
          else bcMediaFileInput.accept = '*/*';
        }
        updateBroadcastPreview();
      });
    }

    if (bcMediaFileInput) {
      bcMediaFileInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (bcMediaTypeSelect && bcMediaTypeSelect.value === 'none') {
          if (file.type.startsWith('image/')) bcMediaTypeSelect.value = 'image';
          else if (file.type.startsWith('video/')) bcMediaTypeSelect.value = 'video';
          else if (file.type.startsWith('audio/')) bcMediaTypeSelect.value = 'audio';
          else if (file.type === 'application/pdf') bcMediaTypeSelect.value = 'document';
        }
        var reader = new FileReader();
        reader.onload = function (ev) {
          broadcastMedia.url = ev.target.result;
          broadcastMedia.name = file.name;
          broadcastMedia.type = bcMediaTypeSelect ? bcMediaTypeSelect.value : 'image';
          if (bcMediaUrlInput) bcMediaUrlInput.value = '';
          updateBroadcastPreview();
        };
        reader.readAsDataURL(file);
      });
    }

    if (bcMediaUrlInput) {
      bcMediaUrlInput.addEventListener('input', function () {
        broadcastMedia.url = bcMediaUrlInput.value.trim();
        broadcastMedia.name = 'Remote File';
        updateBroadcastPreview();
      });
    }
  }

  function initWABroadcast() {
    renderSegments();
    renderBroadcasts();
    renderOptouts();
    setupEventListeners();
  }

  window.NextBrightWABroadcast = {
    init: initWABroadcast,
    openCreateSegmentModal: openCreateSegmentModal,
    openCreateBroadcastModal: openCreateBroadcastModal,
    closeModal: closeCreateSegmentModal,
    deleteSegment: deleteSegment,
    removeOptout: removeOptout
  };

  document.addEventListener('DOMContentLoaded', function () {
    initWABroadcast();
  });
})();
