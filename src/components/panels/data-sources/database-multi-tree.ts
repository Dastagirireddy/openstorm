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
  hasChildren?: boolean;
}

export type ObjectKind = 'connection' | 'database' | 'schema' | 'table' | 'view' | 'column' | 'sequence' | 'function' | 'extension' | 'index' | 'key';

@customElement('database-multi-tree')
export class DatabaseMultiTree extends TailwindElement() {
  @property({ type: Array }) dataSources: AnyDataSource[] = [];
  @property({ type: String }) projectPath: string | null = null;

  @state() private connectionTrees: Map<string, DatabaseObject[]> = new Map();
  @state() private expandedConnections = new Set<string>();
  @state() private expandedNodes: Map<string, Set<string>> = new Map();
  @state() private loadingConnections = new Set<string>();
  @state() private selectedNodeKey: string | null = null;
  @state() private hoveredNode: string | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('refresh-connection', this.handleRefreshConnection.bind(this));
  }

  protected willUpdate(changedProperties: Map<string, unknown>): void {
    super.willUpdate(changedProperties);
    if (changedProperties.has('dataSources')) {
      // Data sources changed - will trigger re-render
    }
    if (changedProperties.has('projectPath')) {
      // Project path changed
    }
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
    if (!expanded.has(node.id)) return;

    // Check if children are already loaded
    // - children === null/undefined: not loaded yet
    // - children === []: placeholder, needs loading
    // - children === [...]: already loaded
    const hasChildrenArray = Array.isArray(node.children);
    const childrenAlreadyLoaded = hasChildrenArray && node.children!.length > 0;

    // Don't reload if children are already loaded
    if (childrenAlreadyLoaded) {
      return;
    }

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

  private openQueryConsole(connectionId: string, connectionName: string, dbType: string) {
    const dialect = dbType === 'mysql' ? 'mysql' : 'postgresql';
    this.dispatchEvent(
      new CustomEvent('open-query-editor', {
        detail: {
          connectionId,
          connectionName,
          dialect,
          tableName: '',
          projectPath: this.projectPath,
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleNodeClick(connectionId: string, node: DatabaseObject) {
    this.selectedNodeKey = `${connectionId}:${node.id}`;

    // Only open query editor for actual tables and views (not folders, system files, etc.)
    const isFolder = !!node.metadata?.['folder'];
    const isSystemFile = node.metadata?.['isSystemFile'] as boolean;
    const isTableOrView = node.kind === 'table' || node.kind === 'view';
    const shouldOpenEditor = isTableOrView && !isFolder && !isSystemFile;

    if (shouldOpenEditor) {
      this.dispatchEvent(
        new CustomEvent('node-select', {
          detail: { connectionId, nodeId: node.id, node },
          bubbles: true,
          composed: true,
        })
      );
    }

    this.requestUpdate();
  }

  private handleNodeExpand(connectionId: string, node: DatabaseObject) {
    const expanded = this.expandedNodes.get(connectionId) || new Set();
    const wasExpanded = expanded.has(node.id);

    if (wasExpanded) {
      expanded.delete(node.id);
    } else {
      expanded.add(node.id);
    }
    this.expandedNodes.set(connectionId, expanded);
    this.requestUpdate();

    if (!wasExpanded) {
      this.loadChildren(connectionId, node);
    }
  }

  private getNodeTypeInfo(node: DatabaseObject): { type: string; info: string; count?: number } {
    const metadata = node.metadata || {};

    switch (node.kind) {
      case 'connection':
        return { type: (metadata['dbType'] as string) || 'Database', info: '' };
      case 'database':
        return { type: '', info: '' };
      case 'schema':
        // Show object count for schemas if available
        const objectCount = metadata['objectCount'] as number;
        return { type: '', info: '', count: objectCount };
      case 'table':
        // Check if it's a Tables folder
        const isTableFolder = metadata['folder'] as string;
        if (isTableFolder) {
          const count = metadata['count'] as number;
          return { type: 'Tables', info: '', count };
        }
        // Handle Database Objects folders (access_methods, casts, languages, virtual_views, db_objects)
        const dbObjectsFolder = metadata['folder'] as string;
        if (dbObjectsFolder) {
          const count = metadata['count'] as number;
          switch (dbObjectsFolder) {
            case 'access_methods':
              return { type: 'Access Methods', info: '', count };
            case 'casts':
              return { type: 'Casts', info: '', count };
            case 'languages':
              return { type: 'Languages', info: '', count };
            case 'virtual_views':
              return { type: 'Virtual Views', info: '', count };
            case 'db_objects':
              return { type: 'Database Objects', info: '', count };
            default:
              return { type: dbObjectsFolder.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()), info: '', count };
          }
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
      case 'sequence':
        // Check if it's a Sequences folder
        const isSequenceFolder = metadata['folder'] as string;
        if (isSequenceFolder) {
          const count = metadata['count'] as number;
          return { type: 'Sequences', info: '', count };
        }
        // Actual sequence
        return { type: 'SEQUENCE', info: '' };
      case 'function':
        // Check if it's a Functions folder
        const isFunctionFolder = metadata['folder'] as string;
        if (isFunctionFolder) {
          const count = metadata['count'] as number;
          return { type: 'Functions', info: '', count };
        }
        // Actual function - name already includes arguments
        return { type: 'FUNCTION', info: '' };
      case 'extension':
        // Check if it's an Extensions folder
        const isExtensionFolder = metadata['folder'] as string;
        if (isExtensionFolder) {
          const count = metadata['count'] as number;
          return { type: 'Extensions', info: '', count };
        }
        // Actual extension
        return { type: 'EXTENSION', info: '' };
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
      database: '#60A5FA',
      schema: '#FBBF24',
      table: '#34D399',
      view: '#C084FC',
      column: '#9CA3AF',
      sequence: '#F472B6',
      function: '#60A5FA',
      extension: '#A78BFA',
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
    // Use hasChildren from backend when available, otherwise fall back to old logic
    const hasChildrenBackend = node.hasChildren !== undefined ? node.hasChildren : null;
    const hasChildrenMetadata = node.metadata?.['hasChildren'] as boolean;
    const isFolderLike = node.metadata?.['folder'] as string;
    const hasLoadedChildren = Array.isArray(node.children) && node.children.length > 0;
    // Backend hasChildren takes precedence
    const hasChildren = hasChildrenBackend !== null
        ? hasChildrenBackend || hasLoadedChildren
        : (hasLoadedChildren || hasChildrenMetadata || isFolderLike);
    const isLoading = isNodeExpanded && !hasLoadedChildren && !hasChildrenMetadata;
    const iconColor = this.getIconColor(node.kind, node.metadata);
    const isSelected = this.selectedNodeKey === `${connectionId}:${node.id}`;
    const isHovered = this.hoveredNode === node.id;
    const { type, info, count } = this.getNodeTypeInfo(node);

    // Determine display icon based on node kind and metadata
    const isFolder = node.metadata?.['folder'] as string;
    const isActualColumn = node.kind === 'column' && !isFolder;
    const isActualIndex = node.kind === 'index' && !isFolder;
    const isTableFolder = (node.kind === 'table' || node.kind === 'view') && isFolder;
    const isSequenceFolder = node.kind === 'sequence' && isFolder;
    const isFunctionFolder = node.kind === 'function' && isFolder;
    const isExtensionFolder = node.kind === 'extension' && isFolder;
    const isDatabaseObjectsFolder = isFolder && ['access_methods', 'casts', 'languages', 'virtual_views', 'db_objects'].includes(isFolder);
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
    } else if (isTableFolder || isSequenceFolder || isFunctionFolder || isExtensionFolder || isDatabaseObjectsFolder) {
      // Folder types - use provided icon
      displayIcon = node.icon;
    }

    const indent = level * 12;

    return html`
      <div style="position: relative;" role="treeitem" aria-expanded="${hasChildren ? isNodeExpanded : undefined}" aria-selected="${isSelected}">
        <div
          class="flex items-center gap-1.5 h-6 px-2 cursor-pointer transition-colors duration-100"
          style="padding-left: ${indent + 8}px; background-color: ${isSelected ? 'var(--app-selection-background)' : (isHovered ? 'var(--app-toolbar-hover)' : 'transparent')};"
          @click=${() => this.handleNodeClick(connectionId, node)}
          @mouseenter=${() => { this.hoveredNode = node.id; }}
          @mouseleave=${() => { this.hoveredNode = null; }}
        >
          <!-- Expand/Collapse Icon (clickable only for expand/collapse) -->
          <span
            class="w-4 h-4 flex items-center justify-center flex-shrink-0 cursor-pointer"
            @click=${(e: Event) => {
              e.stopPropagation();
              if (hasChildren || isLoading) {
                this.handleNodeExpand(connectionId, node);
              }
            }}
          >
            ${hasChildren
              ? html`<iconify-icon
                  icon=${isNodeExpanded ? 'mdi:chevron-down' : 'mdi:chevron-right'}
                  width="16"
                  height="16"
                  style="color: ${isSelected ? 'var(--app-selection-foreground)' : (isHovered ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)')};"
                ></iconify-icon>`
              : isLoading
                ? html`<iconify-icon
                    icon="line-md:loading-loop"
                    class="animate-spin"
                    width="14"
                    height="14"
                    style="color: var(--brand-primary);"
                  ></iconify-icon>`
                : html`<span class="w-4 flex-shrink-0"></span>`}
          </span>

          <!-- Icon (with PK overlay for primary key columns) -->
          ${isPrimaryKey
            ? html`<div class="relative flex-shrink-0" style="margin-right: 6px;">
                <iconify-icon
                  icon=${displayIcon}
                  width="14"
                  height="14"
                  style="color: ${isSelected ? 'var(--app-selection-foreground)' : (isHovered ? 'var(--app-foreground)' : (isActualColumn ? columnIconColor : iconColor))};"
                ></iconify-icon>
                <iconify-icon
                  icon="mdi:key"
                  width="8"
                  height="8"
                  class="absolute -bottom-0.5 -right-0.5"
                  style="color: ${isSelected ? 'var(--app-selection-foreground)' : (isHovered ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)')};"
                  title="Primary Key"
                ></iconify-icon>
              </div>`
            : html`<iconify-icon
                icon=${displayIcon}
                width="14"
                height="14"
                class="flex-shrink-0"
                style="margin-right: 6px; color: ${isSelected ? 'var(--app-selection-foreground)' : (isHovered ? 'var(--app-foreground)' : (isActualColumn ? columnIconColor : iconColor))};"
              ></iconify-icon>`}

          <!-- Object Name -->
          <span class="text-[12px] font-medium truncate flex-1 min-w-0" style="color: ${isSelected ? 'var(--app-selection-foreground)' : (isHovered ? 'var(--app-foreground)' : 'var(--app-foreground)')};">
            ${node.name}
          </span>

          <!-- Badges container - right aligned, prevents overlap -->
          <div class="flex items-center gap-1 flex-shrink-0">
            ${count !== undefined && count !== null
              ? html`<span class="font-mono text-[10px] px-1.5 py-px rounded" style="color: ${isSelected ? 'var(--app-selection-foreground)' : (isHovered ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)')}; background: ${isSelected ? 'rgba(255,255,255,0.12)' : (isHovered ? 'rgba(128,128,128,0.12)' : 'rgba(128,128,128,0.08)')};">
                  ${count}
                </span>`
              : nothing}

            ${type && !count
              ? html`<span class="text-[10px] font-medium px-1.5 py-px rounded" style="color: ${isSelected ? 'var(--app-selection-foreground)' : (isHovered ? 'var(--app-foreground)' : 'var(--app-foreground)')}; opacity: ${isSelected ? '0.9' : (isHovered ? '0.85' : '0.7')}; background: ${isSelected ? 'rgba(255, 255, 255, 0.15)' : (isHovered ? 'rgba(128, 128, 128, 0.15)' : 'rgba(128, 128, 128, 0.08)')};">
                  ${type}
                </span>`
              : nothing}
          </div>
        </div>

        <!-- Children -->
        ${isNodeExpanded && node.children && node.children.length > 0
          ? html`<div style="position: relative; overflow-x: hidden;">${node.children.map(child => this.renderTreeNodeRow(connectionId, child, level + 1))}</div>`
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
    const dbType = connection.config.dbType || 'database';
    const dbIcon = this.getDbIcon(dbType);

    return html`
      <div>
        <!-- Connection Header Row -->
        <div
          class="group flex items-center h-7 px-2 cursor-pointer transition-colors duration-100"
          style="${this.hoveredNode === connection.id ? 'background-color: var(--app-toolbar-hover);' : ''}"
          @click=${() => this.handleConnectionClick(connection.id)}
          @mouseenter=${() => { this.hoveredNode = connection.id; }}
          @mouseleave=${() => { this.hoveredNode = null; }}
          role="treeitem"
          aria-expanded="${isExpanded}"
          aria-selected="${this.selectedNodeKey === connection.id}"
        >
          <!-- Expand/Collapse Icon (clickable only for expand/collapse) -->
          <span
            class="w-4 h-4 flex items-center justify-center flex-shrink-0 cursor-pointer rounded"
            @click=${(e: Event) => {
              e.stopPropagation();
              this.toggleConnection(connection.id);
            }}
          >
            ${isLoading
              ? html`<iconify-icon
                  icon="line-md:loading-loop"
                  class="animate-spin"
                  width="14"
                  height="14"
                  style="color: var(--brand-primary);"
                ></iconify-icon>`
              : html`<iconify-icon
                  icon=${isExpanded ? 'mdi:chevron-down' : 'mdi:chevron-right'}
                  width="16"
                  height="16"
                  style="color: var(--app-disabled-foreground);"
                ></iconify-icon>`}
          </span>

          <!-- Connection Icon -->
          <iconify-icon
            icon="${dbIcon}"
            width="14"
            height="14"
            class="flex-shrink-0"
            style="margin-right: 6px; color: var(--app-foreground);"
          ></iconify-icon>

          <!-- Connection Name -->
          <span class="text-[12px] font-medium truncate flex-1 min-w-0" style="color: var(--app-foreground);">
            ${connection.name}
          </span>

          <!-- Query Console Button (shown on hover) -->
          <button
            class="w-6 h-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-[var(--app-toolbar-hover)]"
            style="margin-right: 2px;"
            title="Open Query Console"
            @click=${(e: Event) => {
              e.stopPropagation();
              this.openQueryConsole(connection.id, connection.name, connection.config.dbType);
            }}
          >
            <iconify-icon
              icon="mdi:console"
              width="14"
              height="14"
              style="color: var(--app-foreground);"
            ></iconify-icon>
          </button>
        </div>

        <!-- Connection Children (Schemas, Tables, etc.) -->
        ${isExpanded && trees.length > 0
          ? html`<div class="mt-0.5">${trees.map(node => this.renderTreeNodeRow(connection.id, node, 1))}</div>`
          : nothing}

        ${isExpanded && trees.length === 0 && !isLoading
          ? html`<div class="px-6 py-2 text-[11px]" style="color: var(--app-disabled-foreground);">
              No objects found
            </div>`
          : nothing}
      </div>
    `;
  }

  render() {
    return html`
      <div class="flex flex-col h-full w-full overflow-y-auto py-1" role="tree">
        ${this.dataSources.length === 0
          ? html`
              <div class="flex flex-col items-center justify-center h-full text-center px-6 py-8">
                <div class="w-16 h-16 mb-4 rounded-xl flex items-center justify-center" style="background-color: var(--app-tab-inactive);">
                  <iconify-icon
                    icon="mdi:database-outline"
                    width="32"
                    height="32"
                    style="color: var(--app-disabled-foreground);"
                  ></iconify-icon>
                </div>
                <h3 class="text-[13px] font-semibold mb-1" style="color: var(--app-foreground);">No Database Connections</h3>
                <p class="text-[12px] mb-4 max-w-[200px]" style="color: var(--app-disabled-foreground);">
                  Connect to a database to view schemas, tables, and more
                </p>
              </div>
            `
          : this.dataSources.map((connection, index) => html`
              <div style="${index < this.dataSources.length - 1 ? 'margin-bottom: 2px;' : ''}">
                ${this.renderConnectionTree(connection)}
              </div>
            `)}
      </div>
    `;
  }
}
