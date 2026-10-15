/* =============================================================================
   content-library.js — NextBright CRM
   Media Asset Library & Content Asset Management
   ============================================================================= */
'use strict';

(function () {
  const DEFAULT_ASSETS = [];

  const DEFAULT_FOLDERS = [];

  let currentCategory = '';
  let currentFolder = '';
  let currentSort = 'newest';

  function getAssets() {
    try {
      const stored = localStorage.getItem('nb_media_library');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error('[ContentLibrary] Error loading assets:', e);
    }
    localStorage.setItem('nb_media_library', JSON.stringify(DEFAULT_ASSETS));
    return DEFAULT_ASSETS;
  }

  function saveAssets(assets) {
    try {
      localStorage.setItem('nb_media_library', JSON.stringify(assets));
    } catch (e) {
      console.error('[ContentLibrary] Error saving assets:', e);
    }
  }

  function getFolders() {
    try {
      const stored = localStorage.getItem('nb_media_folders');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    localStorage.setItem('nb_media_folders', JSON.stringify(DEFAULT_FOLDERS));
    return DEFAULT_FOLDERS;
  }

  function saveFolders(folders) {
    localStorage.setItem('nb_media_folders', JSON.stringify(folders));
  }

  function initContentLibrary() {
    renderFoldersList();
    renderAssetsGrid();
    setupEventListeners();
  }

  function setupEventListeners() {
    // Folder sidebar items
    const sidebar = document.getElementById('media-lib-sidebar');
    if (sidebar) {
      sidebar.onclick = (e) => {
        const item = e.target.closest('.media-lib-folder-item');
        if (!item) return;
        document.querySelectorAll('.media-lib-folder-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');

        const folderId = item.dataset.folderId || '';
        if (folderId === '__images') {
          currentCategory = 'image';
          currentFolder = '';
        } else if (folderId === '__videos') {
          currentCategory = 'video';
          currentFolder = '';
        } else {
          currentCategory = '';
          currentFolder = folderId;
        }
        renderAssetsGrid();
      };
    }

    // Search bar
    const searchInput = document.getElementById('media-search') || document.getElementById('media-search-input');
    if (searchInput) {
      searchInput.oninput = () => renderAssetsGrid();
    }

    // Type filter
    const typeFilter = document.getElementById('media-type-filter');
    if (typeFilter) {
      typeFilter.onchange = (e) => {
        currentCategory = e.target.value;
        renderAssetsGrid();
      };
    }

    // Sort
    const sortSelect = document.getElementById('media-sort');
    if (sortSelect) {
      sortSelect.onchange = (e) => {
        currentSort = e.target.value;
        renderAssetsGrid();
      };
    }

    // Upload button
    const uploadBtn = document.getElementById('upload-media-btn') || document.getElementById('btn-upload-media');
    if (uploadBtn) {
      uploadBtn.onclick = openUploadModal;
    }

    // New Folder button
    const newFolderBtn = document.getElementById('new-folder-btn');
    if (newFolderBtn) {
      newFolderBtn.onclick = openFolderModal;
    }

    // Form upload submit
    const uploadForm = document.getElementById('form-upload-media');
    if (uploadForm) {
      uploadForm.onsubmit = handleUploadSubmit;
    }

    // Form folder submit
    const folderForm = document.getElementById('form-create-folder');
    if (folderForm) {
      folderForm.onsubmit = handleFolderSubmit;
    }

    // Local file input
    const fileInput = document.getElementById('media-upload-input');
    if (fileInput) {
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const assets = getAssets();
            const newAsset = {
              id: 'asset-' + Date.now(),
              title: file.name.replace(/\.[^/.]+$/, ""),
              file_type: file.type.startsWith('video') ? 'video' : 'image',
              url: event.target.result,
              size: (file.size / 1024 / 1024).toFixed(1) + ' MB',
              dimensions: file.type.startsWith('video') ? '1080 x 1920' : '1080 x 1080',
              folder: currentFolder || 'marketing',
              tags: ['uploaded', 'local'],
              created_at: new Date().toISOString()
            };
            assets.unshift(newAsset);
            saveAssets(assets);
            renderAssetsGrid();
            if (window.showToast) window.showToast(`File "${file.name}" added to Content Library!`, 'success');
          };
          reader.readAsDataURL(file);
        }
      };
    }
  }

  function renderFoldersList() {
    const listEl = document.getElementById('media-lib-folders-list');
    if (!listEl) return;
    const folders = getFolders();
    listEl.innerHTML = folders.map(f => `
      <div class="media-lib-folder-item ${currentFolder === f ? 'active' : ''}" data-folder-id="${f}">
        <i data-feather="folder" style="width:14px;height:14px;"></i>
        <span style="text-transform:capitalize;">${f}</span>
      </div>
    `).join('');
    if (typeof feather !== 'undefined') feather.replace();
  }

  function renderAssetsGrid() {
    const container = document.getElementById('media-lib-grid') || document.getElementById('media-assets-grid');
    if (!container) return;

    let assets = getAssets();
    const searchVal = (document.getElementById('media-search')?.value || '').toLowerCase();

    if (currentCategory) {
      assets = assets.filter(a => a.file_type === currentCategory);
    }

    if (currentFolder) {
      assets = assets.filter(a => a.folder === currentFolder);
    }

    if (searchVal) {
      assets = assets.filter(a =>
        a.title.toLowerCase().includes(searchVal) ||
        (a.tags && a.tags.some(t => t.toLowerCase().includes(searchVal)))
      );
    }

    if (currentSort === 'newest') {
      assets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (currentSort === 'oldest') {
      assets.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (currentSort === 'name') {
      assets.sort((a, b) => a.title.localeCompare(b.title));
    }

    if (assets.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 48px; text-align: center; background: #fff; border-radius: 12px; border: 1px dashed var(--border-light); margin: 16px;">
          <div style="font-size: 3rem; margin-bottom: 12px;">📂</div>
          <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 6px;">No assets found</h3>
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 16px;">
            Upload images, videos, or documents to your media library.
          </p>
          <button class="btn btn-primary" onclick="window.NextBrightLibrary.openUploadModal()">
            <i data-feather="upload-cloud"></i> Upload New Media
          </button>
        </div>
      `;
      if (typeof feather !== 'undefined') feather.replace();
      return;
    }

    container.innerHTML = assets.map(asset => {
      let icon = 'image';
      if (asset.file_type === 'video') icon = 'video';
      else if (asset.file_type === 'document') icon = 'file-text';

      return `
        <div class="media-card" style="position:relative;border-radius:10px;overflow:hidden;background:#fff;border:1px solid var(--border-light);box-shadow:var(--shadow-sm);display:flex;flex-direction:column;">
          <div class="media-card-thumb" style="width:100%;aspect-ratio:1;background:#0f172a;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;">
            ${asset.file_type === 'video' ? `
              <video src="${asset.url}" style="width:100%;height:100%;object-fit:cover;" muted></video>
            ` : `
              <img src="${asset.url}" alt="${asset.title}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600'">
            `}
            <span class="media-type-tag" style="position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,0.65);color:#fff;font-size:0.65rem;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;">
              ${asset.file_type}
            </span>
          </div>
          <div class="media-card-info" style="padding:10px;flex:1;display:flex;flex-direction:column;justify-content:space-between;">
            <div>
              <div class="media-card-name" style="font-weight:600;font-size:0.82rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${asset.title}">
                ${escapeHtml(asset.title)}
              </div>
              <div class="media-card-meta" style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">
                ${asset.size} · ${asset.dimensions}
              </div>
            </div>
            <div style="margin-top:8px;display:flex;gap:6px;">
              <button class="btn btn-secondary btn-sm" style="flex:1;font-size:0.72rem;padding:3px 6px;" onclick="window.NextBrightLibrary.copyUrl('${asset.url}')">
                <i data-feather="link" style="width:11px;height:11px;"></i> Copy URL
              </button>
              <button class="btn btn-secondary btn-sm" style="color:var(--status-danger,#ef4444);padding:3px 6px;" onclick="window.NextBrightLibrary.deleteAsset('${asset.id}')">
                <i data-feather="trash-2" style="width:11px;height:11px;"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (typeof feather !== 'undefined') feather.replace();
  }

  function openUploadModal() {
    const modal = document.getElementById('modal-upload-media');
    if (modal) modal.style.display = 'flex';
  }

  function closeUploadModal() {
    const modal = document.getElementById('modal-upload-media');
    if (modal) modal.style.display = 'none';
  }

  function openFolderModal() {
    const modal = document.getElementById('modal-create-folder');
    if (modal) modal.style.display = 'flex';
  }

  function closeFolderModal() {
    const modal = document.getElementById('modal-create-folder');
    if (modal) modal.style.display = 'none';
  }

  function handleUploadSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('upload-media-title')?.value.trim();
    const type = document.getElementById('upload-media-type')?.value || 'image';
    const folder = document.getElementById('upload-media-folder')?.value || 'marketing';
    const url = document.getElementById('upload-media-url')?.value.trim();
    const tags = (document.getElementById('upload-media-tags')?.value || '').split(',').map(t => t.trim()).filter(Boolean);

    if (!title || !url) return;

    const assets = getAssets();
    const newAsset = {
      id: 'asset-' + Date.now(),
      title,
      file_type: type,
      url,
      size: '1.5 MB',
      dimensions: type === 'video' ? '1080 x 1920' : '1920 x 1080',
      folder,
      tags,
      created_at: new Date().toISOString()
    };

    assets.unshift(newAsset);
    saveAssets(assets);
    closeUploadModal();
    renderAssetsGrid();
    if (window.showToast) window.showToast('Asset uploaded successfully!', 'success');
  }

  function handleFolderSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('new-folder-name-input')?.value.trim().toLowerCase();
    if (!name) return;
    const folders = getFolders();
    if (!folders.includes(name)) {
      folders.push(name);
      saveFolders(folders);
      renderFoldersList();
      if (window.showToast) window.showToast(`Folder "${name}" created!`, 'success');
    }
    closeFolderModal();
  }

  function copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
      if (window.showToast) window.showToast('Asset URL copied to clipboard!', 'info');
    });
  }

  function deleteAsset(id) {
    if (!confirm('Are you sure you want to delete this media asset?')) return;
    let assets = getAssets();
    assets = assets.filter(a => a.id !== id);
    saveAssets(assets);
    renderAssetsGrid();
    if (window.showToast) window.showToast('Asset deleted from library', 'default');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.NextBrightLibrary = {
    init: initContentLibrary,
    copyUrl,
    deleteAsset,
    closeModal: closeUploadModal,
    openUploadModal,
    openFolderModal
  };

  document.addEventListener('DOMContentLoaded', () => {
    initContentLibrary();
  });
})();
