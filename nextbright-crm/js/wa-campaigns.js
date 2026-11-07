'use strict';

(function () {
  let campaigns = [];
  let uploadedExcelRecipients = [];

  function request(path, options) {
    if (window.NB_AUTH?.apiFetch) return window.NB_AUTH.apiFetch(path, options);
    return fetch(path, options);
  }

  async function readJson(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The server could not complete the request.');
    return payload;
  }

  async function loadCampaigns() {
    try {
      let payload;
      try {
        payload = await readJson(await request('/api/wa-campaigns', { headers: { Accept: 'application/json' } }));
      } catch (_) {
        payload = await readJson(await request('/api/messages?action=wa_campaigns', { headers: { Accept: 'application/json' } }));
      }
      campaigns = payload.campaigns || [];
    } catch (error) {
      campaigns = [];
      showToast(error.message, 'error');
    }
    renderCampaigns();
    renderStats();
  }

  async function loadApprovedTemplates() {
    const templateSelect = document.getElementById('camp-template-select');
    if (!templateSelect) return;
    try {
      const res = await request('/api/messages?action=approved_templates');
      const data = await readJson(res);
      if (data.templates && Array.isArray(data.templates) && data.templates.length > 0) {
        let options = '<option value="custom_campaign">custom_campaign (Custom Message & Media)</option>';
        options += '<option value="hello_world" selected>hello_world (Meta Pre-approved Starter Template - 100% Delivery)</option>';
        data.templates.forEach(t => {
          if (t.name !== 'hello_world') {
            options += `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)} (${escapeHtml(t.language || 'en')} - ${escapeHtml(t.category || 'MARKETING')})</option>`;
          }
        });
        templateSelect.innerHTML = options;
      }
    } catch (err) {
      console.warn('[WA Campaigns] Could not load approved templates:', err.message);
    }
  }

  function showToast(message, type) {
    if (window.showToast) window.showToast(message, type);
  }

  function renderStats() {
    const totals = campaigns.reduce((value, campaign) => ({
      sent: value.sent + Number(campaign.sent_count || 0),
      delivered: value.delivered + Number(campaign.delivered_count || 0),
      read: value.read + Number(campaign.read_count || 0),
      failed: value.failed + Number(campaign.failed_count || 0)
    }), { sent: 0, delivered: 0, read: 0, failed: 0 });
    const entries = {
      'camp-stat-total': campaigns.length,
      'camp-stat-sent': totals.sent,
      'camp-stat-delivered': totals.delivered,
      'camp-stat-read': totals.read,
      'camp-stat-failed': totals.failed
    };
    Object.entries(entries).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = Number(value).toLocaleString();
    });
  }

  const TEMPLATE_PRESETS = {
    exclusive_festive_offer: 'Hi {{name}}, get exclusive discounts on NextBright CRM enterprise plans this week only! Reply YES to claim.',
    lead_welcome_v2: 'Hello {{name}}, thank you for reaching out to NextBright CRM! How can our team assist your business today?',
    appointment_reminder: 'Hi {{name}}, this is a quick reminder regarding your upcoming consultation with our sales team scheduled for {{time}}.',
    custom_campaign: ''
  };

  let campaignMedia = {
    type: 'none',
    url: '',
    name: ''
  };

  function parseCampaignDescription(description) {
    if (!description) return { text: '', media_type: 'none', media_url: '', media_name: '' };
    if (typeof description === 'object') return description;
    const trimmed = String(description).trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
          return {
            text: parsed.text || '',
            media_type: parsed.media_type || 'none',
            media_url: parsed.media_url || '',
            media_name: parsed.media_name || ''
          };
        }
      } catch (_) {}
    }
    return { text: description, media_type: 'none', media_url: '', media_name: '' };
  }

  function renderCampaigns() {
    const container = document.getElementById('campaigns-list-container');
    if (!container) return;
    if (!campaigns.length) {
      container.innerHTML = '<div style="padding:48px;text-align:center;background:#fff;border-radius:12px;border:1px dashed var(--border-light);">No saved campaigns. Create and launch a bulk campaign by uploading an Excel/CSV leads file.</div>';
      return;
    }
    container.innerHTML = campaigns.map((campaign) => {
      const sent = Number(campaign.sent_count || 0);
      const delivered = Number(campaign.delivered_count || 0);
      const read = Number(campaign.read_count || 0);
      const failed = Number(campaign.failed_count || 0);
      const scheduled = campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString() : (campaign.status === 'completed' ? 'Completed & Dispatched' : 'Draft');

      const descMeta = parseCampaignDescription(campaign.description);
      const messagePreview = campaign.message_text || descMeta.text || '';
      const mediaType = campaign.media_type || descMeta.media_type || 'none';

      let mediaBadge = '';
      if (mediaType === 'image') mediaBadge = '<span class="badge" style="background:#e0f2fe;color:#0284c7;font-size:0.75rem;margin-left:6px;">🖼️ Image</span>';
      else if (mediaType === 'video') mediaBadge = '<span class="badge" style="background:#fef3c7;color:#d97706;font-size:0.75rem;margin-left:6px;">🎬 Video</span>';
      else if (mediaType === 'audio') mediaBadge = '<span class="badge" style="background:#fce7f3;color:#db2777;font-size:0.75rem;margin-left:6px;">🎤 Voice Note</span>';
      else if (mediaType === 'document') mediaBadge = '<span class="badge" style="background:#f3e8ff;color:#7e22ce;font-size:0.75rem;margin-left:6px;">📄 Document</span>';

      const isCompleted = campaign.status === 'completed';
      const statusBadge = isCompleted
        ? '<span class="badge badge-success" style="background:#dcfce7;color:#15803d;padding:4px 8px;border-radius:12px;">✓ Completed</span>'
        : (campaign.status === 'sending'
          ? '<span class="badge badge-warning" style="background:#fef3c7;color:#b45309;padding:4px 8px;border-radius:12px;">⏳ Sending...</span>'
          : '<span class="badge badge-secondary" style="padding:4px 8px;border-radius:12px;">Draft</span>');

      return '<div class="campaign-card" style="background:#fff;border:1px solid var(--border-light);border-radius:12px;padding:18px 20px;margin-bottom:12px;box-shadow:var(--shadow-sm);">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">' +
          '<div>' +
            '<strong style="font-size:1rem;color:#0f172a;">' + escapeHtml(campaign.name) + '</strong>' + mediaBadge +
            '<div style="font-size:.8rem;color:var(--text-muted);margin-top:4px;">Template: <code>' + escapeHtml(campaign.template_name || 'custom') + '</code> • Audience: <strong>' + escapeHtml(campaign.audience_type || 'excel_upload') + '</strong> (' + (campaign.total_recipients || sent) + ' recipients)</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            statusBadge +
          '</div>' +
        '</div>' +
        (messagePreview ? '<div style="font-size:0.84rem;color:#334155;background:#f8fafc;padding:10px 14px;border-radius:8px;margin:12px 0;border-left:4px solid #25d366;">' + escapeHtml(messagePreview) + '</div>' : '') +
        '<div style="font-size:.8rem;color:var(--text-muted);margin:8px 0;">' + scheduled + '</div>' +
        '<div style="display:flex;gap:20px;font-size:.84rem;background:#f1f5f9;padding:8px 12px;border-radius:6px;">' +
          '<span><strong>' + sent + '</strong> Sent</span>' +
          '<span><strong>' + delivered + '</strong> Delivered</span>' +
          '<span><strong>' + read + '</strong> Read</span>' +
          '<span style="color:' + (failed ? '#ef4444' : 'inherit') + ';"><strong>' + failed + '</strong> Failed</span>' +
        '</div>' +
      '</div>';
    }).join('');

    if (typeof feather !== 'undefined') {
      try { feather.replace(); } catch (_) {}
    }
  }

  function updateCampaignPreview() {
    const textPreview = document.getElementById('camp-chat-text-preview');
    const mediaPreview = document.getElementById('camp-chat-media-preview');
    const containerPreview = document.getElementById('camp-media-preview-container');
    const contentPreview = document.getElementById('camp-media-preview-content');
    const msgText = document.getElementById('camp-message-body')?.value || '';

    if (textPreview) {
      textPreview.textContent = msgText || '(Message body is empty)';
    }

    const type = document.getElementById('camp-media-type')?.value || 'none';
    const url = campaignMedia.url || document.getElementById('camp-media-url')?.value.trim() || '';

    if (type === 'none' || !url) {
      if (mediaPreview) {
        mediaPreview.style.display = 'none';
        mediaPreview.innerHTML = '';
      }
      if (containerPreview) {
        containerPreview.style.display = 'none';
      }
      return;
    }

    let previewHtml = '';
    if (type === 'image') {
      previewHtml = '<img src="' + escapeHtml(url) + '" style="max-width:100%;max-height:160px;border-radius:6px;display:block;object-fit:cover;">';
    } else if (type === 'video') {
      previewHtml = '<video src="' + escapeHtml(url) + '" controls style="max-width:100%;max-height:160px;border-radius:6px;display:block;"></video>';
    } else if (type === 'audio') {
      previewHtml = '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#e2e8f0;border-radius:6px;">' +
        '<span style="font-size:1.2rem;">🎤</span>' +
        '<audio src="' + escapeHtml(url) + '" controls style="height:32px;flex:1;"></audio>' +
      '</div>';
    } else if (type === 'document') {
      previewHtml = '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#e2e8f0;border-radius:6px;">' +
        '<span style="font-size:1.2rem;">📄</span>' +
        '<span style="font-size:0.8rem;font-weight:600;word-break:break-all;">' + escapeHtml(campaignMedia.name || 'Document') + '</span>' +
      '</div>';
    }

    if (mediaPreview) {
      mediaPreview.style.display = 'block';
      mediaPreview.innerHTML = previewHtml;
    }
    if (containerPreview && contentPreview) {
      containerPreview.style.display = 'block';
      contentPreview.innerHTML = previewHtml;
    }
  }

  function openCreateCampaignModal() {
    const modal = document.getElementById('modal-create-wa-campaign');
    if (modal) modal.style.display = 'flex';
    loadApprovedTemplates();
    updateCampaignPreview();
    updateRecipientsBadge();
  }

  function closeCreateCampaignModal() {
    const modal = document.getElementById('modal-create-wa-campaign');
    if (modal) modal.style.display = 'none';
  }

  function updateRecipientsBadge() {
    const badge = document.getElementById('camp-recipients-count-badge');
    if (!badge) return;
    const audType = document.querySelector('input[name="camp-audience-type"]:checked')?.value || 'excel';
    if (audType === 'excel') {
      badge.textContent = uploadedExcelRecipients.length + ' Contacts Ready';
      badge.style.background = uploadedExcelRecipients.length > 0 ? '#25d366' : '#94a3b8';
    } else {
      const crmCount = (window.NB?.leads || []).filter(l => l.phone).length;
      badge.textContent = crmCount + ' CRM Leads';
      badge.style.background = crmCount > 0 ? '#3b82f6' : '#94a3b8';
    }
  }

  // ---- CSV PARSER (RFC-4180) ----
  function parseCSVRows(text) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let insideQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentCell += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !insideQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
    }
    return rows;
  }

  // ---- NORMALIZE IMPORTED ROWS ----
  function normalizeImportedRows(rawRows) {
    if (!rawRows || !rawRows.length) return [];
    const validRecipients = [];
    const seenPhones = new Set();

    for (const row of rawRows) {
      if (!row || typeof row !== 'object') continue;
      const keys = Object.keys(row);
      let nameVal = '';
      let phoneVal = '';
      let companyVal = '';

      for (const k of keys) {
        const lk = k.toLowerCase().trim();
        const v = String(row[k] || '').trim();
        if (!phoneVal && (lk.includes('phone') || lk.includes('mobile') || lk.includes('whatsapp') || lk.includes('number') || lk.includes('tel') || lk.includes('cell') || lk === 'contact')) {
          phoneVal = v;
        } else if (!nameVal && (lk.includes('name') || lk.includes('customer') || lk.includes('lead') || lk.includes('person') || lk.includes('client'))) {
          nameVal = v;
        } else if (!companyVal && (lk.includes('company') || lk.includes('business') || lk.includes('org'))) {
          companyVal = v;
        }
      }

      // If phoneVal not found by header, find any field that has 7-15 digits
      if (!phoneVal) {
        for (const k of keys) {
          const v = String(row[k] || '').replace(/\D/g, '');
          if (v.length >= 7 && v.length <= 15) {
            phoneVal = row[k];
            break;
          }
        }
      }

      if (!phoneVal) continue;
      let digits = String(phoneVal).replace(/\D/g, '');
      if (digits.length === 10) digits = '91' + digits;
      if (digits.length < 7 || digits.length > 15) continue;
      if (seenPhones.has(digits)) continue;
      seenPhones.add(digits);

      validRecipients.push({
        name: nameVal || 'Valued Customer',
        phone: digits,
        company: companyVal || ''
      });
    }

    return validRecipients;
  }

  // ---- HANDLE EXCEL / CSV LEADS FILE UPLOAD ----
  async function handleExcelOrCSVFile(file) {
    if (!file) return;
    const fileName = file.name;
    const isExcel = /\.(xlsx|xls)$/i.test(fileName);
    showToast('Reading ' + fileName + '...', 'info');

    try {
      let recipients = [];
      if (isExcel) {
        if (typeof XLSX === 'undefined') {
          throw new Error('SheetJS is loading. Please retry in 2 seconds or upload as CSV.');
        }
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        recipients = normalizeImportedRows(rawJson);
      } else {
        const text = await file.text();
        const lines = parseCSVRows(text);
        if (lines.length < 2) throw new Error('File is empty or contains no lead rows.');
        const headers = lines[0];
        const rows = lines.slice(1).map(line => {
          const obj = {};
          headers.forEach((h, idx) => { obj[h] = line[idx] || ''; });
          return obj;
        });
        recipients = normalizeImportedRows(rows);
      }

      if (!recipients.length) {
        showToast('No valid contact numbers found in file. Ensure file contains a column with phone numbers.', 'error');
        return;
      }

      uploadedExcelRecipients = recipients;

      // Update UI preview box
      const promptBox = document.getElementById('camp-excel-prompt');
      const summaryBox = document.getElementById('camp-excel-summary');
      const filenameLabel = document.getElementById('camp-excel-filename');
      const statsLabel = document.getElementById('camp-excel-stats');
      const previewList = document.getElementById('camp-excel-preview-list');

      if (promptBox) promptBox.style.display = 'none';
      if (summaryBox) summaryBox.style.display = 'block';
      if (filenameLabel) filenameLabel.textContent = fileName;
      if (statsLabel) statsLabel.textContent = recipients.length + ' valid phone numbers ready for launch';

      if (previewList) {
        previewList.innerHTML = recipients.slice(0, 50).map((r, i) =>
          '<div style="padding:3px 0;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;">' +
            '<span>' + (i + 1) + '. <strong>' + escapeHtml(r.name) + '</strong> ' + (r.company ? '(' + escapeHtml(r.company) + ')' : '') + '</span>' +
            '<span style="color:#0284c7;font-family:monospace;">+' + escapeHtml(r.phone) + '</span>' +
          '</div>'
        ).join('') + (recipients.length > 50 ? '<div style="color:#64748b;padding-top:4px;">...and ' + (recipients.length - 50) + ' more</div>' : '');
      }

      updateRecipientsBadge();
      showToast('✅ Loaded ' + recipients.length + ' contacts from ' + fileName + '!', 'success');

      // Auto fill campaign name if empty
      const campNameInput = document.getElementById('camp-name-input');
      if (campNameInput && !campNameInput.value.trim()) {
        campNameInput.value = fileName.replace(/\.[^/.]+$/, '') + ' Campaign';
      }
    } catch (err) {
      console.error('[Excel Upload Error]', err);
      showToast('Failed to process file: ' + err.message, 'error');
    }
  }

  function clearExcelFile() {
    uploadedExcelRecipients = [];
    const promptBox = document.getElementById('camp-excel-prompt');
    const summaryBox = document.getElementById('camp-excel-summary');
    const fileInput = document.getElementById('camp-excel-file-input');
    if (promptBox) promptBox.style.display = 'block';
    if (summaryBox) summaryBox.style.display = 'none';
    if (fileInput) fileInput.value = '';
    updateRecipientsBadge();
  }

  // ---- LAUNCH CAMPAIGN ACTION ----
  async function launchCampaign(isDraftOnly) {
    const name = document.getElementById('camp-name-input')?.value.trim();
    const templateName = document.getElementById('camp-template-select')?.value;
    const audType = document.querySelector('input[name="camp-audience-type"]:checked')?.value || 'excel';
    const scheduleValue = document.getElementById('camp-schedule-input')?.value;
    const messageText = document.getElementById('camp-message-body')?.value.trim() || '';
    const mediaType = document.getElementById('camp-media-type')?.value || 'none';
    const mediaUrl = campaignMedia.url || document.getElementById('camp-media-url')?.value.trim() || '';
    const mediaName = campaignMedia.name || '';

    if (!name) return showToast('Please enter a campaign name.', 'error');
    if (!templateName) return showToast('Please select an approved template or preset.', 'error');

    let recipients = [];
    if (audType === 'excel') {
      if (!uploadedExcelRecipients.length) {
        return showToast('Please upload an Excel (.xlsx, .xls) or CSV file with lead contacts first.', 'error');
      }
      recipients = uploadedExcelRecipients;
    } else {
      const crmLeads = window.NB?.leads || [];
      recipients = crmLeads.filter(l => l.phone).map(l => ({
        name: l.name || l.contact_name || 'Valued Customer',
        phone: String(l.phone).replace(/\D/g, ''),
        company: l.company || l.company_name || ''
      }));
      if (!recipients.length) {
        return showToast('No CRM leads with phone numbers found.', 'error');
      }
    }

    if (isDraftOnly) {
      try {
        const payload = await readJson(await request('/api/wa-campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            template_name: templateName,
            template_language: 'en_US',
            audience_type: audType === 'excel' ? 'excel_upload' : 'crm_leads',
            scheduled_at: scheduleValue ? new Date(scheduleValue).toISOString() : null,
            message_text: messageText,
            media_type: mediaType,
            media_url: mediaUrl,
            media_name: mediaName
          })
        }));
        campaigns.unshift(payload.campaign);
        closeCreateCampaignModal();
        renderCampaigns();
        renderStats();
        showToast('Campaign saved as draft.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }

    // REAL BULK DISPATCH TO META GRAPH API
    if (!confirm('🚀 Are you ready to dispatch this WhatsApp campaign to ' + recipients.length + ' recipients?')) {
      return;
    }

    const launchBtn = document.getElementById('camp-launch-btn');
    if (launchBtn) {
      launchBtn.disabled = true;
      launchBtn.innerHTML = '⏳ Dispatching...';
    }

    showToast('🚀 Launching WhatsApp campaign to ' + recipients.length + ' contacts... Please keep this page open.', 'info');

    try {
      const payload = await readJson(await request('/api/messages?action=launch_campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          template_name: templateName,
          template_language: 'en_US',
          audience_type: audType === 'excel' ? 'excel_upload' : 'crm_leads',
          message_text: messageText,
          media_type: mediaType,
          media_url: mediaUrl,
          media_name: mediaName,
          recipients: recipients
        })
      }));

      closeCreateCampaignModal();
      await loadCampaigns();
      showToast('🎉 Campaign Launched! Successfully sent: ' + (payload.sent || 0) + ', Failed: ' + (payload.failed || 0), 'success');
    } catch (err) {
      console.error('[Launch Campaign Error]', err);
      showToast('Campaign launch failed: ' + err.message, 'error');
    } finally {
      if (launchBtn) {
        launchBtn.disabled = false;
        launchBtn.innerHTML = '<i data-feather="send"></i> 🚀 Launch Campaign Now';
        if (typeof feather !== 'undefined') feather.replace();
      }
    }
  }

  function setup() {
    document.getElementById('create-campaign-btn')?.addEventListener('click', openCreateCampaignModal);

    // Save Draft button
    document.getElementById('camp-save-draft-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      launchCampaign(true);
    });

    // Launch Campaign Now submit handler
    const form = document.getElementById('form-create-wa-campaign');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        launchCampaign(false);
      };
    }

    document.getElementById('btn-test-send-campaign')?.addEventListener('click', () => showToast('Test sending requires a verified recipient on Meta WhatsApp Cloud API.', 'info'));

    // Audience Radio Toggle
    const audExcelRadio = document.getElementById('camp-aud-excel');
    const audCrmRadio = document.getElementById('camp-aud-crm');
    const excelBox = document.getElementById('camp-excel-box');
    const crmBox = document.getElementById('camp-crm-box');

    if (audExcelRadio && audCrmRadio) {
      audExcelRadio.addEventListener('change', () => {
        if (excelBox) excelBox.style.display = 'block';
        if (crmBox) crmBox.style.display = 'none';
        updateRecipientsBadge();
      });
      audCrmRadio.addEventListener('change', () => {
        if (excelBox) excelBox.style.display = 'none';
        if (crmBox) crmBox.style.display = 'block';
        updateRecipientsBadge();
      });
    }

    // Excel Upload Click & Drag-Drop
    const excelFileInput = document.getElementById('camp-excel-file-input');
    if (excelBox && excelFileInput) {
      excelBox.addEventListener('click', (e) => {
        if (e.target.id !== 'camp-excel-clear-btn') {
          excelFileInput.click();
        }
      });
      excelFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) handleExcelOrCSVFile(file);
      });

      excelBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        excelBox.style.borderColor = '#25d366';
        excelBox.style.background = '#f0fdf4';
      });
      excelBox.addEventListener('dragleave', (e) => {
        e.preventDefault();
        excelBox.style.borderColor = '#94a3b8';
        excelBox.style.background = '#fff';
      });
      excelBox.addEventListener('drop', (e) => {
        e.preventDefault();
        excelBox.style.borderColor = '#94a3b8';
        excelBox.style.background = '#fff';
        const file = e.dataTransfer?.files?.[0];
        if (file) handleExcelOrCSVFile(file);
      });
    }

    document.getElementById('camp-excel-clear-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      clearExcelFile();
    });

    // Template selection auto-populates message textarea
    const templateSelect = document.getElementById('camp-template-select');
    const msgBody = document.getElementById('camp-message-body');
    if (templateSelect && msgBody) {
      templateSelect.addEventListener('change', () => {
        const val = templateSelect.value;
        if (TEMPLATE_PRESETS[val] !== undefined) {
          msgBody.value = TEMPLATE_PRESETS[val];
        }
        updateCampaignPreview();
      });
    }

    // Message body real-time typing preview
    if (msgBody) {
      msgBody.addEventListener('input', updateCampaignPreview);
    }

    // Quick variable tags (+ Name, + Company, + Phone)
    document.querySelectorAll('.camp-var-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tag = btn.getAttribute('data-var');
        if (!tag || !msgBody) return;
        const start = msgBody.selectionStart || msgBody.value.length;
        const end = msgBody.selectionEnd || msgBody.value.length;
        msgBody.value = msgBody.value.substring(0, start) + tag + msgBody.value.substring(end);
        msgBody.focus();
        msgBody.selectionStart = msgBody.selectionEnd = start + tag.length;
        updateCampaignPreview();
      });
    });

    // Media type change
    const mediaTypeSelect = document.getElementById('camp-media-type');
    const mediaFileInput = document.getElementById('camp-media-file');
    const mediaUrlInput = document.getElementById('camp-media-url');

    if (mediaTypeSelect) {
      mediaTypeSelect.addEventListener('change', () => {
        const type = mediaTypeSelect.value;
        campaignMedia.type = type;
        if (mediaFileInput) {
          if (type === 'image') mediaFileInput.accept = 'image/*';
          else if (type === 'video') mediaFileInput.accept = 'video/*';
          else if (type === 'audio') mediaFileInput.accept = 'audio/*';
          else if (type === 'document') mediaFileInput.accept = 'application/pdf';
          else mediaFileInput.accept = '*/*';
        }
        updateCampaignPreview();
      });
    }

    // Local file picker for campaign media
    if (mediaFileInput) {
      mediaFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (mediaTypeSelect && mediaTypeSelect.value === 'none') {
          if (file.type.startsWith('image/')) mediaTypeSelect.value = 'image';
          else if (file.type.startsWith('video/')) mediaTypeSelect.value = 'video';
          else if (file.type.startsWith('audio/')) mediaTypeSelect.value = 'audio';
          else if (file.type === 'application/pdf') mediaTypeSelect.value = 'document';
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
          campaignMedia.url = ev.target.result;
          campaignMedia.name = file.name;
          campaignMedia.type = mediaTypeSelect?.value || 'image';
          if (mediaUrlInput) mediaUrlInput.value = '';
          updateCampaignPreview();
        };
        reader.readAsDataURL(file);
      });
    }

    // Direct media URL input
    if (mediaUrlInput) {
      mediaUrlInput.addEventListener('input', () => {
        campaignMedia.url = mediaUrlInput.value.trim();
        campaignMedia.name = 'Remote File';
        updateCampaignPreview();
      });
    }
  }

  function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function init() { setup(); loadCampaigns(); }
  window.NextBrightWACampaigns = { init, openCreateCampaignModal, closeModal: closeCreateCampaignModal, handleExcelOrCSVFile };
  document.addEventListener('DOMContentLoaded', init);
})();
