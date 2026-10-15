/* Load only records returned by authenticated, tenant-scoped APIs. */
(function () {
  'use strict';
  let epoch = 0;
  let controllers = [];

  function clearWorkspace() {
    epoch += 1;
    controllers.forEach(controller => controller.abort());
    controllers = [];
    Object.assign(window.NB, { leads: [], customers: [], deals: {}, calls: [], conversations: [], activityFeed: [], tasks: [], appointments: [] });
    window.appState?.clear();
    ['recent-leads-tbody', 'leads-table-tbody'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.innerHTML = '<tr><td colspan="9">Sign in to load your workspace.</td></tr>';
    });
  }

  function mapLead(lead) { return { ...lead, name: lead.contact_name || lead.name || 'Unnamed lead', company: lead.company_name || '', assigned: lead.assigned_agent_name || 'Unassigned', date: lead.created_at || '', lastActivity: lead.updated_at || '' }; }
  function mapConversation(conversation) { return { ...conversation, name: conversation.contact_name || conversation.lead_name || conversation.sender_number || 'Unknown contact', phone: conversation.sender_number || conversation.phone || '', messages: conversation.messages || [] }; }
  async function request(path, requestEpoch) {
    const controller = new AbortController();
    controllers.push(controller);
    const response = await window.apiClient.authenticatedFetch(path, { signal: controller.signal });
    if (requestEpoch !== epoch) return null;
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(payload.message || payload.error || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  async function loadWorkspace(detail) {
    clearWorkspace();
    if (!detail?.user) return;
    if (!detail.organization) {
      document.querySelectorAll('.user-role').forEach(node => { node.textContent = 'Complete business setup'; });
      return;
    }
    const requestEpoch = epoch;
    window.appState.configureScope({ userId: detail.user.id, organization: detail.organization });
    document.querySelectorAll('.user-role').forEach(node => { node.textContent = detail.role || 'Member'; });
    try {
      const [leads, tasks, inbox] = await Promise.all([
        request('/api/leads?limit=200', requestEpoch),
        request('/api/tasks?show=all', requestEpoch),
        request('/api/messages?limit=200&channel=whatsapp', requestEpoch)
      ]);
      if (requestEpoch !== epoch) return;
      window.NB.leads = (leads?.leads || []).map(mapLead);
      window.NB.tasks = tasks?.tasks || [];
      window.NB.conversations = (inbox?.conversations || []).map(mapConversation);
      window.appState.set('leads', window.NB.leads);
      window.appState.set('tasks', window.NB.tasks);
      window.appState.set('conversations', window.NB.conversations);
      window.renderRecentLeads?.(); window.renderLeadsTable?.(); window.renderTodayTasks?.(); window.renderFullTasks?.();
    } catch (error) {
      if (error.name === 'AbortError' || requestEpoch !== epoch) return;
      clearWorkspace();
      const message = error.status === 403 ? 'Workspace setup or access is required.' : 'Unable to load workspace data.';
      document.querySelectorAll('.user-role').forEach(node => { node.textContent = message; });
      window.showToast?.(message, 'error');
    }
  }
  window.addEventListener('nb:workspace', event => { loadWorkspace(event.detail); });
  window.apiClient?.onAuthEvent?.(event => { if (['auth-required', 'unauthorized', 'forbidden'].includes(event.type)) clearWorkspace(); });
})();