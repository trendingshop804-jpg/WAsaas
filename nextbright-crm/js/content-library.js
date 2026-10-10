/* =============================================================================
   content-library.js — NextBright CRM
   Media Asset Library & Content Asset Management
   ============================================================================= */

'use strict';

(function () {
  const DEFAULT_ASSETS = [
    {
      id: 'asset-1',
      title: 'CRM Product Banner 2026',
      file_type: 'image',
      url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&auto=format&fit=crop&q=60',
      size: '1.2 MB',
      dimensions: '1920 x 1080',
      folder: 'marketing',
      tags: ['banner', 'crm', 'saas'],
      created_at: new Date(Date.now() - 86400000 * 5).toISOString()
    },
    {
      id: 'asset-2',
      title: 'WhatsApp Automation Explainer',
      file_type: 'video',
      url: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&auto=format&fit=crop&q=60',
      size: '4.8 MB',
      dimensions: '1080 x 1920',
      folder: 'reels',
      tags: ['whatsapp', 'reel', 'tutorial'],
      created_at: new Date(Date.now() - 86400000 * 3).toISOString()
    },
    {
      id: 'asset-3',
      title: 'Customer Onboarding Flow Chart',
      file_type: 'image',
      url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&auto=format&fit=crop&q=60',
      size: '850 KB',
      dimensions: '1200 x 800',
      folder: 'templates',
      tags: ['onboarding', 'diagram'],
      created_at: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
      id: 'asset-4',
      title: 'NextBright Brand Guidelines PDF',
      file_type: 'document',
      url: 'https://images.unsplash.com/photo-1568992687947-868a62a9f521?w=800&auto=format&fit=crop&q=60',
      size: '2.4 MB',
      dimensions: 'A4 Document',
      folder: 'brand',
      tags: ['pdf', 'branding', 'guidelines'],
      created_at: new Date(Date.now() - 86400000 * 10).toISOString()
    }
  ];

  let currentCategory = 'all';
  let currentFolder = 'all';

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

  function initContentLibrary() {
    renderAssetsGrid();
    setupEventListeners();
  }

  function setupEventListeners() {
    // Filter by type tabs
    const tabs = document.querySelectorAll('#media-type-tabs .tab-item, [data-media-type]');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        tabs.forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentCategory = e.currentTarget.dataset.mediaType || 'all';
        renderAssetsGrid();
      });
    });

    // Folder selector
    const folderSelect = document.getElementById('media-folder-select');
    if (folderSelect) {
      folderSelect.addEventListener('change', (e) => {
        currentFolder = e.target.value;
        renderAssetsGrid();
      });
    }

    // Search bar
    const searchInput = document.getElementById('media-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderAssetsGrid();
      });
    }

    // Upload button
    const uploadBtn = document.getElementById('btn-upload-media');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', openUploadModal);
    }

    // Form upload submit
    const uploadForm = document.getElementById('form-upload-media');
    if (uploadForm) {
      uploadForm.addEventListener('submit', handleUploadSubmit);
    }
  }

  function renderAssetsGrid() {
    const container = document.getElementById('media-assets-grid');
    if (!container) return;

    let assets = getAssets();
    const searchVal = (document.getElementById('media-search-input')?.value || '').toLowerCase();

    if (currentCategory !== 'all') {
      assets = assets.filter(a => a.file_type === currentCategory);
    }

    if (currentFolder !== 'all') {
      assets = assets.filter(a => a.folder === currentFolder);
    }

    if (searchVal) {
      assets = assets.filter(a =>
        a.title.toLowerCase().includes(searchVal) ||
        a.tags.some(t => t.toLowerCase().includes(searchVal))
      );
    }

    if (assets.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 48px; text-align: center; background: white; border-radius: 12px; border: 1px dashed var(--border-light);">
          <div style="font-size: 3rem; margin-bottom: 12px;">📂</div>
          <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 6px;">No assets found</h3>
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 16px;">
            Upload images, videos or documents to your media library.
          </p>
          <button class="btn btn-primary" onclick="document.getElementById('btn-upload-media')?.click()">
            <i data-feather="upload-cloud"></i> Upload New Media
          </button>
        </div>
      `;
      if (window.feather) feather.replace();
      return;
    }

    container.innerHTML = assets.map(asset => {
      let icon = 'image';
      if (asset.file_type === 'video') icon = 'video';
      else if (asset.file_type === 'document') icon = 'file-text';

      return `
        <div class="media-asset-card" style="background: white; border-radius: 10px; border: 1px solid var(--border-light); overflow: hidden; position: relative; transition: all 0.2s; display: flex; flex-direction: column;">
          <div style="position: relative; aspect-ratio: 16 / 9; background: #1e293b; overflow: hidden; display: flex; align-items: center; justify-content: center;">
            <img src="${asset.url}" alt="${asset.title}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
            <div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; background: var(--navy-50); color: var(--navy-600);">
              <i data-feather="${icon}" style="width: 32px; height: 32px;"></i>
            </div>
            <span class="badge" style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.65); color: white; text-transform: uppercase; font-size: 0.65rem;">
              ${asset.file_type}
            </span>
          </div>
          <div style="padding: 12px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="font-weight: 600; font-size: 0.875rem; color: var(--text-dark); margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${asset.title}">
                ${escapeHtml(asset.title)}
              </div>
              <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 8px;">
                <span>${asset.size}</span>
                <span>•</span>
                <span>${asset.dimensions}</span>
              </div>
            </div>
            <div style="margin-top: 10px; display: flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="window.NextBrightLibrary.copyUrl('${asset.url}')">
                <i data-feather="link"></i> Copy URL
              </button>
              <button class="btn btn-secondary btn-sm" style="color: var(--status-danger);" onclick="window.NextBrightLibrary.deleteAsset('${asset.id}')">
                <i data-feather="trash-2"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.feather) feather.replace();
  }

  function openUploadModal() {
    const modal = document.getElementById('modal-upload-media');
    if (modal) modal.style.display = 'flex';
  }

  function closeUploadModal() {
    const modal = document.getElementById('modal-upload-media');
    if (modal) modal.style.display = 'none';
  }

  function handleUploadSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('media-upload-title')?.value || 'New Uploaded Media';
    const type = document.getElementById('media-upload-type')?.value || 'image';
    const url = document.getElementById('media-upload-url')?.value || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800';
    const folder = document.getElementById('media-upload-folder')?.value || 'marketing';

    const assets = getAssets();
    const newAsset = {
      id: 'asset-' + Date.now(),
      title,
      file_type: type,
      url,
      size: '1.5 MB',
      dimensions: '1080 x 1080',
      folder,
      tags: [type, folder],
      created_at: new Date().toISOString()
    };

    assets.unshift(newAsset);
    saveAssets(assets);
    closeUploadModal();
    renderAssetsGrid();

    if (window.showToast) window.showToast('Asset uploaded to library!', 'success');
  }

  function copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
      if (window.showToast) window.showToast('Media URL copied to clipboard!', 'info');
    }).catch(() => {
      prompt('Copy URL:', url);
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
    closeModal: closeUploadModal
  };

  document.addEventListener('DOMContentLoaded', () => {
    initContentLibrary();
  });
})();
