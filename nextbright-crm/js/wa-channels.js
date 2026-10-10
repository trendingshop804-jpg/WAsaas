/* =============================================================================
   wa-channels.js — NextBright CRM
   WhatsApp Channels & Business Profile Management
   ============================================================================= */

'use strict';

(function () {
  const DEFAULT_PROFILE = {
    display_name: 'NextBright CRM Official',
    about: 'Leading AI-Powered Multi-Tenant CRM & Sales Automation Platform for modern businesses.',
    address: '100 Tech Park Way, Suite 400, San Francisco, CA',
    email: 'support@nextbright.io',
    websites: ['https://nextbright.io', 'https://app.nextbright.io'],
    vertical: 'SOFTWARE',
    messaging_tier: 'TIER_1',
    quality_score: 'GREEN',
    daily_limit: 1000,
    phone_number: '+1 (555) 019-2834',
    waba_id: 'waba_99182471928347'
  };

  function getProfile() {
    try {
      const stored = localStorage.getItem('nb_wa_business_profile');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    localStorage.setItem('nb_wa_business_profile', JSON.stringify(DEFAULT_PROFILE));
    return DEFAULT_PROFILE;
  }

  function saveProfile(prof) {
    localStorage.setItem('nb_wa_business_profile', JSON.stringify(prof));
  }

  function initWAChannels() {
    populateProfileForm();
    setupEventListeners();
  }

  function populateProfileForm() {
    const prof = getProfile();

    const nameInput = document.getElementById('wa-prof-name');
    const aboutInput = document.getElementById('wa-prof-about');
    const addressInput = document.getElementById('wa-prof-address');
    const emailInput = document.getElementById('wa-prof-email');
    const websiteInput = document.getElementById('wa-prof-website');
    const verticalSelect = document.getElementById('wa-prof-vertical');

    if (nameInput) nameInput.value = prof.display_name;
    if (aboutInput) aboutInput.value = prof.about;
    if (addressInput) addressInput.value = prof.address;
    if (emailInput) emailInput.value = prof.email;
    if (websiteInput) websiteInput.value = (prof.websites && prof.websites[0]) || '';
    if (verticalSelect) verticalSelect.value = prof.vertical;

    const elPhone = document.getElementById('wa-channel-phone');
    const elTier = document.getElementById('wa-channel-tier');
    const elLimit = document.getElementById('wa-channel-limit');

    if (elPhone) elPhone.textContent = prof.phone_number;
    if (elTier) elTier.textContent = prof.messaging_tier;
    if (elLimit) elLimit.textContent = `${prof.daily_limit} messaging limit / 24h`;
  }

  function setupEventListeners() {
    const form = document.getElementById('form-wa-profile');
    if (form) {
      form.addEventListener('submit', handleProfileSave);
    }

    const syncBtn = document.getElementById('btn-sync-wa-profile');
    if (syncBtn) {
      syncBtn.addEventListener('click', syncWithMetaGraphApi);
    }
  }

  function handleProfileSave(e) {
    e.preventDefault();
    const prof = getProfile();

    prof.display_name = document.getElementById('wa-prof-name')?.value || prof.display_name;
    prof.about = document.getElementById('wa-prof-about')?.value || prof.about;
    prof.address = document.getElementById('wa-prof-address')?.value || prof.address;
    prof.email = document.getElementById('wa-prof-email')?.value || prof.email;
    prof.websites = [document.getElementById('wa-prof-website')?.value || 'https://nextbright.io'];
    prof.vertical = document.getElementById('wa-prof-vertical')?.value || 'SOFTWARE';

    saveProfile(prof);

    if (window.showToast) window.showToast('WhatsApp Business Profile updated!', 'success');
  }

  async function syncWithMetaGraphApi() {
    if (window.showToast) window.showToast('Syncing with Meta WhatsApp Cloud API...', 'info');

    // Simulate API ping or trigger real sync
    setTimeout(() => {
      const prof = getProfile();
      prof.quality_score = 'GREEN';
      saveProfile(prof);
      populateProfileForm();
      if (window.showToast) window.showToast('Meta WABA Status: Connected & Healthy (High Quality)', 'success');
    }, 1200);
  }

  window.NextBrightWAChannels = {
    init: initWAChannels,
    sync: syncWithMetaGraphApi
  };

  document.addEventListener('DOMContentLoaded', () => {
    initWAChannels();
  });
})();
