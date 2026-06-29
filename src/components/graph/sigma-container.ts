import { LitElement, html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import Graph from 'graphology';
import Sigma from 'sigma';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { GraphData, GraphNode, LayoutType, GraphFilters } from './graph-types';

const DARK_NODE_COLORS: Record<string, string> = {
  Function: '#7c3aed',
  Struct: '#2563eb',
  Enum: '#0891b2',
  Trait: '#d946ef',
  Impl: '#f97316',
  Module: '#059669',
  Import: '#64748b',
  File: '#475569',
  Constant: '#e11d48',
  Type: '#0d9488',
};

const LIGHT_NODE_COLORS: Record<string, string> = {
  Function: '#6d28d9',
  Struct: '#1d4ed8',
  Enum: '#0e7490',
  Trait: '#a21caf',
  Impl: '#c2410c',
  Module: '#047857',
  Import: '#475569',
  File: '#334155',
  Constant: '#be123c',
  Type: '#0f766e',
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

  private graph: Graph | null = null;
  private sigmaInstance: Sigma | null = null;
  private nodeDegrees: Map<string, number> = new Map();
  private lastClickNode: string | null = null;
  private lastClickTime = 0;
  private buildQueued = false;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    #sigma-container {
      width: 100%;
      height: 100%;
      background: var(--ai-panel-background, #1e1e2e);
    }
  `;

  updated(changed: Map<string, unknown>) {
    if (changed.has('graphData') && this.graphData && this.graphData.nodes.length > 0) {
      this.queueBuild();
    }
    if (changed.has('layout') && this.graph && !this.buildQueued) {
      this.layoutGraph();
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
    if (!this.container) {
      requestAnimationFrame(() => this.tryBuild());
      return;
    }
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      requestAnimationFrame(() => this.tryBuild());
      return;
    }
    this.buildQueued = false;
    this.buildGraph();
  }

  private computeDegrees() {
    this.nodeDegrees.clear();
    if (!this.graph) return;
    this.graph.forEachNode((node) => {
      this.nodeDegrees.set(node, this.graph!.degree(node));
    });
  }

  private getNodeSize(node: string): number {
    const degree = this.nodeDegrees.get(node) || 0;
    if (degree > 20) return 24;
    if (degree > 10) return 18;
    if (degree > 5) return 14;
    if (degree > 0) return 10;
    return 7;
  }

  private isNodeVisible(kind: string, file: string): boolean {
    if (this.filters.kinds.length > 0 && !this.filters.kinds.includes(kind)) {
      return false;
    }
    if (this.filters.folders && this.filters.folders.length > 0) {
      const folder = file.split('/').slice(0, -1).join('/');
      const rootFolder = folder.split('/')[0];
      if (this.filters.folders.includes(folder) || this.filters.folders.includes(rootFolder)) {
        return false;
      }
    }
    if (this.filters.files.length > 0 && !this.filters.files.includes(file)) {
      return false;
    }
    return true;
  }

  private buildGraph() {
    this.cleanup();

    const light = isLightTheme(this.container);
    const nodeColors = light ? LIGHT_NODE_COLORS : DARK_NODE_COLORS;
    const fallbackColor = light ? '#475569' : '#64748b';

    this.graph = new Graph();
    for (const node of this.graphData!.nodes) {
      this.graph.addNode(node.id, {
        label: node.name,
        kind: node.kind,
        language: node.language,
        file: node.file_path,
        startLine: node.start_line,
        endLine: node.end_line,
        color: nodeColors[node.kind] || fallbackColor,
        x: (Math.random() - 0.5) * 200,
        y: (Math.random() - 0.5) * 200,
        size: 7,
      });
    }

    for (const edge of this.graphData!.edges) {
      if (this.graph.hasNode(edge.source) && this.graph.hasNode(edge.target)) {
        if (!this.graph.hasEdge(edge.source, edge.target)) {
          this.graph.addEdge(edge.source, edge.target, { label: edge.kind });
        }
      }
    }

    this.computeDegrees();
    this.graph.forEachNode((node) => {
      this.graph!.setNodeAttribute(node, 'size', this.getNodeSize(node));
    });

    if (this.graph.order === 0) return;

    this.layoutGraph();
  }

  private layoutGraph() {
    if (!this.graph || this.graph.order === 0) return;

    if (this.layout === 'force') {
      const settings = forceAtlas2.inferSettings(this.graph);
      forceAtlas2.assign(this.graph, { iterations: 80, settings });
    } else {
      this.applyDagre();
    }

    this.normalizePositions();

    if (!this.sigmaInstance) {
      this.initSigma();
    } else {
      this.sigmaInstance.refresh();
    }
    requestAnimationFrame(() => this.fitToScreen());
  }

  private normalizePositions() {
    if (!this.graph || this.graph.order === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    this.graph.forEachNode((node) => {
      const x = this.graph!.getNodeAttribute(node, 'x');
      const y = this.graph!.getNodeAttribute(node, 'y');
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const scale = 300;

    this.graph.forEachNode((node) => {
      const x = this.graph!.getNodeAttribute(node, 'x');
      const y = this.graph!.getNodeAttribute(node, 'y');
      this.graph!.setNodeAttribute(node, 'x', ((x - minX) / rangeX - 0.5) * scale);
      this.graph!.setNodeAttribute(node, 'y', ((y - minY) / rangeY - 0.5) * scale);
    });
  }

  private initSigma() {
    if (!this.container || !this.graph || this.graph.order === 0) return;

    const light = isLightTheme(this.container);
    const labelColor = resolveCssVar(this.container, '--ai-text', light ? '#1f2937' : '#e6edf3');
    const edgeColor = light ? '#94a3b8' : '#475569';

    this.sigmaInstance = new Sigma(this.graph, this.container, {
      renderLabels: true,
      labelColor: { color: labelColor },
      labelFont: 'monospace',
      labelSize: 11,
      labelThreshold: 6,
      defaultEdgeType: 'arrow',
      edgeReducer: (edge, data) => {
        const res = { ...data };
        const sourceNode = this.graph!.source(edge);
        const targetNode = this.graph!.target(edge);
        const sourceAttrs = this.graph!.getNodeAttributes(sourceNode);
        const targetAttrs = this.graph!.getNodeAttributes(targetNode);
        const sourceVisible = this.isNodeVisible(sourceAttrs.kind, sourceAttrs.file);
        const targetVisible = this.isNodeVisible(targetAttrs.kind, targetAttrs.file);
        if (!sourceVisible || !targetVisible) {
          res.hidden = true;
        } else {
          res.color = edgeColor;
          res.size = 1;
        }
        return res;
      },
      nodeReducer: (node, data) => {
        const res = { ...data };
        const kind = data.kind as string;
        const file = data.file as string;
        if (!this.isNodeVisible(kind, file)) {
          res.hidden = true;
        }
        return res;
      },
    });

    this.sigmaInstance.on('enterNode', ({ node }) => {
      this.sigmaInstance!.setNodeAttribute(node, 'highlighted', true);
      this.sigmaInstance!.refresh();
    });

    this.sigmaInstance.on('leaveNode', ({ node }) => {
      this.sigmaInstance!.removeNodeAttribute(node, 'highlighted');
      this.sigmaInstance!.refresh();
    });

    this.sigmaInstance.on('clickNode', ({ node }) => {
      const now = Date.now();
      const isDoubleClick = this.lastClickNode === node && (now - this.lastClickTime) < 350;
      this.lastClickNode = node;
      this.lastClickTime = now;

      if (isDoubleClick) {
        const attrs = this.graph!.getNodeAttributes(node);
        this.dispatchEvent(new CustomEvent('node-navigate', {
          detail: { id: node, file_path: attrs.file, start_line: attrs.startLine },
          bubbles: true,
          composed: true,
        }));
        return;
      }

      const attrs = this.graph!.getNodeAttributes(node);
      const nodeData: GraphNode = {
        id: node,
        kind: attrs.kind,
        name: attrs.label,
        file_path: attrs.file,
        start_line: attrs.startLine,
        end_line: attrs.endLine,
        language: attrs.language,
      };
      this.dispatchEvent(new CustomEvent('node-select', { detail: nodeData }));
    });

    this.container.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  private applyDagre() {
    if (!this.graph) return;

    const g = new (window as any).dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 60 });
    g.setDefaultEdgeLabel(() => ({}));

    this.graph.forEachNode((node) => {
      g.setNode(node, { width: 120, height: 50 });
    });

    this.graph.forEachEdge((edge, attrs, source, target) => {
      g.setEdge(source, target);
    });

    (window as any).dagre.layout(g);

    this.graph.forEachNode((node) => {
      const pos = g.node(node);
      if (pos) {
        this.graph!.setNodeAttribute(node, 'x', pos.x);
        this.graph!.setNodeAttribute(node, 'y', pos.y);
      }
    });
  }

  private cleanup() {
    if (this.sigmaInstance) {
      this.sigmaInstance.kill();
      this.sigmaInstance = null;
    }
    this.graph = null;
    this.nodeDegrees.clear();
    this.lastClickNode = null;
    this.lastClickTime = 0;
  }

  public fitToScreen() {
    if (!this.sigmaInstance || !this.graph || this.graph.order === 0) return;

    const camera = this.sigmaInstance.getCamera();
    camera.setState({ x: 0, y: 0, ratio: 1.5, angle: 0 });
    this.sigmaInstance.refresh();
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
    return html`<div id="sigma-container"></div>`;
  }
}
