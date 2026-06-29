import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { LayoutType, GraphFilters, GraphData, NodeKind } from './graph-types';

const NODE_KIND_INFO: { kind: NodeKind; label: string; color: string }[] = [
  { kind: 'Function', label: 'Functions', color: '#7c3aed' },
  { kind: 'Struct', label: 'Structs', color: '#2563eb' },
  { kind: 'Enum', label: 'Enums', color: '#0891b2' },
  { kind: 'Trait', label: 'Traits', color: '#d946ef' },
  { kind: 'Impl', label: 'Impls', color: '#f97316' },
  { kind: 'Module', label: 'Modules', color: '#059669' },
  { kind: 'Type', label: 'Types', color: '#0d9488' },
  { kind: 'Constant', label: 'Constants', color: '#e11d48' },
  { kind: 'Import', label: 'Imports', color: '#64748b' },
  { kind: 'File', label: 'Files', color: '#475569' },
];

const ALL_KINDS = NODE_KIND_INFO.map(k => k.kind);

@customElement('graph-toolbar')
export class GraphToolbar extends LitElement {
  @property({ type: String }) layout: LayoutType = 'force';
  @property({ type: Object }) filters: GraphFilters = { kinds: ALL_KINDS, languages: [], files: [], folders: [] };
  @property({ type: Object }) graphData: GraphData | null = null;
  @state() private showFilters = false;

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 12px;
      height: 35px;
      min-height: 35px;
      border-bottom: 1px solid var(--app-border, var(--ai-panel-border, #1e293b));
      background: var(--ai-panel-background, #1e1e2e);
      position: relative;
      z-index: 10;
      flex-shrink: 0;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: none;
      background: transparent;
      color: var(--app-disabled-foreground, var(--ai-text-muted, #94a3b8));
      cursor: pointer;
      transition: background 0.1s;
      padding: 0;
    }
    .btn:hover {
      background: var(--app-toolbar-hover, var(--ai-surface, #1e293b));
      color: var(--ai-text, #e2e8f0);
    }
    .btn.active {
      background: var(--brand-primary, #7c3aed);
      color: #ffffff;
    }
    .btn-icon {
      width: 24px;
      padding: 0;
    }
    .spacer { flex: 1; }
    .filter-panel {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      background: var(--ai-panel-background, #0f172a);
      border: 1px solid var(--ai-panel-border, #1e293b);
      border-radius: 8px;
      padding: 12px;
      z-index: 100;
      min-width: 220px;
      max-height: 400px;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    .filter-panel::-webkit-scrollbar { width: 4px; }
    .filter-panel::-webkit-scrollbar-thumb { background: var(--ai-panel-border, #334155); border-radius: 2px; }
    .section-title {
      font-size: 10px;
      font-weight: 600;
      color: var(--ai-text-dim, #64748b);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      margin-top: 4px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 6px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.1s;
    }
    .row:hover {
      background: var(--ai-surface, #1e293b);
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .label {
      font-size: 12px;
      color: var(--ai-text, #cbd5e1);
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .check {
      width: 16px;
      height: 16px;
      border: 1.5px solid var(--ai-text-dim, #475569);
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .check.checked {
      background: var(--brand-primary, #7c3aed);
      border-color: var(--brand-primary, #7c3aed);
    }
    .check svg {
      width: 11px;
      height: 11px;
      color: #ffffff;
    }
    .section-divider {
      height: 1px;
      background: var(--ai-panel-border, #1e293b);
      margin: 8px 0;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this._handleClickOutside = this._handleClickOutside.bind(this);
    document.addEventListener('click', this._handleClickOutside);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._handleClickOutside);
  }

  private _handleClickOutside(e: MouseEvent) {
    if (!this.showFilters) return;
    const path = e.composedPath();
    if (!path.includes(this)) {
      this.showFilters = false;
    }
  }

  private get uniqueFolders(): string[] {
    if (!this.graphData) return [];
    const folders = new Set<string>();
    for (const node of this.graphData.nodes) {
      const parts = node.file_path.split('/');
      if (parts.length > 1) {
        folders.add(parts.slice(0, -1).join('/'));
      }
    }
    return Array.from(folders).sort();
  }

  private toggleLayout() {
    const newLayout = this.layout === 'force' ? 'hierarchical' : 'force';
    this.dispatchEvent(new CustomEvent('layout-change', { detail: newLayout }));
  }

  private toggleKind(kind: NodeKind) {
    const current = this.filters.kinds;
    const updated = current.includes(kind)
      ? current.filter((k) => k !== kind)
      : [...current, kind];
    this.dispatchEvent(
      new CustomEvent('filter-change', {
        detail: { ...this.filters, kinds: updated },
      })
    );
  }

  private toggleFolder(folder: string) {
    const current = this.filters.folders;
    const updated = current.includes(folder)
      ? current.filter((f) => f !== folder)
      : [...current, folder];
    this.dispatchEvent(
      new CustomEvent('filter-change', {
        detail: { ...this.filters, folders: updated },
      })
    );
  }

  private emitAction(action: string) {
    this.dispatchEvent(new CustomEvent('graph-action', { detail: action }));
  }

  private renderCheckmark() {
    return html`<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M2 6l3 3 5-5"/>
    </svg>`;
  }

  render() {
    const folders = this.uniqueFolders;
    return html`
      <div class="flex items-center gap-1.5" style="margin-right: 4px;">
        <iconify-icon icon="mdi:graph-outline" width="14" style="color: var(--brand-primary, #7c3aed);"></iconify-icon>
        <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--app-disabled-foreground, var(--ai-text-dim, #64748b));">Graph</span>
      </div>
      <button class="btn ${this.layout === 'force' ? 'active' : ''}"
              @click=${this.toggleLayout}
              title="Toggle layout">
        <iconify-icon icon="mdi:${this.layout === 'force' ? 'orbit' : 'file-tree'}" width="14"></iconify-icon>
      </button>
      <button class="btn" @click=${() => (this.showFilters = !this.showFilters)}
              title="Filters">
        <iconify-icon icon="mdi:filter-variant" width="14"></iconify-icon>
      </button>
      <span class="spacer"></span>
      <button class="btn btn-icon" @click=${() => this.emitAction('zoom-in')} title="Zoom in">
        <iconify-icon icon="mdi:magnify-plus" width="14"></iconify-icon>
      </button>
      <button class="btn btn-icon" @click=${() => this.emitAction('zoom-out')} title="Zoom out">
        <iconify-icon icon="mdi:magnify-minus" width="14"></iconify-icon>
      </button>
      <button class="btn btn-icon" @click=${() => this.emitAction('fit-screen')} title="Fit to screen">
        <iconify-icon icon="mdi:fit-to-screen" width="14"></iconify-icon>
      </button>
      ${this.showFilters
        ? html`<div class="filter-panel" @click=${(e: MouseEvent) => e.stopPropagation()}>
            <div class="section-title">Node Types</div>
            ${NODE_KIND_INFO.map(({ kind, label, color }) => {
              const visible = this.filters.kinds.includes(kind);
              return html`
                <div class="row" @click=${() => this.toggleKind(kind)}>
                  <div class="dot" style="background: ${color}"></div>
                  <span class="label">${label}</span>
                  <div class="check ${visible ? 'checked' : ''}">
                    ${visible ? this.renderCheckmark() : ''}
                  </div>
                </div>
              `;
            })}
            ${folders.length > 0 ? html`
              <div class="section-divider"></div>
              <div class="section-title">Folders (uncheck to hide)</div>
              ${folders.map((folder) => {
                const hidden = this.filters.folders.includes(folder);
                return html`
                  <div class="row" @click=${() => this.toggleFolder(folder)}>
                    <iconify-icon icon="mdi:folder-outline" width="14" style="color: #f59e0b; flex-shrink: 0;"></iconify-icon>
                    <span class="label">${folder}</span>
                    <div class="check ${hidden ? 'checked' : ''}">
                      ${hidden ? this.renderCheckmark() : ''}
                    </div>
                  </div>
                `;
              })}
            ` : ''}
          </div>`
        : ''}
    `;
  }
}
