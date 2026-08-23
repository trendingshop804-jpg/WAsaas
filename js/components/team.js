/* ==========================================================================
   NexusLead AI - Team & RBAC Management Component
   ========================================================================== */

class TeamComponent {
  init() {
    this.bindEvents();
    this.render();

    window.appState.on('teamMembers', () => this.render());
  }

  bindEvents() {
    const addMemberBtn = document.getElementById('invite-team-member-btn');
    if (addMemberBtn) {
      addMemberBtn.addEventListener('click', () => {
        const modal = document.getElementById('invite-member-modal');
        if (modal) modal.classList.add('active');
      });
    }

    const form = document.getElementById('invite-member-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleInviteMember();
      });
    }
  }

  render() {
    const tbody = document.getElementById('team-members-tbody');
    if (!tbody) return;

    const members = window.appState.get('teamMembers') || [];

    tbody.innerHTML = members.map(m => `
      <tr>
        <td>
          <div class="flex items-center gap-3">
            <div class="user-avatar" style="width: 34px; height: 34px; font-size: 13px;">
              ${m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <div style="font-weight: 700; color: var(--text-primary);">${this.escapeHtml(m.name)}</div>
              <div style="font-size: 11.5px; color: var(--text-muted);">${this.escapeHtml(m.email)}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="badge ${m.role === 'Owner' ? 'badge-purple' : m.role === 'Admin' ? 'badge-warm' : 'badge-whatsapp'}">
            ${m.role}
          </span>
        </td>
        <td>
          <span class="badge badge-success">● ${m.status}</span>
        </td>
        <td>${m.leadsAssigned} Leads</td>
        <td>${m.lastLogin}</td>
        <td>
          ${m.role !== 'Owner' ? `
            <button class="btn btn-outline btn-sm" style="color: var(--status-danger); border-color: var(--border-medium);" onclick="window.teamComponent.removeMember('${m.id}')">
              Remove
            </button>
          ` : '<span style="font-size: 11.5px; color: var(--text-muted);">Primary Owner</span>'}
        </td>
      </tr>
    `).join('');
  }

  handleInviteMember() {
    const name = document.getElementById('invite-member-name')?.value;
    const email = document.getElementById('invite-member-email')?.value;
    const role = document.getElementById('invite-member-role')?.value || 'Sales Agent';

    if (!name || !email) {
      alert('Please provide Name and Email.');
      return;
    }

    const newMember = {
      id: 'usr_' + Date.now(),
      name,
      email,
      role,
      status: 'Active',
      leadsAssigned: 0,
      lastLogin: 'Never'
    };

    const members = window.appState.get('teamMembers') || [];
    window.appState.set('teamMembers', [...members, newMember]);
    window.appState.addAuditLog('Team Member Invited', `${name} (${role})`, `Added user with ${role} permissions.`, 'Success');

    const modal = document.getElementById('invite-member-modal');
    if (modal) modal.classList.remove('active');

    alert(`Invitation sent to ${email}!`);
  }

  removeMember(userId) {
    if (confirm('Remove this user from the organization?')) {
      let members = window.appState.get('teamMembers') || [];
      members = members.filter(m => m.id !== userId);
      window.appState.set('teamMembers', members);
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
}

window.teamComponent = new TeamComponent();
