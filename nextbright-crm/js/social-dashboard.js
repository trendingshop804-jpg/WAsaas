/* =============================================================================
   social-dashboard.js — NextBright CRM
   Unified Social & Messaging Dashboard
   Reads from Supabase (social_accounts, scheduled_posts, wa_campaigns,
   social_conversations) when credentials are available.
   Falls back to real local data where no connection is configured.
   ============================================================================= */
'use strict';

(function () {

  /* ---- Helpers ---- */
  function esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(n) { return Number(n || 0).toLocaleString('en-IN'); }
  function toast(msg, type) { if (typeof window.showToast === 'function') window.showToast(msg, type); }

  /* ---- Connection state (read from localStorage set by social-integrations.js) ---- */
  function getIgConnection() {
    try { return JSON.parse(localStorage.getItem('nb_ig_connection') || 'null'); } catch { return null; }
  }
  function getWaConnection() {
    try { return JSON.parse(localStorage.getItem('nb_wa_connection') || 'null'); } catch { return null; }
  }

  /* ---- Load campaign stats from localStorage (set by wa-campaigns.js) ---- */
  function getCampaignStats() {
    const camps = JSON.parse(localStorage.getItem('nb_wa_campaigns') || '[]');
    return {
      total: camps.length,
      active: camps.filter(c => c.status === 'running').length,
      totalSent: camps.reduce((s, c) => s + (c.sent_count || 0), 0),
      totalDelivered: camps.reduce((s, c) => s + (c.delivered_count || 0), 0),
      totalRead: camps.reduce((s, c) => s + (c.read_count || 0), 0),
      totalFailed: camps.reduce((s, c) => s + (c.failed_count || 0), 0),
    };
  }

  /* ---- Load scheduled posts from localStorage (set by instagram-posts.js) ---- */
  function getScheduledPosts() {
    const posts = JSON.parse(localStorage.getItem('nb_scheduled_posts') || '[]');
    const now = new Date();
    return {
      total: posts.length,
      scheduled: posts.filter(p => p.status === 'scheduled').length,
      published: posts.filter(p => p.status === 'published').length,
      failed: posts.filter(p => p.status === 'failed').length,
      upcoming: posts
        .filter(p => p.status === 'scheduled' && p.scheduled_at && new Date(p.scheduled_at) > now)
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
        .slice(0, 5),
    };
  }

  /* ---- Load Instagram conversations from localStorage ---- */
  function getSocialConvStats() {
    const convs = JSON.parse(localStorage.getItem('nb_social_conversations') || '[]');
    return {
      total: convs.length,
      unread: convs.reduce((s, c) => s + (c.unread_count || 0), 0),
      open: convs.filter(c => c.status === 'open').length,
    };
  }

  /* ---- Render dashboard ---- */
  function render() {
    const container = document.getElementById('social-dashboard-content');
    if (!container) return;

    const ig = getIgConnection();
    const wa = getWaConnection();
    const campStats = getCampaignStats();
    const postStats = getScheduledPosts();
    const convStats = getSocialConvStats();

    container.innerHTML = `
      <!-- Connection Status Row -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-bottom:20px;">

        <!-- Instagram Account Card -->
        <div class="social-metric-card" style="border-left:3px solid #dc2743;">
          <div class="social-metric-header">
            <div class="social-metric-icon" style="background:linear-gradient(135deg,#f09433,#dc2743,#bc1888);color:#fff;font-size:18px;">📸</div>
            <div class="conn-status-pill ${ig ? 'connected' : 'disconnected'}" style="font-size:0.75rem;">
              <span class="conn-status-dot"></span>
              ${ig ? 'Connected' : 'Not Connected'}
            </div>
          </div>
          <div class="social-metric-val" style="font-size:1.1rem;margin-top:6px;">${ig ? esc('@' + (ig.username || 'Unknown')) : 'Instagram'}</div>
          <div class="social-metric-label">Instagram Account</div>
          ${ig ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">Followers: ${fmt(ig.followers_count || 0)}</div>` : ''}
          ${!ig ? `<button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="window.switchView('social-integrations')">Connect Now</button>` : ''}
        </div>

        <!-- WhatsApp Account Card -->
        <div class="social-metric-card" style="border-left:3px solid #25d366;">
          <div class="social-metric-header">
            <div class="social-metric-icon" style="background:#25d366;color:#fff;font-size:18px;">💬</div>
            <div class="conn-status-pill ${wa ? 'connected' : 'disconnected'}" style="font-size:0.75rem;">
              <span class="conn-status-dot"></span>
              ${wa ? 'Connected' : 'Not Connected'}
            </div>
          </div>
          <div class="social-metric-val" style="font-size:1.1rem;margin-top:6px;">${wa ? esc(wa.phone_number || 'WhatsApp') : 'WhatsApp'}</div>
          <div class="social-metric-label">WhatsApp Business</div>
          ${wa ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">WABA: ${esc(wa.waba_id || '—')}</div>` : ''}
          ${!wa ? `<button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="window.switchView('social-integrations')">Configure</button>` : ''}
        </div>

        <!-- Social Inbox Summary -->
        <div class="social-metric-card" style="cursor:pointer;" onclick="window.switchView('social-inbox')">
          <div class="social-metric-header">
            <div class="social-metric-icon" style="background:#dbeafe;">💌</div>
          </div>
          <div class="social-metric-val">${fmt(convStats.unread)}</div>
          <div class="social-metric-label">Unread Conversations</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">${fmt(convStats.open)} open · ${fmt(convStats.total)} total</div>
        </div>

        <!-- Scheduled Posts -->
        <div class="social-metric-card" style="cursor:pointer;" onclick="window.switchView('instagram-posts')">
          <div class="social-metric-header">
            <div class="social-metric-icon" style="background:#f0fdf4;">📅</div>
          </div>
          <div class="social-metric-val">${fmt(postStats.scheduled)}</div>
          <div class="social-metric-label">Scheduled Posts</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">${fmt(postStats.published)} published · ${postStats.failed > 0 ? `<span style="color:#ef4444;">${fmt(postStats.failed)} failed</span>` : '0 failed'}</div>
        </div>
      </div>

      <!-- Campaign Stats Row -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:20px;">
        ${[
          { label: 'Active Campaigns', val: campStats.active, color: '#6366f1', icon: '🚀' },
          { label: 'Total Sent', val: campStats.totalSent, color: '#2563eb', icon: '📤' },
          { label: 'Delivered', val: campStats.totalDelivered, color: '#10b981', icon: '✅' },
          { label: 'Read', val: campStats.totalRead, color: '#8b5cf6', icon: '👀' },
          { label: 'Failed', val: campStats.totalFailed, color: '#ef4444', icon: '❌' },
        ].map(m => `
          <div class="social-metric-card" style="cursor:pointer;" onclick="window.switchView('campaign-analytics')">
            <div style="font-size:20px;margin-bottom:8px;">${m.icon}</div>
            <div style="font-size:1.5rem;font-weight:800;color:${m.color};">${fmt(m.val)}</div>
            <div style="font-size:0.72rem;color:var(--text-muted);font-weight:600;margin-top:2px;">${esc(m.label)}</div>
          </div>
        `).join('')}
      </div>

      <!-- Bottom: Upcoming Posts + Recent Activity -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">

        <!-- Upcoming Posts -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Upcoming Scheduled Posts</div>
            <button class="card-link" onclick="window.switchView('instagram-posts')">View All ›</button>
          </div>
          <div style="padding:0 16px 12px;">
            ${postStats.upcoming.length === 0 ? `
              <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.8125rem;">
                <div style="font-size:32px;margin-bottom:8px;">📭</div>
                No upcoming scheduled posts.
                <br><button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="window.switchView('instagram-posts')">Schedule a Post</button>
              </div>
            ` : postStats.upcoming.map(p => `
              <div class="upcoming-post-item">
                <div class="upcoming-thumb">${p.media_url ? `<img src="${esc(p.media_url)}" loading="lazy">` : '🖼️'}</div>
                <div class="upcoming-info">
                  <div class="upcoming-caption">${esc(p.caption || p.title || 'No caption')}</div>
                  <div class="upcoming-time">${p.scheduled_at ? new Date(p.scheduled_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</div>
                </div>
                <span class="status-badge scheduled" style="font-size:0.68rem;">Scheduled</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Recent Campaign Activity -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Active Campaigns</div>
            <button class="card-link" onclick="window.switchView('wa-campaigns')">View All ›</button>
          </div>
          <div style="padding:0 16px 12px;" id="social-dash-campaigns">
            <!-- Rendered below -->
          </div>
        </div>
      </div>
    `;

    // Render recent campaigns
    const camps = JSON.parse(localStorage.getItem('nb_wa_campaigns') || '[]')
      .filter(c => c.status !== 'draft')
      .slice(0, 4);
    const campEl = document.getElementById('social-dash-campaigns');
    if (campEl) {
      if (!camps.length) {
        campEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.8125rem;">
          <div style="font-size:32px;margin-bottom:8px;">📣</div>No active campaigns.
          <br><button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="window.switchView('wa-campaigns')">Create Campaign</button>
        </div>`;
      } else {
        campEl.innerHTML = camps.map(c => {
          const pct = c.total_recipients > 0 ? Math.round((c.sent_count || 0) / c.total_recipients * 100) : 0;
          return `
            <div style="padding:10px 0;border-bottom:1px solid var(--border-light);">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="font-size:0.8375rem;font-weight:600;">${esc(c.name)}</span>
                <span class="status-badge ${c.status}">${esc(c.status)}</span>
              </div>
              <div class="campaign-progress-bar"><div class="campaign-progress-fill" style="width:${pct}%"></div></div>
              <div style="font-size:0.72rem;color:var(--text-muted);">${fmt(c.sent_count || 0)} / ${fmt(c.total_recipients || 0)} sent</div>
            </div>
          `;
        }).join('');
      }
    }

    // Re-run feather icons
    if (typeof feather !== 'undefined') feather.replace();
  }

  /* ---- Refresh button ---- */
  function bindRefreshBtn() {
    const btn = document.getElementById('social-dash-refresh-btn');
    if (btn) btn.addEventListener('click', () => { render(); toast('Dashboard refreshed', 'success'); });
  }

  /* ---- Init ---- */
  function init() {
    render();
    bindRefreshBtn();
  }

  // Activate on view switch
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-view="social-dashboard"]').forEach(el => {
      el.addEventListener('click', () => setTimeout(render, 80));
    });
    // If already on this view
    if (window.location.hash.includes('social-dashboard')) init();
  });

  // Re-render when navigated to
  const _orig = window.switchView;
  window.switchView = function (viewId, ...rest) {
    if (typeof _orig === 'function') _orig(viewId, ...rest);
    if (viewId === 'social-dashboard') setTimeout(render, 80);
  };

  window.socialDashboard = { render, init };

})();
