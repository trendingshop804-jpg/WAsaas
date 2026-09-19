/* ==========================================================================
   NexusLead AI / WAsaas — Instagram Hub & Automation Manager Component
   Handles:
     1. Instagram Professional Account Connection Status & Business Warning Notice
     2. Auto-Reply to Comments (Keyword Triggered, Public Reply)
     3. Auto-DM (Comment-to-DM Private Reply with Paced Queue)
     4. Post / Reel / Story Scheduler with Supabase Media Upload & Preview
     5. Complete event delegation for robust subtab, modal, and CRUD actions
   ========================================================================== */

class InstagramManagerComponent {
  constructor() {
    this.currentSubTab = 'overview'; // 'overview' | 'reply-rules' | 'dm-rules' | 'scheduler'
    this.filterScheduledStatus = 'all';
    this.uploadedMediaUrl = null;
    this.eventsBound = false;
  }

  init() {
    if (!this.eventsBound) {
      this.bindEvents();
      this.eventsBound = true;
    }
    this.render();

    // Listen to reactive state changes
    window.appState?.on?.('instagramConnectionChanged', () => this.render());
    window.appState?.on?.('orgChanged', () => this.render());
  }

  bindEvents() {
    // 1. Sub-tab switching event delegation
    document.addEventListener('click', (e) => {
      const subtabBtn = e.target.closest('.ig-subtab-btn');
      if (subtabBtn) {
        e.preventDefault();
        const tab = subtabBtn.getAttribute('data-ig-tab');
        if (tab) this.switchSubTab(tab);
      }
    });

    // 2. Connect Instagram Trigger
    document.addEventListener('click', (e) => {
      if (e.target.closest('#ig-btn-connect-meta')) {
        e.preventDefault();
        if (window.settingsIntegrationsComponent) {
          if (window.navigationComponent) {
            window.navigationComponent.switchView('settings');
          }
          setTimeout(() => {
            window.settingsIntegrationsComponent._handleInstagramEmbeddedSignup();
          }, 300);
        } else {
          alert('Instagram Meta OAuth authorization starting...');
        }
      }
    });

    // 3. Disconnect Instagram Trigger
    document.addEventListener('click', (e) => {
      if (e.target.closest('#ig-btn-disconnect')) {
        e.preventDefault();
        if (confirm('Disconnect Instagram account from this workspace? All comment auto-replies and scheduled posts will be paused.')) {
          const org = window.appState.getCurrentOrg();
          if (org.id) {
            fetch('/api/instagram?action=disconnect', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                organizationId: org.id,
                instagramBusinessId: org.instagramBusinessId
              })
            }).catch(err => console.warn('[IG Disconnect] API call notice:', err.message));
          }

          org.instagramConnected = false;
          org.instagramUsername = null;
          org.instagramBusinessId = null;
          org.instagramPageId = null;
          window.appState.saveState();
          window.appState.emit('instagramConnectionChanged', { status: 'DISCONNECTED' });
          window.appState.addAuditLog('Instagram Disconnected', 'Instagram Account', 'Instagram account disconnected by admin.', 'Success');
          this.render();
        }
      }
    });

    // 4. Modal Opener Triggers
    document.addEventListener('click', (e) => {
      if (e.target.closest('#ig-btn-new-reply-rule')) {
        e.preventDefault();
        this.openRuleModal('reply');
      }
      if (e.target.closest('#ig-btn-new-dm-rule')) {
        e.preventDefault();
        this.openRuleModal('dm');
      }
      if (e.target.closest('#ig-btn-schedule-post-modal')) {
        e.preventDefault();
        this.openScheduleModal();
      }
    });

    // 5. Modal Close & Cancel Triggers
    document.addEventListener('click', (e) => {
      const closeTrigger = e.target.closest('[data-close-modal], .modal-close-btn, .btn-cancel, [data-modal-close]');
      if (closeTrigger) {
        const modal = closeTrigger.closest('#ig-reply-rule-modal, #ig-dm-rule-modal, #ig-schedule-post-modal, .modal-backdrop, .modal');
        if (modal) {
          modal.classList.remove('active');
          modal.style.display = 'none';
        }
      }
      if (e.target.classList.contains('modal-backdrop') || (e.target.classList.contains('modal') && (e.target.id?.startsWith('ig-')))) {
        e.target.classList.remove('active');
        e.target.style.display = 'none';
      }
    });

    // 6. Schedule Filter Tabs
    document.addEventListener('click', (e) => {
      const filterBtn = e.target.closest('.ig-schedule-filter-btn');
      if (filterBtn) {
        document.querySelectorAll('.ig-schedule-filter-btn').forEach(b => b.classList.remove('active'));
        filterBtn.classList.add('active');
        this.filterScheduledStatus = filterBtn.getAttribute('data-status') || 'all';
        this.renderScheduledPostsList();
      }
    });

    // 7. Modal Form Submit Handlers
    document.addEventListener('submit', (e) => {
      if (e.target.id === 'ig-reply-rule-form') {
        this.handleSaveReplyRule(e);
      } else if (e.target.id === 'ig-dm-rule-form') {
        this.handleSaveDmRule(e);
      } else if (e.target.id === 'ig-schedule-post-form') {
        this.handleSaveScheduledPost(e);
      }
    });

    // 8. Media File Upload Handler
    document.addEventListener('change', (e) => {
      if (e.target.id === 'ig-media-file-input') {
        this.handleMediaUpload(e);
      }
    });
  }

  switchSubTab(tabName) {
    this.currentSubTab = tabName;
    document.querySelectorAll('.ig-subtab-btn').forEach(btn => {
      const isTarget = btn.getAttribute('data-ig-tab') === tabName;
      btn.classList.toggle('active', isTarget);
    });

    document.querySelectorAll('.ig-subtab-panel').forEach(panel => {
      const isTarget = panel.id === `ig-tab-${tabName}`;
      panel.classList.toggle('active', isTarget);
      panel.style.display = isTarget ? 'block' : 'none';
    });

    this.render();
  }

  render() {
    this.renderConnectionCard();
    this.renderReplyRulesList();
    this.renderDmRulesList();
    this.renderScheduledPostsList();
  }

  /* -------------------------------------------------------------------------
     1. Connection Overview & Meta Account Notice
     ------------------------------------------------------------------------- */
  renderConnectionCard() {
    const org = window.appState.getCurrentOrg();
    const isConnected = Boolean(org.instagramConnected && org.instagramUsername);
    const cardEl = document.getElementById('ig-connection-banner');
    if (!cardEl) return;

    if (isConnected) {
      cardEl.innerHTML = `
        <div class="card" style="border-color: rgba(225, 48, 108, 0.4); background: linear-gradient(135deg, rgba(225, 48, 108, 0.08) 0%, rgba(131, 58, 180, 0.08) 100%);">
          <div class="flex items-center justify-between" style="flex-wrap: wrap; gap: 16px;">
            <div class="flex items-center gap-3">
              <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); display: flex; align-items: center; justify-content: center; color: white;">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span style="font-size: 16px; font-weight: 700; color: var(--text-primary);">@${org.instagramUsername}</span>
                  <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 11px;">● Connected & Verified</span>
                </div>
                <div style="font-size: 12.5px; color: var(--text-secondary); margin-top: 2px;">
                  Instagram Professional Account ID: <code class="font-mono" style="color: #f472b6;">${org.instagramBusinessId || 'Active'}</code> · Page ID: <code class="font-mono">${org.instagramPageId || 'Linked'}</code>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button id="ig-btn-connect-meta" type="button" class="btn btn-secondary btn-sm">
                Switch Account
              </button>
              <button id="ig-btn-disconnect" type="button" class="btn btn-outline btn-sm" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.4);">
                Disconnect
              </button>
            </div>
          </div>
        </div>
      `;
    } else {
      cardEl.innerHTML = `
        <div class="card" style="border-color: var(--border-medium); background: var(--bg-card);">
          <div class="flex items-center justify-between" style="flex-wrap: wrap; gap: 16px;">
            <div class="flex items-center gap-3">
              <div style="width: 48px; height: 48px; border-radius: 12px; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; color: var(--text-muted);">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
              </div>
              <div>
                <div style="font-size: 15px; font-weight: 700; color: var(--text-primary);">No Instagram Account Connected</div>
                <div style="font-size: 12.5px; color: var(--text-muted);">
                  Connect your Instagram Business or Creator account to enable comment auto-replies, automated DMs, and post scheduling.
                </div>
              </div>
            </div>

            <button id="ig-btn-connect-meta" type="button" class="btn btn-primary btn-sm" style="background: linear-gradient(45deg, #f09433, #dc2743, #bc1888); border: none;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Connect Instagram
            </button>
          </div>

          <!-- Business Account Requirement Notice -->
          <div style="margin-top: 14px; padding: 10px 14px; background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b; border-radius: 4px; font-size: 12px; color: #fbbf24;">
            <strong>⚠️ Meta Platform Constraint:</strong> Instagram Graph API requires an <strong>Instagram Business or Creator account</strong> linked to a Facebook Page. Personal profiles cannot use automated replies or scheduling. To switch: Open Instagram App → Settings → Account Type → Switch to Professional Account.
          </div>
        </div>
      `;
    }
  }

  /* -------------------------------------------------------------------------
     2. Auto-Reply Rules Table (Public Comment Responses)
     ------------------------------------------------------------------------- */
  renderReplyRulesList() {
    const tbody = document.getElementById('ig-reply-rules-tbody');
    if (!tbody) return;

    const rules = window.appState.get('instagramReplyRules') || [];

    if (rules.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">
            No public comment reply rules configured yet. Click "+ New Reply Rule" to automate keyword responses.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rules.map(rule => `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text-primary); font-size: 13.5px;">${rule.name}</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">${rule.media_id ? `Scoped to Post #${rule.media_id}` : 'Applies to all posts'}</div>
        </td>
        <td>
          <div class="flex flex-wrap gap-1">
            ${String(rule.trigger_keyword || '').split(',').map(kw => `<span class="badge" style="background: rgba(139, 92, 246, 0.15); color: #c4b5fd; font-size: 11px;">${kw.trim()}</span>`).join('')}
          </div>
        </td>
        <td style="max-width: 280px;">
          <div style="font-size: 12.5px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${rule.reply_message}">
            💬 ${rule.reply_message}
          </div>
        </td>
        <td>
          <span class="badge font-mono" style="background: rgba(16, 185, 129, 0.1); color: #34d399;">${rule.reply_count || 0} replies</span>
        </td>
        <td>
          <label class="toggle-switch" style="transform: scale(0.8); transform-origin: left center;">
            <input type="checkbox" ${rule.is_active ? 'checked' : ''} onchange="window.instagramManagerComponent.toggleRuleActive('reply', '${rule.id}', this.checked)">
            <span class="slider"></span>
          </label>
        </td>
        <td>
          <button type="button" class="btn btn-secondary btn-icon btn-sm" onclick="window.instagramManagerComponent.deleteRule('reply', '${rule.id}')" title="Delete rule" style="color: #ef4444;">
            🗑️
          </button>
        </td>
      </tr>
    `).join('');
  }

  /* -------------------------------------------------------------------------
     3. Auto-DM Rules Table (Comment-to-DM Private Reply)
     ------------------------------------------------------------------------- */
  renderDmRulesList() {
    const tbody = document.getElementById('ig-dm-rules-tbody');
    if (!tbody) return;

    const rules = window.appState.get('instagramDmRules') || [];

    if (rules.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">
            No comment-to-DM rules configured yet. Click "+ New Auto-DM Rule" to create private reply automations.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rules.map(rule => `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text-primary); font-size: 13.5px;">${rule.name}</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">${rule.media_id ? `Scoped to Post #${rule.media_id}` : 'Global Comment-to-DM'}</div>
        </td>
        <td>
          <div class="flex flex-wrap gap-1">
            ${String(rule.trigger_keyword || '').split(',').map(kw => `<span class="badge" style="background: rgba(236, 72, 153, 0.15); color: #f472b6; font-size: 11px;">${kw.trim()}</span>`).join('')}
          </div>
        </td>
        <td style="max-width: 280px;">
          <div style="font-size: 12.5px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${rule.dm_message}">
            ✉️ ${rule.dm_message}
          </div>
        </td>
        <td>
          <span class="badge font-mono" style="background: rgba(59, 130, 246, 0.1); color: #60a5fa;">${rule.dm_count || 0} DMs sent</span>
        </td>
        <td>
          <label class="toggle-switch" style="transform: scale(0.8); transform-origin: left center;">
            <input type="checkbox" ${rule.is_active ? 'checked' : ''} onchange="window.instagramManagerComponent.toggleRuleActive('dm', '${rule.id}', this.checked)">
            <span class="slider"></span>
          </label>
        </td>
        <td>
          <button type="button" class="btn btn-secondary btn-icon btn-sm" onclick="window.instagramManagerComponent.deleteRule('dm', '${rule.id}')" title="Delete rule" style="color: #ef4444;">
            🗑️
          </button>
        </td>
      </tr>
    `).join('');
  }

  /* -------------------------------------------------------------------------
     4. Post / Reel / Story Scheduler List & Calendar View
     ------------------------------------------------------------------------- */
  renderScheduledPostsList() {
    const grid = document.getElementById('ig-scheduled-posts-grid');
    if (!grid) return;

    let posts = window.appState.get('instagramScheduledPosts') || [];
    if (this.filterScheduledStatus !== 'all') {
      posts = posts.filter(p => p.status === this.filterScheduledStatus);
    }

    if (posts.length === 0) {
      grid.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 12px; display: block;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <h4>No scheduled posts matching filter "${this.filterScheduledStatus}"</h4>
          <p style="font-size: 13px; margin-top: 4px;">Click "+ Schedule Post" to compose feed posts, Reels, or Stories.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = posts.map(post => {
      const typeBadgeClass = {
        post: 'badge-primary',
        reel: 'badge-hot',
        story: 'badge-warm',
        carousel: 'badge-whatsapp'
      }[post.post_type] || 'badge-primary';

      const statusBadge = {
        pending: '<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24;">⏳ Pending</span>',
        processing: '<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa;">⚡ Processing</span>',
        published: '<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399;">✓ Published</span>',
        failed: '<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171;">✕ Failed</span>',
      }[post.status] || `<span class="badge">${post.status}</span>`;

      const mediaUrl = Array.isArray(post.media_urls) ? post.media_urls[0] : post.media_urls;
      const isVideo = mediaUrl && (mediaUrl.endsWith('.mp4') || post.post_type === 'reel');
      const dateFormatted = new Date(post.scheduled_time || Date.now()).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      return `
        <div class="card" style="display: flex; flex-direction: column; overflow: hidden; padding: 0;">
          <div style="position: relative; height: 180px; background: #0f172a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
            ${mediaUrl ? (isVideo ? `
              <video src="${mediaUrl}" style="width: 100%; height: 100%; object-fit: cover;" muted></video>
              <span style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">▶ Video</span>
            ` : `
              <img src="${mediaUrl}" alt="Post media" style="width: 100%; height: 100%; object-fit: cover;">
            `) : `
              <span style="color: var(--text-muted); font-size: 12px;">No Preview</span>
            `}
            <span style="position: absolute; top: 10px; left: 10px;" class="badge ${typeBadgeClass}">
              ${post.post_type ? post.post_type.toUpperCase() : 'POST'}
            </span>
            <span style="position: absolute; top: 10px; right: 10px;">
              ${statusBadge}
            </span>
          </div>

          <div style="padding: 16px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">
                📅 Scheduled: <strong style="color: var(--text-primary);">${dateFormatted}</strong>
              </div>
              <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.4; max-height: 56px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; margin-bottom: 10px;">
                ${post.caption || '<em>No caption</em>'}
              </p>
            </div>

            <div class="flex items-center justify-between" style="border-top: 1px solid var(--border-subtle); padding-top: 10px; margin-top: 8px;">
              <span style="font-size: 11px; color: var(--text-muted);">
                ${post.ig_post_id ? `ID: ${post.ig_post_id.slice(0, 10)}...` : (post.error_message ? `<span style="color: #ef4444;" title="${post.error_message}">⚠️ ${post.error_message.slice(0, 20)}...</span>` : 'Ready to publish')}
              </span>
              <button type="button" class="btn btn-secondary btn-icon btn-sm" onclick="window.instagramManagerComponent.deleteScheduledPost('${post.id}')" title="Delete post" style="color: #ef4444;">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* -------------------------------------------------------------------------
     Modal & CRUD Actions
     ------------------------------------------------------------------------- */
  openRuleModal(type) {
    const modalId = type === 'reply' ? 'ig-reply-rule-modal' : 'ig-dm-rule-modal';
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
    }
  }

  openScheduleModal() {
    this.uploadedMediaUrl = null;
    const previewEl = document.getElementById('ig-composer-media-preview');
    if (previewEl) previewEl.style.display = 'none';

    const timeInput = document.getElementById('ig-schedule-datetime');
    if (timeInput) {
      const now = new Date(Date.now() + 3600000);
      const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      timeInput.value = localIso;
    }

    const modal = document.getElementById('ig-schedule-post-modal');
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
    }
  }

  async handleMediaUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const statusEl = document.getElementById('ig-upload-status');
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = '<span class="spinner-xs"></span> Uploading media...';
    }

    const setPreviewAndStatus = (url) => {
      this.uploadedMediaUrl = url;
      if (statusEl) {
        statusEl.innerHTML = '✓ Media ready for publishing!';
        statusEl.style.color = '#10b981';
      }
      const previewEl = document.getElementById('ig-composer-media-preview');
      const previewImg = document.getElementById('ig-composer-preview-img');
      if (previewEl && previewImg) {
        previewEl.style.display = 'block';
        previewImg.src = url;
      }
    };

    try {
      if (window.supabaseConfig?.isSupabaseConfigured() && window.supabase) {
        const filePath = `post_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { data, error } = await window.supabase.storage
          .from('instagram-media-public')
          .upload(filePath, file, { upsert: true });

        if (error) throw error;
        const { data: publicUrlData } = window.supabase.storage
          .from('instagram-media-public')
          .getPublicUrl(filePath);

        setPreviewAndStatus(publicUrlData.publicUrl);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => setPreviewAndStatus(e.target.result);
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.warn('[Instagram Media Upload Supabase Notice]:', err.message);
      const reader = new FileReader();
      reader.onload = (e) => setPreviewAndStatus(e.target.result);
      reader.readAsDataURL(file);
    }
  }

  async handleSaveReplyRule(e) {
    e.preventDefault();
    const name = document.getElementById('ig-reply-rule-name')?.value.trim();
    const keywords = document.getElementById('ig-reply-rule-keywords')?.value.trim();
    const message = document.getElementById('ig-reply-rule-message')?.value.trim();
    const mediaId = document.getElementById('ig-reply-rule-media-id')?.value.trim() || null;

    if (!keywords || !message) {
      alert('Please provide trigger keywords and a reply message.');
      return;
    }

    const org = window.appState.getCurrentOrg();
    const newRule = {
      id: 'ig_rule_' + Date.now(),
      organization_id: org.id,
      name: name || 'Comment Auto-Reply',
      trigger_keyword: keywords,
      reply_message: message,
      media_id: mediaId,
      match_type: 'contains',
      is_active: true,
      reply_count: 0
    };

    const rules = window.appState.get('instagramReplyRules') || [];
    window.appState.set('instagramReplyRules', [newRule, ...rules]);
    window.appState.addAuditLog('Instagram Rule Created', newRule.name, `Added comment auto-reply for keywords: ${keywords}`, 'Success');

    // Persist to DB asynchronously
    fetch('/api/instagram?action=save_rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruleType: 'reply', rule: newRule })
    }).catch(err => console.warn('[Save Reply Rule DB Error]:', err.message));

    const modal = document.getElementById('ig-reply-rule-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    document.getElementById('ig-reply-rule-form')?.reset();
    this.renderReplyRulesList();
  }

  async handleSaveDmRule(e) {
    e.preventDefault();
    const name = document.getElementById('ig-dm-rule-name')?.value.trim();
    const keywords = document.getElementById('ig-dm-rule-keywords')?.value.trim();
    const message = document.getElementById('ig-dm-rule-message')?.value.trim();
    const mediaId = document.getElementById('ig-dm-rule-media-id')?.value.trim() || null;

    if (!keywords || !message) {
      alert('Please provide trigger keywords and a DM message.');
      return;
    }

    const org = window.appState.getCurrentOrg();
    const newRule = {
      id: 'ig_dm_' + Date.now(),
      organization_id: org.id,
      name: name || 'Comment-to-DM Trigger',
      trigger_keyword: keywords,
      dm_message: message,
      media_id: mediaId,
      match_type: 'contains',
      is_active: true,
      dm_count: 0
    };

    const rules = window.appState.get('instagramDmRules') || [];
    window.appState.set('instagramDmRules', [newRule, ...rules]);
    window.appState.addAuditLog('Instagram Auto-DM Created', newRule.name, `Added Comment-to-DM private reply for keywords: ${keywords}`, 'Success');

    // Persist to DB asynchronously
    fetch('/api/instagram?action=save_rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruleType: 'dm', rule: newRule })
    }).catch(err => console.warn('[Save DM Rule DB Error]:', err.message));

    const modal = document.getElementById('ig-dm-rule-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    document.getElementById('ig-dm-rule-form')?.reset();
    this.renderDmRulesList();
  }

  async handleSaveScheduledPost(e) {
    e.preventDefault();
    const postType = document.getElementById('ig-composer-post-type')?.value || 'post';
    const caption = document.getElementById('ig-composer-caption')?.value.trim() || '';
    const scheduledTime = document.getElementById('ig-schedule-datetime')?.value;
    const directUrl = document.getElementById('ig-composer-direct-url')?.value.trim();

    const finalMediaUrl = this.uploadedMediaUrl || directUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80';

    if (!scheduledTime) {
      alert('Please select a date and time for publishing.');
      return;
    }

    const org = window.appState.getCurrentOrg();
    const newPost = {
      id: 'sched_post_' + Date.now(),
      organization_id: org.id,
      media_urls: [finalMediaUrl],
      caption: caption,
      post_type: postType,
      scheduled_time: new Date(scheduledTime).toISOString(),
      status: 'pending',
      created_at: new Date().toISOString()
    };

    const posts = window.appState.get('instagramScheduledPosts') || [];
    window.appState.set('instagramScheduledPosts', [newPost, ...posts]);
    window.appState.addAuditLog('Instagram Post Scheduled', `${postType.toUpperCase()} scheduled`, `Scheduled for ${new Date(scheduledTime).toLocaleString()}`, 'Success');

    // Persist to DB asynchronously
    fetch('/api/instagram?action=save_post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post: newPost })
    }).catch(err => console.warn('[Save Post DB Error]:', err.message));

    const modal = document.getElementById('ig-schedule-post-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    document.getElementById('ig-schedule-post-form')?.reset();
    this.renderScheduledPostsList();
  }

  toggleRuleActive(type, ruleId, isActive) {
    const key = type === 'reply' ? 'instagramReplyRules' : 'instagramDmRules';
    const rules = window.appState.get(key) || [];
    const rule = rules.find(r => r.id === ruleId);
    if (rule) {
      rule.is_active = isActive;
      window.appState.set(key, [...rules]);

      fetch('/api/instagram?action=toggle_rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleType: type, ruleId, isActive })
      }).catch(err => console.warn('[Toggle Rule DB Error]:', err.message));
    }
  }

  deleteRule(type, ruleId) {
    if (!confirm('Delete this rule?')) return;
    const key = type === 'reply' ? 'instagramReplyRules' : 'instagramDmRules';
    const rules = window.appState.get(key) || [];
    window.appState.set(key, rules.filter(r => r.id !== ruleId));

    fetch('/api/instagram?action=delete_rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruleType: type, ruleId })
    }).catch(err => console.warn('[Delete Rule DB Error]:', err.message));

    if (type === 'reply') this.renderReplyRulesList();
    else this.renderDmRulesList();
  }

  deleteScheduledPost(postId) {
    if (!confirm('Cancel this scheduled post?')) return;
    const posts = window.appState.get('instagramScheduledPosts') || [];
    window.appState.set('instagramScheduledPosts', posts.filter(p => p.id !== postId));

    fetch('/api/instagram?action=delete_post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId })
    }).catch(err => console.warn('[Delete Post DB Error]:', err.message));

    this.renderScheduledPostsList();
  }
}

window.instagramManagerComponent = new InstagramManagerComponent();
