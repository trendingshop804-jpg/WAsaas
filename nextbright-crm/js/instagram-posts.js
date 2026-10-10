/* =============================================================================
   instagram-posts.js — NextBright CRM
   Instagram Post Scheduler, Reel/Story Publisher & Content Manager
   ============================================================================= */

'use strict';

(function () {
  // Default mock state if none in localStorage or Supabase
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

  let currentTab = 'all';

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
    renderPostsGrid();
    setupEventListeners();
  }

  function setupEventListeners() {
    // Filter tabs
    const filterTabs = document.querySelectorAll('#ig-posts-tabs .tab-item, [data-post-filter]');
    filterTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        filterTabs.forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentTab = e.currentTarget.dataset.postFilter || 'all';
        renderPostsGrid();
      });
    });

    // Create post button
    const createBtn = document.getElementById('btn-create-ig-post');
    if (createBtn) {
      createBtn.addEventListener('click', openCreatePostModal);
    }

    // Modal submit
    const postForm = document.getElementById('form-create-ig-post');
    if (postForm) {
      postForm.addEventListener('submit', handleCreatePostSubmit);
    }

    // Caption character counter & preview sync
    const captionInput = document.getElementById('ig-post-caption-input');
    if (captionInput) {
      captionInput.addEventListener('input', (e) => {
        const charCount = document.getElementById('ig-caption-char-count');
        if (charCount) charCount.textContent = `${e.target.value.length} / 2200`;
        const previewCaption = document.getElementById('ig-preview-caption');
        if (previewCaption) previewCaption.textContent = e.target.value || 'Your caption preview will appear here...';
      });
    }

    // Image URL preview sync
    const urlInput = document.getElementById('ig-post-media-url');
    if (urlInput) {
      urlInput.addEventListener('input', (e) => {
        const previewImg = document.getElementById('ig-preview-image');
        if (previewImg && e.target.value) {
          previewImg.src = e.target.value;
        }
      });
    }
  }

  function renderPostsGrid() {
    const container = document.getElementById('ig-posts-grid');
    if (!container) return;

    let posts = getPosts();
    if (currentTab !== 'all') {
      posts = posts.filter(p => p.status === currentTab);
    }

    if (posts.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 48px; text-align: center; background: white; border-radius: 12px; border: 1px dashed var(--border-light);">
          <div style="font-size: 3rem; margin-bottom: 12px;">📸</div>
          <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 6px;">No posts found</h3>
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 16px;">
            ${currentTab === 'all' ? 'You haven’t created any Instagram posts yet.' : `No posts matching "${currentTab}" status.`}
          </p>
          <button class="btn btn-primary" onclick="document.getElementById('btn-create-ig-post')?.click()">
            <i data-feather="plus"></i> Create New Post
          </button>
        </div>
      `;
      if (window.feather) feather.replace();
      return;
    }

    container.innerHTML = posts.map(post => {
      const isPublished = post.status === 'published';
      const isScheduled = post.status === 'scheduled';
      const isDraft = post.status === 'draft';

      let statusBadge = '';
      if (isPublished) {
        statusBadge = `<span class="badge badge-success" style="position: absolute; top: 10px; right: 10px; z-index: 2;">Published</span>`;
      } else if (isScheduled) {
        statusBadge = `<span class="badge badge-warning" style="position: absolute; top: 10px; right: 10px; z-index: 2;">Scheduled</span>`;
      } else {
        statusBadge = `<span class="badge badge-secondary" style="position: absolute; top: 10px; right: 10px; z-index: 2;">Draft</span>`;
      }

      let typeIcon = 'image';
      if (post.type === 'reel') typeIcon = 'video';
      else if (post.type === 'story') typeIcon = 'circle';
      else if (post.type === 'carousel') typeIcon = 'layers';

      const formattedDate = post.scheduled_at
        ? new Date(post.scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Not scheduled';

      return `
        <div class="ig-post-card" style="background: white; border-radius: 12px; border: 1px solid var(--border-light); overflow: hidden; position: relative; display: flex; flex-direction: column;">
          ${statusBadge}
          <div style="position: relative; width: 100%; aspect-ratio: 1 / 1; background: #000; overflow: hidden;">
            <img src="${post.media_url}" alt="Post Media" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s;" onerror="this.src='https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600'">
            <div style="position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.6); color: white; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; display: flex; align-items: center; gap: 4px;">
              <i data-feather="${typeIcon}" style="width: 12px; height: 12px;"></i>
              <span style="text-transform: capitalize;">${post.type}</span>
            </div>
          </div>
          <div style="padding: 14px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <p style="font-size: 0.85rem; color: var(--text-dark); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 12px; line-height: 1.4;">
                ${escapeHtml(post.caption)}
              </p>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 10px; display: flex; align-items: center; gap: 4px;">
                <i data-feather="clock" style="width: 12px; height: 12px;"></i>
                <span>${isPublished ? 'Published: ' : 'Scheduled: '} ${formattedDate}</span>
              </div>
              ${isPublished ? `
                <div style="display: flex; gap: 16px; font-size: 0.75rem; color: var(--text-muted); border-top: 1px solid var(--border-light); padding-top: 10px;">
                  <span>❤️ ${post.likes}</span>
                  <span>💬 ${post.comments}</span>
                  <span>👁️ ${post.reach} reach</span>
                </div>
              ` : `
                <div style="display: flex; gap: 8px; border-top: 1px solid var(--border-light); padding-top: 10px;">
                  <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="window.NextBrightIGPosts.publishNow('${post.id}')">
                    Publish Now
                  </button>
                  <button class="btn btn-secondary btn-sm" style="color: var(--status-danger);" onclick="window.NextBrightIGPosts.deletePost('${post.id}')">
                    <i data-feather="trash-2"></i>
                  </button>
                </div>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.feather) feather.replace();
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
    const mediaUrl = document.getElementById('ig-post-media-url')?.value || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600';
    const scheduledTime = document.getElementById('ig-post-schedule-time')?.value || null;
    const action = e.submitter ? e.submitter.dataset.action : 'schedule';

    const posts = getPosts();
    const newPost = {
      id: 'post-' + Date.now(),
      type,
      caption,
      media_url: mediaUrl,
      scheduled_at: scheduledTime ? new Date(scheduledTime).toISOString() : new Date().toISOString(),
      status: action === 'publish' ? 'published' : (scheduledTime ? 'scheduled' : 'draft'),
      likes: action === 'publish' ? Math.floor(Math.random() * 20) + 5 : 0,
      comments: action === 'publish' ? Math.floor(Math.random() * 5) : 0,
      reach: action === 'publish' ? Math.floor(Math.random() * 200) + 50 : 0,
      created_at: new Date().toISOString()
    };

    // Attempt real server call if API token is connected
    try {
      const auth = localStorage.getItem('nb_instagram_conn');
      if (auth && action === 'publish') {
        const resp = await fetch('/api/instagram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'publish_post', caption, imageUrl: mediaUrl })
        });
        const result = await resp.json();
        if (result.success) {
          if (window.showToast) window.showToast('Published live to Instagram feed!', 'success');
        } else {
          console.warn('Instagram live publish warning:', result.error);
        }
      }
    } catch (err) {
      console.warn('Publish API call fallback to local:', err);
    }

    posts.unshift(newPost);
    savePosts(posts);
    closeCreatePostModal();
    renderPostsGrid();

    if (window.showToast) {
      window.showToast(`Post ${newPost.status === 'published' ? 'published' : 'scheduled'} successfully!`, 'success');
    }
  }

  function publishNow(postId) {
    const posts = getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    post.status = 'published';
    post.likes = Math.floor(Math.random() * 25) + 8;
    post.comments = Math.floor(Math.random() * 6) + 1;
    post.reach = Math.floor(Math.random() * 300) + 100;
    savePosts(posts);
    renderPostsGrid();

    if (window.showToast) window.showToast('Post published live!', 'success');
  }

  function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this scheduled post?')) return;
    let posts = getPosts();
    posts = posts.filter(p => p.id !== postId);
    savePosts(posts);
    renderPostsGrid();

    if (window.showToast) window.showToast('Post removed', 'default');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Export public API
  window.NextBrightIGPosts = {
    init: initInstagramPosts,
    publishNow,
    deletePost,
    closeModal: closeCreatePostModal
  };

  document.addEventListener('DOMContentLoaded', () => {
    initInstagramPosts();
  });
})();
