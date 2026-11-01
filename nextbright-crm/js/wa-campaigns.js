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
      return `<div class="campaign-card" style="background:#fff;border:1px solid var(--border-light);border-radius:12px;padding:18px 20px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;gap:12px;"><div><strong>${escapeHtml(campaign.name)}</strong><div style="font-size:.8rem;color:var(--text-muted);margin-top:4px;">Template: <code>${escapeHtml(campaign.template_name)}</code> - ${escapeHtml(campaign.audience_type || 'manual')}</div></div><span class="badge badge-secondary">${escapeHtml(campaign.status)}</span></div>
        <div style="font-size:.8rem;color:var(--text-muted);margin:12px 0;">${scheduled}</div>
        <div style="display:flex;gap:16px;font-size:.82rem;"><span>${sent} sent</span><span>${delivered} delivered</span><span>${read} read</span><span>${failed} failed</span></div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-top:10px;">Metrics remain zero until Meta accepts sends and delivery webhooks update this campaign.</div>
      </div>`;
    }).join('');
  }

  function openCreateCampaignModal() { const modal = document.getElementById('modal-create-wa-campaign'); if (modal) modal.style.display = 'flex'; }
  function closeCreateCampaignModal() { const modal = document.getElementById('modal-create-wa-campaign'); if (modal) modal.style.display = 'none'; }

  async function saveCampaign(event) {
    event.preventDefault();
    const name = document.getElementById('camp-name-input')?.value.trim();
    const templateName = document.getElementById('camp-template-select')?.value;
    const audienceType = document.getElementById('camp-audience-select')?.value || 'manual';
    const scheduleValue = document.getElementById('camp-schedule-input')?.value;
    if (!name || !templateName) return showToast('Campaign name and an approved template are required.', 'error');
    try {
      const payload = await readJson(await request('/api/wa-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, template_name: templateName, template_language: 'en_US', audience_type: audienceType, scheduled_at: scheduleValue ? new Date(scheduleValue).toISOString() : null })
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
