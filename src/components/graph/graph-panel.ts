import { LitElement, html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { GraphData, GraphNode, LayoutType, GraphFilters } from './graph-types';
import type { SigmaContainer } from './sigma-container';

@customElement('graph-panel')
export class GraphPanel extends LitElement {
  @property({ type: String }) projectPath = '';
  @state() private graphData: GraphData | null = null;
  @state() private selectedNode: GraphNode | null = null;
  @state() private layout: LayoutType = 'force';
  @state() private filters: GraphFilters = { kinds: [], languages: [], files: [], folders: [] };
  @state() private loading = true;
  @state() private error: string | null = null;
  @state() private phase = '';
  @state() private filesScanned = 0;
  @state() private totalNodes = 0;

  @query('sigma-container') private sigmaContainer!: SigmaContainer;

  private unlisteners: (() => void)[] = [];

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--ai-panel-background, #1e1e2e);
    }
    .progress-overlay {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 12px;
      color: var(--ai-text, #cdd6f4);
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--ai-panel-border, #334155);
      border-top-color: var(--brand-primary, #7c3aed);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .phase-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--ai-text, #e2e8f0);
    }
    .stat {
      font-size: 12px;
      color: var(--ai-text-muted, #94a3b8);
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 8px;
      color: var(--ai-text-muted, #64748b);
    }
    .empty-state iconify-icon {
      font-size: 48px;
      opacity: 0.3;
    }
  `;

  async connectedCallback() {
    super.connectedCallback();
    this.setupListeners();
    await this.loadGraph();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unlisteners.forEach(u => u());
  }

  private setupListeners() {
    listen<{
      phase: string;
      files_scanned: number;
      total_nodes: number;
    }>('graph-build-progress', (e) => {
      this.phase = e.payload.phase;
      this.filesScanned = e.payload.files_scanned;
      this.totalNodes = e.payload.total_nodes;
    }).then(u => this.unlisteners.push(u));
  }

  async loadGraph() {
    this.loading = true;
    this.error = null;
    this.phase = 'scanning';
    this.filesScanned = 0;
    this.totalNodes = 0;
    try {
      if (this.projectPath) {
        const result = await invoke<{ node_count: number; edge_count: number; files_scanned: number }>(
          'graph_build_project',
          { projectPath: this.projectPath }
        );
        this.filesScanned = result.files_scanned;
        this.totalNodes = result.node_count;
      }
      this.graphData = await invoke('graph_get_all');
    } catch (e) {
      this.error = String(e);
    } finally {
      this.loading = false;
    }
  }

  private get phaseLabel(): string {
    switch (this.phase) {
      case 'scanning': return 'Scanning project files...';
      case 'storing': return 'Building graph...';
      case 'loaded': return 'Loading cached graph...';
      default: return 'Loading...';
    }
  }

  private handleLayoutChange(e: CustomEvent<LayoutType>) {
    this.layout = e.detail;
  }

  private handleFilterChange(e: CustomEvent<GraphFilters>) {
    this.filters = e.detail;
  }

  private handleNodeSelect(e: CustomEvent<GraphNode>) {
    this.selectedNode = e.detail;
  }

  private handleNodeNavigate(e: CustomEvent<{ id: string; file_path: string; start_line: number }>) {
    const { file_path, start_line } = e.detail;
    this.dispatchEvent(
      new CustomEvent('navigate-to-file', {
        detail: { file_path, line: start_line },
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleGraphAction(e: CustomEvent<string>) {
    if (!this.sigmaContainer) return;
    switch (e.detail) {
      case 'zoom-in': this.sigmaContainer.zoomIn(); break;
      case 'zoom-out': this.sigmaContainer.zoomOut(); break;
      case 'fit-screen': this.sigmaContainer.fitToScreen(); break;
    }
  }

  private async handleNavigate() {
    if (!this.selectedNode) return;
    try {
      const location = await invoke<{ file_path: string; line: number }>(
        'graph_navigate_to',
        { nodeId: this.selectedNode.id }
      );
      this.dispatchEvent(
        new CustomEvent('navigate-to-file', {
          detail: location,
          bubbles: true,
          composed: true,
        })
      );
    } catch (e) {
      console.error('Navigate failed:', e);
    }
  }

  render() {
    if (this.loading) {
      return html`
        <div class="progress-overlay">
          <div class="spinner"></div>
          <div class="phase-label">${this.phaseLabel}</div>
          ${this.filesScanned > 0
            ? html`<div class="stat">${this.filesScanned} files &middot; ${this.totalNodes.toLocaleString()} nodes</div>`
            : ''}
        </div>`;
    }

    if (this.error) {
      return html`<div class="empty-state" style="color: var(--ai-error, #f85149);">
        <iconify-icon icon="mdi:alert-circle-outline"></iconify-icon>
        <div>${this.error}</div>
      </div>`;
    }

    const hasNodes = this.graphData && this.graphData.nodes.length > 0;

    return html`
      <graph-toolbar
        .layout=${this.layout}
        .filters=${this.filters}
        .graphData=${this.graphData}
        @layout-change=${this.handleLayoutChange}
        @filter-change=${this.handleFilterChange}
        @graph-action=${this.handleGraphAction}
      ></graph-toolbar>
      ${hasNodes
        ? html`
          <sigma-container
            class="flex-1 min-h-0"
            .graphData=${this.graphData}
            .layout=${this.layout}
            .filters=${this.filters}
            @node-select=${this.handleNodeSelect}
            @node-navigate=${this.handleNodeNavigate}
          ></sigma-container>
        `
        : html`
          <div class="empty-state">
            <iconify-icon icon="mdi:graph-outline"></iconify-icon>
            <div>No nodes found in project</div>
            <div style="font-size: 11px;">Open a project folder to visualize its structure</div>
          </div>
        `
      }
      ${this.selectedNode
        ? html`<graph-sidebar
            .node=${this.selectedNode}
            @navigate=${this.handleNavigate}
          ></graph-sidebar>`
        : ''}
    `;
  }
}
