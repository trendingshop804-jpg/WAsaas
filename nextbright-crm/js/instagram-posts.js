/* =============================================================================
   instagram-posts.js — NextBright CRM
   Instagram Post Scheduler, Reel/Story Publisher & Content Manager
   ============================================================================= */
'use strict';

(function () {
  const DEFAULT_POSTS = [
    {
      id: 'post-101',
      type: 'feed',
      caption: '🚀 Elevate your CRM experience with NextBright AI automation! Scale sales faster than ever. #CRM #Automation #SaaS #Growth',
      media_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop&q=60',
      scheduled_at: new Date(Date.now() + 86400000 * 2).toISOString(),
      status: 'scheduled',
      likes: 0,
      comments: 0,
      reach: 0,
      created_at: new Date().toISOString()
    },
    {
      id: 'post-102',
      type: 'reel',
      caption: '3 steps to automate your lead follow-up using WhatsApp Cloud API 💬✨ Link in bio!',
      media_url: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&auto=format&fit=crop&q=60',
      scheduled_at: new Date(Date.now() - 86400000).toISOString(),
      status: 'published',
      likes: 142,
      comments: 18,
      reach: 1250,
      created_at: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
      id: 'post-103',
      type: 'story',
      caption: 'New feature drop coming tomorrow! Stay tuned 🔥',
      media_url: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=600&auto=format&fit=crop&q=60',
      scheduled_at: new Date(Date.now() + 3600000 * 5).toISOString(),
      status: 'scheduled',
      likes: 0,
      comments: 0,
      reach: 0,
      created_at: new Date().toISOString()
    },
    {
      id: 'post-104',
      type: 'carousel',
      caption: 'Slide through to see how multi-channel inbox unifies Instagram DMs and WhatsApp messages into a single pipeline 📥 slide 1/3',
      media_url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&auto=format&fit=crop&q=60',
      scheduled_at: null,
      status: 'draft',
      likes: 0,
      comments: 0,
      reach: 0,
      created_at: new Date().toISOString()
    }
  ];

  let currentView = 'calendar'; // 'calendar' or 'list'
  let currentFilter = '';
  let currentDate = new Date();

  function getPosts() {
    try {
      const stored = localStorage.getItem('nb_instagram_posts');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error('[InstagramPosts] Error loading posts:', e);
    }
    localStorage.setItem('nb_instagram_posts', JSON.stringify(DEFAULT_POSTS));
    return DEFAULT_POSTS;
  }

  function savePosts(posts) {
    try {
      localStorage.setItem('nb_instagram_posts', JSON.stringify(posts));
    } catch (e) {
      console.error('[InstagramPosts] Error saving posts:', e);
    }
  }

  function initInstagramPosts() {
    renderPostsView();
    setupEventListeners();
  }

  function setupEventListeners() {
    // View Toggle
    const calBtn = document.getElementById('post-view-calendar-btn');
    const listBtn = document.getElementById('post-view-list-btn');

    if (calBtn) {
      calBtn.onclick = () => {
        currentView = 'calendar';
        calBtn.classList.add('active');
        if (listBtn) listBtn.classList.remove('active');
        const calView = document.getElementById('posts-calendar-view');
        const listView = document.getElementById('posts-list-view');
        const toolbar = document.getElementById('posts-cal-toolbar');
        if (calView) calView.style.display = 'block';
        if (listView) listView.style.display = 'none';
        if (toolbar) toolbar.style.display = 'flex';
        renderPostsCalendar();
      };
    }

    if (listBtn) {
      listBtn.onclick = () => {
        currentView = 'list';
        listBtn.classList.add('active');
        if (calBtn) calBtn.classList.remove('active');
        const calView = document.getElementById('posts-calendar-view');
        const listView = document.getElementById('posts-list-view');
        const toolbar = document.getElementById('posts-cal-toolbar');
        if (calView) calView.style.display = 'none';
        if (listView) listView.style.display = 'block';
        if (toolbar) toolbar.style.display = 'flex';
        renderPostsList();
      };
    }

    // Month navigation
    const prevBtn = document.getElementById('cal-prev-btn');
    const nextBtn = document.getElementById('cal-next-btn');

    if (prevBtn) {
      prevBtn.onclick = () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderPostsCalendar();
      };
    }
    if (nextBtn) {
      nextBtn.onclick = () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderPostsCalendar();
      };
    }

    // Filter
    const filterSelect = document.getElementById('post-status-filter');
    if (filterSelect) {
      filterSelect.onchange = (e) => {
        currentFilter = e.target.value;
        if (currentView === 'calendar') renderPostsCalendar();
        else renderPostsList();
      };
    }

    // Create post button
    const createBtn = document.getElementById('create-post-btn') || document.getElementById('btn-create-ig-post');
    if (createBtn) {
      createBtn.onclick = openCreatePostModal;
    }

    // Modal submit
    const postForm = document.getElementById('form-create-ig-post');
    if (postForm) {
      postForm.onsubmit = handleCreatePostSubmit;
    }

    // Caption character counter & preview sync
    const captionInput = document.getElementById('ig-post-caption-input');
    if (captionInput) {
      captionInput.oninput = (e) => {
        const charCount = document.getElementById('ig-caption-char-count');
        if (charCount) charCount.textContent = `${e.target.value.length} / 2200`;
        const previewCaption = document.getElementById('ig-preview-caption');
        if (previewCaption) previewCaption.textContent = e.target.value || 'Your caption preview will appear here...';
      };
    }

    // Image URL preview sync
    const urlInput = document.getElementById('ig-post-media-url');
    if (urlInput) {
      urlInput.oninput = (e) => {
        const previewImg = document.getElementById('ig-preview-image');
        if (previewImg && e.target.value) {
          previewImg.src = e.target.value;
        }
      };
    }
  }

  function renderPostsView() {
    if (currentView === 'calendar') {
      renderPostsCalendar();
    } else {
      renderPostsList();
    }
  }

  function renderPostsCalendar() {
    const grid = document.getElementById('posts-cal-grid');
    const label = document.getElementById('cal-month-label');
    if (!grid) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (label) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      label.textContent = `${monthNames[month]} ${year}`;
    }

    let posts = getPosts();
    if (currentFilter) {
      posts = posts.filter(p => p.status === currentFilter);
    }

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = '';
    // Day of week headers
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(d => {
      html += `<div style="text-align:center;font-weight:700;font-size:0.75rem;color:var(--text-muted);padding:8px 0;">${d}</div>`;
    });

    // Empty cells for first day padding
    for (let i = 0; i < firstDay; i++) {
      html += `<div class="cal-cell empty" style="min-height:90px;background:var(--navy-50,#f8fafc);border:1px solid var(--border-light);border-radius:6px;opacity:0.4;"></div>`;
    }

    const today = new Date();

    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(year, month, day);
      const isToday = cellDate.toDateString() === today.toDateString();

      const dayPosts = posts.filter(p => {
        if (!p.scheduled_at) return false;
        const d = new Date(p.scheduled_at);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
      });

      html += `
        <div class="cal-cell ${isToday ? 'today' : ''}" style="min-height:90px;background:#fff;border:1px solid var(--border-light);border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:4px;position:relative;">
          <div style="font-size:0.75rem;font-weight:${isToday ? '800' : '600'};color:${isToday ? 'var(--brand-primary)' : 'var(--text-primary)'};display:flex;justify-content:space-between;align-items:center;">
            <span>${day}</span>
            ${isToday ? '<span style="font-size:0.6rem;background:var(--brand-primary);color:#fff;padding:1px 4px;border-radius:3px;">TODAY</span>' : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;overflow-y:auto;max-height:65px;">
            ${dayPosts.map(p => {
              let color = '#2563eb';
              if (p.status === 'published') color = '#10b981';
              else if (p.status === 'draft') color = '#6b7280';
              else if (p.status === 'failed') color = '#ef4444';

              return `
                <div style="background:${color}18;border-left:3px solid ${color};padding:3px 5px;border-radius:3px;font-size:0.68rem;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(p.caption)}" onclick="window.NextBrightIGPosts.viewPost('${p.id}')">
                  <span style="font-weight:700;">${p.type.toUpperCase()}:</span> ${escapeHtml(p.caption)}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    grid.innerHTML = html;
    if (typeof feather !== 'undefined') feather.replace();
  }

  function renderPostsList() {
    const container = document.getElementById('posts-list-container');
    if (!container) return;

    let posts = getPosts();
    if (currentFilter) {
      posts = posts.filter(p => p.status === currentFilter);
    }

    if (posts.length === 0) {
      container.innerHTML = `
        <div style="padding:48px;text-align:center;background:#fff;border-radius:12px;border:1px dashed var(--border-light);margin:16px;">
          <div style="font-size:3rem;margin-bottom:12px;">📸</div>
          <h3 style="font-size:1.1rem;font-weight:600;margin-bottom:6px;">No posts found</h3>
          <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:16px;">Create your first Instagram post or schedule one for later.</p>
          <button class="btn btn-primary" onclick="window.NextBrightIGPosts.openCreatePostModal()"><i data-feather="plus"></i> Create Post</button>
        </div>
      `;
      if (typeof feather !== 'undefined') feather.replace();
      return;
    }

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;padding:16px;">
        ${posts.map(post => {
          let badgeColor = 'badge-warning';
          if (post.status === 'published') badgeColor = 'badge-success';
          else if (post.status === 'draft') badgeColor = 'badge-secondary';
          else if (post.status === 'failed') badgeColor = 'badge-danger';

          return `
            <div class="card" style="border-radius:12px;overflow:hidden;border:1px solid var(--border-light);display:flex;flex-direction:column;">
              <div style="position:relative;width:100%;aspect-ratio:1;background:#000;overflow:hidden;">
                <img src="${post.media_url}" alt="Post Media" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600'">
                <span class="badge ${badgeColor}" style="position:absolute;top:10px;right:10px;text-transform:capitalize;">${post.status}</span>
                <span style="position:absolute;bottom:10px;left:10px;background:rgba(0,0,0,0.7);color:#fff;padding:2px 8px;border-radius:4px;font-size:0.72rem;text-transform:uppercase;font-weight:700;">
                  ${post.type}
                </span>
              </div>
              <div style="padding:14px;flex:1;display:flex;flex-direction:column;justify-content:space-between;">
                <div>
                  <p style="font-size:0.85rem;color:var(--text-primary);line-height:1.4;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">
                    ${escapeHtml(post.caption)}
                  </p>
                </div>
                <div>
                  <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px;display:flex;align-items:center;gap:6px;">
                    <i data-feather="clock" style="width:12px;height:12px;"></i>
                    <span>${post.scheduled_at ? new Date(post.scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No schedule set'}</span>
                  </div>
                  <div style="display:flex;gap:8px;border-top:1px solid var(--border-light);padding-top:10px;">
                    ${post.status !== 'published' ? `
                      <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="window.NextBrightIGPosts.publishNow('${post.id}')">Publish Now</button>
                    ` : `
                      <span style="font-size:0.75rem;color:#10b981;display:flex;align-items:center;gap:4px;flex:1;">✅ Published Live</span>
                    `}
                    <button class="btn btn-secondary btn-sm" style="color:var(--status-danger,#ef4444);" onclick="window.NextBrightIGPosts.deletePost('${post.id}')"><i data-feather="trash-2"></i></button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    if (typeof feather !== 'undefined') feather.replace();
  }

  function openCreatePostModal() {
    const modal = document.getElementById('modal-create-ig-post');
    if (modal) modal.style.display = 'flex';
  }

  function closeCreatePostModal() {
    const modal = document.getElementById('modal-create-ig-post');
    if (modal) modal.style.display = 'none';
  }

  async function handleCreatePostSubmit(e) {
    e.preventDefault();
    const type = document.getElementById('ig-post-type-select')?.value || 'feed';
    const caption = document.getElementById('ig-post-caption-input')?.value || '';
    const mediaUrl = document.getElementById('ig-post-media-url')?.value || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600';
    const scheduledTime = document.getElementById('ig-post-schedule-time')?.value || null;
    const action = e.submitter ? e.submitter.dataset.action : 'schedule';

    const posts = getPosts();
    const newPost = {
      id: 'post-' + Date.now(),
      type,
      caption,
      media_url: mediaUrl,
      scheduled_at: scheduledTime ? new Date(scheduledTime).toISOString() : (action === 'publish' ? new Date().toISOString() : null),
      status: action === 'publish' ? 'published' : (action === 'draft' ? 'draft' : 'scheduled'),
      likes: action === 'publish' ? 12 : 0,
      comments: 0,
      reach: action === 'publish' ? 85 : 0,
      created_at: new Date().toISOString()
    };

    posts.unshift(newPost);
    savePosts(posts);
    closeCreatePostModal();

    if (currentView === 'calendar') renderPostsCalendar();
    else renderPostsList();

    if (action === 'publish') {
      if (window.showToast) window.showToast('Post published live to Instagram feed!', 'success');
    } else {
      if (window.showToast) window.showToast(`Instagram ${type} ${action === 'draft' ? 'saved as draft' : 'scheduled'}!`, 'success');
    }
  }

  function publishNow(postId) {
    const posts = getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    post.status = 'published';
    post.scheduled_at = new Date().toISOString();
    savePosts(posts);
    if (currentView === 'calendar') renderPostsCalendar();
    else renderPostsList();
    if (window.showToast) window.showToast('Post published live!', 'success');
  }

  function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this Instagram post?')) return;
    let posts = getPosts();
    posts = posts.filter(p => p.id !== postId);
    savePosts(posts);
    if (currentView === 'calendar') renderPostsCalendar();
    else renderPostsList();
    if (window.showToast) window.showToast('Post removed', 'default');
  }

  function viewPost(postId) {
    const posts = getPosts();
    const post = posts.find(p => p.id === postId);
    if (post) {
      alert(`[${post.type.toUpperCase()}] ${post.caption}\n\nStatus: ${post.status}\nScheduled: ${post.scheduled_at || 'None'}`);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.NextBrightIGPosts = {
    init: initInstagramPosts,
    openCreatePostModal,
    closeModal: closeCreatePostModal,
    publishNow,
    deletePost,
    viewPost
  };

  document.addEventListener('DOMContentLoaded', () => {
    initInstagramPosts();
  });
})();
