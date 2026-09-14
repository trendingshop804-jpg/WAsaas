/* ==========================================================================
   NexusLead AI — Business Profile Settings Component
   Handles:
     - WhatsApp Business profile picture upload (via Edge Function)
     - WhatsApp Business About text sync (via Edge Function)
     - Error handling with user-friendly messages
     - Demo mode fallback when Supabase is not configured

   Backend wiring:
     POST /functions/v1/update-whatsapp-profile
     { action: "update_profile_picture", imageBase64: "...", fileName: "..." }
     { action: "update_about", about: "Available for demos 9AM-6PM" }
     { action: "fetch_profile" }
   ========================================================================== */

class SettingsBusinessProfileComponent {
  constructor() {
    this.currentOrg = null;
    this.selectedImageBase64 = null;
    this.selectedImageFile = null;
    this.init();
  }

  init() {
    this.bindBusinessProfileEvents();
    this.renderProfileSection();

    window.appState.on('orgChanged', () => this.renderProfileSection());
    window.appState.on('whatsappConnectionChanged', () => this.renderProfileSection());
  }

  renderProfileSection() {
    this.currentOrg = window.appState.getCurrentOrg();
    const waConnected = this.currentOrg?.whatsappConnected;

    const preview = document.getElementById('wa-profile-preview');
    const changeBtn = document.getElementById('wa-change-photo-btn');
    const aboutInput = document.getElementById('wa-about-input');
    const aboutSaveBtn = document.getElementById('wa-save-about-btn');
    const counter = document.getElementById('wa-about-counter');

    if (preview) {
      if (waConnected && this.currentOrg.profilePictureUrl) {
        preview.src = this.currentOrg.profilePictureUrl;
      } else if (waConnected) {
        preview.src = 'https://wa.me/profile-picture/placeholder';
      } else {
        preview.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIjBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZT1ub25lPjxjaXJjbGUgY3g9IjE1IiBjeT0iMTUiIHI9IjMiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIi8+PC9zdmc+';
      }
    }

    if (changeBtn) {
      changeBtn.disabled = !waConnected;
      changeBtn.title = waConnected ? 'Change your WhatsApp Business profile picture' : 'Connect WhatsApp Business to enable';
    }

    if (aboutInput) {
      aboutInput.disabled = !waConnected;
    }
    if (aboutSaveBtn) {
      aboutSaveBtn.disabled = !waConnected;
    }

    if (aboutInput && this.currentOrg?.about) {
      aboutInput.value = this.currentOrg.about;
      this.updateAboutCounter(aboutInput.value.length);
    }

    if (counter) {
      counter.style.color = this.currentOrg?.about?.length > 139 ? '#ef4444' : 'var(--text-muted)';
    }

    if (!waConnected) {
      this.showStatus('wa-profile-status', 'Connect WhatsApp Business to manage your profile picture and About text.', 'info');
    }
  }

  bindBusinessProfileEvents() {
    const input = document.getElementById('wa-profile-input');
    input?.addEventListener('change', (e) => this.handleFileSelect(e));

    document.getElementById('wa-change-photo-btn')?.addEventListener('click', () => {
      if (this.currentOrg?.whatsappConnected) {
        document.getElementById('wa-profile-input').click();
      }
    });

    document.getElementById('wa-upload-photo-btn')?.addEventListener('click', () => this.uploadProfilePicture());
    document.getElementById('wa-cancel-photo-btn')?.addEventListener('click', () => this.cancelProfilePicture());

    const aboutInput = document.getElementById('wa-about-input');
    if (aboutInput) {
      aboutInput.addEventListener('input', () => this.updateAboutCounter(aboutInput.value.length));
      aboutInput.addEventListener('input', () => {
        const counter = document.getElementById('wa-about-counter');
        if (counter) {
          counter.style.color = aboutInput.value.length > 139 ? '#ef4444' : 'var(--text-muted)';
        }
      });
    }

    document.getElementById('wa-save-about-btn')?.addEventListener('click', () => this.saveAbout());
  }

  handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    this.selectedImageFile = file;
    const validTypes = ['image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      this.showStatus('wa-profile-status', 'Invalid format. Only JPEG and PNG are accepted.', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.showStatus('wa-profile-status', 'File too large. Maximum size is 5MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      this.selectedImageBase64 = dataUrl;

      const preview = document.getElementById('wa-profile-preview');
      if (preview) preview.src = dataUrl;

      document.getElementById('wa-profile-filename').textContent = `${file.name} (${this.formatFileSize(file.size)})`;

      document.getElementById('wa-upload-photo-btn').style.display = 'inline-flex';
      document.getElementById('wa-cancel-photo-btn').style.display = 'inline-flex';
    };
    reader.readAsDataURL(file);
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  cancelProfilePicture() {
    this.selectedImageFile = null;
    this.selectedImageBase64 = null;
    const input = document.getElementById('wa-profile-input');
    if (input) input.value = '';

    document.getElementById('wa-upload-photo-btn').style.display = 'none';
    document.getElementById('wa-cancel-photo-btn').style.display = 'none';
    document.getElementById('wa-profile-filename').textContent = 'No file selected';

    this.renderProfileSection();
  }

  async uploadProfilePicture() {
    if (!this.selectedImageBase64) return;

    const uploadBtn = document.getElementById('wa-upload-photo-btn');
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.innerHTML = '<span class="spinner-xs"></span> Uploading…';
    }

    try {
      const result = await window.whatsappService?.updateProfilePicture(
        this.selectedImageBase64,
        this.selectedImageFile?.name || 'profile.jpg'
      ) || await this.callEdgeFunction({
        action: 'update_profile_picture',
        imageBase64: this.selectedImageBase64,
        fileName: this.selectedImageFile?.name || 'profile.jpg',
      });

      if (result.success) {
        this.showStatus('wa-profile-status', 'Profile picture updated successfully! Changes may take a few minutes to appear on WhatsApp.', 'success');

        const org = this.currentOrg;
        if (org && result.profile_picture_url) {
          org.profilePictureUrl = result.profile_picture_url;
        }

        window.appState.addAuditLog(
          'WhatsApp Profile Picture Updated',
          this.currentOrg.whatsappNumber || 'WhatsApp Business',
          `Profile picture updated. Media ID: ${result.media_id}`,
          'Success'
        );

        this.cancelProfilePicture();
      } else {
        this.showStatus('wa-profile-status', result.error || 'Failed to update profile picture.', 'error');
      }
    } catch (err) {
      this.showStatus('wa-profile-status', `Error: ${err.message}`, 'error');
    } finally {
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = 'Confirm Upload';
      }
    }
  }

  updateAboutCounter(count) {
    const counter = document.getElementById('wa-about-counter');
    if (counter) {
      counter.textContent = `${count}/139`;
      counter.style.color = count > 139 ? '#ef4444' : 'var(--text-muted)';
    }
  }

  async saveAbout() {
    const aboutInput = document.getElementById('wa-about-input');
    const saveBtn = document.getElementById('wa-save-about-btn');
    const about = aboutInput?.value.trim() || '';
    const statusEl = document.getElementById('wa-about-status');

    if (about.length > 139) {
      if (statusEl) {
        statusEl.style.color = '#ef4444';
        statusEl.textContent = `Text exceeds 139 characters (${about.length}/139).`;
      }
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner-xs"></span> Saving…';
    }

    try {
      const result = await window.whatsappService?.updateAbout(about) || await this.callEdgeFunction({
        action: 'update_about',
        about,
      });

      if (result.success) {
        if (statusEl) {
          statusEl.style.color = '#10b981';
          statusEl.textContent = 'About text saved to WhatsApp Business profile.';
        }

        const org = this.currentOrg;
        if (org) org.about = about;

        window.appState.addAuditLog(
          'WhatsApp About Text Updated',
          this.currentOrg.whatsappNumber || 'WhatsApp Business',
          `About text set to: "${about}"`,
          'Success'
        );
      } else {
        if (statusEl) {
          statusEl.style.color = '#ef4444';
          statusEl.textContent = result.error || 'Failed to save About text.';
        }
      }
    } catch (err) {
      if (statusEl) {
        statusEl.style.color = '#ef4444';
        statusEl.textContent = `Error: ${err.message}`;
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Save to WhatsApp';
      }
    }
  }

  async callEdgeFunction(body) {
    if (window.supabaseConfig?.isSupabaseConfigured()) {
      const fnUrl = window.supabaseConfig.getEdgeFunctionUrl('update-whatsapp-profile');
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: window.supabaseConfig.getAuthHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    }

    await new Promise(r => setTimeout(r, 800));

    if (body.action === 'update_profile_picture') {
      return {
        success: true,
        message: 'Profile picture updated (demo mode).',
        media_id: 'demo_media_' + Date.now(),
        profile_picture_url: URL.createObjectURL(this.selectedImageFile),
      };
    }

    if (body.action === 'update_about') {
      return {
        success: true,
        message: 'About text saved (demo mode).',
        about: body.about,
      };
    }

    return { success: false, error: 'Demo mode does not support this action.' };
  }

  showStatus(elementId, message, type = 'info') {
    const el = document.getElementById(elementId);
    if (!el) return;

    const icons = {
      success: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
      error: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    };

    el.innerHTML = `${icons[type] || icons.info} ${message}`;
    el.style.display = 'block';
    el.style.color = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : 'var(--text-muted)');

    setTimeout(() => { el.style.display = 'none'; }, type === 'error' ? 8000 : 6000);
  }
}

window.settingsBusinessProfileComponent = new SettingsBusinessProfileComponent();
