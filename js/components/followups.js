/* ==========================================================================
   NexusLead AI - Automated Follow-Up Sequence Builder Component
   ========================================================================== */

class FollowUpsComponent {
  init() {
    this.render();
  }

  render() {
    const treeContainer = document.getElementById('followup-sequence-visual-tree');
    if (!treeContainer) return;

    treeContainer.innerHTML = `
      <div class="card" style="border-left: 4px solid var(--brand-whatsapp);">
        <div class="flex items-center justify-between" style="margin-bottom: 8px;">
          <div style="font-weight: 700; font-size: 14px; color: var(--text-primary);">Step 1: Campaign Trigger</div>
          <span class="badge badge-whatsapp">TRIGGER</span>
        </div>
        <p style="font-size: 12.5px; color: var(--text-secondary);">Lead enters campaign & passes validation filters. Dispatches initial personalized hook template.</p>
      </div>

      <div style="text-align: center; margin: 10px 0; color: var(--brand-whatsapp);">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
      </div>

      <div class="card" style="border-left: 4px solid #f59e0b;">
        <div class="flex items-center justify-between" style="margin-bottom: 8px;">
          <div style="font-weight: 700; font-size: 14px; color: #f59e0b;">Step 2: Smart Delay Timer (24 Hours)</div>
          <span class="badge badge-warm">DELAY</span>
        </div>
        <p style="font-size: 12.5px; color: var(--text-secondary);">System waits 24h (respecting business hours: 09:30 AM - 06:30 PM IST) for prospect response.</p>
      </div>

      <div style="text-align: center; margin: 10px 0; color: #f59e0b;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
      </div>

      <div class="card" style="border: 1px solid var(--border-medium); background: var(--bg-tertiary);">
        <div style="font-weight: 700; font-size: 14px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <span style="color: #ec4899;">◆</span> Condition: Did Prospect Reply on WhatsApp?
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
          <!-- Branch YES -->
          <div style="padding: 14px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px;">
            <div style="font-weight: 700; color: var(--status-success); margin-bottom: 6px; font-size: 13px;">
              ✓ YES (Replied)
            </div>
            <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
              • Automatically CANCEL all scheduled outbound follow-ups.<br>
              • Engage AI Sales Agent to answer FAQs & qualify budget.<br>
              • Move CRM status to <strong>"Replied" / "Qualified"</strong>.
            </p>
            <span class="badge badge-success">AI Conversational Flow</span>
          </div>

          <!-- Branch NO -->
          <div style="padding: 14px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px;">
            <div style="font-weight: 700; color: #60a5fa; margin-bottom: 6px; font-size: 13px;">
              ✕ NO (No Reply)
            </div>
            <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
              • Dispatch Follow-Up #1 (Social Proof / Case study).<br>
              • Wait 48 hours.<br>
              • If still no reply: Send Final Break-up message and tag as <strong>"Unresponsive"</strong>.
            </p>
            <span class="badge badge-cold">Multi-Touch Sequence</span>
          </div>
        </div>
      </div>

      <div style="margin-top: 20px; padding: 14px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px;">
        <div class="flex items-center gap-2" style="color: var(--status-danger); font-weight: 700; margin-bottom: 4px; font-size: 13px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          Strict Opt-Out & Compliance Safety Rule
        </div>
        <p style="font-size: 12px; color: var(--text-secondary);">
          If prospect replies with keywords <strong>"STOP", "REMOVE ME", "UNSUBSCRIBE", "NOT INTERESTED"</strong>, all future automation queues are instantly terminated, the contact is flagged as Opted-Out, and lead score is set to 0.
        </p>
      </div>
    `;
  }
}

window.followUpsComponent = new FollowUpsComponent();
