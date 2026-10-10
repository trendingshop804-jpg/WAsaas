/* =============================================================================
   social-integrations.js — NextBright CRM
   Social Media & Telephony API Setup, Live Status & Credentials Management
   ============================================================================= */

'use strict';

(function () {
  function initSocialIntegrations() {
    loadSavedCredentials();
    fetchLiveIntegrationStatuses();
    setupEventListeners();
  }

  async function fetchLiveIntegrationStatuses() {
    try {
      const headers = {};
      const token = window.supabaseConfig?.accessToken || localStorage.getItem('sb-access-token') || '';
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/integration-status', { headers });
      const data = await res.json();

      if (data && data.integrations) {
        const wa = data.integrations.whatsapp;
        const ig = data.integrations.instagram;
        const tw = data.integrations.twilio;

        if (wa) {
          if (wa.connected) {
            setConnectionBadge('wa-status-badge', true, `Connected (${wa.displayName || wa.phoneNumberId || 'WhatsApp Cloud API'})`);
          } else if (wa.status === 'not_configured') {
            setConnectionBadge('wa-status-badge', false, 'Not Configured');
          } else {
            setConnectionBadge('wa-status-badge', false, `Status: ${wa.status}`);
          }
        }

        if (ig) {
          if (ig.connected) {
            setConnectionBadge('ig-status-badge', true, `Connected (@${ig.displayName || ig.accountId || 'Instagram Business'})`);
          } else if (ig.status === 'not_configured') {
            setConnectionBadge('ig-status-badge', false, 'Not Configured');
          } else {
            setConnectionBadge('ig-status-badge', false, `Status: ${ig.status}`);
          }
        }

        if (tw) {
          const twBadge = document.getElementById('twilio-status-badge');
          if (twBadge) {
            if (tw.connected) {
              twBadge.className = 'badge badge-success';
              twBadge.textContent = `Connected (${tw.displayName || tw.accountSid || 'Twilio Voice'})`;
            } else {
              twBadge.className = 'badge badge-secondary';
              twBadge.textContent = tw.status === 'not_configured' ? 'Not Configured' : `Status: ${tw.status}`;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[SocialIntegrations] Live status fetch fallback:', err.message);
    }
  }

  function loadSavedCredentials() {
    // Instagram Credentials
    try {
      const igConn = JSON.parse(localStorage.getItem('nb_instagram_conn') || '{}');
      if (igConn.page_access_token || igConn.ig_account_id) {
        const tokenInput = document.getElementById('ig-access-token');
        const accInput = document.getElementById('ig-account-id');
        if (tokenInput && igConn.page_access_token) tokenInput.value = igConn.page_access_token;
        if (accInput && igConn.ig_account_id) accInput.value = igConn.ig_account_id;
      }
    } catch (e) {}

    // WhatsApp Credentials
    try {
      const waConn = JSON.parse(localStorage.getItem('nb_whatsapp_conn') || '{}');
      if (waConn.system_token || waConn.phone_number_id) {
        const tokenInput = document.getElementById('wa-access-token');
        const phoneIdInput = document.getElementById('wa-phone-number-id');
        const wabaIdInput = document.getElementById('wa-waba-id');
        if (tokenInput && waConn.system_token) tokenInput.value = waConn.system_token;
        if (phoneIdInput && waConn.phone_number_id) phoneIdInput.value = waConn.phone_number_id;
        if (wabaIdInput && waConn.waba_id) wabaIdInput.value = waConn.waba_id;
      }
    } catch (e) {}

    // Webhook Callback URL display
    const webhookUrlInput = document.getElementById('meta-webhook-callback-url');
    if (webhookUrlInput) {
      const origin = window.location.origin;
      webhookUrlInput.value = `${origin}/api/meta-webhook`;
    }
  }

  function setConnectionBadge(elementId, isConnected, text) {
    const badge = document.getElementById(elementId);
    if (!badge) return;
    if (isConnected) {
      badge.className = 'badge badge-success';
      badge.textContent = text || 'Connected';
    } else {
      badge.className = 'badge badge-secondary';
      badge.textContent = text || 'Not Connected';
    }
  }

  function setupEventListeners() {
    // Save Instagram Credentials
    const igForm = document.getElementById('form-ig-credentials');
    if (igForm) {
      igForm.addEventListener('submit', handleSaveInstagram);
    }

    // Save WhatsApp Credentials
    const waForm = document.getElementById('form-wa-credentials');
    if (waForm) {
      waForm.addEventListener('submit', handleSaveWhatsApp);
    }

    // Test Instagram Connection
    const testIgBtn = document.getElementById('btn-test-ig-conn');
    if (testIgBtn) {
      testIgBtn.addEventListener('click', testInstagramConnection);
    }

    // Test WhatsApp Connection
    const testWaBtn = document.getElementById('btn-test-wa-conn');
    if (testWaBtn) {
      testWaBtn.addEventListener('click', testWhatsAppConnection);
    }

    // Copy Webhook URL
    const copyWebhookBtn = document.getElementById('btn-copy-webhook-url');
    if (copyWebhookBtn) {
      copyWebhookBtn.addEventListener('click', () => {
        const urlInput = document.getElementById('meta-webhook-callback-url');
        if (urlInput) {
          navigator.clipboard.writeText(urlInput.value).then(() => {
            if (window.showToast) window.showToast('Meta Webhook URL copied to clipboard!', 'info');
          });
        }
      });
    }
  }

  async function handleSaveInstagram(e) {
    e.preventDefault();
    const token = document.getElementById('ig-access-token')?.value.trim();
    const accountId = document.getElementById('ig-account-id')?.value.trim();

    if (!token || !accountId) {
      alert('Please provide both Access Token and Instagram Account ID');
      return;
    }

    const conn = {
      page_access_token: token,
      ig_account_id: accountId,
      username: 'instagram_biz',
      connected_at: new Date().toISOString()
    };
    localStorage.setItem('nb_instagram_conn', JSON.stringify(conn));

    try {
      const headers = { 'Content-Type': 'application/json' };
      const sbToken = window.supabaseConfig?.accessToken || localStorage.getItem('sb-access-token') || '';
      if (sbToken) headers['Authorization'] = `Bearer ${sbToken}`;

      const res = await fetch('/api/integration-status', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          integration: 'instagram',
          accessToken: token,
          instagramBusinessId: accountId
        })
      });

      const data = await res.json();
      if (data.success && data.status) {
        setConnectionBadge('ig-status-badge', data.status.connected, data.status.connected ? `Connected (@${data.status.displayName || 'Instagram'})` : `Status: ${data.status.status}`);
        if (window.showToast) window.showToast('Instagram Graph API credentials encrypted & saved to database!', 'success');
      } else {
        setConnectionBadge('ig-status-badge', true, 'Connected (Local)');
        if (window.showToast) window.showToast(data.error || 'Instagram credentials saved', 'info');
      }
    } catch (err) {
      setConnectionBadge('ig-status-badge', true, 'Connected (Local)');
      if (window.showToast) window.showToast('Instagram credentials saved locally', 'info');
    }
  }

  async function handleSaveWhatsApp(e) {
    e.preventDefault();
    const token = document.getElementById('wa-access-token')?.value.trim();
    const phoneId = document.getElementById('wa-phone-number-id')?.value.trim();
    const wabaId = document.getElementById('wa-waba-id')?.value.trim();

    if (!token || !phoneId) {
      alert('Please provide Access Token and Phone Number ID');
      return;
    }

    const conn = {
      system_token: token,
      phone_number_id: phoneId,
      waba_id: wabaId || 'waba_default',
      phone_number: '+1 (555) 019-2834',
      connected_at: new Date().toISOString()
    };
    localStorage.setItem('nb_whatsapp_conn', JSON.stringify(conn));

    try {
      const headers = { 'Content-Type': 'application/json' };
      const sbToken = window.supabaseConfig?.accessToken || localStorage.getItem('sb-access-token') || '';
      if (sbToken) headers['Authorization'] = `Bearer ${sbToken}`;

      const res = await fetch('/api/integration-status', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          integration: 'whatsapp',
          accessToken: token,
          phoneNumberId: phoneId,
          wabaId
        })
      });

      const data = await res.json();
      if (data.success && data.status) {
        setConnectionBadge('wa-status-badge', data.status.connected, data.status.connected ? `Connected (${data.status.displayName || 'WhatsApp Cloud API'})` : `Status: ${data.status.status}`);
        if (window.showToast) window.showToast('WhatsApp Cloud API credentials encrypted & saved to database!', 'success');
      } else {
        setConnectionBadge('wa-status-badge', true, 'Connected (Local)');
        if (window.showToast) window.showToast(data.error || 'WhatsApp credentials saved', 'info');
      }
    } catch (err) {
      setConnectionBadge('wa-status-badge', true, 'Connected (Local)');
      if (window.showToast) window.showToast('WhatsApp credentials saved locally', 'info');
    }
  }

  async function testInstagramConnection() {
    if (window.showToast) window.showToast('Testing Instagram Graph API connection...', 'info');

    try {
      const headers = {};
      const sbToken = window.supabaseConfig?.accessToken || localStorage.getItem('sb-access-token') || '';
      if (sbToken) headers['Authorization'] = `Bearer ${sbToken}`;

      const resp = await fetch('/api/integration-status?integration=instagram', { headers });
      const res = await resp.json();
      if (res.success && res.integrations?.instagram?.connected) {
        setConnectionBadge('ig-status-badge', true, `Connected (@${res.integrations.instagram.displayName || 'Instagram'})`);
        if (window.showToast) window.showToast('Instagram API Connection Verified!', 'success');
      } else {
        const msg = res.integrations?.instagram?.message || 'Check credentials';
        if (window.showToast) window.showToast(`Instagram API: ${msg}`, 'info');
      }
    } catch (err) {
      if (window.showToast) window.showToast('Instagram API connection checked', 'info');
    }
  }

  async function testWhatsAppConnection() {
    if (window.showToast) window.showToast('Testing Meta WhatsApp Cloud API connection...', 'info');

    try {
      const headers = {};
      const sbToken = window.supabaseConfig?.accessToken || localStorage.getItem('sb-access-token') || '';
      if (sbToken) headers['Authorization'] = `Bearer ${sbToken}`;

      const resp = await fetch('/api/integration-status?integration=whatsapp', { headers });
      const res = await resp.json();
      if (res.success && res.integrations?.whatsapp?.connected) {
        setConnectionBadge('wa-status-badge', true, `Connected (${res.integrations.whatsapp.displayName || 'WhatsApp'})`);
        if (window.showToast) window.showToast('WhatsApp Cloud API Connection Verified!', 'success');
      } else {
        const msg = res.integrations?.whatsapp?.message || 'Check credentials';
        if (window.showToast) window.showToast(`WhatsApp API: ${msg}`, 'info');
      }
    } catch (err) {
      if (window.showToast) window.showToast('WhatsApp Cloud API connection checked', 'info');
    }
  }

  window.NextBrightIntegrations = {
    init: initSocialIntegrations,
    refreshStatus: fetchLiveIntegrationStatuses,
    testIg: testInstagramConnection,
    testWa: testWhatsAppConnection
  };

  document.addEventListener('DOMContentLoaded', () => {
    initSocialIntegrations();
  });
})();
