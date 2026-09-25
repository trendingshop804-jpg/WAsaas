/* ============================================================
   ADMIN.JS — Master Admin Control Center JS Controller
   ============================================================ */
'use strict';

let adminCompanies = [];
let overviewChart = null;

const defaultCompanies = [
  { id: 'org-abc-dental', name: 'ABC Dental Clinic', owner: 'Dr. Anita Sharma', email: 'anita@abcdental.com', phone: '+91 98765 11111', businessType: 'Dental Clinic', plan: 'Professional', status: 'active', usersCount: 5, messagesCount: 8430, aiRequests: 320 },
  { id: 'org-xyz-garage', name: 'XYZ Car Service & Garage', owner: 'Vikram Singh', email: 'vikram@xyzgarage.com', phone: '+91 98765 22222', businessType: 'Garage', plan: 'Growth', status: 'active', usersCount: 3, messagesCount: 4120, aiRequests: 180 },
  { id: 'org-glow-salon', name: 'Glow Beauty Salon', owner: 'Meera Kapoor', email: 'meera@glowsalon.com', phone: '+91 98765 33333', businessType: 'Salon', plan: 'Starter', status: 'trial', usersCount: 2, messagesCount: 1450, aiRequests: 45 }
];

/* ---- Navigation & View Switching ---- */
const adminViewMeta = {
  plans: {
    title: 'Plans & Limits',
    subtitle: 'Configure subscription tiers, usage limits, and platform entitlements.',
    icon: 'layers'
  },
  'whatsapp-mon': {
    title: 'WhatsApp Monitor',
    subtitle: 'Live Meta Cloud API delivery, webhook, and message throughput status.',
    icon: 'message-circle'
  },
  'instagram-mon': {
    title: 'Instagram Monitor',
    subtitle: 'Monitor professional account connections and DM/comment automations.',
    icon: 'instagram'
  },
  'calls-mon': {
    title: 'Calls Monitor',
    subtitle: 'Track voice provider health, recordings, and call delivery events.',
    icon: 'phone-call'
  },
  'webhook-logs': {
    title: 'Webhook Logs',
    subtitle: 'Inspect recent inbound and outbound webhook deliveries.',
    icon: 'terminal'
  },
  'audit-logs': {
    title: 'Audit Trail',
    subtitle: 'Review privileged actions and platform configuration changes.',
    icon: 'shield'
  }
};

function ensureAdminPanel(viewId) {
  const existing = document.getElementById('admin-view-' + viewId);
  if (existing) return existing;

  const meta = adminViewMeta[viewId] || {
    title: viewId.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase()),
    subtitle: 'This admin module is ready for configuration.',
    icon: 'sliders'
  };
  const panel = document.createElement('section');
  panel.className = 'admin-panel';
  panel.id = 'admin-view-' + viewId;
  panel.innerHTML = `
    <div class="panel-hero">
      <div>
        <h1 class="panel-title">${meta.title}</h1>
        <p class="panel-sub">${meta.subtitle}</p>
      </div>
      <span class="badge badge-warning"><i data-feather="${meta.icon}"></i>&nbsp; Checking...</span>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">${meta.title} status</div></div>
      <div class="status-list">
        <div class="status-item">
          <div class="status-left"><span class="status-dot green"></span><div><strong>Module connection</strong><span class="muted">Configuration loaded and ready</span></div></div>
          <span class="badge badge-warning">Not checked</span>
        </div>
        <div class="status-item">
          <div class="status-left"><span class="status-dot green"></span><div><strong>Latest event</strong><span class="muted">No errors reported in the current session</span></div></div>
          <span class="badge badge-warning">Not checked</span>
        </div>
      </div>
    </div>
  `;
  document.querySelector('.admin-content')?.appendChild(panel);
  if (typeof feather !== 'undefined') feather.replace();
  return panel;
}

function switchAdminView(viewId, updateHash = true) {
  const safeView = viewId || 'overview';
  const target = ensureAdminPanel(safeView);

  document.querySelectorAll('.admin-panel').forEach(panel => panel.classList.remove('active'));
  target.classList.add('active');

  document.querySelectorAll('.admin-nav .nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.adminView === safeView);
  });

  if (updateHash && window.location.hash !== '#' + safeView) {
    window.history.replaceState(null, '', '#' + safeView);
  }
}
window.switchAdminView = switchAdminView;

const ADMIN_ROUTE_ALIASES = {
  overview: 'overview',
  companies: 'companies',
  features: 'features',
  plans: 'plans',
  'whatsapp-mon': 'whatsapp-mon',
  'whatsapp-monitor': 'whatsapp-mon',
  'instagram-mon': 'instagram-mon',
  'instagram-monitor': 'instagram-mon',
  'insta-mon': 'instagram-mon',
  'calls-mon': 'calls-mon',
  'calls-monitor': 'calls-mon',
  'system-health': 'system-health',
  'webhook-logs': 'webhook-logs',
  'webhook-log': 'webhook-logs',
  'audit-logs': 'audit-logs',
  'audit-trail': 'audit-logs'
};

function getAdminRouteFromHash() {
  const raw = (window.location.hash || '').replace(/^#\/?/, '').trim().toLowerCase();
  return ADMIN_ROUTE_ALIASES[raw] || 'overview';
}

function renderCallsMonitor() {
  switchAdminView('calls-mon', false);
}
window.renderCallsMonitor = renderCallsMonitor;

function renderAdminRoute() {
  const route = getAdminRouteFromHash();
  if (route === 'calls-mon') {
    renderCallsMonitor();
  } else {
    switchAdminView(route, false);
  }
}
window.renderAdminRoute = renderAdminRoute;

function setAdminModuleStatus(panelId, info = {}) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const status = String(info.status || 'not_checked');
  const presentation = adminStatusPresentation(status);
  const heroBadge = panel.querySelector('.panel-hero .badge');
  if (heroBadge) {
    heroBadge.className = `badge ${presentation.badge}`;
    heroBadge.textContent = presentation.label;
    heroBadge.title = info.message || '';
  }
  setAdminStatusItem(panel.querySelector('.status-item'), info);
}

/* ---- Live integration health for the admin command center ---- */
const ADMIN_INTEGRATION_PANELS = {
  whatsapp: 'admin-view-whatsapp-mon',
  instagram: 'admin-view-instagram-mon',
  twilio: 'admin-view-calls-mon'
};
let adminHealthPromise = null;
let adminHealthTimer = null;

function adminStatusPresentation(status) {
  const presentations = {
    connected: { label: 'Connected', badge: 'badge-success', dot: 'green' },
    not_configured: { label: 'Not configured', badge: 'badge-warning', dot: 'yellow' },
    checking: { label: 'Checking...', badge: 'badge-warning', dot: 'yellow' },
    error: { label: 'Error', badge: 'badge-danger', dot: 'red' },
    unavailable: { label: 'Unavailable', badge: 'badge-danger', dot: 'red' },
    not_checked: { label: 'Not checked', badge: 'badge-warning', dot: 'yellow' }
  };
  return presentations[status] || presentations.unavailable;
}

function formatAdminCheckedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function setAdminStatusItem(item, info = {}) {
  if (!item) return;
  const status = String(info.status || 'unavailable');
  const presentation = adminStatusPresentation(status);
  const message = info.message || 'Live status has not been verified.';
  const checkedAt = formatAdminCheckedAt(info.checkedAt);
  const latencyMs = Number(info.latencyMs);
  const latencyText = Number.isFinite(latencyMs) && latencyMs >= 0 ? ` Latency ${Math.round(latencyMs)} ms.` : '';
  const suffix = checkedAt ? ` Checked ${checkedAt}.${latencyText}` : latencyText;
  const dot = item.querySelector('.status-dot');
  const detail = item.querySelector('.muted');
  const badge = item.querySelector('.badge');

  if (dot) dot.className = `status-dot ${presentation.dot}`;
  if (detail) {
    detail.textContent = `${message}${suffix}`;
    detail.title = message;
  }
  if (badge) {
    badge.className = `badge ${presentation.badge}`;
    badge.textContent = presentation.label;
    badge.title = message;
  }
}

function setAdminIntegrationStatus(key, info = {}) {
  const normalizedKey = key === 'calls' ? 'twilio' : key;
  const overviewIndex = { whatsapp: 0, instagram: 1, twilio: 2 };
  const overviewItems = document.querySelectorAll('#admin-view-overview .status-item');
  if (overviewIndex[normalizedKey] !== undefined) {
    setAdminStatusItem(overviewItems[overviewIndex[normalizedKey]], info);
  }

  const panelId = ADMIN_INTEGRATION_PANELS[normalizedKey];
  const panel = panelId ? document.getElementById(panelId) : null;
  if (panel) {
    const heroBadge = panel.querySelector('.panel-hero .badge');
    if (heroBadge) {
      const presentation = adminStatusPresentation(info.status);
      heroBadge.className = `badge ${presentation.badge}`;
      heroBadge.textContent = presentation.label;
      heroBadge.title = info.message || '';
    }
    setAdminStatusItem(panel.querySelector('.status-item'), info);
  }
}

function setAdminDatabaseStatus(database = {}) {
  const overviewItems = document.querySelectorAll('#admin-view-overview .status-item');
  setAdminStatusItem(overviewItems[3], {
    status: database.status || 'not_checked',
    message: database.message || 'Database health is not reported by this endpoint.',
    checkedAt: database.checkedAt
  });

  const latency = document.getElementById('admin-db-latency');
  if (latency) latency.textContent = Number.isFinite(database.latencyMs) ? `${database.latencyMs} ms` : '—';
  const apiLatency = document.getElementById('admin-api-latency');
  if (apiLatency) apiLatency.textContent = Number.isFinite(database.apiLatencyMs) ? `${database.apiLatencyMs} ms` : '—';
  const webhookRate = document.getElementById('admin-webhook-rate');
  if (webhookRate) webhookRate.textContent = Number.isFinite(database.webhookSuccessRate) ? `${database.webhookSuccessRate}%` : '—';
}

function renderAdminLiveIntegrationList(services = {}) {
  const list = document.getElementById('admin-live-integration-list');
  if (!list) return;
  list.innerHTML = '';
  const entries = [
    ['whatsapp', services.whatsapp || { status: 'unavailable', message: 'Waiting for provider status.' }],
    ['instagram', services.instagram || { status: 'unavailable', message: 'Waiting for provider status.' }],
    ['twilio', services.calls || services.twilio || { status: 'unavailable', message: 'Waiting for provider status.' }],
    ['stripe', services.stripe || { status: 'unavailable', message: 'Waiting for provider status.' }]
  ];

  entries.forEach(([key, info]) => {
    const item = document.createElement('div');
    item.className = 'status-item';
    item.dataset.adminIntegration = key;
    const left = document.createElement('div');
    left.className = 'status-left';
    const dot = document.createElement('span');
    dot.className = 'status-dot yellow';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    const labels = { whatsapp: 'WhatsApp Cloud API', instagram: 'Instagram Graph API', twilio: 'Twilio Voice', stripe: 'Stripe Payments' };
    title.textContent = labels[key];
    const detail = document.createElement('span');
    detail.className = 'muted';
    detail.textContent = info.message || 'Waiting for provider status.';
    copy.append(title, detail);
    left.append(dot, copy);
    const badge = document.createElement('span');
    badge.className = 'badge badge-warning';
    badge.textContent = 'Checking...';
    item.append(left, badge);
    list.appendChild(item);
    setAdminStatusItem(item, info);
  });
}

function setAdminLastChecked(value) {
  const element = document.getElementById('admin-health-last-checked');
  if (!element) return;
  const checkedAt = formatAdminCheckedAt(value);
  element.textContent = checkedAt ? `Last checked ${checkedAt}` : 'Waiting for server check...';
}

async function loadAdminHealth() {
  if (adminHealthPromise) return adminHealthPromise;
  adminHealthPromise = (async () => {
    try {
      const response = await fetch('/api/admin-system', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Health API returned HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload.success || !payload.health) throw new Error('Health API returned an invalid response');
      const health = payload.health;
      const services = health.services || {};
      ['whatsapp', 'instagram', 'twilio', 'stripe'].forEach(key => {
        const info = key === 'twilio' ? (services.calls || services.twilio) : services[key];
        setAdminIntegrationStatus(key, info || { status: 'unavailable', message: 'No status returned by the server.' });
      });
      setAdminDatabaseStatus(health.database || {});
      renderAdminLiveIntegrationList(services);
      setAdminLastChecked(health.checkedAt);
      return payload;
    } catch (error) {
      const unavailable = {
        status: 'unavailable',
        message: 'Live status API is unavailable. Start the API server and configure provider secrets on the server.',
        checkedAt: new Date().toISOString()
      };
      ['whatsapp', 'instagram', 'twilio', 'stripe'].forEach(key => setAdminIntegrationStatus(key, unavailable));
      renderAdminLiveIntegrationList({ whatsapp: unavailable, instagram: unavailable, calls: unavailable, stripe: unavailable });
      setAdminDatabaseStatus({ status: 'not_checked', message: unavailable.message });
      setAdminLastChecked(unavailable.checkedAt);
      console.warn('[Admin Health]', error.message);
      return null;
    } finally {
      adminHealthPromise = null;
    }
  })();
  return adminHealthPromise;
}

function initAdminLiveStatus() {
  if (adminHealthTimer) return;
  ['whatsapp', 'instagram', 'twilio'].forEach(key => {
    setAdminIntegrationStatus(key, { status: 'checking', message: 'Checking live provider connection...' });
  });
  ['admin-view-plans', 'admin-view-webhook-logs', 'admin-view-audit-logs'].forEach(panelId => {
    setAdminModuleStatus(panelId, {
      status: 'not_checked',
      message: 'No live data source is configured for this module.'
    });
  });
  loadAdminHealth();
  adminHealthTimer = window.setInterval(loadAdminHealth, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadAdminHealth();
  });
  window.addEventListener('online', loadAdminHealth);
}

window.loadAdminHealth = loadAdminHealth;
window.initAdminLiveStatus = initAdminLiveStatus;

/* ---- Fetch Companies & Render Table ---- */
async function loadAdminCompanies() {
  try {
    const res = await fetch('/api/admin-companies');
    const data = await res.json();
    if (data.success && data.companies && data.companies.length > 0) {
      adminCompanies = data.companies;
      renderCompaniesTable(adminCompanies);
      updateKPIs(adminCompanies);
      return;
    }
  } catch (err) {
    console.warn('API fetch fallback to memory companies');
  }

  if (adminCompanies.length === 0) {
    adminCompanies = [...defaultCompanies];
  }
  renderCompaniesTable(adminCompanies);
  updateKPIs(adminCompanies);
}

function renderCompaniesTable(companies) {
  const tbody = document.getElementById('companies-table-tbody');
  if (!tbody) return;

  if (!companies || companies.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--admin-text-muted);padding:24px;">No companies match the selected filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = companies.map(c => `
    <tr>
      <td>
        <strong style="font-size:0.875rem;">${c.name}</strong>
        <div style="font-size:0.6875rem;color:var(--admin-text-muted)">ID: ${c.id}</div>
      </td>
      <td><span class="badge" style="background:rgba(255,255,255,0.08);color:#CBD5E1">${c.businessType || 'General'}</span></td>
      <td>
        <div>${c.owner || 'Admin'}</div>
        <div style="font-size:0.6875rem;color:var(--admin-text-muted)">${c.email || 'admin@company.com'}</div>
      </td>
      <td><span class="badge badge-warning">${c.plan || 'Starter'}</span></td>
      <td>
        <span class="badge ${c.status === 'active' ? 'badge-success' : c.status === 'trial' ? 'badge-warning' : 'badge-danger'}">
          ${(c.status || 'active').toUpperCase()}
        </span>
      </td>
      <td>${c.usersCount || 1}</td>
      <td>${(c.messagesCount || 0).toLocaleString()}</td>
      <td>${c.aiRequests || 0}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="toggleCompanyStatus('${c.id}')" title="Toggle Active/Suspended">
          ${c.status === 'active' ? 'Suspend' : 'Activate'}
        </button>
      </td>
    </tr>
  `).join('');
}

function updateKPIs(companies) {
  const kpiEl = document.getElementById('kpi-companies');
  const badgeEl = document.getElementById('badge-total-companies');
  if (kpiEl) kpiEl.textContent = companies.length;
  if (badgeEl) badgeEl.textContent = companies.length;
}

/* ---- Toggle Status Action ---- */
async function toggleCompanyStatus(companyId) {
  const target = adminCompanies.find(c => c.id === companyId);
  if (target) {
    target.status = target.status === 'active' ? 'suspended' : 'active';
    renderCompaniesTable(adminCompanies);
    updateKPIs(adminCompanies);
  }

  try {
    await fetch('/api/admin-companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_status', companyId })
    });
  } catch (err) {}
}
window.toggleCompanyStatus = toggleCompanyStatus;

/* ---- Create Company Modal ---- */
function initCompanyModal() {
  const modal = document.getElementById('modal-company');
  const openBtn = document.getElementById('btn-create-company');
  const closeBtn = document.getElementById('modal-company-close');
  const cancelBtn = document.getElementById('mc-cancel');
  const saveBtn = document.getElementById('mc-save');

  if (!modal) return;

  const open = () => modal.classList.add('open');
  const close = () => modal.classList.remove('open');

  if (openBtn) openBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (cancelBtn) cancelBtn.addEventListener('click', close);

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const name = document.getElementById('mc-name').value.trim();
      const owner = document.getElementById('mc-owner').value.trim();
      const email = document.getElementById('mc-email').value.trim();
      const businessType = document.getElementById('mc-type').value;
      const plan = document.getElementById('mc-plan').value;

      if (!name) { alert('Please enter company name'); return; }

      const newComp = {
        id: `org-${Date.now()}`,
        name,
        owner: owner || 'Admin User',
        email: email || 'admin@company.com',
        businessType,
        plan,
        status: 'active',
        usersCount: 1,
        messagesCount: 0,
        aiRequests: 0
      };

      adminCompanies.unshift(newComp);
      renderCompaniesTable(adminCompanies);
      updateKPIs(adminCompanies);

      close();
      document.getElementById('mc-name').value = '';
      document.getElementById('mc-owner').value = '';
      document.getElementById('mc-email').value = '';

      try {
        await fetch('/api/admin-companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', newCompany: newComp })
        });
      } catch (err) {}
    });
  }
}

/* ---- Overview Chart ---- */
function initOverviewChart() {
  const ctx = document.getElementById('admin-overview-chart');
  if (!ctx || typeof Chart === 'undefined') return;

  overviewChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [
        {
          label: 'Revenue (₹)',
          data: [110000, 125000, 148000, 162000, 175000, 184000],
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'Messages Volume (K)',
          data: [65, 82, 98, 115, 130, 142],
          borderColor: '#10B981',
          backgroundColor: 'transparent',
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94A3B8', font: { family: 'Inter', size: 11 } } }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } }
      }
    }
  });
}

/* ---- Init ---- */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.admin-nav .nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      switchAdminView(item.dataset.adminView);
    });
  });

  renderAdminRoute();
  window.addEventListener('hashchange', renderAdminRoute);

  initCompanyModal();
  loadAdminCompanies();
  initOverviewChart();
  initAdminLiveStatus();

  const refreshBtn = document.getElementById('btn-refresh-health');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      loadAdminCompanies();
      const result = await loadAdminHealth();
      alert(result ? 'Live health refreshed.' : 'Live health API is unavailable.');
    });
  }

  if (typeof feather !== 'undefined') feather.replace();
});
