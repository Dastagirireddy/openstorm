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
  @state() private activeConnections = new Set<string>();
  @state() private selectedNodeId: string | null = null;
  @state() private hoveredNode: string | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('refresh-connection', this.handleRefreshConnection.bind(this));
  }

  disconnectedCallback(): void {
    this.removeEventListener('refresh-connection', this.handleRefreshConnection.bind(this));
    super.disconnectedCallback();
  }

  private handleRefreshConnection(e: CustomEvent) {
    e.stopPropagation();
    const connectionId = e.detail.connectionId;
    if (connectionId) {
      this.refreshConnection(connectionId, new Event('click'));
    }
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
      this.activeConnections.add(connectionId);
    } catch (err) {
      console.error('Failed to load connection objects:', err);
    } finally {
      this.loadingConnections.delete(connectionId);
      this.requestUpdate();
    }
  }

  private async handleDisconnect(connectionId: string, e: Event) {
    e.stopPropagation();
    try {
      await invoke('db_disconnect', { connectionId });
      this.activeConnections.delete(connectionId);
      this.connectionTrees.delete(connectionId);
      this.expandedConnections.delete(connectionId);
      this.expandedNodes.delete(connectionId);
      this.requestUpdate();
    } catch (err) {
      console.error('Failed to disconnect:', err);
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
    this.dispatchEvent(
      new CustomEvent('node-select', {
        detail: { connectionId },
        bubbles: true,
        composed: true,
      })
    );
    this.toggleConnection(connectionId);
  }

  private handleNodeClick(connectionId: string, node: DatabaseObject) {
    this.selectedNodeId = node.id;
    const expanded = this.expandedNodes.get(connectionId) || new Set();
    const wasExpanded = expanded.has(node.id);

    // Toggle the expanded state
    if (wasExpanded) {
      expanded.delete(node.id);
    } else {
      expanded.add(node.id);
    }
    this.expandedNodes.set(connectionId, expanded);
    this.requestUpdate();

    // If now expanded, load children
    if (!wasExpanded) {
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
          return { type: '', info: '', count };
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
          return { type: '', info: '', count: keyCount };
        }
        // Actual key - show constraint type and columns
        const constraintType = metadata['constraintType'] as string;
        const keyColumns = metadata['columns'] as string;
        const refTable = metadata['referenceTable'] as string;
        if (constraintType === 'FOREIGN KEY' && refTable) {
          return { type: 'Foreign Key', info: `→ ${refTable}${keyColumns ? `(${keyColumns})` : ''}` };
        }
        return { type: 'Primary Key', info: keyColumns || '' };
      default:
        return { type: '', info: '' };
    }
  }

  private getIconColor(kind: ObjectKind, metadata?: Record<string, unknown>): string {
    if (metadata?.['iconColor']) return metadata['iconColor'] as string;
    const colors: Record<ObjectKind, string> = {
      connection: '#60A5FA',
      schema: '#FBBF24',
      table: '#34D399',
      view: '#C084FC',
      column: '#9CA3AF',
      index: '#FBBF24',
      key: '#FBBF24',
    };
    return colors[kind] || 'var(--app-foreground)';
  }

  private getColumnIcon(dataType: string): string {
    const type = dataType.toLowerCase();
    // Integers
    if (type.includes('int') || type.includes('serial')) return 'mdi:numeric';
    // Booleans
    if (type.includes('bool')) return 'mdi:checkbox-marked';
    // Text types
    if (type.includes('char') || type.includes('text')) return 'mdi:text';
    // Date/Time
    if (type.includes('date')) return 'mdi:calendar';
    if (type.includes('time')) return 'mdi:clock-time-four';
    // JSON
    if (type.includes('json')) return 'mdi:code-braces';
    // UUID
    if (type.includes('uuid')) return 'mdi:barcode';
    // Numbers
    if (type.includes('float') || type.includes('double') || type.includes('decimal') || type.includes('numeric')) return 'mdi:decimal';
    // Binary
    if (type.includes('blob') || type.includes('byte')) return 'mdi:paperclip';
    // Default
    return 'mdi:alpha-a-box';
  }

  private getColumnIconColor(dataType: string): string {
    const type = dataType.toLowerCase();
    // Integers - Orange
    if (type.includes('int') || type.includes('serial')) return '#FB923C';
    // Booleans - Green
    if (type.includes('bool')) return '#4ADE80';
    // Text types - Blue
    if (type.includes('char') || type.includes('text')) return '#60A5FA';
    // Date/Time - Purple
    if (type.includes('date') || type.includes('time')) return '#C084FC';
    // JSON - Yellow
    if (type.includes('json')) return '#FACC15';
    // UUID - Pink
    if (type.includes('uuid')) return '#F472B6';
    // Numbers - Teal
    if (type.includes('float') || type.includes('double') || type.includes('decimal') || type.includes('numeric')) return '#2DD4BF';
    // Binary - Gray
    if (type.includes('blob') || type.includes('byte')) return '#9CA3AF';
    // Default - Slate
    return '#78716C';
  }

  private getDbIcon(dbType: string): string {
    const icons: Record<string, string> = {
      postgresql: 'logos:postgresql',
      mysql: 'logos:mysql',
      sqlite: 'logos:sqlite',
      mongodb: 'logos:mongodb',
      redis: 'logos:redis',
      mariadb: 'logos:mariadb',
      sqlserver: 'logos:microsoft',
      oracle: 'logos:oracle',
      cockroachdb: 'logos:cockroachlabs',
      clickhouse: 'logos:clickhouse',
      neo4j: 'logos:neo4j',
      elasticsearch: 'logos:elastic',
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
    let columnIconColor = iconColor;
    let isPrimaryKey = false;

    if (isActualColumn) {
      // Actual column - use type-specific icon with color
      displayIcon = this.getColumnIcon(type);
      columnIconColor = this.getColumnIconColor(type);
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
                    icon="line-md:loading-loop"
                    class="animate-spin"
                    width="18"
                    height="18"
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
                  style="color: ${isActualColumn ? columnIconColor : iconColor};"
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
                style="color: ${isActualColumn ? columnIconColor : iconColor};"
              ></iconify-icon>`}

          <!-- Object Name with count -->
          <span class="text-[14px] font-medium whitespace-nowrap" style="color: var(--app-foreground);">
            ${node.name}${count !== undefined && count !== null ? html`&nbsp;<span class="font-mono text-[12px]" style="color: var(--app-muted-foreground); opacity: 0.6;">${count}</span>` : nothing}
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

  private async refreshConnection(connectionId: string, e: Event) {
    e.stopPropagation();
    this.connectionTrees.delete(connectionId);
    this.expandedConnections.delete(connectionId);
    this.expandedNodes.delete(connectionId);
    await this.loadConnectionObjects(connectionId);
  }

  private renderConnectionTree(connection: AnyDataSource) {
    const isExpanded = this.expandedConnections.has(connection.id);
    const trees = this.connectionTrees.get(connection.id) || [];
    const isLoading = this.loadingConnections.has(connection.id);
    const isActive = this.activeConnections.has(connection.id);
    const dbType = connection.config.dbType || 'database';
    const dbIcon = this.getDbIcon(dbType);

    return html`
      <div class="mb-2">
        <!-- Connection Header Row -->
        <div
          class="group flex items-center h-8 px-2 cursor-pointer rounded hover:bg-[var(--app-hover)] transition-colors duration-150"
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
            style="color: ${isActive ? 'var(--brand-primary)' : 'var(--app-foreground);'}"
          ></iconify-icon>

          <!-- Connection Name with Type Badge -->
          <span class="text-[14px] font-medium truncate flex-1" style="color: var(--app-foreground);">
            ${connection.name}
          </span>
          <span class="text-[7px] font-bold ml-2 px-1 py-0.5 rounded" style="color: #6366F1; border: 1px solid #6366F1; letter-spacing: 0.03em;">
            ${dbType.toUpperCase()}
          </span>
          ${isActive
            ? html`
                <button
                  @click=${(e: Event) => this.handleDisconnect(connection.id, e)}
                  class="ml-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--app-hover)] transition-all"
                  title="Disconnect"
                >
                  <iconify-icon
                    icon="mdi:plug"
                    width="14"
                    height="14"
                    style="color: var(--app-muted-foreground);"
                  ></iconify-icon>
                </button>
              `
            : nothing}
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
