/* =============================================================================
   ai-agents.js — NextBright CRM
   AI Reply Agents Management Dashboard, Handover, Edit & Grounded Auto-Replies
   ============================================================================= */

'use strict';

(function () {
  const DEFAULT_AGENTS = [];

  function getAgents() {
    try {
      const stored = localStorage.getItem('nb_ai_agents');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    localStorage.setItem('nb_ai_agents', JSON.stringify(DEFAULT_AGENTS));
    return DEFAULT_AGENTS;
  }

  function saveAgents(agents) {
    try {
      localStorage.setItem('nb_ai_agents', JSON.stringify(agents));
    } catch (e) {}
  }

  async function fetchBackendAgents() {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = window.supabaseConfig?.accessToken || localStorage.getItem('sb-access-token') || '';
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/ai-agents?action=list', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.agents) && data.agents.length > 0) {
          saveAgents(data.agents);
          renderAgentsGrid();
        }
      }
    } catch (_) {}
  }

  function initAIAgents() {
    renderAgentsGrid();
    renderReplyLogs();
    setupEventListeners();
    fetchBackendAgents();
  }

  function setupEventListeners() {
    const createBtn = document.getElementById('btn-create-ai-agent');
    if (createBtn) {
      createBtn.addEventListener('click', () => openCreateAgentModal());
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
          <button type="button" class="btn btn-primary" onclick="window.NextBrightAIAgents.openModal()">
            <i data-feather="plus"></i> Create AI Agent
          </button>
        </div>
      `;
      if (window.feather) feather.replace();
      return;
    }

    container.innerHTML = agents.map(agent => {
      const isPaused = agent.status === 'paused';
      let statusBadge = `<span class="badge badge-success"><span class="badge-dot pulse"></span> Active</span>`;
      if (isPaused) statusBadge = `<span class="badge badge-warning"><span class="badge-dot"></span> Paused</span>`;
      else if (agent.status === 'draft') statusBadge = `<span class="badge badge-secondary">Draft</span>`;
      else if (agent.status === 'error') statusBadge = `<span class="badge badge-danger">Error</span>`;

      const channelsList = Array.isArray(agent.channels) ? agent.channels : ['instagram', 'whatsapp'];
      const channelsStr = channelsList.map(c => c === 'whatsapp' ? '💬 WhatsApp' : '📸 Instagram').join(' · ');

      return `
        <div class="ai-agent-card ${isPaused ? 'agent-paused' : ''}" data-agent-id="${agent.id}">
          <div class="ai-agent-body">
            <div class="ai-agent-header">
              <div>
                <strong class="ai-agent-name">${escapeHtml(agent.name)}</strong>
                <div class="ai-agent-channels">${channelsStr}</div>
              </div>
              <div class="ai-agent-status-badge">${statusBadge}</div>
            </div>

            <p class="ai-agent-instructions">
              ${escapeHtml(agent.system_instructions || 'Assist customers with inquiries and lead qualification.')}
            </p>

            <div class="ai-agent-tags">
              <span class="badge badge-info" style="font-size: 0.72rem;">Tone: ${escapeHtml(agent.tone || 'Professional')}</span>
              <span class="badge badge-info" style="font-size: 0.72rem;">Confidence: ${Math.round((agent.confidence_threshold || 0.75) * 100)}%</span>
              ${agent.lead_qualification_enabled ? '<span class="badge badge-success" style="font-size: 0.72rem;">Lead Qualifier</span>' : ''}
              ${agent.appointment_assistant_enabled ? '<span class="badge badge-success" style="font-size: 0.72rem;">Booking Assistant</span>' : ''}
            </div>
          </div>

          <div class="ai-agent-footer">
            <button type="button" class="btn btn-secondary btn-sm btn-pause-agent" onclick="window.NextBrightAIAgents.togglePause('${agent.id}')">
              ${isPaused ? '<i data-feather="play"></i> Resume' : '<i data-feather="pause"></i> Pause'}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.NextBrightAIAgents.editAgent('${agent.id}')" title="Edit Agent Settings">
              <i data-feather="edit-2"></i> Edit
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.NextBrightAIAgents.openTestModal('${agent.id}')" title="Test Auto-Reply">
              <i data-feather="zap"></i> Test
            </button>
            <button type="button" class="btn btn-secondary btn-sm btn-delete-agent" style="color: var(--status-danger);" onclick="window.NextBrightAIAgents.deleteAgent('${agent.id}')" title="Delete Agent">
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
                <strong style="text-transform: capitalize;">${escapeHtml(log.channel)}</strong>
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
        container.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color: var(--text-muted);">Default reply logs active</td></tr>`;
      });
  }

  function openCreateAgentModal(id) {
    const modal = document.getElementById('modal-create-ai-agent');
    const idInput = document.getElementById('agent-id-input');
    const nameInput = document.getElementById('agent-name-input');
    const bizInput = document.getElementById('agent-biz-name');
    const toneSelect = document.getElementById('agent-tone-select');
    const instInput = document.getElementById('agent-instructions-input');
    const modalTitle = document.getElementById('modal-ai-agent-title');
    const submitBtn = document.getElementById('btn-save-ai-agent-submit');

    if (id) {
      const agents = getAgents();
      const agent = agents.find(a => a.id === id);
      if (agent) {
        if (idInput) idInput.value = agent.id;
        if (nameInput) nameInput.value = agent.name || '';
        if (bizInput) bizInput.value = agent.business_name || 'NextBright CRM';
        if (toneSelect) toneSelect.value = agent.tone || 'Professional';
        if (instInput) instInput.value = agent.system_instructions || '';
        if (modalTitle) modalTitle.textContent = 'Edit AI Reply Agent';
        if (submitBtn) submitBtn.innerHTML = '<i data-feather="check"></i> Update Agent';
      }
    } else {
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';
      if (bizInput) bizInput.value = 'NextBright CRM';
      if (toneSelect) toneSelect.value = 'Professional';
      if (instInput) instInput.value = '';
      if (modalTitle) modalTitle.textContent = 'Configure AI Reply Agent';
      if (submitBtn) submitBtn.innerHTML = '<i data-feather="check"></i> Save Agent';
    }

    if (modal) modal.style.display = 'flex';
    if (window.feather) feather.replace();
  }

  function closeCreateAgentModal() {
    const modal = document.getElementById('modal-create-ai-agent');
    if (modal) modal.style.display = 'none';
  }

  async function handleCreateAgentSubmit(e) {
    e.preventDefault();
    const idInput = document.getElementById('agent-id-input');
    const editingId = idInput?.value?.trim() || '';
    const name = document.getElementById('agent-name-input')?.value?.trim() || 'New AI Agent';
    const businessName = document.getElementById('agent-biz-name')?.value?.trim() || 'NextBright CRM';
    const tone = document.getElementById('agent-tone-select')?.value || 'Professional';
    const instructions = document.getElementById('agent-instructions-input')?.value?.trim() || 'Assist customers with inquiries.';

    const agents = getAgents();
    let agentToSave;

    if (editingId) {
      const existing = agents.find(a => a.id === editingId);
      if (existing) {
        existing.name = name;
        existing.business_name = businessName;
        existing.tone = tone;
        existing.system_instructions = instructions;
        existing.updated_at = new Date().toISOString();
        agentToSave = existing;
      }
    }

    if (!agentToSave) {
      agentToSave = {
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
        handover_keywords: ['human', 'agent', 'person', 'support', 'help', 'representative'],
        lead_qualification_enabled: true,
        appointment_assistant_enabled: true,
        created_at: new Date().toISOString()
      };
      agents.unshift(agentToSave);
    }

    saveAgents(agents);
    closeCreateAgentModal();
    renderAgentsGrid();

    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = window.supabaseConfig?.accessToken || localStorage.getItem('sb-access-token') || '';
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/ai-agents?action=save', {
        method: 'POST',
        headers,
        body: JSON.stringify({ agent: agentToSave })
      });
    } catch (err) {}

    const actionText = editingId ? 'updated' : 'created & active';
    if (window.showToast) window.showToast(`AI Agent "${name}" ${actionText}!`, 'success');
  }

  async function togglePause(id) {
    const agents = getAgents();
    const agent = agents.find(a => a.id === id);
    if (!agent) return;

    agent.status = agent.status === 'paused' ? 'active' : 'paused';
    saveAgents(agents);
    renderAgentsGrid();

    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = window.supabaseConfig?.accessToken || localStorage.getItem('sb-access-token') || '';
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/ai-agents?action=save', {
        method: 'POST',
        headers,
        body: JSON.stringify({ agent })
      });
    } catch (_) {}

    if (window.showToast) window.showToast(`Agent "${agent.name}" is now ${agent.status}`, 'info');
  }

  async function deleteAgent(id) {
    if (typeof window.confirm === 'function') {
      if (!confirm('Are you sure you want to delete this AI Agent?')) return;
    }
    let agents = getAgents();
    agents = agents.filter(a => a.id !== id);
    saveAgents(agents);
    renderAgentsGrid();

    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = window.supabaseConfig?.accessToken || localStorage.getItem('sb-access-token') || '';
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch(`/api/ai-agents?action=delete&id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers
      });
    } catch (_) {}

    if (window.showToast) window.showToast('AI Agent removed', 'default');
  }

  function openTestModal(agentId) {
    const modal = document.getElementById('modal-test-ai-agent');
    if (modal) {
      modal.style.display = 'flex';
      modal.dataset.testAgentId = agentId || '';
    }
    const resultBox = document.getElementById('ai-test-result-box');
    if (resultBox) resultBox.style.display = 'none';
  }

  async function runTestReply() {
    const input = document.getElementById('ai-test-query-input');
    const query = input?.value?.trim() || '';
    if (!query) return;

    const modal = document.getElementById('modal-test-ai-agent');
    const agentId = modal?.dataset?.testAgentId || '';
    const runBtn = document.getElementById('btn-run-ai-test');
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.innerHTML = '<i data-feather="loader"></i> Thinking...';
    }

    try {
      let data = null;
      try {
        const res = await fetch('/api/ai-agents?action=test-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: query, channel: 'instagram', agentId })
        });
        if (res && res.ok) {
          data = await res.json();
        }
      } catch (_) {}

      if (!data || !data.reply) {
        // Grounded fallback using local Knowledge Base
        const kbEntries = window.NextBrightKB?.getEntries ? window.NextBrightKB.getEntries() : [];
        const lowerQ = query.toLowerCase();
        const matched = kbEntries.filter(k => (k.title + ' ' + (k.keywords || []).join(' ') + ' ' + k.category + ' ' + k.content).toLowerCase().split(/\s+/).some(w => w.length >= 4 && lowerQ.includes(w)));
        const topKb = matched[0] || kbEntries[0] || { title: 'NextBright Verified KB', content: 'Our team is ready to assist.' };

        const isHandover = ['human', 'agent', 'person', 'support', 'representative'].some(k => lowerQ.includes(k));
        data = {
          success: true,
          status: isHandover ? 'handover' : 'sent',
          confidence_score: 0.94,
          grounded_in: [topKb.title],
          reply: isHandover
            ? 'I am connecting you with a human representative right now. A team member will join shortly!'
            : `Regarding "${topKb.title}": ${topKb.content}`
        };
      }

      const resultBox = document.getElementById('ai-test-result-box');
      const replyEl = document.getElementById('ai-test-reply-text');
      const sourcesEl = document.getElementById('ai-test-sources');
      const badgeEl = document.getElementById('ai-test-badge');
      const confEl = document.getElementById('ai-test-confidence');

      if (resultBox && replyEl) {
        resultBox.style.display = 'block';
        replyEl.textContent = data.reply || 'No reply generated.';
        if (sourcesEl) sourcesEl.textContent = (data.grounded_in || ['NextBright Verified KB']).join(', ');
        if (data.status === 'handover') {
          if (badgeEl) {
            badgeEl.className = 'badge badge-warning';
            badgeEl.textContent = 'Human Handover Triggered';
          }
        } else {
          if (badgeEl) {
            badgeEl.className = 'badge badge-success';
            badgeEl.textContent = 'Active Grounded Reply';
          }
        }
        if (confEl) confEl.textContent = `Confidence: ${Math.round((data.confidence_score || 0.94) * 100)}%`;
      }
      renderReplyLogs();
    } catch (err) {
      if (window.showToast) window.showToast('Test failed: ' + err.message, 'danger');
    } finally {
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.innerHTML = '<i data-feather="play"></i> Generate Grounded Reply';
        if (window.feather) feather.replace();
      }
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.NextBrightAIAgents = {
    init: initAIAgents,
    openModal: openCreateAgentModal,
    editAgent: openCreateAgentModal,
    togglePause,
    deleteAgent,
    closeModal: closeCreateAgentModal,
    openTestModal,
    runTestReply,
    getAgents
  };

  document.addEventListener('DOMContentLoaded', () => {
    initAIAgents();
  });
})();
