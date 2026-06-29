import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { GraphNode } from './graph-types';

const KIND_ICONS: Record<string, string> = {
  Function: 'mdi:function',
  Struct: 'mdi:code-braces-box',
  Enum: 'mdi:format-list-bulleted',
  Trait: 'mdi:link-variant',
  Impl: 'mdi:puzzle',
  Module: 'mdi:folder-outline',
  Import: 'mdi:import',
  File: 'mdi:file-document-outline',
  Constant: 'mdi:numeric',
  Type: 'mdi:format-letter-case',
};

@customElement('graph-sidebar')
export class GraphSidebar extends LitElement {
  @property({ type: Object }) node: GraphNode | null = null;

  static styles = css`
    :host {
      display: block;
      border-top: 1px solid var(--ai-panel-border, #1e293b);
      padding: 12px;
      background: var(--ai-panel-background, #1e1e2e);
    }
    .node-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--ai-text, #e2e8f0);
      margin-bottom: 4px;
    }
    .node-kind {
      font-size: 12px;
      color: var(--ai-text-muted, #94a3b8);
      margin-bottom: 8px;
    }
    .node-file {
      font-size: 11px;
      color: var(--ai-text-dim, #64748b);
      word-break: break-all;
    }
    .navigate-btn {
      margin-top: 12px;
      padding: 6px 12px;
      background: var(--brand-primary, #7c3aed);
      color: var(--ai-panel-background, #ffffff);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      width: 100%;
      transition: opacity 0.15s ease;
    }
    .navigate-btn:hover {
      opacity: 0.85;
    }
  `;

  render() {
    if (!this.node) return html``;

    return html`
      <div class="node-name">${this.node.name}</div>
      <div class="node-kind">${this.node.kind} · ${this.node.language}</div>
      <div class="node-file">${this.node.file_path}:${this.node.start_line}</div>
      <button class="navigate-btn" @click=${() => this.dispatchEvent(new CustomEvent('navigate'))}>
        Open in Editor
      </button>
    `;
  }
}
