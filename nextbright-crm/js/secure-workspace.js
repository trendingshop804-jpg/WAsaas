/* Tenant-safe bridge for the restored full CRM interface. */
(function () {
  'use strict';

  let loadEpoch = 0;
  let activeControllers = [];
  let activeScope = null;

  const APP_CACHE_PREFIXES = ['nb_', 'nl_', 'nextbright_', 'nexuslead_'];
  const SCOPE_KEY = 'nextbright:local-cache-scope';

  function clearLegacyCaches() {
    for (const key of Object.keys(localStorage)) {
      if (APP_CACHE_PREFIXES.some(prefix => key.startsWith(prefix))) localStorage.removeItem(key);
    }
    for (const key of Object.keys(sessionStorage)) {
      if (APP_CACHE_PREFIXES.some(prefix => key.startsWith(prefix))) sessionStorage.removeItem(key);
    }
  }

  function emptyWorkspace() {
    loadEpoch += 1;
    activeControllers.forEach(controller => controller.abort());
    activeControllers = [];
    const data = window.NB = window.NB || {};
    Object.assign(data, {
      leads: [], customers: [], deals: [], calls: [], conversations: [],
      activityFeed: [], tasks: [], appointments: [],
      dealsStorageAvailable: undefined,
      appointmentsStorageAvailable: undefined,
      loadState: { leads: 'loading', tasks: 'loading', messages: 'loading', deals: 'loading', appointments: 'loading' }
    });
    window.renderRecentLeads?.();
    window.renderLeadsTable?.();
    window.renderKanban?.();
    window.renderCustomers?.();
    window.renderDeals?.();
    window.renderCalls?.();
    window.renderActivityFeed?.();
    window.renderTodayTasks?.();
    window.renderFullTasks?.();
    window.renderAppointments?.();
    window.renderFunnel?.();
    window.renderConversationList?.();
    window.renderCalendar?.();
    window.renderReports?.();
    const messages = document.getElementById('conv-messages');
    if (messages) messages.innerHTML = '<div class="empty-state">No conversations for this organization.</div>';
    updateDashboardMetrics();
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(node => { node.textContent = value; });
  }

  function displayName(context, authUser) {
    const profileName = String(context?.user?.name || '').trim();
    const metadataName = String(authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || '').trim();
    const emailName = String(context?.user?.email || authUser?.email || '').split('@')[0];
    return profileName || metadataName || emailName || 'Signed-in user';
  }

  function updateIdentity(context, authUser) {
    const name = displayName(context, authUser);
    const role = context?.role || (context?.setupRequired ? 'Complete business setup' : 'Member');
    const organizationName = context?.organization?.name || 'Complete business setup';
    const initials = name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?';
    setText('#sb-user-name', name);
    setText('.user-role', role);
    setText('#sb-workspace', organizationName);
    setText('.workspace-avatar, .user-ava, .topbar-avatar-initials', initials);
    setText('.topbar-profile-copy strong', name);
    setText('.topbar-profile-copy small, .topbar-workspace-sel span', role);
    const title = document.querySelector('.dashboard-welcome-copy .page-title');
    if (title) {
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      title.textContent = `${greeting}, ${name}`;
    }
    const profileName = document.getElementById('set-prof-name');
    if (profileName) profileName.value = name;
    const workspaceName = document.getElementById('set-ws-name');
    if (workspaceName) workspaceName.value = context?.organization?.name || '';
    const profileEmail = document.getElementById('set-prof-email');
    if (profileEmail) profileEmail.value = context?.user?.email || authUser?.email || '';
    const profileRole = document.getElementById('set-prof-role');
    if (profileRole) profileRole.value = role;
    const teamName = document.getElementById('team-current-name');
    if (teamName) teamName.textContent = name;
    const teamEmail = document.getElementById('team-current-email');
    if (teamEmail) teamEmail.textContent = context?.user?.email || authUser?.email || '';
    const teamRole = document.getElementById('team-current-role');
    if (teamRole) teamRole.textContent = role;
    const profileModal = document.getElementById('modal-profile');
    if (profileModal) {
      const heading = profileModal.querySelector('strong');
      const subtitle = heading?.nextElementSibling;
      if (heading) heading.textContent = name;
      if (subtitle) subtitle.textContent = role;
    }
  }

  function updateDashboardMetrics() {
    const data = window.NB || {};
    const state = data.loadState || {};

    // '—' means the number is unknown (still loading, or the source is not
    // available). It is never replaced by an invented figure.
    const metrics = {
      'Total Leads': {
        stateName: state.leads,
        value: () => (data.leads || []).length,
        sub: 'Current organization'
      },
      'Customers': {
        stateName: state.leads,
        value: () => (data.customers || []).length,
        sub: 'Won or Converted leads'
      },
      'Calls Made': {
        stateName: 'untracked',
        value: () => null,
        sub: 'Call log is not tracked yet'
      },
      'Messages Sent': {
        stateName: state.messages,
        value: () => (data.conversations || []).reduce((total, conversation) => total + (conversation.messages || []).filter(message => (message.dir || message.direction) === 'out' || message.direction === 'outbound').length, 0),
        sub: 'Outbound messages'
      },
      'Appointments': {
        stateName: state.appointments,
        value: () => (data.appointments || []).length,
        sub: 'Scheduled appointments',
        unavailableSub: 'Appointments storage is not enabled yet'
      }
    };

    document.querySelectorAll('.kpi-card').forEach(card => {
      const label = card.querySelector('.kpi-label')?.textContent?.trim();
      if (!(label in metrics)) return;
      const metric = metrics[label];
      const value = card.querySelector('.kpi-value');
      const trend = card.querySelector('.kpi-trend');
      const sub = card.querySelector('.kpi-sub');
      const ready = metric.stateName === 'ready';
      const loading = metric.stateName === 'loading';
      if (value) {
        if (loading) value.textContent = '…';
        else if (!ready) value.textContent = '—';
        else value.textContent = String(metric.value());
      }
      if (trend) trend.style.display = 'none';
      if (sub) {
        if (loading) sub.textContent = 'Loading organization data…';
        else if (metric.stateName === 'untracked') sub.textContent = metric.sub;
        else if (metric.stateName === 'unavailable') sub.textContent = metric.unavailableSub || 'Not enabled for this workspace';
        else if (!ready) sub.textContent = 'Could not load organization data';
        else sub.textContent = metric.sub;
      }
    });
  }
  window.updateWorkspaceMetrics = updateDashboardMetrics;

  /* Customers are derived from persisted leads marked Won/Converted — the same
     records the Customers KPI counts, so both views always agree. */
  function deriveCustomers(leads) {
    return leads
      .filter(lead => ['Won', 'Converted'].includes(lead.status))
      .map(lead => {
        const revenue = lead.custom_fields && lead.custom_fields.revenue;
        return {
          id: lead.id,
          name: lead.name,
          phone: lead.phone || '',
          company: lead.company || '',
          revenue: revenue ? window.formatINR ? window.formatINR(Number(revenue)) : `₹${revenue}` : '—',
          assigned: lead.assigned || 'Unassigned',
          lastContact: lead.updated_at ? new Date(lead.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
        };
      });
  }

  function mapLead(lead) {
    return {
      ...lead,
      name: lead.contact_name || lead.name || 'Unnamed lead',
      company: lead.company_name || lead.company || '',
      assigned: lead.assigned_agent_name || 'Unassigned',
      lastActivity: lead.updated_at ? new Date(lead.updated_at).toLocaleString() : '',
      date: lead.created_at ? new Date(lead.created_at).toLocaleDateString() : ''
    };
  }

  function mapTask(task) {
    return {
      ...task,
      text: task.title || task.notes || 'Follow-up task',
      date: task.due_at || '',
      time: task.due_at ? new Date(task.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      done: Boolean(task.completed_at),
      priority: task.priority || 'Normal'
    };
  }

  function mapConversation(conversation) {
    return {
      ...conversation,
      id: conversation.id || conversation.key,
      key: conversation.key || conversation.id,
      name: conversation.name || conversation.sender_number || 'Unknown contact',
      phone: conversation.phone || conversation.sender_number || '',
      initials: conversation.initials || window.NB.initials(conversation.name || conversation.sender_number || '?'),
      messages: (conversation.messages || []).map(message => ({
        ...message,
        dir: message.dir || (message.direction === 'outbound' ? 'out' : 'in'),
        text: message.text || message.content || '',
        messageType: message.messageType || message.message_type || 'text',
        mediaUrl: message.mediaUrl || message.media_url || null
      }))
    };
  }

  async function requestJson(path, epoch) {
    const controller = new AbortController();
    activeControllers.push(controller);
    const response = await window.NB_AUTH.apiFetch(path, { cache: 'no-store', signal: controller.signal });
    if (epoch !== loadEpoch) throw new DOMException('Stale request', 'AbortError');
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || payload.error || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function removeSetupCard() {
    document.getElementById('workspace-setup-required')?.remove();
  }

  function showSetupCard(authUser) {
    removeSetupCard();
    updateIdentity({ setupRequired: true, user: { email: authUser?.email } }, authUser);
    const host = document.querySelector('.content-area');
    if (!host) return;
    const card = document.createElement('section');
    card.id = 'workspace-setup-required';
    card.style.cssText = 'margin:18px;padding:24px;border:1px solid #bfdbfe;border-radius:14px;background:#eff6ff;color:#172554;position:relative;z-index:20';
    card.innerHTML = '<h2 style="margin:0 0 8px">Complete business setup</h2><p style="margin:0 0 16px">This account is not linked to any organization. Create a separate workspace to continue.</p><button class="btn btn-primary" id="complete-workspace-setup">Create organization</button>';
    host.prepend(card);
    card.querySelector('#complete-workspace-setup').addEventListener('click', async () => {
      const organizationName = window.prompt('Enter your business or organization name');
      if (!organizationName?.trim()) return;
      const button = card.querySelector('button');
      button.disabled = true;
      try {
        const response = await window.NB_AUTH.apiFetch('/api/onboarding', { method: 'POST', body: JSON.stringify({ organizationName: organizationName.trim() }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok && response.status !== 409) throw new Error(payload.error || 'Could not create organization.');
        const client = await window.NB_AUTH.getClient();
        const { data } = await client.auth.getSession();
        await loadWorkspace(data?.session || null, data?.session?.user || authUser);
      } catch (error) {
        window.showToast?.(error.message, 'error');
      } finally {
        button.disabled = false;
      }
    });
  }

  function mapAppointment(appointment) {
    return {
      ...appointment,
      title: appointment.title || 'Appointment',
      customer_name: appointment.customer_name || '',
      starts_at: appointment.starts_at || null
    };
  }

  async function loadWorkspace(session, authUser) {
    emptyWorkspace();
    removeSetupCard();
    if (!session || !authUser) {
      activeScope = null;
      lastSession = null; lastUser = null;
      updateIdentity({ setupRequired: false, user: null, role: 'Signed out' }, null);
      return;
    }
    lastSession = session; lastUser = authUser;
    const epoch = loadEpoch;
    try {
      const context = await requestJson('/api/leads?route=workspace', epoch);
      if (context.setupRequired || !context.organization) {
        clearLegacyCaches();
        localStorage.removeItem(SCOPE_KEY);
        showSetupCard(authUser);
        return;
      }
      const scope = `${authUser.id}:${context.organization.id}`;
      const previousScope = localStorage.getItem(SCOPE_KEY);
      if (previousScope !== scope) {
        clearLegacyCaches();
        localStorage.setItem(SCOPE_KEY, scope);
        sessionStorage.setItem('nextbright:scope-ready', scope);
        window.location.reload();
        return;
      }
      activeScope = scope;
      updateIdentity(context, authUser);

      const [leadsResult, tasksResult, messagesResult, dealsResult, appointmentsResult] = await Promise.allSettled([
        requestJson('/api/leads?limit=200', epoch),
        requestJson('/api/tasks?show=all', epoch),
        requestJson('/api/messages?limit=500', epoch),
        requestJson('/api/deals?limit=200', epoch),
        requestJson('/api/appointments?limit=200', epoch)
      ]);
      if (epoch !== loadEpoch || activeScope !== scope) return;

      const loadState = window.NB.loadState = window.NB.loadState || {};
      const failures = [];

      if (leadsResult.status === 'fulfilled') {
        window.NB.leads = (leadsResult.value.leads || []).map(mapLead);
        window.NB.customers = deriveCustomers(window.NB.leads);
        loadState.leads = 'ready';
      } else {
        loadState.leads = 'error';
        failures.push(leadsResult.reason);
      }

      if (tasksResult.status === 'fulfilled') {
        window.NB.tasks = (tasksResult.value.tasks || []).map(mapTask);
        loadState.tasks = 'ready';
      } else {
        loadState.tasks = 'error';
        failures.push(tasksResult.reason);
      }

      if (messagesResult.status === 'fulfilled') {
        window.NB.conversations = (messagesResult.value.conversations || []).map(mapConversation);
        loadState.messages = 'ready';
      } else {
        loadState.messages = 'error';
        failures.push(messagesResult.reason);
      }

      if (dealsResult.status === 'fulfilled') {
        window.NB.deals = dealsResult.value.deals || [];
        window.NB.dealsStorageAvailable = true;
        loadState.deals = 'ready';
      } else {
        const reason = dealsResult.reason || {};
        // 503 = migration not applied; 404 = endpoint not deployed yet. Neither is
        // a data error, so both are shown as "storage not enabled" rather than a
        // failure toast.
        const storageMissing = reason.status === 503 || reason.status === 404;
        window.NB.deals = [];
        window.NB.dealsStorageAvailable = storageMissing ? false : undefined;
        loadState.deals = storageMissing ? 'unavailable' : 'error';
        if (!storageMissing) failures.push(reason);
      }

      if (appointmentsResult.status === 'fulfilled') {
        window.NB.appointments = (appointmentsResult.value.appointments || []).map(mapAppointment);
        window.NB.appointmentsStorageAvailable = true;
        loadState.appointments = 'ready';
      } else {
        const reason = appointmentsResult.reason || {};
        const storageMissing = reason.status === 503 || reason.status === 404;
        window.NB.appointments = [];
        window.NB.appointmentsStorageAvailable = storageMissing ? false : undefined;
        loadState.appointments = storageMissing ? 'unavailable' : 'error';
        if (!storageMissing) failures.push(reason);
      }

      window.renderRecentLeads?.();
      window.renderLeadsTable?.();
      window.renderKanban?.();
      window.renderCustomers?.();
      window.renderDeals?.();
      window.renderTodayTasks?.();
      window.renderFullTasks?.();
      window.renderAppointments?.();
      window.renderFunnel?.();
      window.renderReports?.();
      window.renderCalendar?.();
      window.renderConversationList?.();
      window.refreshCRMCharts?.();
      updateDashboardMetrics();
      removeSetupCard();

      // Surface real failures instead of silently showing empty views. One broken
      // resource no longer wipes the data that did load.
      failures.forEach(error => {
        if (error?.status === 401) { window.NB_AUTH.showOverlay(); return; }
        window.showToast?.(error?.message || 'Could not load part of your workspace data.', 'error');
      });
    } catch (error) {
      if (error.name === 'AbortError' || epoch !== loadEpoch) return;
      if (error.status === 401) {
        emptyWorkspace();
        window.NB_AUTH.showOverlay();
        return;
      }
      if (error.status === 403) {
        showSetupCard(authUser);
        return;
      }
      window.NB.loadState = { leads: 'error', tasks: 'error', messages: 'error', deals: 'error', appointments: 'error' };
      updateDashboardMetrics();
      window.showToast?.(error.message || 'Could not load workspace data.', 'error');
    }
  }

  let lastSession = null;
  let lastUser = null;
  window.NB_WORKSPACE = {
    reload: () => loadWorkspace(lastSession, lastUser)
  };

  window.NB_AUTH.onAuthChange((session, user) => { loadWorkspace(session, user); });
  document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('sb-signout-btn')?.addEventListener('click', () => window.NB_AUTH.signOut());
    const { session, user } = await window.NB_AUTH.requireSession();
    await loadWorkspace(session, user);
  });
})();