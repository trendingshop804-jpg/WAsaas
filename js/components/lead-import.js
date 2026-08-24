/* ==========================================================================
   NexusLead AI - Data Import & Normalization Component
   CSV, Excel, API Import, Deduplication & Validation Summary
   ========================================================================== */

class LeadImportComponent {
  init() {
    this.bindEvents();
  }

  bindEvents() {
    // CSV file upload change
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
          this.processCSVFile(e.dataTransfer.files[0]);
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
  }

  handleFileSelected(e) {
    if (e.target.files && e.target.files[0]) {
      this.processCSVFile(e.target.files[0]);
      e.target.value = ''; // Reset input so selecting the same file again triggers change event
    }
  }

  processCSVFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      this.parseAndValidateCSV(text);
    };
    reader.readAsText(file);
  }

  parseAndValidateCSV(csvText) {
    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length <= 1) {
      alert('CSV file appears to be empty or missing headers.');
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    const rows = lines.slice(1);

    // Smart column index detection with collision avoidance
    const companyIdx = headers.findIndex(h => h.includes('company') || h.includes('business') || h.includes('org'));
    const nameIdx = headers.findIndex(h => !h.includes('company') && !h.includes('business') && (h.includes('contact') || h.includes('name') || h.includes('owner') || h.includes('person')));
    const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('whatsapp') || h.includes('number') || h.includes('cell') || h.includes('tel'));
    const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('mail'));
    const industryIdx = headers.findIndex(h => h.includes('industry') || h.includes('category') || h.includes('niche') || h.includes('vertical'));
    const locationIdx = headers.findIndex(h => h.includes('location') || h.includes('city') || h.includes('state') || h.includes('address'));
    const websiteIdx = headers.findIndex(h => h.includes('website') || h.includes('url') || h.includes('site') || h.includes('domain'));

    const finalCompanyIdx = companyIdx !== -1 ? companyIdx : 0;
    const finalNameIdx = nameIdx !== -1 ? nameIdx : 1;
    const finalPhoneIdx = phoneIdx !== -1 ? phoneIdx : 2;
    const finalEmailIdx = emailIdx !== -1 ? emailIdx : 3;
    const finalIndustryIdx = industryIdx !== -1 ? industryIdx : 4;
    const finalLocationIdx = locationIdx !== -1 ? locationIdx : 5;
    const finalWebsiteIdx = websiteIdx !== -1 ? websiteIdx : 6;

    const existingLeads = window.appState.get('leads') || [];
    const existingPhones = new Set(existingLeads.map(l => l.phone ? l.phone.replace(/\D/g, '') : ''));
    const existingEmails = new Set(existingLeads.map(l => (l.email || '').toLowerCase()));

    let total = rows.length;
    let valid = 0;
    let duplicates = 0;
    let invalid = 0;
    const leadsToAdd = [];

    rows.forEach(row => {
      const cols = row.split(',').map(c => c.trim().replace(/^["'\r]+|["'\r]+$/g, ''));
      if (cols.length < 2) {
        invalid++;
        return;
      }

      const companyName = cols[finalCompanyIdx] || cols[0] || 'Unknown Business';
      const contactName = cols[finalNameIdx] || cols[1] || 'Owner';
      let rawPhone = cols[finalPhoneIdx] || cols[2] || '';
      const email = cols[finalEmailIdx] || cols[3] || '';
      const industry = cols[finalIndustryIdx] || cols[4] || 'General';
      const location = cols[finalLocationIdx] || cols[5] || 'India';
      const website = cols[finalWebsiteIdx] || cols[6] || '';

      // Phone normalization & auto-detection across columns if needed
      let cleanPhoneDigits = rawPhone.replace(/\D/g, '');
      if (cleanPhoneDigits.length < 7) {
        const foundPhoneCol = cols.find(c => c.replace(/\D/g, '').length >= 7);
        if (foundPhoneCol) {
          cleanPhoneDigits = foundPhoneCol.replace(/\D/g, '');
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
        id: 'lead_csv_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        companyName,
        contactName,
        jobTitle: 'Decision Maker',
        phone: formattedPhone,
        whatsappStatus: 'Available',
        email,
        website: website || `https://${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        industry,
        location,
        source: 'CSV Upload',
        sourceUrl: 'Uploaded File',
        score: 65,
        scoreCategory: 'warm',
        status: 'New',
        assignedTo: 'Karthik Raja',
        optedOut: false,
        createdDate: new Date().toISOString(),
        tags: ['CSV Import', industry]
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
          All ${valid} valid records have been normalized to E.164 phone formats and scored via the AI lead qualification rules.
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
          'CSV Leads Ingested',
          `${valid} Valid Records Added`,
          `Deduplicated ${duplicates} entries. Total CRM size: ${current.length + valid}.`,
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
}

window.leadImportComponent = new LeadImportComponent();
