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
      if (!window.NB_AUTH?.apiFetch) throw new Error('Sign in to check integrations.');
      const res = await window.NB_AUTH.apiFetch('/api/integration-status', { cache: 'no-store' });
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
      console.warn('[SocialIntegrations] Live status fetch failed:', err.message);
    }
  }

  function loadSavedCredentials() {
    ['nb_instagram_conn', 'nb_ig_connection', 'nb_whatsapp_conn', 'nb_wa_connection'].forEach(key => localStorage.removeItem(key));

    const webhookUrlInput = document.getElementById('meta-webhook-callback-url');
    if (webhookUrlInput) webhookUrlInput.value = `${window.location.origin}/api/meta-webhook`;
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
    const testIgBtn = document.getElementById('ig-test-btn') || document.getElementById('btn-test-ig-conn');
    if (testIgBtn) {
      testIgBtn.addEventListener('click', testInstagramConnection);
    }

    // Test WhatsApp Connection
    const testWaBtn = document.getElementById('wa-test-btn') || document.getElementById('btn-test-wa-conn');
    if (testWaBtn) {
      testWaBtn.addEventListener('click', testWhatsAppConnection);
    }

    // Configure Buttons (Open Modal)
    const connectWaBtn = document.getElementById('wa-connect-btn');
    if (connectWaBtn) {
      connectWaBtn.addEventListener('click', () => {
        if (typeof window.openIntegrationEditor === 'function') {
          window.openIntegrationEditor('whatsapp');
        }
      });
    }

    const connectIgBtn = document.getElementById('ig-connect-btn');
    if (connectIgBtn) {
      connectIgBtn.addEventListener('click', () => {
        if (typeof window.openIntegrationEditor === 'function') {
          window.openIntegrationEditor('instagram');
        }
      });
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
    const tokenInput = document.getElementById('ig-access-token');
    const token = tokenInput?.value.trim() || '';
    const accountId = document.getElementById('ig-account-id')?.value.trim() || '';

    if (!accountId) {
      if (window.showToast) window.showToast('Instagram Business Account ID is required.', 'error');
      return;
    }

    try {
      if (!window.NB_AUTH?.apiFetch) throw new Error('Sign in to save Instagram credentials.');
      const res = await window.NB_AUTH.apiFetch('/api/integration-status', {
        method: 'POST',
        body: JSON.stringify({ integration: 'instagram', accessToken: token, instagramBusinessId: accountId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.status?.connected) throw new Error(data.error || data.status?.message || 'Instagram credentials were not verified.');
      if (tokenInput) {
        tokenInput.value = '';
        tokenInput.placeholder = 'Saved securely — leave blank to keep';
      }
      setConnectionBadge('ig-status-badge', true, `Connected (@${data.status.displayName || 'Instagram'})`);
      if (window.showToast) window.showToast('Instagram credentials verified and saved securely.', 'success');
    } catch (error) {
      setConnectionBadge('ig-status-badge', false, 'Not Connected');
      if (window.showToast) window.showToast(error.message, 'error');
    }
  }

  async function handleSaveWhatsApp(e) {
    e.preventDefault();
    const tokenInput = document.getElementById('wa-access-token');
    const token = tokenInput?.value.trim() || '';
    const phoneId = document.getElementById('wa-phone-number-id')?.value.trim() || '';
    const wabaId = document.getElementById('wa-waba-id')?.value.trim() || '';

    if (!phoneId) {
      if (window.showToast) window.showToast('WhatsApp Phone Number ID is required.', 'error');
      return;
    }

    try {
      if (!window.NB_AUTH?.apiFetch) throw new Error('Sign in to save WhatsApp credentials.');
      const res = await window.NB_AUTH.apiFetch('/api/integration-status', {
        method: 'POST',
        body: JSON.stringify({ integration: 'whatsapp', accessToken: token, phoneNumberId: phoneId, wabaId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.status?.connected) throw new Error(data.error || data.status?.message || 'WhatsApp credentials were not verified.');
      if (tokenInput) {
        tokenInput.value = '';
        tokenInput.placeholder = 'Saved securely — leave blank to keep';
      }
      setConnectionBadge('wa-status-badge', true, `Connected (${data.status.displayName || 'WhatsApp Cloud API'})`);
      if (window.showToast) window.showToast('WhatsApp credentials verified and saved securely.', 'success');
    } catch (error) {
      setConnectionBadge('wa-status-badge', false, 'Not Connected');
      if (window.showToast) window.showToast(error.message, 'error');
    }
  }

  async function testInstagramConnection() {
    if (window.showToast) window.showToast('Testing Instagram Graph API connection...', 'info');
    try {
      if (typeof window.testIntegrationConnection !== 'function') throw new Error('Integration tester is unavailable.');
      const result = await window.testIntegrationConnection('instagram');
      if (result?.success) setConnectionBadge('ig-status-badge', true, `Connected (@${result.data?.displayName || 'Instagram'})`);
      else setConnectionBadge('ig-status-badge', false, 'Not Connected');
    } catch (error) {
      setConnectionBadge('ig-status-badge', false, 'Not Connected');
      if (window.showToast) window.showToast(`Instagram connection failed: ${error.message}`, 'error');
    }
  }

  async function testWhatsAppConnection() {
    const btn = document.getElementById('wa-test-btn') || document.getElementById('btn-test-wa-conn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.innerHTML = '<i data-feather="loader"></i> Testing connection...';
      if (typeof feather !== 'undefined') feather.replace();
    }

    try {
      if (typeof window.testIntegrationConnection !== 'function') throw new Error('Integration tester is unavailable.');
      const result = await window.testIntegrationConnection('whatsapp');
      if (result?.success) setConnectionBadge('wa-status-badge', true, 'Connected (' + (result.data?.verifiedName || 'WhatsApp') + ')');
      else setConnectionBadge('wa-status-badge', false, 'Not Connected');
    } catch (err) {
      if (window.showToast) window.showToast(`WhatsApp connection failed: ${err.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText || '<i data-feather="zap"></i> Test';
        if (typeof feather !== 'undefined') feather.replace();
      }
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
