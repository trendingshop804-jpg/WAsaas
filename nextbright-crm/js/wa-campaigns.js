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
      const scheduled = campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString() : 'Draft — not scheduled';
      return `<div class="campaign-card" style="background:#fff;border:1px solid var(--border-light);border-radius:12px;padding:18px 20px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;gap:12px;"><div><strong>${escapeHtml(campaign.name)}</strong><div style="font-size:.8rem;color:var(--text-muted);margin-top:4px;">Template: <code>${escapeHtml(campaign.template_name)}</code> · ${escapeHtml(campaign.audience_type || 'manual')}</div></div><span class="badge badge-secondary">${escapeHtml(campaign.status)}</span></div>
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
        body: JSON.stringify({ name, template_name: templateName, template_language: 'en_US', audience_type: audienceType, scheduled_at: scheduleValue ? new Date(scheduleValue).toISOString() : null })
      }));
      campaigns.unshift(payload.campaign);
      closeCreateCampaignModal();
      renderCampaigns();
      renderStats();
      showToast(payload.campaign.status === 'scheduled' ? 'Campaign scheduled. No messages have been sent.' : 'Campaign saved as a draft. No messages have been sent.', 'success');
    } catch (error) { showToast(error.message, 'error'); }
  }

  function setup() {
    document.getElementById('create-campaign-btn')?.addEventListener('click', openCreateCampaignModal);
    const form = document.getElementById('form-create-wa-campaign');
    if (form) form.onsubmit = saveCampaign;
    document.getElementById('btn-test-send-campaign')?.addEventListener('click', () => showToast('Test sending requires a verified test recipient and is not simulated.', 'info'));
  }

  function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function init() { setup(); loadCampaigns(); }
  window.NextBrightWACampaigns = { init, openCreateCampaignModal, closeModal: closeCreateCampaignModal };
  document.addEventListener('DOMContentLoaded', init);
})();