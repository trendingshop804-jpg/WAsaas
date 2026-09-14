/* ==========================================================================
   NexusLead AI - Visual Drag-and-Drop Workflow Canvas & Flow Builder
   ========================================================================== */

class WorkflowBuilderComponent {
  constructor() {
    this.activeWorkflowId = 'wf_demo_01';
    this.selectedNodeId = null;
    this.isDragging = false;
    this.dragNodeId = null;
    this.dragOffset = { x: 0, y: 0 };
  }

  init() {
    this.bindEvents();
    this.render();

    window.appState.on('workflows', () => this.render());
  }

  bindEvents() {
    const canvas = document.getElementById('workflow-canvas');
    if (canvas) {
      canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
      canvas.addEventListener('mouseup', () => this.handleCanvasMouseUp());
    }

    // Node draggable from palette
    document.querySelectorAll('.draggable-node-item').forEach(item => {
      item.addEventListener('click', () => {
        const type = item.getAttribute('data-node-type');
        const title = item.getAttribute('data-node-title');
        this.addNewNodeToCanvas(type, title);
      });
    });

    // Test run workflow button
    const testRunBtn = document.getElementById('run-workflow-test-btn');
    if (testRunBtn) {
      testRunBtn.addEventListener('click', () => this.executeTestRun());
    }

    // Save workflow button
    const saveWfBtn = document.getElementById('save-workflow-btn');
    if (saveWfBtn) {
      saveWfBtn.addEventListener('click', () => {
        alert('Workflow graph and logic saved successfully!');
      });
    }
  }

  getActiveWorkflow() {
    const wfs = window.appState.get('workflows') || [];
    return wfs.find(w => w.id === this.activeWorkflowId) || wfs[0];
  }

  render() {
    const wf = this.getActiveWorkflow();
    if (!wf) return;

    const nodesArea = document.getElementById('workflow-canvas-nodes');
    const svgArea = document.getElementById('workflow-svg-lines');

    if (!nodesArea || !svgArea) return;

    // Render Canvas Nodes
    nodesArea.innerHTML = wf.nodes.map(node => `
      <div id="node-el-${node.id}" class="canvas-node ${node.type} ${this.selectedNodeId === node.id ? 'selected' : ''}" 
           style="left: ${node.x}px; top: ${node.y}px;"
           onmousedown="window.workflowBuilderComponent.handleNodeMouseDown(event, '${node.id}')"
           onclick="window.workflowBuilderComponent.selectNode('${node.id}')">
        <div class="canvas-node-header">
          <span>${this.escapeHtml(node.title)}</span>
          <span style="font-size: 10px; opacity: 0.8; text-transform: uppercase;">${node.type}</span>
        </div>
        <div class="canvas-node-body">
          ${this.escapeHtml(node.desc)}
        </div>
        <div class="canvas-node-ports">
          <div class="port-handle"></div>
          <div class="port-handle"></div>
        </div>
      </div>
    `).join('');

    this.renderConnectorLines(wf, svgArea);
    this.renderInspector();
  }

  renderConnectorLines(wf, svgArea) {
    if (!svgArea) return;

    const paths = (wf.connections || []).map(conn => {
      const fromNode = wf.nodes.find(n => n.id === conn.from);
      const toNode = wf.nodes.find(n => n.id === conn.to);
      if (!fromNode || !toNode) return '';

      const x1 = fromNode.x + 125;
      const y1 = fromNode.y + 70;
      const x2 = toNode.x + 125;
      const y2 = toNode.y + 10;

      const cx1 = x1;
      const cy1 = y1 + (y2 - y1) / 2;
      const cx2 = x2;
      const cy2 = y1 + (y2 - y1) / 2;

      return `<path class="flow-connection-line active" d="M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}" />`;
    }).join('');

    svgArea.innerHTML = paths;
  }

  handleNodeMouseDown(e, nodeId) {
    this.isDragging = true;
    this.dragNodeId = nodeId;
    const wf = this.getActiveWorkflow();
    const node = wf.nodes.find(n => n.id === nodeId);
    if (node) {
      const rect = document.getElementById('workflow-canvas').getBoundingClientRect();
      this.dragOffset = {
        x: e.clientX - rect.left - node.x,
        y: e.clientY - rect.top - node.y
      };
    }
  }

  handleCanvasMouseMove(e) {
    if (!this.isDragging || !this.dragNodeId) return;
    const wf = this.getActiveWorkflow();
    const node = wf.nodes.find(n => n.id === this.dragNodeId);
    if (node) {
      const rect = document.getElementById('workflow-canvas').getBoundingClientRect();
      node.x = Math.max(10, Math.min(rect.width - 260, e.clientX - rect.left - this.dragOffset.x));
      node.y = Math.max(10, Math.min(rect.height - 120, e.clientY - rect.top - this.dragOffset.y));

      const el = document.getElementById(`node-el-${node.id}`);
      if (el) {
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
      }
      this.renderConnectorLines(wf, document.getElementById('workflow-svg-lines'));
    }
  }

  handleCanvasMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.dragNodeId = null;
      window.appState.saveState();
    }
  }

  selectNode(nodeId) {
    this.selectedNodeId = nodeId;
    this.render();
  }

  renderInspector() {
    const inspectorContent = document.getElementById('workflow-node-inspector-content');
    if (!inspectorContent) return;

    const wf = this.getActiveWorkflow();
    const node = wf.nodes.find(n => n.id === this.selectedNodeId);

    if (!node) {
      inspectorContent.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 40px 10px;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 10px; display: block;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          Select a node on the canvas to inspect its triggers, parameters, and AI configuration rules.
        </div>
      `;
      return;
    }

    inspectorContent.innerHTML = `
      <div style="margin-bottom: 16px;">
        <span class="badge ${node.type === 'trigger' ? 'badge-warm' : node.type === 'ai' ? 'badge-purple' : 'badge-whatsapp'}">
          ${node.type.toUpperCase()} NODE
        </span>
        <h4 style="margin-top: 8px;">${this.escapeHtml(node.title)}</h4>
      </div>

      <div class="form-group">
        <label class="form-label">Node Title</label>
        <input type="text" class="form-input" value="${this.escapeHtml(node.title)}" oninput="window.workflowBuilderComponent.updateNodeProp('title', this.value)">
      </div>

      <div class="form-group">
        <label class="form-label">Description / Prompt Rule</label>
        <textarea class="form-textarea" oninput="window.workflowBuilderComponent.updateNodeProp('desc', this.value)">${this.escapeHtml(node.desc)}</textarea>
      </div>

      <div style="padding: 12px; background: var(--bg-tertiary); border-radius: 8px; font-size: 12px; margin-bottom: 16px;">
        <div style="font-weight: 700; color: var(--brand-whatsapp); margin-bottom: 4px;">Node Execution Metadata</div>
        <div>Status: <span style="color: var(--status-success); font-weight: 600;">Active in Live Pipeline</span></div>
        <div>Success Rate: <strong>99.1%</strong></div>
        <div>Avg Latency: <strong>320ms</strong></div>
      </div>

      <button class="btn btn-outline btn-sm w-full" style="color: var(--status-danger); border-color: var(--status-danger);" onclick="window.workflowBuilderComponent.deleteSelectedNode()">
        Delete Node
      </button>
    `;
  }

  updateNodeProp(prop, val) {
    const wf = this.getActiveWorkflow();
    const node = wf.nodes.find(n => n.id === this.selectedNodeId);
    if (node) {
      node[prop] = val;
      window.appState.saveState();
      const el = document.getElementById(`node-el-${node.id}`);
      if (el) {
        if (prop === 'title') el.querySelector('.canvas-node-header span').textContent = val;
        if (prop === 'desc') el.querySelector('.canvas-node-body').textContent = val;
      }
    }
  }

  addNewNodeToCanvas(type, title) {
    const wf = this.getActiveWorkflow();
    const newNode = {
      id: 'node_' + Date.now(),
      type,
      title: `${type.toUpperCase()}: ${title}`,
      desc: `Automated action configured for ${title}.`,
      x: 200 + Math.floor(Math.random() * 80),
      y: 180 + Math.floor(Math.random() * 60),
      config: {}
    };

    wf.nodes.push(newNode);
    this.selectedNodeId = newNode.id;
    window.appState.saveState();
    this.render();
  }

  deleteSelectedNode() {
    if (!this.selectedNodeId) return;
    const wf = this.getActiveWorkflow();
    wf.nodes = wf.nodes.filter(n => n.id !== this.selectedNodeId);
    wf.connections = (wf.connections || []).filter(c => c.from !== this.selectedNodeId && c.to !== this.selectedNodeId);
    this.selectedNodeId = null;
    window.appState.saveState();
    this.render();
  }

  async executeTestRun() {
    const lead = window.appState.get('leads')[0];
    const logModal = document.getElementById('workflow-execution-modal');
    const logBody = document.getElementById('workflow-execution-log-body');

    if (logBody) {
      logBody.innerHTML = `<div style="color: var(--brand-whatsapp);">Initiating live workflow execution test for lead: <strong>${lead ? lead.contactName : 'Demo'}</strong>...</div>`;
    }
    if (logModal) logModal.classList.add('active');

    try {
      const logs = await window.automationEngine.executeWorkflow(this.activeWorkflowId, lead ? lead.id : null);
      if (logBody) {
        logBody.innerHTML = `
          <div style="margin-bottom: 12px; font-weight: 700; color: var(--status-success);">
            ✓ Workflow Execution Succeeded (All ${logs.length} steps resolved)
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${logs.map((l, i) => `
              <div style="padding: 8px 12px; background: var(--bg-tertiary); border-radius: 6px; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
                <div>
                  <strong>Step ${i + 1}: ${this.escapeHtml(l.node || l.step)}</strong>
                  ${l.result ? `<div style="color: var(--text-secondary); margin-top: 2px;">${this.escapeHtml(l.result)}</div>` : ''}
                </div>
                <span class="badge badge-success">${l.status}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
    } catch (err) {
      if (logBody) {
        logBody.innerHTML = `<div style="color: var(--status-danger);">Execution Error: ${err.message}</div>`;
      }
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
}

window.workflowBuilderComponent = new WorkflowBuilderComponent();
