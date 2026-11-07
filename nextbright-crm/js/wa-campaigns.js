'use strict';

(function () {
  let campaigns = [];

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
      const payload = await readJson(await request('/api/wa-campaigns', { headers: { Accept: 'application/json' } }));
      campaigns = payload.campaigns || [];
    } catch (error) {
      campaigns = [];
      showToast(error.message, 'error');
    }
    renderCampaigns();
    renderStats();
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
      container.innerHTML = '<div style="padding:48px;text-align:center;background:#fff;border-radius:12px;border:1px dashed var(--border-light);">No saved campaigns. Create a draft or schedule one after selecting an approved template.</div>';
      return;
    }
    container.innerHTML = campaigns.map((campaign) => {
      const sent = Number(campaign.sent_count || 0);
      const delivered = Number(campaign.delivered_count || 0);
      const read = Number(campaign.read_count || 0);
      const failed = Number(campaign.failed_count || 0);
      const scheduled = campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString() : 'Draft - not scheduled';

      const descMeta = parseCampaignDescription(campaign.description);
      const messagePreview = campaign.message_text || descMeta.text || '';
      const mediaType = campaign.media_type || descMeta.media_type || 'none';

      let mediaBadge = '';
      if (mediaType === 'image') mediaBadge = '<span class="badge" style="background:#e0f2fe;color:#0284c7;font-size:0.75rem;margin-left:6px;">🖼️ Image</span>';
      else if (mediaType === 'video') mediaBadge = '<span class="badge" style="background:#fef3c7;color:#d97706;font-size:0.75rem;margin-left:6px;">🎬 Video</span>';
      else if (mediaType === 'audio') mediaBadge = '<span class="badge" style="background:#fce7f3;color:#db2777;font-size:0.75rem;margin-left:6px;">🎤 Voice Note</span>';
      else if (mediaType === 'document') mediaBadge = '<span class="badge" style="background:#f3e8ff;color:#7e22ce;font-size:0.75rem;margin-left:6px;">📄 Document</span>';

      return `<div class="campaign-card" style="background:#fff;border:1px solid var(--border-light);border-radius:12px;padding:18px 20px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;gap:12px;">
          <div>
            <strong>${escapeHtml(campaign.name)}</strong>${mediaBadge}
            <div style="font-size:.8rem;color:var(--text-muted);margin-top:4px;">Template: <code>${escapeHtml(campaign.template_name)}</code> - ${escapeHtml(campaign.audience_type || 'manual')}</div>
          </div>
          <span class="badge badge-secondary">${escapeHtml(campaign.status)}</span>
        </div>
        ${messagePreview ? `<div style="font-size:0.82rem;color:#334155;background:#f8fafc;padding:8px 12px;border-radius:6px;margin:10px 0;border-left:3px solid #25d366;">${escapeHtml(messagePreview)}</div>` : ''}
        <div style="font-size:.8rem;color:var(--text-muted);margin:10px 0;">${scheduled}</div>
        <div style="display:flex;gap:16px;font-size:.82rem;"><span>${sent} sent</span><span>${delivered} delivered</span><span>${read} read</span><span>${failed} failed</span></div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-top:10px;">Metrics remain zero until Meta accepts sends and delivery webhooks update this campaign.</div>
      </div>`;
    }).join('');
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
      previewHtml = `<img src="${escapeHtml(url)}" style="max-width:100%;max-height:160px;border-radius:6px;display:block;object-fit:cover;">`;
    } else if (type === 'video') {
      previewHtml = `<video src="${escapeHtml(url)}" controls style="max-width:100%;max-height:160px;border-radius:6px;display:block;"></video>`;
    } else if (type === 'audio') {
      previewHtml = `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#e2e8f0;border-radius:6px;">
        <span style="font-size:1.2rem;">🎤</span>
        <audio src="${escapeHtml(url)}" controls style="height:32px;flex:1;"></audio>
      </div>`;
    } else if (type === 'document') {
      previewHtml = `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#e2e8f0;border-radius:6px;">
        <span style="font-size:1.2rem;">📄</span>
        <span style="font-size:0.8rem;font-weight:600;word-break:break-all;">${escapeHtml(campaignMedia.name || 'Document')}</span>
      </div>`;
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
    updateCampaignPreview();
  }

  function closeCreateCampaignModal() {
    const modal = document.getElementById('modal-create-wa-campaign');
    if (modal) modal.style.display = 'none';
  }

  async function saveCampaign(event) {
    event.preventDefault();
    const name = document.getElementById('camp-name-input')?.value.trim();
    const templateName = document.getElementById('camp-template-select')?.value;
    const audienceType = document.getElementById('camp-audience-select')?.value || 'manual';
    const scheduleValue = document.getElementById('camp-schedule-input')?.value;
    const messageText = document.getElementById('camp-message-body')?.value.trim() || '';
    const mediaType = document.getElementById('camp-media-type')?.value || 'none';
    const mediaUrl = campaignMedia.url || document.getElementById('camp-media-url')?.value.trim() || '';
    const mediaName = campaignMedia.name || '';

    if (!name || !templateName) return showToast('Campaign name and an approved template are required.', 'error');
    try {
      const payload = await readJson(await request('/api/wa-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          template_name: templateName,
          template_language: 'en_US',
          audience_type: audienceType,
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
      showToast(payload.campaign.status === 'scheduled' ? 'Campaign scheduled. No messages have been sent.' : 'Campaign saved as a draft. No messages have been sent.', 'success');
    } catch (error) { showToast(error.message, 'error'); }
  }

  /**
   * RFC-4180 compliant CSV parser that correctly handles quoted strings,
   * commas within fields, and newlines.
   */
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
          i++; // skip escaped quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !insideQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some(c => c.length > 0)) {
        rows.push(currentRow);
      }
    }
    return rows;
  }

  /**
   * Handle CSV file uploaded from WhatsApp Campaigns section.
   * Parses rows, validates contact info, normalizes phones, posts to /api/leads,
   * adds to target audience, and opens the campaign modal.
   */
  async function handleCSVImport(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = String(reader.result || '');
        const lines = parseCSVRows(text);
        if (lines.length < 2) {
          showToast('CSV file is empty or missing data rows.', 'error');
          return;
        }

        const headers = lines[0].map(h => String(h || '').trim().toLowerCase());

        // Dynamic column detection
        const nameIdx = headers.findIndex(h =>
          ['name', 'full name', 'contact', 'contact name', 'customer', 'customer name', 'person', 'lead', 'first name', 'title'].includes(h) ||
          (h.includes('name') && !h.includes('company') && !h.includes('file'))
        );
        let phoneIdx = headers.findIndex(h =>
          ['phone', 'mobile', 'whatsapp', 'tel', 'cell', 'phone number', 'contact number', 'mobile number', 'wa_number', 'number'].includes(h) ||
          h.includes('phone') || h.includes('mobile') || h.includes('whatsapp')
        );
        const emailIdx = headers.findIndex(h =>
          ['email', 'email address', 'e-mail', 'mail'].includes(h) || h.includes('email')
        );
        const companyIdx = headers.findIndex(h =>
          ['company', 'business', 'organization', 'company name', 'business name', 'org'].includes(h) || h.includes('company')
        );

        // Fallback: search for phone digits if header was non-standard
        if (phoneIdx === -1) {
          for (let c = 0; c < headers.length; c++) {
            const sampleDigits = lines.slice(1, 6).map(r => String(r[c] || '').replace(/\D/g, ''));
            const validCount = sampleDigits.filter(d => d.length >= 7 && d.length <= 15).length;
            if (validCount >= Math.min(2, lines.length - 1)) {
              phoneIdx = c;
              break;
            }
          }
        }

        if (nameIdx === -1 && phoneIdx === -1) {
          showToast('CSV must include at least a Name or Phone column.', 'error');
          return;
        }

        const rawDataRows = lines.slice(1);
        const leadsToImport = [];

        for (const row of rawDataRows) {
          if (!row || !row.length) continue;
          const rawName = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';
          const rawPhone = phoneIdx !== -1 ? String(row[phoneIdx] || '').trim() : '';
          const rawEmail = emailIdx !== -1 ? String(row[emailIdx] || '').trim() : '';
          const rawCompany = companyIdx !== -1 ? String(row[companyIdx] || '').trim() : '';

          // Normalize phone number
          const digits = rawPhone.replace(/\D/g, '');
          let phoneFormatted = '';
          if (digits.length >= 7 && digits.length <= 15) {
            if (digits.length === 10) {
              phoneFormatted = '+91 ' + digits.slice(0, 5) + ' ' + digits.slice(5);
            } else if (digits.startsWith('91') && digits.length === 12) {
              phoneFormatted = '+91 ' + digits.slice(2, 7) + ' ' + digits.slice(7);
            } else {
              phoneFormatted = '+' + digits;
            }
          }

          const contactName = rawName || (rawCompany ? rawCompany : (phoneFormatted || 'Valued Customer'));
          if (!phoneFormatted && !rawEmail) continue;

          leadsToImport.push({
            contactName,
            phone: phoneFormatted || undefined,
            email: rawEmail || undefined,
            companyName: rawCompany || undefined,
            source: 'Import',
            customFields: {
              source_label: 'WhatsApp Campaign CSV',
              import_filename: file.name,
              imported_at: new Date().toISOString()
            }
          });
        }

        if (!leadsToImport.length) {
          showToast('No valid contact rows found. Each row needs a Name and Phone/Email.', 'error');
          return;
        }

        showToast(`Importing ${leadsToImport.length} contacts from ${file.name}...`, 'info');

        let importedCount = 0;
        let duplicateCount = 0;
        let failedCount = 0;

        const batchResults = await Promise.allSettled(leadsToImport.map(lead =>
          request('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lead)
          }).then(readJson)
        ));

        for (const res of batchResults) {
          if (res.status === 'fulfilled') {
            importedCount++;
          } else {
            const errMsg = res.reason?.message || '';
            if (errMsg.includes('already exists') || errMsg.includes('DUPLICATE')) {
              duplicateCount++;
            } else {
              failedCount++;
            }
          }
        }

        // Add imported batch as target audience option in campaign modal
        const audienceSelect = document.getElementById('camp-audience-select');
        const cleanFileName = file.name.replace(/\.[^/.]+$/, '');
        const totalEligible = importedCount + duplicateCount;
        if (audienceSelect) {
          const optionVal = `Imported: ${cleanFileName} (${totalEligible} contacts)`;
          const newOption = document.createElement('option');
          newOption.value = optionVal;
          newOption.textContent = optionVal;
          newOption.selected = true;
          audienceSelect.insertBefore(newOption, audienceSelect.firstChild);
        }

        // Pre-fill campaign name in modal
        const campNameInput = document.getElementById('camp-name-input');
        if (campNameInput) {
          campNameInput.value = `${cleanFileName} WhatsApp Campaign`;
        }

        if (importedCount > 0) {
          showToast(`Successfully imported ${importedCount} contacts${duplicateCount ? ` (${duplicateCount} existing leads added to audience)` : ''}!`, 'success');
        } else if (duplicateCount > 0) {
          showToast(`All ${duplicateCount} contacts already exist in CRM and are ready in your campaign audience.`, 'info');
        } else {
          showToast(`Import completed with ${failedCount} errors. Please check your CSV format.`, 'error');
        }

        // Refresh CRM workspace so all tables/kanban reflect newly imported leads
        if (typeof window.NB_WORKSPACE?.reload === 'function') {
          try { await window.NB_WORKSPACE.reload(); } catch (_) {}
        }

        // Open WhatsApp campaign creation modal ready to launch
        openCreateCampaignModal();

      } catch (err) {
        console.error('[WhatsApp Campaign CSV Import Error]', err);
        showToast(`Failed to parse CSV file: ${err.message}`, 'error');
      } finally {
        const fileInput = document.getElementById('campaign-csv-input');
        if (fileInput) fileInput.value = '';
      }
    };
    reader.readAsText(file);
  }

  function setup() {
    document.getElementById('create-campaign-btn')?.addEventListener('click', openCreateCampaignModal);
    const form = document.getElementById('form-create-wa-campaign');
    if (form) form.onsubmit = saveCampaign;
    document.getElementById('btn-test-send-campaign')?.addEventListener('click', () => showToast('Test sending requires a verified test recipient and is not simulated.', 'info'));

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

    // Quick tag insertion buttons (+ Name, + Company, + Phone)
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

    // Local file picker for media (FileReader)
    if (mediaFileInput) {
      mediaFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        // Auto-select matching media type if set to 'none'
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

    // Bind CSV Import button and file input
    const importCsvBtn = document.getElementById('campaign-import-csv-btn');
    const csvFileInput = document.getElementById('campaign-csv-input');
    if (importCsvBtn && csvFileInput) {
      importCsvBtn.addEventListener('click', () => {
        csvFileInput.click();
      });
      csvFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) handleCSVImport(file);
      });
    }
  }

  function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function init() { setup(); loadCampaigns(); }
  window.NextBrightWACampaigns = { init, openCreateCampaignModal, closeModal: closeCreateCampaignModal, handleCSVImport };
  document.addEventListener('DOMContentLoaded', init);
})();
