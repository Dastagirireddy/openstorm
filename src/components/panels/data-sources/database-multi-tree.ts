/**
 * Database Multi-Tree Component
 *
 * IntelliJ-style database tree with inline metadata:
 * - Header toolbar with actions
 * - Tree rows with inline metadata (no column headers)
 */

import { html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../../../tailwind-element.js';
import { invoke } from '@tauri-apps/api/core';
import type { AnyDataSource } from './data-source-types.js';

export interface DatabaseObject {
  id: string;
  name: string;
  kind: ObjectKind;
  icon: string;
  children?: DatabaseObject[] | null;
  expanded: boolean;
  metadata?: Record<string, unknown>;
}

export type ObjectKind = 'connection' | 'schema' | 'table' | 'view' | 'column';

@customElement('database-multi-tree')
export class DatabaseMultiTree extends TailwindElement() {
  @property({ type: Array }) dataSources: AnyDataSource[] = [];
  @property({ type: String }) projectPath: string | null = null;

  @state() private connectionTrees: Map<string, DatabaseObject[]> = new Map();
  @state() private expandedConnections = new Set<string>();
  @state() private expandedNodes: Map<string, Set<string>> = new Map();
  @state() private loadingConnections = new Set<string>();
  @state() private selectedNodeId: string | null = null;
  @state() private hoveredNode: string | null = null;

  connectedCallback(): void {
    super.connectedCallback();
  }

  private dispatchRemove(connectionId: string) {
    this.dispatchEvent(
      new CustomEvent('remove', {
        detail: { id: connectionId },
        bubbles: true,
        composed: true,
      })
    );
  }

  private async loadConnectionObjects(connectionId: string) {
    if (this.connectionTrees.has(connectionId)) return;

    this.loadingConnections.add(connectionId);
    this.requestUpdate();

    try {
      const result = await invoke<DatabaseObject[]>('db_get_objects', {
        connectionId,
        projectPath: this.projectPath,
      });

      this.connectionTrees.set(connectionId, result);
      this.expandedConnections.add(connectionId);
    } catch (err) {
      console.error('Failed to load connection objects:', err);
    } finally {
      this.loadingConnections.delete(connectionId);
      this.requestUpdate();
    }
  }

  private toggleConnection(connectionId: string) {
    if (this.expandedConnections.has(connectionId)) {
      this.expandedConnections.delete(connectionId);
    } else {
      this.expandedConnections.add(connectionId);
      if (!this.connectionTrees.has(connectionId)) {
        this.loadConnectionObjects(connectionId);
      }
    }
    this.requestUpdate();
  }

  private toggleNode(connectionId: string, nodeId: string) {
    const expanded = this.expandedNodes.get(connectionId) || new Set();
    if (expanded.has(nodeId)) {
      expanded.delete(nodeId);
    } else {
      expanded.add(nodeId);
    }
    this.expandedNodes.set(connectionId, expanded);
    this.requestUpdate();
  }

  private async loadChildren(connectionId: string, node: DatabaseObject) {
    const expanded = this.expandedNodes.get(connectionId) || new Set();
    if (!expanded.has(node.id) || node.children != null) return;

    try {
      const children = await invoke<DatabaseObject[]>('db_get_children', {
        connectionId,
        parent: node,
        projectPath: this.projectPath,
      });

      const trees = this.connectionTrees.get(connectionId) || [];
      this.updateNodeWithChildren(trees, node.id, children);
      this.connectionTrees.set(connectionId, trees);
      this.requestUpdate();
    } catch (err) {
      console.error('Failed to load children:', err);
    }
  }

  private updateNodeWithChildren(objects: DatabaseObject[], targetId: string, children: DatabaseObject[]) {
    for (const obj of objects) {
      if (obj.id === targetId) {
        obj.children = children;
        return;
      }
      if (obj.children) {
        this.updateNodeWithChildren(obj.children, targetId, children);
      }
    }
  }

  private handleConnectionClick(connectionId: string) {
    this.toggleConnection(connectionId);
  }

  private handleNodeClick(connectionId: string, node: DatabaseObject) {
    this.selectedNodeId = node.id;
    this.toggleNode(connectionId, node.id);
    if (this.expandedNodes.get(connectionId)?.has(node.id)) {
      this.loadChildren(connectionId, node);
    }
  }

  private getNodeTypeInfo(node: DatabaseObject): { type: string; info: string; count?: number } {
    const metadata = node.metadata || {};

    switch (node.kind) {
      case 'connection':
        return { type: (metadata['dbType'] as string) || 'Database', info: '' };
      case 'schema':
        return { type: '', info: '' };
      case 'table':
        // Check if it's a Tables folder
        const isTableFolder = metadata['folder'] as string;
        if (isTableFolder) {
          const count = metadata['count'] as number;
          return { type: 'Tables', info: '', count };
        }
        // Actual table - show table type
        const tableType = metadata['type'] as string;
        return {
          type: tableType === 'BASE TABLE' ? 'TABLE' : (tableType || ''),
          info: ''
        };
      case 'view':
        // Check if it's a Views folder
        const isViewFolder = metadata['folder'] as string;
        if (isViewFolder) {
          const count = metadata['count'] as number;
          return { type: 'Views', info: '', count };
        }
        // Actual view
        return { type: 'VIEW', info: '' };
      case 'column':
        // Check if it's a folder or actual column
        const isFolder = metadata['folder'] as string;
        if (isFolder) {
          const count = metadata['count'] as number;
          return { type: isFolder.charAt(0).toUpperCase() + isFolder.slice(1), info: '', count };
        }
        // Actual column - show only data type, no constraints
        const dataType = (metadata['dataType'] as string) || '';
        return {
          type: dataType,
          info: ''
        };
      case 'index':
        const isIndexFolder = metadata['folder'] as string;
        if (isIndexFolder) {
          const count = metadata['count'] as number;
          return { type: 'Indexes', info: '', count };
        }
        // Actual index - show columns in type
        const indexColumns = metadata['columns'] as string;
        const isUnique = metadata['isUnique'] as boolean;
        return {
          type: 'INDEX',
          info: isUnique ? 'UNIQUE' + (indexColumns ? ` ${indexColumns}` : '') : (indexColumns || '')
        };
      case 'key':
        const keyCount = metadata['count'] as number;
        if (keyCount !== undefined) {
          return { type: 'Keys', info: '', count: keyCount };
        }
        // Actual key - show constraint type and columns
        const constraintType = metadata['constraintType'] as string;
        const keyColumns = metadata['columns'] as string;
        const refTable = metadata['referenceTable'] as string;
        if (constraintType === 'FOREIGN KEY' && refTable) {
          return { type: 'FK', info: `→ ${refTable}${keyColumns ? `(${keyColumns})` : ''}` };
        }
        return { type: constraintType || 'KEY', info: keyColumns || '' };
      default:
        return { type: '', info: '' };
    }
  }

  private getIconColor(kind: ObjectKind, metadata?: Record<string, unknown>): string {
    if (metadata?.['iconColor']) return metadata['iconColor'] as string;
    const colors: Record<ObjectKind, string> = {
      connection: '#3B82F6',
      schema: '#F59E0B',
      table: '#10B981',
      view: '#A855F7',
      column: '#64748B',
      index: '#F59E0B',
      key: '#F59E0B',
    };
    return colors[kind] || 'var(--app-foreground)';
  }

  private getColumnIcon(dataType: string): string {
    const type = dataType.toLowerCase();
    // Integers
    if (type.includes('int') || type.includes('serial')) return 'mdi:counter';
    // Booleans
    if (type.includes('bool')) return 'mdi:toggle-switch';
    // Text types
    if (type.includes('char') || type.includes('text')) return 'mdi:text-box';
    // Date/Time
    if (type.includes('date')) return 'mdi:calendar-clock';
    if (type.includes('time')) return 'mdi:clock-outline';
    // JSON
    if (type.includes('json')) return 'mdi:code-json';
    // UUID
    if (type.includes('uuid')) return 'mdi:fingerprint';
    // Numbers
    if (type.includes('float') || type.includes('double')) return 'mdi:chart-timeline-variant-shimmer';
    if (type.includes('decimal') || type.includes('numeric')) return 'mdi:currency-usd';
    // Binary
    if (type.includes('blob') || type.includes('byte')) return 'mdi:database-outline';
    // Default
    return 'mdi:variable';
  }

  private getDbIcon(dbType: string): string {
    const icons: Record<string, string> = {
      postgresql: 'simple-icons:postgresql',
      mysql: 'simple-icons:mysql',
      sqlite: 'simple-icons:sqlite',
      mongodb: 'simple-icons:mongodb',
      redis: 'simple-icons:redis',
      mariadb: 'simple-icons:mariadb',
      sqlserver: 'simple-icons:microsoftsqlserver',
      oracle: 'simple-icons:oracle',
      cockroachdb: 'simple-icons:cockroachlabs',
      clickhouse: 'simple-icons:clickhouse',
      neo4j: 'simple-icons:neo4j',
      elasticsearch: 'simple-icons:elasticsearch',
    };
    return icons[dbType] || 'mdi:database';
  }

  private renderTreeNodeRow(
    connectionId: string,
    node: DatabaseObject,
    level: number
  ) {
    const expanded = this.expandedNodes.get(connectionId) || new Set();
    const isNodeExpanded = expanded.has(node.id);
    const hasChildren = node.children != null && node.children.length > 0;
    const isLoading = isNodeExpanded && node.children == null;
    const iconColor = this.getIconColor(node.kind, node.metadata);
    const isSelected = this.selectedNodeId === node.id;
    const isHovered = this.hoveredNode === node.id;
    const { type, info, count } = this.getNodeTypeInfo(node);

    const rowClasses = `
      flex items-center h-6 px-2 cursor-pointer rounded
      transition-colors duration-100
      ${isSelected ? 'bg-[var(--app-selected)]' : ''}
      ${!isSelected && isHovered ? 'bg-[var(--app-hover)]' : ''}
    `.trim();

    // Determine display icon based on node kind and metadata
    const isFolder = node.metadata?.['folder'] as string;
    const isActualColumn = node.kind === 'column' && !isFolder;
    const isActualIndex = node.kind === 'index' && !isFolder;
    const isTableFolder = (node.kind === 'table' || node.kind === 'view') && isFolder;
    let displayIcon = node.icon;
    let isPrimaryKey = false;

    if (isActualColumn) {
      // Actual column - use type-specific icon
      displayIcon = this.getColumnIcon(type);
      isPrimaryKey = node.metadata?.['isPrimaryKey'] as boolean;
    } else if (isActualIndex) {
      // Actual index
      displayIcon = 'mdi:database-outline';
    } else if (node.kind === 'key') {
      // Key node
      displayIcon = 'mdi:key';
    } else if (isTableFolder) {
      // Table/View folder - use folder icon
      displayIcon = node.icon;
    }

    return html`
      <div>
        <div
          class=${rowClasses}
          style="padding-left: ${level * 16 + 8}px;"
          @click=${() => this.handleNodeClick(connectionId, node)}
          @mouseenter=${() => { this.hoveredNode = node.id; }}
          @mouseleave=${() => { this.hoveredNode = null; }}
        >
          <!-- Expand/Collapse Icon -->
          <span class="w-4 h-4 flex items-center justify-center mr-1 flex-shrink-0">
            ${hasChildren
              ? html`<iconify-icon
                  icon=${isNodeExpanded ? 'mdi:chevron-down' : 'mdi:chevron-right'}
                  width="20"
                  height="20"
                  style="color: var(--app-muted-foreground);"
                ></iconify-icon>`
              : isLoading
                ? html`<iconify-icon
                    icon="mdi:loading"
                    class="animate-spin"
                    width="16"
                    height="16"
                    style="color: var(--brand-primary);"
                  ></iconify-icon>`
                : html`<span class="w-3.5"></span>`}
          </span>

          <!-- Icon (with PK overlay for primary key columns) -->
          ${isPrimaryKey
            ? html`<div class="relative mr-1.5 flex-shrink-0">
                <iconify-icon
                  icon=${displayIcon}
                  width="16"
                  height="16"
                  style="color: ${iconColor};"
                ></iconify-icon>
                <iconify-icon
                  icon="mdi:key"
                  width="9"
                  height="9"
                  class="absolute -bottom-0.5 -right-0.5"
                  style="color: #F59E0B;"
                  title="Primary Key"
                ></iconify-icon>
              </div>`
            : html`<iconify-icon
                icon=${displayIcon}
                width="16"
                height="16"
                class="mr-1.5 flex-shrink-0"
                style="color: ${iconColor};"
              ></iconify-icon>`}

          <!-- Object Name with count -->
          <span class="text-[14px] font-medium whitespace-nowrap" style="color: var(--app-foreground);">
            ${node.name}${count ? html`&nbsp;<span class="font-mono text-[12px]" style="color: var(--app-muted-foreground); opacity: 0.6;">${count}</span>` : nothing}
          </span>

          <!-- Type label for non-folder nodes -->
          ${type && !count
            ? html`<span class="text-[12px] font-medium ml-1.5 px-1.5 py-0.5 rounded" style="color: var(--app-muted-foreground); opacity: 0.7; background: var(--app-selected);">
                ${type}
              </span>`
            : nothing}
        </div>

        <!-- Children -->
        ${isNodeExpanded && node.children && node.children.length > 0
          ? html`<div>${node.children.map(child => this.renderTreeNodeRow(connectionId, child, level + 1))}</div>`
          : nothing}
      </div>
    `;
  }

  private renderConnectionTree(connection: AnyDataSource) {
    const isExpanded = this.expandedConnections.has(connection.id);
    const trees = this.connectionTrees.get(connection.id) || [];
    const isLoading = this.loadingConnections.has(connection.id);
    const dbType = connection.config.dbType || 'database';
    const dbIcon = this.getDbIcon(dbType);

    return html`
      <div class="mb-2">
        <!-- Connection Header Row -->
        <div
          class="flex items-center h-7 px-2 cursor-pointer rounded hover:bg-[var(--app-hover)] transition-colors duration-150"
          @click=${() => this.handleConnectionClick(connection.id)}
        >
          <!-- Expand/Collapse Icon -->
          <span class="w-4 h-4 flex items-center justify-center mr-2 flex-shrink-0">
            ${isLoading
              ? html`<iconify-icon
                  icon="mdi:loading"
                  class="animate-spin"
                  width="14"
                  height="14"
                  style="color: var(--brand-primary);"
                ></iconify-icon>`
              : html`<iconify-icon
                  icon=${isExpanded ? 'mdi:chevron-down' : 'mdi:chevron-right'}
                  width="20"
                  height="20"
                  style="color: var(--app-muted-foreground);"
                ></iconify-icon>`}
          </span>

          <!-- Connection Icon -->
          <iconify-icon
            icon="${dbIcon}"
            width="16"
            height="16"
            class="mr-2 flex-shrink-0"
            style="color: var(--app-foreground);"
          ></iconify-icon>

          <!-- Connection Name with Type Badge -->
          <span class="text-[14px] font-medium truncate flex-1" style="color: var(--app-foreground);">
            ${connection.name}
          </span>
          <span class="text-[11px] font-medium ml-1.5 px-1.5 py-0.5 rounded" style="color: var(--app-muted-foreground); background: var(--app-selected);">
            ${dbType}
          </span>
        </div>

        <!-- Connection Children (Schemas, Tables, etc.) -->
        ${isExpanded && trees.length > 0
          ? html`<div class="mt-0.5 pl-4">${trees.map(node => this.renderTreeNodeRow(connection.id, node, 0))}</div>`
          : nothing}

        ${isExpanded && trees.length === 0 && !isLoading
          ? html`<div class="px-6 py-2 text-[10px]" style="color: var(--app-disabled-foreground);">
              No objects found
            </div>`
          : nothing}
      </div>
    `;
  }

  render() {
    if (this.dataSources.length === 0) {
      return html`
        <div class="flex flex-col items-center justify-center h-full py-6 text-center px-4">
          <iconify-icon
            icon="mdi:database-outline"
            width="40"
            height="40"
            style="color: var(--app-disabled-foreground); opacity: 0.6;"
          ></iconify-icon>
          <p class="text-[11px] mt-3 font-medium" style="color: var(--app-foreground);">No database connections</p>
          <p class="text-[10px] mt-1" style="color: var(--app-disabled-foreground);">
            Click + to add a connection
          </p>
        </div>
      `;
    }

    return html`
      <div class="flex flex-col h-full w-full overflow-y-auto px-1 pb-2">
        ${this.dataSources.map(connection => this.renderConnectionTree(connection))}
      </div>
    `;
  }
}
