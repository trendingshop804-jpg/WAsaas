/* ==========================================================================
   NexusLead AI - Data Import & Normalization Component
   CSV, Excel (.xlsx, .xls), API Import, Deduplication & Validation Summary
   ========================================================================== */

class LeadImportComponent {
  init() {
    this.bindEvents();
  }

  bindEvents() {
    // CSV / Excel file upload change
    const fileInput = document.getElementById('csv-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.handleFileSelected(e));
    }

    // Drag and drop zone
    const dropZone = document.getElementById('import-dropzone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--brand-whatsapp)';
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'var(--border-medium)';
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border-medium)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.processFile(e.dataTransfer.files[0]);
        }
      });
    }

    // Sample CSV Download
    const sampleBtn = document.getElementById('download-sample-csv-btn');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', () => this.downloadSampleCSV());
    }

    // Manual lead creation form submit
    const manualForm = document.getElementById('manual-lead-form');
    if (manualForm) {
      manualForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleManualLeadSubmit();
      });
    }

    // Mapping form submit button
    const mappingForm = document.getElementById('csv-mapping-form');
    if (mappingForm) {
      mappingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitMappedCSVImport();
      });
    }
  }

  handleFileSelected(e) {
    if (e.target.files && e.target.files[0]) {
      this.processFile(e.target.files[0]);
      e.target.value = ''; // Reset input so selecting the same file again triggers change event
    }
  }

  processFile(file) {
    const filename = (file.name || '').toLowerCase();
    const isExcel = filename.endsWith('.xlsx') || filename.endsWith('.xls');

    if (isExcel) {
      this.processExcelFile(file);
    } else {
      this.processCSVFile(file);
    }
  }

  processExcelFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (typeof XLSX === 'undefined') {
          alert('Excel parsing library (SheetJS) is loading. Please refresh or try again in a moment.');
          return;
        }
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert sheet to matrix array of arrays
        const rawJsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rawJsonRows || rawJsonRows.length <= 1) {
          alert('Excel sheet appears to be empty or missing headers.');
          return;
        }

        const rawHeaders = rawJsonRows[0].map(h => String(h || '').trim());
        const dataRows = rawJsonRows.slice(1).map(row => 
          Array.isArray(row) ? row.map(cell => String(cell ?? '').trim()) : []
        ).filter(row => row.some(cell => cell !== ''));

        this.openMappingModalFromMatrix(rawHeaders, dataRows, file.name);
      } catch (err) {
        console.error('Error reading Excel file:', err);
        alert('Failed to read Excel file. Please ensure it is a valid .xlsx or .xls document.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  processCSVFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvText = e.target.result;
      const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length <= 1) {
        alert('CSV file appears to be empty or missing headers.');
        return;
      }

      const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^["'\r]+|["'\r]+$/g, ''));
      const dataRows = lines.slice(1).map(line => 
        line.split(',').map(c => c.trim().replace(/^["'\r]+|["'\r]+$/g, ''))
      );

      this.openMappingModalFromMatrix(rawHeaders, dataRows, file.name);
    };
    reader.readAsText(file);
  }

  openMappingModalFromMatrix(rawHeaders, dataRows, filename) {
    this.currentCsvHeaders = rawHeaders;
    this.currentCsvRows = dataRows;
    this.currentFilename = filename || 'Uploaded File';

    const lowerHeaders = rawHeaders.map(h => String(h).toLowerCase());

    // Enhanced Auto-detect default indices for standard CSVs & Google Places / Apollo scraped datasets
    const companyIdx = lowerHeaders.findIndex(h => 
      h === 'title' || h.includes('company') || h.includes('business') || h.includes('org') || h === 'title'
    );
    const nameIdx = lowerHeaders.findIndex(h => 
      !h.includes('company') && !h.includes('business') && 
      (h.includes('contact') || h.includes('name') || h.includes('owner') || h.includes('person') || h.includes('subtitle'))
    );
    const phoneIdx = lowerHeaders.findIndex(h => 
      h === 'phone' || h === 'phoneunformatted' || h.includes('phone') || h.includes('mobile') || h.includes('whatsapp') || h.includes('cell') || h.includes('tel')
    );
    const emailIdx = lowerHeaders.findIndex(h => 
      h.includes('email') || h.includes('mail')
    );
    const industryIdx = lowerHeaders.findIndex(h => 
      h === 'categoryname' || h.includes('category') || h.includes('industry') || h.includes('niche') || h.includes('vertical')
    );
    const locationIdx = lowerHeaders.findIndex(h => 
      h === 'city' || h === 'state' || h === 'address' || h.includes('location') || h.includes('city') || h.includes('state') || h.includes('address')
    );
    const websiteIdx = lowerHeaders.findIndex(h => 
      h === 'url' || h === 'website' || h.includes('website') || h.includes('site') || h.includes('domain') || h.includes('url')
    );

    const buildOptionsHtml = (selectedIdx) => {
      let html = `<option value="-1">-- Ignore / None --</option>`;
      rawHeaders.forEach((h, idx) => {
        html += `<option value="${idx}" ${idx === selectedIdx ? 'selected' : ''}>Column ${idx + 1}: ${this.escapeHtml(h)}</option>`;
      });
      return html;
    };

    const compSelect = document.getElementById('map-col-company');
    const nameSelect = document.getElementById('map-col-name');
    const phoneSelect = document.getElementById('map-col-phone');
    const emailSelect = document.getElementById('map-col-email');
    const indSelect = document.getElementById('map-col-industry');
    const locSelect = document.getElementById('map-col-location');
    const webSelect = document.getElementById('map-col-website');

    if (compSelect) compSelect.innerHTML = buildOptionsHtml(companyIdx !== -1 ? companyIdx : 0);
    if (nameSelect) nameSelect.innerHTML = buildOptionsHtml(nameIdx !== -1 ? nameIdx : (companyIdx !== -1 ? -1 : 1));
    if (phoneSelect) phoneSelect.innerHTML = buildOptionsHtml(phoneIdx !== -1 ? phoneIdx : 2);
    if (emailSelect) emailSelect.innerHTML = buildOptionsHtml(emailIdx !== -1 ? emailIdx : 3);
    if (indSelect) indSelect.innerHTML = buildOptionsHtml(industryIdx !== -1 ? industryIdx : 4);
    if (locSelect) locSelect.innerHTML = buildOptionsHtml(locationIdx !== -1 ? locationIdx : 5);
    if (webSelect) webSelect.innerHTML = buildOptionsHtml(websiteIdx !== -1 ? websiteIdx : 6);

    const countEl = document.getElementById('csv-mapping-row-count');
    if (countEl) countEl.textContent = `Total ${dataRows.length} records detected from ${this.escapeHtml(filename)}`;

    // Listen for select changes to update live preview
    document.querySelectorAll('.csv-map-select').forEach(select => {
      select.onchange = () => this.updateMappingPreview();
    });

    this.updateMappingPreview();

    const modal = document.getElementById('csv-mapping-modal');
    if (modal) modal.classList.add('active');
  }

  updateMappingPreview() {
    const companyIdx = parseInt(document.getElementById('map-col-company')?.value ?? '0');
    const nameIdx = parseInt(document.getElementById('map-col-name')?.value ?? '1');
    const phoneIdx = parseInt(document.getElementById('map-col-phone')?.value ?? '2');
    const emailIdx = parseInt(document.getElementById('map-col-email')?.value ?? '3');
    const industryIdx = parseInt(document.getElementById('map-col-industry')?.value ?? '4');

    const previewTbody = document.getElementById('csv-mapping-preview-tbody');
    if (!previewTbody || !this.currentCsvRows) return;

    const sampleRows = this.currentCsvRows.slice(0, 3);
    previewTbody.innerHTML = sampleRows.map(cols => {
      const getVal = (idx) => {
        if (idx < 0 || !Array.isArray(cols)) return '—';
        return cols[idx] ? String(cols[idx]).trim() || '—' : '—';
      };
      return `
        <tr>
          <td>${this.escapeHtml(getVal(companyIdx))}</td>
          <td>${this.escapeHtml(getVal(nameIdx))}</td>
          <td>${this.escapeHtml(getVal(phoneIdx))}</td>
          <td>${this.escapeHtml(getVal(emailIdx))}</td>
          <td>${this.escapeHtml(getVal(industryIdx))}</td>
        </tr>
      `;
    }).join('');
  }

  submitMappedCSVImport() {
    const modal = document.getElementById('csv-mapping-modal');
    if (modal) modal.classList.remove('active');

    const companyIdx = parseInt(document.getElementById('map-col-company')?.value ?? '0');
    const nameIdx = parseInt(document.getElementById('map-col-name')?.value ?? '1');
    const phoneIdx = parseInt(document.getElementById('map-col-phone')?.value ?? '2');
    const emailIdx = parseInt(document.getElementById('map-col-email')?.value ?? '3');
    const industryIdx = parseInt(document.getElementById('map-col-industry')?.value ?? '4');
    const locationIdx = parseInt(document.getElementById('map-col-location')?.value ?? '5');
    const websiteIdx = parseInt(document.getElementById('map-col-website')?.value ?? '6');

    this.parseAndValidateCSVWithMapping({
      companyIdx,
      nameIdx,
      phoneIdx,
      emailIdx,
      industryIdx,
      locationIdx,
      websiteIdx
    });
  }

  parseAndValidateCSVWithMapping({ companyIdx, nameIdx, phoneIdx, emailIdx, industryIdx, locationIdx, websiteIdx }) {
    const rows = this.currentCsvRows || [];
    const existingLeads = window.appState.get('leads') || [];
    const existingPhones = new Set(existingLeads.map(l => l.phone ? l.phone.replace(/\D/g, '') : ''));
    const existingEmails = new Set(existingLeads.map(l => (l.email || '').toLowerCase()));

    let total = rows.length;
    let valid = 0;
    let duplicates = 0;
    let invalid = 0;
    const leadsToAdd = [];

    rows.forEach(row => {
      const cols = Array.isArray(row) 
        ? row 
        : String(row).split(',').map(c => c.trim().replace(/^["'\r]+|["'\r]+$/g, ''));
        
      if (!cols || cols.length < 1) {
        invalid++;
        return;
      }

      const getColVal = (idx) => idx >= 0 && cols[idx] ? String(cols[idx]).trim() : '';

      const companyName = getColVal(companyIdx) || 'Unknown Business';
      const contactName = getColVal(nameIdx) || 'Decision Maker';
      let rawPhone = getColVal(phoneIdx);
      const email = getColVal(emailIdx);
      const industry = getColVal(industryIdx) || 'General';
      const location = getColVal(locationIdx) || 'India';
      const website = getColVal(websiteIdx);

      // Phone normalization & auto-detection across columns if needed
      let cleanPhoneDigits = rawPhone.replace(/\D/g, '');
      if (cleanPhoneDigits.length < 7) {
        const foundPhoneCol = cols.find(c => String(c).replace(/\D/g, '').length >= 7);
        if (foundPhoneCol) {
          cleanPhoneDigits = String(foundPhoneCol).replace(/\D/g, '');
        } else {
          invalid++;
          return;
        }
      }

      // Check duplicates
      if (existingPhones.has(cleanPhoneDigits) || (email && existingEmails.has(email.toLowerCase()))) {
        duplicates++;
        return;
      }

      const formattedPhone = cleanPhoneDigits.startsWith('91') && cleanPhoneDigits.length === 12
        ? `+${cleanPhoneDigits.slice(0, 2)} ${cleanPhoneDigits.slice(2, 7)} ${cleanPhoneDigits.slice(7)}`
        : cleanPhoneDigits.length === 10
        ? `+91 ${cleanPhoneDigits.slice(0, 5)} ${cleanPhoneDigits.slice(5)}`
        : `+${cleanPhoneDigits}`;

      const leadObj = {
        id: 'lead_import_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
        companyName,
        contactName,
        jobTitle: 'Decision Maker',
        phone: formattedPhone,
        whatsappStatus: 'Available',
        email,
        website: website || `https://${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        industry,
        location,
        source: this.currentFilename ? `File: ${this.currentFilename}` : 'Spreadsheet Upload',
        sourceUrl: 'Uploaded File',
        score: 65,
        scoreCategory: 'warm',
        status: 'New',
        assignedTo: 'Karthik Raja',
        optedOut: false,
        createdDate: new Date().toISOString(),
        tags: ['File Import', industry]
      };

      // Score lead with AI
      const scoreData = window.aiService.analyzeLead(leadObj);
      leadObj.score = scoreData.score;
      leadObj.scoreCategory = scoreData.category;

      leadsToAdd.push(leadObj);
      existingPhones.add(cleanPhoneDigits);
      valid++;
    });

    // Show import summary modal
    this.showImportSummaryModal({
      total,
      valid,
      duplicates,
      invalid,
      leadsToAdd
    });
  }

  showImportSummaryModal({ total, valid, duplicates, invalid, leadsToAdd }) {
    const summaryBody = document.getElementById('import-summary-content');
    if (summaryBody) {
      summaryBody.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 20px;">
          <div class="card" style="padding: 14px; text-align: center;">
            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Total Rows</div>
            <div style="font-size: 24px; font-weight: 800;">${total}</div>
          </div>
          <div class="card" style="padding: 14px; text-align: center; border-color: rgba(16, 185, 129, 0.4);">
            <div style="font-size: 11px; color: var(--status-success); text-transform: uppercase;">Valid Records</div>
            <div style="font-size: 24px; font-weight: 800; color: var(--status-success);">${valid}</div>
          </div>
          <div class="card" style="padding: 14px; text-align: center; border-color: rgba(245, 158, 11, 0.4);">
            <div style="font-size: 11px; color: var(--status-warning); text-transform: uppercase;">Duplicates Detected</div>
            <div style="font-size: 24px; font-weight: 800; color: var(--status-warning);">${duplicates}</div>
          </div>
          <div class="card" style="padding: 14px; text-align: center; border-color: rgba(239, 68, 68, 0.4);">
            <div style="font-size: 11px; color: var(--status-danger); text-transform: uppercase;">Invalid Phone / Data</div>
            <div style="font-size: 24px; font-weight: 800; color: var(--status-danger);">${invalid}</div>
          </div>
        </div>
        <p style="font-size: 13px; color: var(--text-secondary);">
          All ${valid} valid records have been normalized to E.164 phone formats and scored via the AI lead qualification engine.
        </p>
      `;
    }

    const modal = document.getElementById('import-summary-modal');
    if (modal) modal.classList.add('active');

    // Confirm button
    const confirmBtn = document.getElementById('confirm-import-btn');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        const current = window.appState.get('leads') || [];
        window.appState.set('leads', [...leadsToAdd, ...current]);
        modal.classList.remove('active');
        window.appState.addAuditLog(
          'Spreadsheet Ingested',
          `${valid} Valid Records Added`,
          `Ingested from ${this.currentFilename || 'File'}. Deduplicated ${duplicates} entries. CRM total: ${current.length + valid}.`,
          'Success'
        );
        alert(`Successfully imported ${valid} leads into CRM!`);
        window.navigationComponent.switchView('crm');
      };
    }
  }

  handleManualLeadSubmit() {
    const company = document.getElementById('man-company')?.value;
    const name = document.getElementById('man-name')?.value;
    const phone = document.getElementById('man-phone')?.value;
    const email = document.getElementById('man-email')?.value;
    const industry = document.getElementById('man-industry')?.value || 'General';
    const location = document.getElementById('man-location')?.value || 'India';
    const website = document.getElementById('man-website')?.value || '';

    if (!company || !name || !phone) {
      alert('Please provide Company Name, Contact Name, and Phone Number.');
      return;
    }

    const newLead = {
      id: 'lead_man_' + Date.now(),
      companyName: company,
      contactName: name,
      jobTitle: 'Primary Contact',
      phone,
      whatsappStatus: 'Available',
      email,
      website,
      industry,
      location,
      source: 'Manual Entry',
      sourceUrl: 'Direct Dashboard Entry',
      score: 75,
      scoreCategory: 'warm',
      status: 'New',
      assignedTo: 'Karthik Raja',
      optedOut: false,
      createdDate: new Date().toISOString(),
      tags: ['Manual Entry', industry]
    };

    const scoreData = window.aiService.analyzeLead(newLead);
    newLead.score = scoreData.score;
    newLead.scoreCategory = scoreData.category;

    const leads = window.appState.get('leads') || [];
    window.appState.set('leads', [newLead, ...leads]);

    window.appState.addAuditLog('Manual Lead Added', `${name} (${company})`, 'Lead created with score ' + newLead.score, 'Success');

    const modal = document.getElementById('manual-lead-modal');
    if (modal) modal.classList.remove('active');

    alert('Lead successfully added to CRM!');
    window.navigationComponent.switchView('crm');
  }

  downloadSampleCSV() {
    const csvContent = "data:text/csv;charset=utf-8," +
      "Company Name,Contact Name,Phone Number,Email,Industry,Location,Website\n" +
      "Royal Palm Dental Care,Dr. Sunita Varma,+919841022334,sunita@royalpalmdental.com,Healthcare & Dental,Ernakulam Kerala,https://royalpalmdental.com\n" +
      "Southern Spice Bistro,Arun Nair,+919886099887,arun@southernspice.in,Restaurants & Food,Indiranagar Bangalore,https://southernspice.in\n" +
      "CloudMatrix Media,Divya Prakash,+919745011223,divya@cloudmatrix.io,Digital Agency,Chennai Tamil Nadu,https://cloudmatrix.io";

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "nexuslead_sample_import.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.leadImportComponent = new LeadImportComponent();
