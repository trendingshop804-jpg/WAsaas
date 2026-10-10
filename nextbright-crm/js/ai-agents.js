/* =============================================================================
   ai-agents.js — NextBright CRM
   AI Reply Agents Management Dashboard, Handover & Settings
   ============================================================================= */

'use strict';

(function () {
  const DEFAULT_AGENTS = [
    {
      id: 'agent-1',
      name: 'Sales & Support Assistant',
      channels: ['instagram', 'whatsapp'],
      business_name: 'NextBright CRM',
      language: 'en',
      tone: 'Professional',
      system_instructions: 'You are an AI sales executive for NextBright. Assist customers with pricing, product features, and booking demo sessions.',
      status: 'active',
      working_hours: { enabled: false, start: '09:00', end: '18:00', timezone: 'UTC' },
      auto_reply_enabled: true,
      confidence_threshold: 0.75,
      max_replies_per_conversation: 10,
      handover_on_low_confidence: true,
      handover_keywords: ['human', 'agent', 'person', 'representative', 'support', 'help'],
      lead_qualification_enabled: true,
      appointment_assistant_enabled: true,
      created_at: new Date(Date.now() - 86400000 * 7).toISOString()
    },
    {
      id: 'agent-2',
      name: 'Instagram DM Lead Qualifier',
      channels: ['instagram'],
      business_name: 'NextBright Social',
      language: 'en',
      tone: 'Sales-focused',
      system_instructions: 'Qualify inbound Instagram DMs by asking for their business name, team size, and main CRM requirement.',
      status: 'active',
      working_hours: { enabled: true, start: '08:00', end: '20:00', timezone: 'EST' },
      auto_reply_enabled: true,
      confidence_threshold: 0.80,
      max_replies_per_conversation: 5,
      handover_on_low_confidence: true,
      handover_keywords: ['human', 'pricing'],
      lead_qualification_enabled: true,
      appointment_assistant_enabled: false,
      created_at: new Date(Date.now() - 86400000 * 3).toISOString()
    }
  ];

  function getAgents() {
    try {
      const stored = localStorage.getItem('nb_ai_agents');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    localStorage.setItem('nb_ai_agents', JSON.stringify(DEFAULT_AGENTS));
    return DEFAULT_AGENTS;
  }

  function saveAgents(agents) {
    try {
      localStorage.setItem('nb_ai_agents', JSON.stringify(agents));
    } catch (e) {}
  }

  function initAIAgents() {
    renderAgentsGrid();
    renderReplyLogs();
    setupEventListeners();
  }

  function setupEventListeners() {
    const createBtn = document.getElementById('btn-create-ai-agent');
    if (createBtn) {
      createBtn.addEventListener('click', openCreateAgentModal);
    }

    const form = document.getElementById('form-create-ai-agent');
    if (form) {
      form.addEventListener('submit', handleCreateAgentSubmit);
    }
  }

  function renderAgentsGrid() {
    const container = document.getElementById('ai-agents-grid');
    if (!container) return;

    const agents = getAgents();

    if (agents.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 48px; text-align: center; background: white; border-radius: 12px; border: 1px dashed var(--border-light);">
          <div style="font-size: 3rem; margin-bottom: 12px;">🤖</div>
          <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 6px;">No AI Agents Configured</h3>
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 16px;">Create your first AI Auto-Reply Agent for Instagram DMs and WhatsApp messages.</p>
          <button class="btn btn-primary" onclick="document.getElementById('btn-create-ai-agent')?.click()">
            <i data-feather="plus"></i> Create AI Agent
          </button>
        </div>
      `;
      if (window.feather) feather.replace();
      return;
    }

    container.innerHTML = agents.map(agent => {
      const isPaused = agent.status === 'paused';
      let statusBadge = `<span class="badge badge-success">Active</span>`;
      if (isPaused) statusBadge = `<span class="badge badge-warning">Paused</span>`;
      else if (agent.status === 'draft') statusBadge = `<span class="badge badge-secondary">Draft</span>`;
      else if (agent.status === 'error') statusBadge = `<span class="badge badge-danger">Error</span>`;

      const channelsStr = (agent.channels || []).map(c => c === 'whatsapp' ? '💬 WhatsApp' : '📸 Instagram').join(' · ');

      return `
        <div class="ai-agent-card" style="background: white; border-radius: 12px; border: 1px solid var(--border-light); padding: 20px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
              <div>
                <strong style="font-size: 1.05rem; color: var(--text-dark);">${escapeHtml(agent.name)}</strong>
                <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">${channelsStr}</div>
              </div>
              ${statusBadge}
            </div>

            <p style="font-size: 0.825rem; color: var(--text-muted); margin-bottom: 14px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
              ${escapeHtml(agent.system_instructions)}
            </p>

            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px;">
              <span class="badge badge-info" style="font-size: 0.7rem;">Tone: ${agent.tone}</span>
              <span class="badge badge-info" style="font-size: 0.7rem;">Confidence: ${Math.round((agent.confidence_threshold || 0.75) * 100)}%</span>
              ${agent.lead_qualification_enabled ? '<span class="badge badge-success" style="font-size: 0.7rem;">Lead Qualifier</span>' : ''}
              ${agent.appointment_assistant_enabled ? '<span class="badge badge-success" style="font-size: 0.7rem;">Booking Assistant</span>' : ''}
            </div>
          </div>

          <div style="display: flex; gap: 8px; border-top: 1px solid var(--border-light); padding-top: 14px;">
            <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="window.NextBrightAIAgents.togglePause('${agent.id}')">
              ${isPaused ? '<i data-feather="play"></i> Resume' : '<i data-feather="pause"></i> Pause'}
            </button>
            <button class="btn btn-secondary btn-sm" style="color: var(--status-danger);" onclick="window.NextBrightAIAgents.deleteAgent('${agent.id}')">
              <i data-feather="trash-2"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.feather) feather.replace();
  }

  function renderReplyLogs() {
    const container = document.getElementById('ai-logs-table-body');
    if (!container) return;

    // Fetch from server or localStorage
    fetch('/api/ai-agents?action=logs')
      .then(r => r.json())
      .then(res => {
        const logs = res.logs || [];
        if (logs.length === 0) {
          container.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color: var(--text-muted);">No AI reply logs recorded yet.</td></tr>`;
          return;
        }

        container.innerHTML = logs.map(log => {
          const isWA = log.channel === 'whatsapp';
          const icon = isWA ? '💬' : '📸';
          let statusBadge = '<span class="badge badge-success">Sent</span>';
          if (log.status === 'handover') statusBadge = '<span class="badge badge-warning">Human Handover</span>';
          else if (log.status === 'failed') statusBadge = '<span class="badge badge-danger">Failed</span>';

          return `
            <tr>
              <td>
                <span style="font-size: 1rem; margin-right: 6px;">${icon}</span>
                <strong style="text-transform: capitalize;">${log.channel}</strong>
              </td>
              <td style="font-size: 0.85rem; color: var(--text-dark); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(log.incoming_message)}
              </td>
              <td style="font-size: 0.85rem; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(log.final_sent_reply || log.handover_reason || 'Pushed to Human Agent')}
              </td>
              <td>${statusBadge}</td>
              <td style="font-size: 0.75rem; color: var(--text-muted);">
                ${new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </td>
            </tr>
          `;
        }).join('');
      })
      .catch(() => {
        container.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color: var(--text-muted);">Loaded default logs</td></tr>`;
      });
  }

  function openCreateAgentModal() {
    const modal = document.getElementById('modal-create-ai-agent');
    if (modal) modal.style.display = 'flex';
  }

  function closeCreateAgentModal() {
    const modal = document.getElementById('modal-create-ai-agent');
    if (modal) modal.style.display = 'none';
  }

  async function handleCreateAgentSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('agent-name-input')?.value || 'New AI Agent';
    const businessName = document.getElementById('agent-biz-name')?.value || 'NextBright CRM';
    const tone = document.getElementById('agent-tone-select')?.value || 'Professional';
    const instructions = document.getElementById('agent-instructions-input')?.value || 'Assist customers with inquiries.';

    const agents = getAgents();
    const newAgent = {
      id: 'agent-' + Date.now(),
      name,
      channels: ['instagram', 'whatsapp'],
      business_name: businessName,
      language: 'en',
      tone,
      system_instructions: instructions,
      status: 'active',
      working_hours: { enabled: false, start: '09:00', end: '18:00', timezone: 'UTC' },
      auto_reply_enabled: true,
      confidence_threshold: 0.75,
      max_replies_per_conversation: 10,
      handover_on_low_confidence: true,
      handover_keywords: ['human', 'agent', 'person', 'support'],
      lead_qualification_enabled: true,
      appointment_assistant_enabled: true,
      created_at: new Date().toISOString()
    };

    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = window.supabaseConfig?.accessToken || localStorage.getItem('sb-access-token') || '';
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/ai-agents?action=save', {
        method: 'POST',
        headers,
        body: JSON.stringify({ agent: newAgent })
      });
    } catch (err) {}

    agents.unshift(newAgent);
    saveAgents(agents);
    closeCreateAgentModal();
    renderAgentsGrid();

    if (window.showToast) window.showToast(`AI Agent "${name}" created & active!`, 'success');
  }

  function togglePause(id) {
    const agents = getAgents();
    const agent = agents.find(a => a.id === id);
    if (!agent) return;

    agent.status = agent.status === 'paused' ? 'active' : 'paused';
    saveAgents(agents);
    renderAgentsGrid();

    if (window.showToast) window.showToast(`Agent "${agent.name}" is now ${agent.status}`, 'info');
  }

  function deleteAgent(id) {
    if (!confirm('Are you sure you want to delete this AI Agent?')) return;
    let agents = getAgents();
    agents = agents.filter(a => a.id !== id);
    saveAgents(agents);
    renderAgentsGrid();

    if (window.showToast) window.showToast('AI Agent removed', 'default');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.NextBrightAIAgents = {
    init: initAIAgents,
    togglePause,
    deleteAgent,
    closeModal: closeCreateAgentModal
  };

  document.addEventListener('DOMContentLoaded', () => {
    initAIAgents();
  });
})();
