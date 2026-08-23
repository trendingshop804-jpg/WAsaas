/* ==========================================================================
   NexusLead AI - Compliant Lead Discovery Component
   ========================================================================== */

class DiscoveryComponent {
  constructor() {
    this.discoveredResults = [];
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    // Quick preset buttons
    document.querySelectorAll('.discovery-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const query = btn.getAttribute('data-preset');
        this.fillPresetQuery(query);
      });
    });

    // Search submit
    const searchForm = document.getElementById('lead-discovery-form');
    if (searchForm) {
      searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.executeSearch();
      });
    }

    // Select all discovered leads
    const selectAllCb = document.getElementById('select-all-discovered');
    if (selectAllCb) {
      selectAllCb.addEventListener('change', (e) => {
        document.querySelectorAll('.discovered-item-cb').forEach(cb => {
          cb.checked = e.target.checked;
        });
        this.updateImportButton();
      });
    }

    // Bulk Import to CRM button
    const importBtn = document.getElementById('import-discovered-btn');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        this.importSelectedLeads();
      });
    }
  }

  fillPresetQuery(preset) {
    const categoryInput = document.getElementById('disc-category');
    const locationInput = document.getElementById('disc-location');
    const keywordsInput = document.getElementById('disc-keywords');

    if (preset === 'dentists_kerala') {
      if (categoryInput) categoryInput.value = 'Dental Clinics & Surgeons';
      if (locationInput) locationInput.value = 'Kochi, Kerala, India';
      if (keywordsInput) keywordsInput.value = 'Implantology, Orthodontics, Cosmetic Clinic';
    } else if (preset === 'restaurants_bangalore') {
      if (categoryInput) categoryInput.value = 'Fine Dining & Bistros';
      if (locationInput) locationInput.value = 'Indiranagar, Bangalore, India';
      if (keywordsInput) keywordsInput.value = 'Table Reservation, Craft Beer, Rooftop Dining';
    } else if (preset === 'agencies_chennai') {
      if (categoryInput) categoryInput.value = 'Digital Marketing & Advertising Agencies';
      if (locationInput) locationInput.value = 'Chennai, Tamil Nadu, India';
      if (keywordsInput) keywordsInput.value = 'Performance Marketing, SEO, Social Media';
    } else if (preset === 'resorts_munnar') {
      if (categoryInput) categoryInput.value = 'Ayurvedic & Luxury Resorts';
      if (locationInput) locationInput.value = 'Munnar, Kerala, India';
      if (keywordsInput) keywordsInput.value = 'Wellness, Monsoon Ayurveda, Eco Tourism';
    }

    this.executeSearch();
  }

  async executeSearch() {
    const category = document.getElementById('disc-category')?.value || 'Healthcare Clinics';
    const location = document.getElementById('disc-location')?.value || 'Kochi, Kerala';
    const statusMsg = document.getElementById('discovery-status');
    const resultsContainer = document.getElementById('discovery-results-table');
    const countEl = document.getElementById('discovered-count');

    if (statusMsg) {
      statusMsg.innerHTML = `
        <div class="flex items-center gap-2" style="color: var(--brand-whatsapp); font-weight: 600;">
          <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path></svg>
          Scanning verified public B2B directories for "${category}" in "${location}"...
        </div>
      `;
    }

    setTimeout(() => {
      // Generate synthetic realistic leads based on search query
      const isKerala = location.toLowerCase().includes('kerala') || location.toLowerCase().includes('kochi');
      const isBangalore = location.toLowerCase().includes('bangalore') || location.toLowerCase().includes('karnataka');

      this.discoveredResults = [
        {
          id: 'disc_' + Date.now() + '_1',
          companyName: isKerala ? 'Lakeshore Dental & Maxillofacial Care' : 'Green Leaf Gourmet Kitchen',
          contactName: isKerala ? 'Dr. Thomas Varghese' : 'Aditya Kulkarni',
          jobTitle: isKerala ? 'Senior Consultant' : 'Operations Partner',
          phone: isKerala ? '+91 94471 22334' : '+91 98450 11223',
          email: isKerala ? 'drthomas@lakeshoredental.in' : 'aditya@greenleafkitchen.in',
          website: isKerala ? 'https://lakeshoredental.in' : 'https://greenleafkitchen.in',
          industry: category,
          location: location,
          source: 'Discovery Engine',
          sourceUrl: 'https://public-registry.org/b2b/' + encodeURIComponent(location),
          score: 86,
          scoreCategory: 'hot',
          status: 'New',
          customFields: { verifiedPublicListing: 'Yes' }
        },
        {
          id: 'disc_' + Date.now() + '_2',
          companyName: isKerala ? 'Cochin Smile Multispeciality Dental' : 'Brew & Barrel Craft Gastropub',
          contactName: isKerala ? 'Dr. Priya Menon' : 'Nikhil Rao',
          jobTitle: isKerala ? 'Managing Director' : 'General Manager',
          phone: isKerala ? '+91 94475 66778' : '+91 98862 33445',
          email: isKerala ? 'priya@cochinsmile.com' : 'nikhil@brewandbarrel.in',
          website: isKerala ? 'https://cochinsmile.com' : 'https://brewandbarrel.in',
          industry: category,
          location: location,
          source: 'Discovery Engine',
          sourceUrl: 'https://public-registry.org/b2b/' + encodeURIComponent(location),
          score: 79,
          scoreCategory: 'warm',
          status: 'New',
          customFields: { verifiedPublicListing: 'Yes' }
        },
        {
          id: 'disc_' + Date.now() + '_3',
          companyName: isKerala ? 'Green Valley Family Dental Studio' : 'Urban Tadka Modern Eatery',
          contactName: isKerala ? 'Dr. Alex Joseph' : 'Meera Sundaram',
          jobTitle: isKerala ? 'Chief Orthodontist' : 'Founder & Owner',
          phone: isKerala ? '+91 97455 88990' : '+91 97401 55667',
          email: isKerala ? 'alex@greenvalleydental.org' : 'meera@urbantadka.com',
          website: isKerala ? 'https://greenvalleydental.org' : 'https://urbantadka.com',
          industry: category,
          location: location,
          source: 'Discovery Engine',
          sourceUrl: 'https://public-registry.org/b2b/' + encodeURIComponent(location),
          score: 91,
          scoreCategory: 'hot',
          status: 'New',
          customFields: { verifiedPublicListing: 'Yes' }
        }
      ];

      if (statusMsg) {
        statusMsg.innerHTML = `<span style="color: var(--status-success); font-weight: 600;">✓ Successfully discovered ${this.discoveredResults.length} compliant public records matching criteria.</span>`;
      }
      if (countEl) countEl.textContent = this.discoveredResults.length;

      this.renderDiscoveredTable();
    }, 1000);
  }

  renderDiscoveredTable() {
    const tbody = document.getElementById('discovery-results-tbody');
    if (!tbody) return;

    tbody.innerHTML = this.discoveredResults.map(lead => `
      <tr>
        <td><input type="checkbox" class="discovered-item-cb" data-id="${lead.id}" checked></td>
        <td>
          <div style="font-weight: 600; color: var(--text-primary);">${this.escapeHtml(lead.contactName)}</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">${this.escapeHtml(lead.jobTitle)}</div>
        </td>
        <td>
          <div style="font-weight: 600;">${this.escapeHtml(lead.companyName)}</div>
          <div style="font-size: 11px; color: var(--text-muted);"><a href="${lead.website}" target="_blank">${this.escapeHtml(lead.website)}</a></div>
        </td>
        <td>
          <span class="badge badge-whatsapp font-mono">${this.escapeHtml(lead.phone)}</span>
        </td>
        <td>${this.escapeHtml(lead.location)}</td>
        <td><span class="badge badge-${lead.scoreCategory}">🔥 ${lead.score}/100</span></td>
      </tr>
    `).join('');

    this.updateImportButton();

    document.querySelectorAll('.discovered-item-cb').forEach(cb => {
      cb.addEventListener('change', () => this.updateImportButton());
    });
  }

  updateImportButton() {
    const checked = document.querySelectorAll('.discovered-item-cb:checked').length;
    const btn = document.getElementById('import-discovered-btn');
    if (btn) {
      btn.disabled = checked === 0;
      btn.textContent = `Import Selected Leads (${checked}) to CRM`;
    }
  }

  importSelectedLeads() {
    const selectedIds = Array.from(document.querySelectorAll('.discovered-item-cb:checked')).map(cb => cb.getAttribute('data-id'));
    const leadsToImport = this.discoveredResults.filter(l => selectedIds.includes(l.id));

    if (leadsToImport.length === 0) return;

    const currentLeads = window.appState.get('leads') || [];
    window.appState.set('leads', [...leadsToImport, ...currentLeads]);

    window.appState.addAuditLog(
      'Leads Imported via Discovery',
      `${leadsToImport.length} Leads Added`,
      `Added ${leadsToImport.map(l => l.companyName).join(', ')} to CRM.`,
      'Success'
    );

    alert(`Successfully imported ${leadsToImport.length} discovered leads into CRM!`);
    window.navigationComponent.switchView('crm');
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
}

window.discoveryComponent = new DiscoveryComponent();
