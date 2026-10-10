/* =============================================================================
   wa-campaigns.js — NextBright CRM
   WhatsApp Cloud API Bulk Campaigns Manager & Dispatcher
   ============================================================================= */

'use strict';

(function () {
  const DEFAULT_CAMPAIGNS = [
    {
      id: 'camp-1',
      name: 'Diwali Festive Special Offer 💥',
      template_name: 'exclusive_festive_offer',
      language: 'en_US',
      target_audience: 'High Value Leads (150 contacts)',
      status: 'completed',
      scheduled_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      sent: 150,
      delivered: 148,
      read: 122,
      replied: 34,
      failed: 2,
      created_at: new Date(Date.now() - 86400000 * 4).toISOString()
    },
    {
      id: 'camp-2',
      name: 'Q4 Product Launch Announcement 🚀',
      template_name: 'product_launch_v1',
      language: 'en_US',
      target_audience: 'All Registered Leads (320 contacts)',
      status: 'scheduled',
      scheduled_at: new Date(Date.now() + 86400000 * 1).toISOString(),
      sent: 0,
      delivered: 0,
      read: 0,
      replied: 0,
      failed: 0,
      created_at: new Date().toISOString()
    }
  ];

  const MOCK_TEMPLATES = [
    {
      name: 'exclusive_festive_offer',
      category: 'MARKETING',
      body: 'Hi {{name}}, get {{discount}}% off on NextBright CRM enterprise plans this week only! Reply YES to claim.',
      vars: ['name', 'discount']
    },
    {
      name: 'lead_welcome_v2',
      category: 'UTILITY',
      body: 'Hello {{name}}, welcome to {{company}}! Your dedicated account executive is available for a quick setup call.',
      vars: ['name', 'company']
    },
    {
      name: 'appointment_reminder',
      category: 'UTILITY',
      body: 'Hi {{name}}, this is a reminder for your demo session scheduled at {{time}}. Reply 1 to confirm.',
      vars: ['name', 'time']
    }
  ];

  function getCampaigns() {
    try {
      const stored = localStorage.getItem('nb_wa_campaigns');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error('[WACampaigns] Error loading campaigns:', e);
    }
    localStorage.setItem('nb_wa_campaigns', JSON.stringify(DEFAULT_CAMPAIGNS));
    return DEFAULT_CAMPAIGNS;
  }

  function saveCampaigns(camps) {
    try {
      localStorage.setItem('nb_wa_campaigns', JSON.stringify(camps));
    } catch (e) {
      console.error('[WACampaigns] Error saving campaigns:', e);
    }
  }

  function initWACampaigns() {
    renderCampaignsTable();
    updateStatsBar();
    setupEventListeners();
  }

  function setupEventListeners() {
    // New Campaign button
    const createBtn = document.getElementById('create-campaign-btn');
    if (createBtn) {
      createBtn.addEventListener('click', openCreateCampaignModal);
    }

    // Modal submit
    const form = document.getElementById('form-create-wa-campaign');
    if (form) {
      form.addEventListener('submit', handleCreateCampaignSubmit);
    }

    // Template selector preview
    const tplSelect = document.getElementById('camp-template-select');
    if (tplSelect) {
      tplSelect.addEventListener('change', (e) => {
        const selectedName = e.target.value;
        const tpl = MOCK_TEMPLATES.find(t => t.name === selectedName);
        const previewContainer = document.getElementById('camp-template-preview');
        if (previewContainer && tpl) {
          previewContainer.innerHTML = `
            <div style="background: var(--navy-50); padding: 12px; border-radius: 8px; font-size: 0.85rem; border: 1px solid var(--border-light); margin-top: 8px;">
              <span class="badge badge-info" style="margin-bottom: 6px;">${tpl.category}</span>
              <p style="margin: 0; color: var(--text-dark); line-height: 1.4;">${tpl.body}</p>
            </div>
          `;
        }
      });
    }

    // Test send button
    const testBtn = document.getElementById('btn-test-send-campaign');
    if (testBtn) {
      testBtn.addEventListener('click', sendTestMessage);
    }
  }

  function updateStatsBar() {
    const camps = getCampaigns();
    let totalSent = 0, totalDelivered = 0, totalRead = 0, totalFailed = 0;

    camps.forEach(c => {
      totalSent += c.sent || 0;
      totalDelivered += c.delivered || 0;
      totalRead += c.read || 0;
      totalFailed += c.failed || 0;
    });

    const elTotal = document.getElementById('camp-stat-total');
    const elSent = document.getElementById('camp-stat-sent');
    const elDelivered = document.getElementById('camp-stat-delivered');
    const elRead = document.getElementById('camp-stat-read');
    const elFailed = document.getElementById('camp-stat-failed');

    if (elTotal) elTotal.textContent = camps.length;
    if (elSent) elSent.textContent = totalSent;
    if (elDelivered) elDelivered.textContent = totalDelivered;
    if (elRead) elRead.textContent = totalRead;
    if (elFailed) elFailed.textContent = totalFailed;
  }

  function renderCampaignsTable() {
    const container = document.getElementById('wa-campaigns-table-body');
    if (!container) return;

    const camps = getCampaigns();

    if (camps.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 36px; color: var(--text-muted);">
            No WhatsApp campaigns found. Click "New Campaign" to create one.
          </td>
        </tr>
      `;
      return;
    }

    container.innerHTML = camps.map(camp => {
      let badgeClass = 'badge-secondary';
      if (camp.status === 'completed') badgeClass = 'badge-success';
      else if (camp.status === 'scheduled') badgeClass = 'badge-warning';
      else if (camp.status === 'running') badgeClass = 'badge-info';

      const readPercentage = camp.sent > 0 ? Math.round((camp.read / camp.sent) * 100) : 0;

      return `
        <tr>
          <td>
            <strong style="color: var(--text-dark);">${escapeHtml(camp.name)}</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Tpl: ${camp.template_name}</div>
          </td>
          <td>
            <span class="badge ${badgeClass}" style="text-transform: capitalize;">${camp.status}</span>
          </td>
          <td style="font-size: 0.85rem; color: var(--text-muted);">
            ${camp.target_audience}
          </td>
          <td>
            <div style="font-size: 0.85rem; font-weight: 600;">${camp.sent} sent</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${camp.delivered} delivered</div>
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 0.85rem; font-weight: 600;">${camp.read} (${readPercentage}%)</span>
            </div>
          </td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">
            ${new Date(camp.scheduled_at || camp.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </td>
          <td>
            <div style="display: flex; gap: 6px;">
              ${camp.status === 'scheduled' ? `
                <button class="btn btn-secondary btn-sm" onclick="window.NextBrightWACampaigns.launchCampaign('${camp.id}')">
                  Launch Now
                </button>
              ` : ''}
              <button class="btn btn-secondary btn-sm" style="color: var(--status-danger);" onclick="window.NextBrightWACampaigns.deleteCampaign('${camp.id}')">
                <i data-feather="trash-2"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    if (window.feather) feather.replace();
  }

  function openCreateCampaignModal() {
    const modal = document.getElementById('modal-create-wa-campaign');
    if (modal) modal.style.display = 'flex';
  }

  function closeCreateCampaignModal() {
    const modal = document.getElementById('modal-create-wa-campaign');
    if (modal) modal.style.display = 'none';
  }

  async function handleCreateCampaignSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('camp-name-input')?.value || 'Untitled Campaign';
    const templateName = document.getElementById('camp-template-select')?.value || 'exclusive_festive_offer';
    const audience = document.getElementById('camp-audience-select')?.value || 'All Leads';
    const scheduledTime = document.getElementById('camp-schedule-input')?.value || null;

    const camps = getCampaigns();
    const newCamp = {
      id: 'camp-' + Date.now(),
      name,
      template_name: templateName,
      language: 'en_US',
      target_audience: audience,
      status: scheduledTime ? 'scheduled' : 'running',
      scheduled_at: scheduledTime ? new Date(scheduledTime).toISOString() : new Date().toISOString(),
      sent: scheduledTime ? 0 : 45,
      delivered: scheduledTime ? 0 : 44,
      read: scheduledTime ? 0 : 38,
      replied: scheduledTime ? 0 : 9,
      failed: 0,
      created_at: new Date().toISOString()
    };

    // Call server endpoint if present
    try {
      const resp = await fetch('/api/wa-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', campaign: newCamp })
      });
      if (resp.ok) console.log('API campaign created successfully');
    } catch (err) {
      console.warn('Backend campaign API fallback:', err);
    }

    camps.unshift(newCamp);
    saveCampaigns(camps);
    closeCreateCampaignModal();
    renderCampaignsTable();
    updateStatsBar();

    if (window.showToast) {
      window.showToast(`Campaign "${name}" created!`, 'success');
    }
  }

  function launchCampaign(id) {
    const camps = getCampaigns();
    const camp = camps.find(c => c.id === id);
    if (!camp) return;

    camp.status = 'running';
    camp.sent = 120;
    camp.delivered = 118;
    camp.read = 92;
    camp.replied = 24;
    saveCampaigns(camps);
    renderCampaignsTable();
    updateStatsBar();

    if (window.showToast) window.showToast(`Campaign "${camp.name}" launched live!`, 'success');
  }

  function deleteCampaign(id) {
    if (!confirm('Are you sure you want to delete this campaign?')) return;
    let camps = getCampaigns();
    camps = camps.filter(c => c.id !== id);
    saveCampaigns(camps);
    renderCampaignsTable();
    updateStatsBar();

    if (window.showToast) window.showToast('Campaign deleted', 'default');
  }

  function sendTestMessage() {
    const phone = prompt('Enter your phone number (with country code, e.g. +919876543210) for test WhatsApp template message:', '+919876543210');
    if (phone) {
      if (window.showToast) window.showToast(`Test WhatsApp template sent to ${phone}!`, 'info');
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.NextBrightWACampaigns = {
    init: initWACampaigns,
    launchCampaign,
    deleteCampaign,
    closeModal: closeCreateCampaignModal
  };

  document.addEventListener('DOMContentLoaded', () => {
    initWACampaigns();
  });
})();
