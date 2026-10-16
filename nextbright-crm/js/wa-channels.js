'use strict';

(function () {
  let initialized = false;

  function request(options) {
    if (window.NB_AUTH?.apiFetch) return window.NB_AUTH.apiFetch('/api/update-whatsapp-profile', options);
    const error = new Error('Sign in to manage the WhatsApp Business profile.');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
  async function callProfile(body) {
    const response = await request({ method: 'POST', body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Meta did not confirm the WhatsApp profile operation.');
    return payload;
  }
  function toast(message, type) { if (window.showToast) window.showToast(message, type); }
  function fill(profile) {
    const fields = { 'wa-prof-name': profile.name || '', 'wa-prof-about': profile.about || profile.description || '', 'wa-prof-address': profile.address || '', 'wa-prof-email': profile.email || '', 'wa-prof-website': Array.isArray(profile.websites) ? profile.websites[0] || '' : '' };
    Object.entries(fields).forEach(([id, value]) => { const input = document.getElementById(id); if (input) input.value = value; });
    const vertical = document.getElementById('wa-prof-vertical'); if (vertical && profile.vertical) vertical.value = profile.vertical;
  }
  async function sync() {
    try {
      toast('Fetching live WhatsApp Business profile from Meta…', 'info');
      const payload = await callProfile({ action: 'fetch_profile' });
      fill(payload.profile || {});
      const profile = payload.profile || {};
      const phone = document.getElementById('wa-channel-phone'); if (phone) phone.textContent = profile.phone_number || 'Connected (number not returned by Meta)';
      const tier = document.getElementById('wa-channel-tier'); if (tier) tier.textContent = profile.messaging_limit_tier || 'Not returned by Meta';
      const limit = document.getElementById('wa-channel-limit'); if (limit) limit.textContent = profile.messaging_limit_tier ? 'See Meta Manager' : 'Not returned by Meta';
      const quality = document.getElementById('wa-channel-quality'); if (quality) quality.textContent = profile.quality_rating ? `Quality: ${profile.quality_rating}` : 'Quality: Not returned by Meta';
      toast('WhatsApp profile refreshed from Meta.', 'success');
    } catch (error) { toast(error.message, 'error'); }
  }
  async function save(event) {
    event.preventDefault();
    const about = document.getElementById('wa-prof-about')?.value.trim();
    if (!about) return toast('About text is required for the supported profile update.', 'error');
    try {
      const payload = await callProfile({ action: 'update_about', about });
      toast(payload.message || 'Meta confirmed the About update.', 'success');
      await sync();
    } catch (error) { toast(error.message, 'error'); }
  }
  async function init() {
    if (initialized) return;
    initialized = true;
    const form = document.getElementById('form-wa-profile'); if (form) form.onsubmit = save;
    document.getElementById('btn-sync-wa-profile')?.addEventListener('click', sync);
    const token = await window.NB_AUTH?.getAccessToken?.().catch(() => null);
    if (token) sync();
  }
  window.NextBrightWAChannels = { init, sync };
})();
