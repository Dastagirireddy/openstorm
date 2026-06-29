import { LitElement, html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import Graph from 'graphology';
import Sigma from 'sigma';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import * as dagre from 'dagre';
import louvain from 'graphology-communities-louvain';
import iwanthue from 'iwanthue';
import { GraphData, GraphNode, LayoutType, GraphFilters } from './graph-types';
import { LODManager } from './lod-manager';

const DARK_NODE_COLORS: Record<string, string> = {
  Function: '#7c3aed', Struct: '#2563eb', Enum: '#0891b2', Trait: '#d946ef',
  Impl: '#f97316', Module: '#059669', Import: '#64748b', File: '#475569',
  Constant: '#e11d48', Type: '#0d9488',
};
const LIGHT_NODE_COLORS: Record<string, string> = {
  Function: '#6d28d9', Struct: '#1d4ed8', Enum: '#0e7490', Trait: '#a21caf',
  Impl: '#c2410c', Module: '#047857', Import: '#475569', File: '#334155',
  Constant: '#be123c', Type: '#0f766e',
};

function resolveCssVar(el: HTMLElement, varName: string, fallback: string): string {
  const val = getComputedStyle(el).getPropertyValue(varName).trim();
  return val || fallback;
}
function isLightTheme(el: HTMLElement): boolean {
  const bg = resolveCssVar(el, '--ai-panel-background', '#1e1e2e');
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 128;
}

@customElement('sigma-container')
export class SigmaContainer extends LitElement {
  @property({ type: Object }) graphData: GraphData | null = null;
  @property({ type: String }) layout: LayoutType = 'force';
  @property({ type: Object }) filters: GraphFilters = { kinds: [], languages: [], files: [], folders: [] };
  @query('#sigma-container') private container!: HTMLElement;

  private sigmaInstance: Sigma | null = null;
  private buildQueued = false;
  private communityPalette: Record<string, string> = {};
  private lodManager = new LODManager();
  @state() private layoutStatus = '';
  private currentGraph: Graph | null = null;
  private hoveredNode: string | null = null;

  static styles = css`
    :host { display: block; width: 100%; height: 100%; overflow: hidden; }
    #sigma-container { position: relative; width: 100%; height: 100%; background: var(--ai-panel-background, #1e1e2e); }
    #sigma-container canvas { background: transparent !important; }
    .layout-status {
      position: absolute; bottom: 8px; left: 8px; z-index: 10;
      display: flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 6px;
      background: var(--ai-panel-background, #1e1e2e);
      border: 1px solid var(--ai-panel-border, #334155);
      font-size: 11px; color: var(--ai-text-muted, #94a3b8);
      pointer-events: none;
    }
    .layout-status .dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--brand-primary, #7c3aed);
      animation: pulse 1s ease-in-out infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
  `;

  updated(changed: Map<string, unknown>) {
    if (changed.has('graphData') && this.graphData && this.graphData.nodes.length > 0) {
      this.queueBuild();
    }
    if (changed.has('filters') && this.sigmaInstance) {
      this.sigmaInstance.refresh();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.buildQueued = false;
    this.cleanup();
  }

  private queueBuild() {
    if (this.buildQueued) return;
    this.buildQueued = true;
    this.tryBuild();
  }

  private tryBuild() {
    if (!this.container) { requestAnimationFrame(() => this.tryBuild()); return; }
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) { requestAnimationFrame(() => this.tryBuild()); return; }
    this.buildQueued = false;
    this.buildGraph();
  }

  private isNodeVisible(kind: string, file: string): boolean {
    if (this.filters.kinds.length > 0 && !this.filters.kinds.includes(kind)) return false;
    if (this.filters.folders && this.filters.folders.length > 0) {
      const folder = file.split('/').slice(0, -1).join('/');
      const rootFolder = folder.split('/')[0];
      if (this.filters.folders.includes(folder) || this.filters.folders.includes(rootFolder)) return false;
    }
    if (this.filters.files.length > 0 && !this.filters.files.includes(file)) return false;
    return true;
  }

  private lightenColor(hex: string, amount: number): string {
    const h = hex.replace('#', '');
    const r = Math.min(255, parseInt(h.substring(0, 2), 16) + Math.round(255 * amount));
    const g = Math.min(255, parseInt(h.substring(2, 4), 16) + Math.round(255 * amount));
    const b = Math.min(255, parseInt(h.substring(4, 6), 16) + Math.round(255 * amount));
    return `rgb(${r}, ${g}, ${b})`;
  }

  private buildGraph() {
    this.cleanup();
    if (!this.graphData) return;
    this.lodManager.setFullData(this.graphData);
    this.renderHierarchicalView();
  }

  private runQuickLayout(graph: Graph) {
    if (graph.order < 3) return;

    graph.forEachNode((node) => {
      const size = graph.getNodeAttribute(node, 'size') || 5;
      graph.setNodeAttribute(node, 'size', Math.max(size, 8));
    });

    const settings = forceAtlas2.inferSettings(graph);
    forceAtlas2.assign(graph, {
      iterations: 150,
      settings: {
        ...settings,
        barnesHutOptimize: true,
        barnesHutTheta: 0.5,
        scalingRatio: 30,
        gravity: 0.15,
        strongGravityMode: true,
        slowDown: 1
      }
    });
  }

  private normalizePositions(graph: Graph, scale: number = 200) {
    if (graph.order === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    graph.forEachNode((node) => {
      const x = graph.getNodeAttribute(node, 'x');
      const y = graph.getNodeAttribute(node, 'y');
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const aspect = this.container.offsetWidth / this.container.offsetHeight;
    graph.forEachNode((node) => {
      const x = graph.getNodeAttribute(node, 'x');
      const y = graph.getNodeAttribute(node, 'y');
      graph.setNodeAttribute(node, 'x', ((x - minX) / rangeX - 0.5) * scale * aspect);
      graph.setNodeAttribute(node, 'y', ((y - minY) / rangeY - 0.5) * scale);
    });
  }

  private renderHierarchicalView(focusNodeId?: string) {
    if (!this.container || !this.graphData) return;

    if (this.sigmaInstance) { this.sigmaInstance.kill(); this.sigmaInstance = null; }

    const edgeColor = isLightTheme(this.container) ? '#94a3b8' : '#475569';
    const hierarchicalGraph = this.lodManager.buildHierarchicalGraph(
      this.graphData,
      this.lodManager['expandedFolders'],
      this.lodManager['expandedFiles'],
      this.communityPalette,
      edgeColor,
    );

    if (hierarchicalGraph.order === 0) return;

    this.runQuickLayout(hierarchicalGraph);
    this.normalizePositions(hierarchicalGraph, 200);
    this.currentGraph = hierarchicalGraph;

    this.sigmaInstance = new Sigma(hierarchicalGraph, this.container, {
      renderLabels: true,
      labelColor: { color: resolveCssVar(this.container, '--ai-text', isLightTheme(this.container) ? '#1f2937' : '#e6edf3') },
      labelFont: 'monospace',
      labelSize: 11,
      labelRenderedSizeThreshold: 8,
      labelDensity: 0.5,
      labelGridCellSize: 80,
      renderEdgeLabels: false,
      hideEdgesOnMove: true,
      hideLabelsOnMove: true,
      defaultEdgeType: 'arrow',
      defaultDrawNodeHover: () => {},
      nodeReducer: (node: string, data: Record<string, unknown>) => {
        const res = { ...data };
        const kind = data.kind as string;
        const file = data.file as string;
        if (kind && file && !this.isNodeVisible(kind, file)) {
          res.hidden = true;
        }
        if (node === this.hoveredNode) {
          res.size = (data.size as number) * 1.8;
          res.color = data.color;
          res.strokeColor = '#ffffff';
          res.strokeWidth = 4;
          res.zIndex = 1;
          res.labelColor = { color: resolveCssVar(this.container, '--ai-text', '#e6edf3') };
          res.labelBackground = false;
          res.forceLabel = true;
        }
        return res;
      },
      edgeReducer: (edge: string, data: Record<string, unknown>) => {
        const res = { ...data };
        const graph = this.sigmaInstance?.getGraph();
        if (graph) {
          const sourceNode = graph.source(edge);
          const targetNode = graph.target(edge);
          const sourceAttrs = graph.getNodeAttributes(sourceNode);
          const targetAttrs = graph.getNodeAttributes(targetNode);
          if ((sourceAttrs.kind && sourceAttrs.file && !this.isNodeVisible(sourceAttrs.kind, sourceAttrs.file)) ||
              (targetAttrs.kind && targetAttrs.file && !this.isNodeVisible(targetAttrs.kind, targetAttrs.file))) {
            res.hidden = true;
          } else {
            res.color = edgeColor;
            res.size = 1;
          }
          if (data.highlighted) {
            res.size = 2.5;
            res.color = resolveCssVar(this.container, '--brand-primary', '#7c3aed');
            res.zIndex = 0;
          }
        }
        return res;
      },
    });

    this.sigmaInstance.on('clickNode', ({ node }) => {
      this.handleNodeInteraction(node);
    });

    this.sigmaInstance.on('enterNode', ({ node }) => {
      this.hoveredNode = node;
      this.sigmaInstance?.refresh();
    });

    this.sigmaInstance.on('leaveNode', () => {
      this.hoveredNode = null;
      this.sigmaInstance?.refresh();
    });

    this.sigmaInstance.on('doubleClickNode', ({ node }) => {
      this.handleDoubleClick(node);
    });

    this.container.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); });
    this.patchMouseCaptor();

    requestAnimationFrame(() => {
      if (focusNodeId) {
        this.focusOnExpandedChildren(focusNodeId);
      } else {
        this.fitToScreen();
      }
    });
  }

  private handleNodeInteraction(nodeId: string) {
    if (!this.sigmaInstance || !this.currentGraph) return;

    const result = this.lodManager.handleNodeClick(nodeId);
    if (!result) return;

    if (result.action === 'expand-folder' || result.action === 'expand-file') {
      this.layoutStatus = 'Expanding...';
      requestAnimationFrame(() => {
        this.renderHierarchicalView(result.target);
        this.layoutStatus = '';
      });
    }
  }

  private focusOnExpandedChildren(parentId: string) {
    if (!this.sigmaInstance) return;
    const graph = this.sigmaInstance.getGraph();

    let targetNode = parentId;
    if (!graph.hasNode(targetNode)) {
      if (graph.hasNode(`folder:${parentId}`)) targetNode = `folder:${parentId}`;
      else if (graph.hasNode(`file:${parentId}`)) targetNode = `file:${parentId}`;
      else return;
    }

    const nodesToFocus = [targetNode];
    graph.forEachNeighbor(targetNode, (neighbor) => nodesToFocus.push(neighbor));

    if (nodesToFocus.length <= 1) return;

    this.sigmaInstance.getCamera().animate(
      { nodes: nodesToFocus },
      { duration: 500 }
    );
  }

  private handleDoubleClick(nodeId: string) {
    if (!this.sigmaInstance) return;
    const graph = this.sigmaInstance.getGraph();
    if (!graph.hasNode(nodeId)) return;

    const attrs = graph.getNodeAttributes(nodeId);
    if (attrs.file && attrs.startLine) {
      this.dispatchEvent(new CustomEvent('node-navigate', {
        detail: { id: nodeId, file_path: attrs.file, start_line: attrs.startLine },
        bubbles: true,
        composed: true,
      }));
    }
  }

  private cleanup() {
    this.layoutStatus = '';
    if (this.sigmaInstance) { this.sigmaInstance.kill(); this.sigmaInstance = null; }
    this.currentGraph = null;
    this.lodManager.cleanup();
  }

  private patchMouseCaptor() {
    const sigma: any = this.sigmaInstance;
    if (!sigma?.mouseCaptor) return;
    const captor = sigma.mouseCaptor;
    const container = this.container;
    const doc = container.getRootNode()?.ownerDocument ?? document;
    if (captor.handleMove) {
      doc.removeEventListener('mousemove', captor.handleMove);
      container.addEventListener('mousemove', captor.handleMove, { capture: false });
    }
    if (captor.handleUp) {
      doc.removeEventListener('mouseup', captor.handleUp);
      container.addEventListener('mouseup', captor.handleUp, { capture: false });
    }
  }

  public fitToScreen() {
    if (!this.sigmaInstance) return;
    const allNodes = this.sigmaInstance.getGraph().nodes();
    this.sigmaInstance.getCamera().animate(
      { nodes: allNodes },
      { duration: 500 }
    );
  }

  public zoomIn() {
    if (!this.sigmaInstance) return;
    const camera = this.sigmaInstance.getCamera();
    const state = camera.getState();
    camera.animate({ ratio: state.ratio * 0.7 }, { duration: 200 });
  }

  public zoomOut() {
    if (!this.sigmaInstance) return;
    const camera = this.sigmaInstance.getCamera();
    const state = camera.getState();
    camera.animate({ ratio: state.ratio * 1.4 }, { duration: 200 });
  }

  render() {
    return html`
      <div id="sigma-container"></div>
      ${this.layoutStatus
        ? html`<div class="layout-status"><span class="dot"></span>${this.layoutStatus}</div>`
        : ''}
    `;
  }
}
