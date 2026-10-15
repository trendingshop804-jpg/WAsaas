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
      leads: [], customers: [], deals: {}, calls: [], conversations: [],
      activityFeed: [], tasks: [], appointments: []
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
    if (title) title.textContent = `Good Morning, ${name} ??`;
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
    const metrics = {
      'Total Leads': (data.leads || []).length,
      'Customers': (data.leads || []).filter(lead => ['Won', 'Converted'].includes(lead.status)).length,
      'Calls Made': (data.calls || []).length,
      'Messages Sent': (data.conversations || []).reduce((total, conversation) => total + (conversation.messages || []).filter(message => (message.dir || message.direction) === 'out').length, 0),
      'Appointments': (data.appointments || []).length
    };
    document.querySelectorAll('.kpi-card').forEach(card => {
      const label = card.querySelector('.kpi-label')?.textContent?.trim();
      if (!(label in metrics)) return;
      const value = card.querySelector('.kpi-value');
      const trend = card.querySelector('.kpi-trend');
      const sub = card.querySelector('.kpi-sub');
      if (value) value.textContent = String(metrics[label]);
      if (trend) trend.style.display = 'none';
      if (sub) sub.textContent = 'Current organization';
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

  async function loadWorkspace(session, authUser) {
    emptyWorkspace();
    removeSetupCard();
    if (!session || !authUser) {
      activeScope = null;
      updateIdentity({ setupRequired: false, user: null, role: 'Signed out' }, null);
      return;
    }
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
      const [leadsPayload, tasksPayload, messagesPayload] = await Promise.all([
        requestJson('/api/leads?limit=200', epoch),
        requestJson('/api/tasks?show=all', epoch),
        requestJson('/api/messages?limit=500', epoch)
      ]);
      if (epoch !== loadEpoch || activeScope !== scope) return;
      window.NB.leads = (leadsPayload.leads || []).map(mapLead);
      window.NB.tasks = (tasksPayload.tasks || []).map(mapTask);
      window.NB.conversations = (messagesPayload.conversations || []).map(mapConversation);
      window.renderRecentLeads?.();
      window.renderLeadsTable?.();
      window.renderKanban?.();
      window.renderTodayTasks?.();
      window.renderFullTasks?.();
      window.renderFunnel?.();
      window.renderConversationList?.();
      updateDashboardMetrics();
      removeSetupCard();
    } catch (error) {
      if (error.name === 'AbortError' || epoch !== loadEpoch) return;
      emptyWorkspace();
      if (error.status === 401) window.NB_AUTH.showOverlay();
      if (error.status === 403) showSetupCard(authUser);
      else window.showToast?.(error.message || 'Could not load workspace data.', 'error');
    }
  }

  window.NB_AUTH.onAuthChange((session, user) => { loadWorkspace(session, user); });
  document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('sb-signout-btn')?.addEventListener('click', () => window.NB_AUTH.signOut());
    const { session, user } = await window.NB_AUTH.requireSession();
    await loadWorkspace(session, user);
  });
})();