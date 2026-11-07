'use strict';

(function () {
  let posts = [];

  function request(path, options) {
    return window.NB_AUTH?.apiFetch ? window.NB_AUTH.apiFetch(path, options) : fetch(path, options);
  }

  function toast(message, type) {
    if (window.showToast) window.showToast(message, type);
  }

  async function json(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Request failed.');
    return payload;
  }

  function normalize(post) {
    return {
      ...post,
      type: post.post_type || post.type || 'post',
      media_url: post.media_url || post.media_urls?.[0] || '',
      scheduled_at: post.scheduled_time || post.scheduled_at || null,
      status: post.status === 'pending' ? 'scheduled' : post.status
    };
  }

  async function load() {
    try {
      const res = await json(await request('/api/instagram?action=list_posts', { headers: { Accept: 'application/json' } }));
      posts = (res.posts || []).map(normalize);
    } catch (error) {
      posts = [];
      toast(error.message, 'error');
    }
    render();
  }

  function render() {
    const container = document.getElementById('posts-list-container');
    if (!container) return;
    if (!posts.length) {
      container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);background:#fff;border-radius:12px;border:1px dashed var(--border-light);">No Instagram posts have been created yet. Click \'Create Post\' to draft or schedule.</div>';
      return;
    }
    container.innerHTML = posts.map((post) => {
      const statusBadge = post.status === 'published'
        ? '<span class="badge" style="background:#dcfce7;color:#15803d;">Published</span>'
        : (post.status === 'scheduled'
          ? '<span class="badge" style="background:#fef3c7;color:#b45309;">Scheduled</span>'
          : '<span class="badge badge-secondary">Draft</span>');

      return '<div class="card" style="margin:12px 0;padding:16px;border-radius:10px;border:1px solid var(--border-light);box-shadow:var(--shadow-sm);">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<strong style="text-transform:capitalize;font-size:0.95rem;">' + escapeHtml(post.type) + '</strong>' +
            statusBadge +
          '</div>' +
          '<button class="btn btn-secondary btn-sm" onclick="window.NextBrightIGPosts.deletePost(\'' + post.id + '\')" style="color:#ef4444;font-size:0.75rem;padding:3px 8px;">Delete</button>' +
        '</div>' +
        (post.media_url ? '<div style="margin-bottom:10px;"><img src="' + escapeHtml(post.media_url) + '" alt="Media" style="max-height:140px;border-radius:6px;object-fit:cover;"></div>' : '') +
        '<p style="font-size:0.85rem;color:#334155;margin:6px 0;white-space:pre-wrap;">' + escapeHtml(post.caption) + '</p>' +
        '<div style="font-size:.78rem;color:var(--text-muted);margin-top:8px;">' +
          (post.scheduled_at ? 'Scheduled: ' + new Date(post.scheduled_at).toLocaleString() : 'Draft (Not scheduled)') +
          (post.error_message ? ' • Error: ' + escapeHtml(post.error_message) : '') +
        '</div>' +
      '</div>';
    }).join('');

    if (typeof feather !== 'undefined') {
      try { feather.replace(); } catch (_) {}
    }
  }

  function updateLivePreview() {
    const captionInput = document.getElementById('ig-post-caption-input');
    const mediaUrlInput = document.getElementById('ig-post-media-url');
    const previewCaption = document.getElementById('ig-preview-caption');
    const previewImage = document.getElementById('ig-preview-image');
    const charCounter = document.getElementById('ig-caption-char-count');

    const text = captionInput?.value || '';
    if (previewCaption) {
      previewCaption.textContent = text || 'Your caption preview will appear here...';
    }
    if (charCounter) {
      charCounter.textContent = text.length + ' / 2200';
      charCounter.style.color = text.length > 2200 ? '#ef4444' : 'var(--text-muted)';
    }

    const url = mediaUrlInput?.value.trim() || '';
    if (previewImage) {
      previewImage.src = url || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600';
    }
  }

  function handleFileSelect(file) {
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast('Please upload an image or video file.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const mediaUrlInput = document.getElementById('ig-post-media-url');
      if (mediaUrlInput) {
        mediaUrlInput.value = dataUrl;
      }
      updateLivePreview();
      toast('✅ "' + file.name + '" loaded for Instagram post!', 'success');
    };
    reader.readAsDataURL(file);
  }

  async function save(event) {
    event.preventDefault();
    const submitter = event.submitter;
    const action = submitter?.dataset?.action || 'draft';

    const type = document.getElementById('ig-post-type-select')?.value || 'feed';
    const caption = document.getElementById('ig-post-caption-input')?.value.trim();
    const media_url = document.getElementById('ig-post-media-url')?.value.trim();
    const scheduleValue = document.getElementById('ig-post-schedule-time')?.value;

    if (!caption || !media_url) {
      return toast('Caption and a media asset are required.', 'error');
    }

    try {
      const payload = await json(await request('/api/instagram?action=save_post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post: {
            type,
            caption,
            media_url,
            status: action === 'publish' ? 'published' : (action === 'schedule' && scheduleValue ? 'scheduled' : 'draft'),
            scheduled_at: (action === 'schedule' && scheduleValue) ? new Date(scheduleValue).toISOString() : null
          }
        })
      }));

      posts.unshift(normalize(payload.post));
      close();
      render();

      if (action === 'publish') {
        toast('Post submitted for publishing. Meta will process and display it in feed.', 'success');
      } else if (action === 'schedule') {
        toast('Post scheduled successfully!', 'success');
      } else {
        toast('Post saved as draft.', 'success');
      }
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function deletePost(id) {
    if (!confirm('Are you sure you want to delete this Instagram post?')) return;
    try {
      await json(await request('/api/instagram?action=delete_post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: id })
      }));
      posts = posts.filter((post) => post.id !== id);
      render();
      toast('Post deleted.', 'success');
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function open() {
    const modal = document.getElementById('modal-create-ig-post');
    if (modal) modal.style.display = 'flex';
    updateLivePreview();
  }

  function close() {
    const modal = document.getElementById('modal-create-ig-post');
    if (modal) modal.style.display = 'none';
  }

  function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function init() {
    document.getElementById('create-post-btn')?.addEventListener('click', open);
    document.getElementById('btn-create-ig-post')?.addEventListener('click', open);

    const form = document.getElementById('form-create-ig-post');
    if (form) form.onsubmit = save;

    // Real-time caption and URL typing preview
    const captionInput = document.getElementById('ig-post-caption-input');
    const mediaUrlInput = document.getElementById('ig-post-media-url');
    if (captionInput) captionInput.addEventListener('input', updateLivePreview);
    if (mediaUrlInput) mediaUrlInput.addEventListener('input', updateLivePreview);

    // File Drag & Drop / Click Picker for Instagram
    const dropZone = document.getElementById('ig-drop-zone');
    const fileInput = document.getElementById('ig-post-file-input');

    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) handleFileSelect(file);
      });

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#dc2743';
        dropZone.style.background = '#fef2f2';
      });
      dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#cbd5e1';
        dropZone.style.background = '#f8fafc';
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#cbd5e1';
        dropZone.style.background = '#f8fafc';
        const file = e.dataTransfer?.files?.[0];
        if (file) handleFileSelect(file);
      });
    }

    load();
  }

  window.NextBrightIGPosts = { init, openCreatePostModal: open, closeModal: close, deletePost };
  document.addEventListener('DOMContentLoaded', init);
})();
