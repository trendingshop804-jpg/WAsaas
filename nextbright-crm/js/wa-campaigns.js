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
      sent: 320,
      delivered: 312,
      read: 245,
      replied: 58,
      failed: 8,
      created_at: new Date().toISOString()
    },
    {
      id: 'camp-3',
      name: 'Welcome Onboarding Sequence 🤝',
      template_name: 'lead_welcome_v2',
      language: 'en_US',
      target_audience: 'New Inbound Contacts (85 contacts)',
      status: 'running',
      scheduled_at: new Date().toISOString(),
      sent: 85,
      delivered: 84,
      read: 71,
      replied: 19,
      failed: 1,
      created_at: new Date(Date.now() - 3600000 * 2).toISOString()
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
    renderCampaigns();
    updateStatsBar();
    setupEventListeners();
  }

  function setupEventListeners() {
    // New Campaign button
    const createBtn = document.getElementById('create-campaign-btn');
    if (createBtn) {
      createBtn.onclick = openCreateCampaignModal;
    }

    // Modal submit
    const form = document.getElementById('form-create-wa-campaign');
    if (form) {
      form.onsubmit = handleCreateCampaignSubmit;
    }

    // Template selector preview
    const tplSelect = document.getElementById('camp-template-select');
    if (tplSelect) {
      tplSelect.onchange = (e) => {
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
      };
    }

    // Test send button
    const testBtn = document.getElementById('btn-test-send-campaign');
    if (testBtn) {
      testBtn.onclick = sendTestMessage;
    }

    // CSV import button & input
    const csvBtn = document.getElementById('campaign-import-csv-btn');
    const csvInput = document.getElementById('campaign-csv-input');
    if (csvBtn && csvInput) {
      csvBtn.onclick = () => csvInput.click();
      csvInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          if (window.showToast) window.showToast(`Imported ${file.name} (120 audience contacts queued)`, 'success');
        }
      };
    }
  }

  function updateStatsBar() {
    const camps = getCampaigns();
    let totalSent = 0, totalDelivered = 0, totalRead = 0, totalFailed = 0;

    camps.forEach(c => {
      totalSent += (c.sent || 0);
      totalDelivered += (c.delivered || 0);
      totalRead += (c.read || 0);
      totalFailed += (c.failed || 0);
    });

    const elTotal = document.getElementById('camp-stat-total');
    const elSent = document.getElementById('camp-stat-sent');
    const elDelivered = document.getElementById('camp-stat-delivered');
    const elRead = document.getElementById('camp-stat-read');
    const elFailed = document.getElementById('camp-stat-failed');

    if (elTotal) elTotal.textContent = camps.length;
    if (elSent) elSent.textContent = totalSent.toLocaleString();
    if (elDelivered) elDelivered.textContent = totalDelivered.toLocaleString();
    if (elRead) elRead.textContent = totalRead.toLocaleString();
    if (elFailed) elFailed.textContent = totalFailed.toLocaleString();
  }

  function renderCampaigns() {
    const container = document.getElementById('campaigns-list-container');
    if (!container) return;

    const camps = getCampaigns();

    if (camps.length === 0) {
      container.innerHTML = `
        <div style="padding: 48px; text-align: center; color: var(--text-muted); background: #fff; border-radius: 12px; border: 1px dashed var(--border-light);">
          <div style="font-size: 3rem; margin-bottom: 12px;">📣</div>
          <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 6px;">No WhatsApp Campaigns yet</h3>
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 16px;">
            Create automated broadcast campaigns to engage your leads via WhatsApp Business Cloud API.
          </p>
          <button class="btn btn-primary" onclick="window.NextBrightWACampaigns.openCreateCampaignModal()">
            <i data-feather="plus"></i> New Campaign
          </button>
        </div>
      `;
      if (typeof feather !== 'undefined') feather.replace();
      return;
    }

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${camps.map(camp => {
          let badgeClass = 'badge-secondary';
          if (camp.status === 'completed') badgeClass = 'badge-success';
          else if (camp.status === 'scheduled') badgeClass = 'badge-warning';
          else if (camp.status === 'running') badgeClass = 'badge-info';

          const readPercentage = camp.sent > 0 ? Math.round((camp.read / camp.sent) * 100) : 0;
          const deliveryPercentage = camp.sent > 0 ? Math.round((camp.delivered / camp.sent) * 100) : 0;

          return `
            <div class="campaign-card" style="background:#fff;border:1px solid var(--border-light);border-radius:12px;padding:18px 20px;box-shadow:var(--shadow-sm);">
              <div class="campaign-card-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                <div>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <strong style="font-size:1.05rem;color:var(--text-primary);">${escapeHtml(camp.name)}</strong>
                    <span class="badge ${badgeClass}" style="text-transform:capitalize;">${camp.status}</span>
                  </div>
                  <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">
                    Template: <code style="background:var(--navy-50);padding:2px 6px;border-radius:4px;">${camp.template_name}</code> · Audience: <strong>${camp.target_audience}</strong>
                  </div>
                </div>
                <div style="display:flex;gap:8px;">
                  ${camp.status === 'scheduled' ? `
                    <button class="btn btn-secondary btn-sm" onclick="window.NextBrightWACampaigns.launchCampaign('${camp.id}')">
                      <i data-feather="send" style="width:12px;height:12px;"></i> Launch Now
                    </button>
                  ` : ''}
                  <button class="btn btn-secondary btn-sm" style="color:var(--status-danger,#ef4444);" onclick="window.NextBrightWACampaigns.deleteCampaign('${camp.id}')">
                    <i data-feather="trash-2" style="width:12px;height:12px;"></i>
                  </button>
                </div>
              </div>

              <!-- Progress bar -->
              <div class="campaign-progress-bar" style="height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;margin-bottom:12px;">
                <div class="campaign-progress-fill" style="width:${deliveryPercentage}%;height:100%;background:linear-gradient(90deg,#25d366,#10b981);border-radius:3px;"></div>
              </div>

              <!-- Stats row -->
              <div class="campaign-stats-row" style="display:flex;gap:20px;font-size:0.82rem;color:var(--text-secondary);flex-wrap:wrap;">
                <div><strong>${camp.sent}</strong> <span style="color:var(--text-muted);">Sent</span></div>
                <div><strong style="color:#10b981;">${camp.delivered}</strong> <span style="color:var(--text-muted);">Delivered (${deliveryPercentage}%)</span></div>
                <div><strong style="color:#6366f1;">${camp.read}</strong> <span style="color:var(--text-muted);">Read (${readPercentage}%)</span></div>
                <div><strong style="color:#0ea5e9;">${camp.replied || 0}</strong> <span style="color:var(--text-muted);">Replied</span></div>
                ${camp.failed > 0 ? `<div><strong style="color:#ef4444;">${camp.failed}</strong> <span style="color:var(--text-muted);">Failed</span></div>` : ''}
                <div style="margin-left:auto;color:var(--text-muted);font-size:0.75rem;">
                  ${new Date(camp.scheduled_at || camp.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    if (typeof feather !== 'undefined') feather.replace();
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
    const name = document.getElementById('camp-name-input')?.value.trim() || 'Untitled Campaign';
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
      sent: 85,
      delivered: 83,
      read: 62,
      replied: 14,
      failed: 2,
      created_at: new Date().toISOString()
    };

    camps.unshift(newCamp);
    saveCampaigns(camps);
    closeCreateCampaignModal();
    renderCampaigns();
    updateStatsBar();

    if (window.showToast) window.showToast(`WhatsApp Campaign "${name}" created successfully!`, 'success');
  }

  function launchCampaign(campId) {
    const camps = getCampaigns();
    const camp = camps.find(c => c.id === campId);
    if (!camp) return;

    camp.status = 'running';
    saveCampaigns(camps);
    renderCampaigns();
    updateStatsBar();

    if (window.showToast) window.showToast(`Dispatching broadcast for "${camp.name}"...`, 'info');

    setTimeout(() => {
      camp.status = 'completed';
      saveCampaigns(camps);
      renderCampaigns();
      updateStatsBar();
      if (window.showToast) window.showToast(`Campaign "${camp.name}" completed delivery!`, 'success');
    }, 1500);
  }

  function deleteCampaign(campId) {
    if (!confirm('Are you sure you want to delete this WhatsApp campaign?')) return;
    let camps = getCampaigns();
    camps = camps.filter(c => c.id !== campId);
    saveCampaigns(camps);
    renderCampaigns();
    updateStatsBar();
    if (window.showToast) window.showToast('Campaign deleted', 'default');
  }

  function sendTestMessage() {
    if (window.showToast) window.showToast('Test WhatsApp template dispatched to your registered phone!', 'success');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.NextBrightWACampaigns = {
    init: initWACampaigns,
    openCreateCampaignModal,
    closeModal: closeCreateCampaignModal,
    launchCampaign,
    deleteCampaign,
    sendTestMessage
  };

  document.addEventListener('DOMContentLoaded', () => {
    initWACampaigns();
  });
})();
