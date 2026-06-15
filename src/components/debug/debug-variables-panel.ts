/**
 * Debug Variables Panel
 * Displays variables during debugging with expand/collapse, pin, and edit functionality
 */

import { html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invoke } from "@tauri-apps/api/core";
import { TailwindElement } from "../../tailwind-element.js";
import type { Variable } from "../debug-panel.js";
import { getValueClass, copyToClipboard } from "../../lib/debug/debug-utils.js";

interface EditingVariable {
  path: string;
  value: string;
  original: string;
}

@customElement("debug-variables-panel")
export class DebugVariablesPanel extends TailwindElement() {
  @state() variables: Variable[] = [];
  @state() isLoading = false;
  @state() variableFilter = "";
  @state() isDebugging = false;
  private expandedVariables = new Set<string>();
  private pinnedVariables = new Set<string>();
  private editingVariable: EditingVariable | null = null;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("debug-state-changed", (e: any) => {
      this.isDebugging = e.detail.isDebugging;
      if (this.isDebugging && e.detail.debugState === "stopped") {
        this.refresh();
      }
      this.requestUpdate();
    });
  }

  async refresh() {
    this.isLoading = true;
    try {
      const stackFrames = await invoke<any[]>("get_stack_trace");
      if (!stackFrames || stackFrames.length === 0) {
        this.variables = [];
        return;
      }

      const topFrame = stackFrames[0];
      let scopes: any[] = [];
      try {
        scopes = await invoke<any[]>("get_scopes", { frameId: topFrame.id });
      } catch {
        this.variables = [];
        return;
      }

      if (!scopes || scopes.length === 0) {
        this.variables = [];
        return;
      }

      const scope = scopes[0];
      const vars = await invoke<any[]>("get_variables", {
        variablesReference: scope.variablesReference,
      });

      this.variables = (vars || []).map((v) => ({
        name: v.name,
        value: v.value,
        type: v.variable_type,
        variablesReference: v.variables_reference || 0,
        namedVariables: v.named_variables,
        indexedVariables: v.indexed_variables,
        expanded: false,
        pinned: this.pinnedVariables.has(v.name),
      }));
    } catch (error) {
      console.error("Failed to get variables:", error);
      this.variables = [];
    } finally {
      this.isLoading = false;
    }
  }

  private async expandVariable(path: string, variablesReference: number) {
    if (variablesReference === 0) return;

    try {
      const children = await invoke<any[]>("get_variables", {
        variablesReference,
      });

      this.variables = this.updateVariableChildren(
        this.variables,
        path,
        (children || []).map((c) => ({
          name: c.name,
          value: c.value,
          type: c.variable_type,
          variablesReference: c.variables_reference || 0,
          namedVariables: c.named_variables,
          indexedVariables: c.indexed_variables,
          expanded: false,
        })),
      );

      if (this.expandedVariables.has(path)) {
        this.expandedVariables.delete(path);
      } else {
        this.expandedVariables.add(path);
      }
      this.requestUpdate();
    } catch (error) {
      console.error("Failed to expand variable:", error);
    }
  }

  private updateVariableChildren(
    variables: Variable[],
    path: string,
    children: Variable[],
  ): Variable[] {
    return variables.map((v) => {
      const varPath = v.name;
      if (varPath === path) {
        return { ...v, children, expanded: !this.expandedVariables.has(path) };
      }
      if (v.children) {
        return {
          ...v,
          children: this.updateVariableChildren(v.children, path, children),
        };
      }
      return v;
    });
  }

  private togglePinVariable(path: string) {
    if (this.pinnedVariables.has(path)) {
      this.pinnedVariables.delete(path);
    } else {
      this.pinnedVariables.add(path);
    }
    this.requestUpdate();
  }

  private startEditingVariable(path: string, value: string) {
    this.editingVariable = { path, value, original: value };
    this.requestUpdate();
    setTimeout(() => {
      const input = this.renderRoot.querySelector('.variable-edit-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  private async saveVariableEdit(path: string) {
    if (!this.editingVariable || this.editingVariable.path !== path) return;

    const newValue = this.editingVariable.value;
    const originalValue = this.editingVariable.original;

    if (newValue !== originalValue) {
      try {
        const varName = path.split('.').pop() || path;
        await invoke("evaluate_expression", {
          expression: `${varName} = ${newValue}`,
          frameId: 0,
        });
        await this.refresh();
      } catch (error) {
        console.error("Failed to update variable:", error);
      }
    }

    this.editingVariable = null;
    this.requestUpdate();
  }

  private handleVariableEditKeydown(e: KeyboardEvent, path: string) {
    if (e.key === 'Enter') {
      this.saveVariableEdit(path);
    } else if (e.key === 'Escape') {
      this.editingVariable = null;
      this.requestUpdate();
    }
  }

  private formatValueDisplay(value: string, type?: string): { display: string; expandable: boolean; fullValue?: string } {
    if (type === 'string' || (value.startsWith('"') && value.endsWith('"'))) {
      const truncated = value.length > 50 ? value.substring(0, 50) + '…' : value;
      return { display: truncated, expandable: value.length > 50, fullValue: value };
    }

    if (value.startsWith('{') || value.startsWith('[')) {
      const truncated = value.length > 100 ? value.substring(0, 100) + '…' : value;
      return { display: truncated, expandable: value.length > 100, fullValue: value };
    }

    return { display: value, expandable: false };
  }

  private renderVariable(variable: Variable, path: string = "", isChild: boolean = false): TemplateResult {
    const currentPath = path ? `${path}.${variable.name}` : variable.name;
    const hasChildren = variable.variablesReference > 0;
    const isExpanded = this.expandedVariables.has(currentPath);
    const isPinned = this.pinnedVariables.has(currentPath);
    const valueClass = getValueClass(variable.value, variable.type);
    const isEditing = this.editingVariable?.path === currentPath;

    const valueDisplay = this.formatValueDisplay(variable.value, variable.type);
    const displayValue = valueDisplay.expandable && this.expandedVariables.has(currentPath + '-full')
      ? valueDisplay.fullValue
      : valueDisplay.display;

    return html`
      <div class="flex items-start px-3 py-[3px] cursor-pointer font-mono text-xs border-b ${isPinned ? 'bg-[var(--app-pinned-background)]' : ''} ${isChild ? 'pl-7' : ''}"
           style="border-color: var(--app-border);"
           @click=${() => hasChildren && this.expandVariable(currentPath, variable.variablesReference)}>
        ${hasChildren
          ? html`
              <span class="variable-expand w-4 h-5 flex items-center justify-center mr-1 ${isExpanded ? 'expanded' : ''}"
                    style="color: var(--app-disabled-foreground);">
                <iconify-icon icon="mdi:chevron-right" width="14"></iconify-icon>
              </span>
            `
          : html`<span class="w-4 h-5"></span>`}
        <span class="text-teal-700 mr-1 whitespace-nowrap">${variable.name}</span>
        <span class="mr-1" style="color: var(--app-disabled-foreground);">:</span>
        ${isEditing
          ? html`
              <input
                class="variable-edit-input flex-1 px-1.5 py-0.5 text-xs font-mono border rounded outline-none"
                style="border-color: var(--brand-primary); background-color: var(--app-input-background); color: var(--app-input-foreground);"
                type="text"
                value=${this.editingVariable?.value ?? ''}
                @keydown=${(e: KeyboardEvent) => this.handleVariableEditKeydown(e, currentPath)}
                @blur=${() => this.saveVariableEdit(currentPath)}
                @click=${(e: Event) => e.stopPropagation()}
              />
            `
          : html`
              <span
                class="${valueClass} flex-1 min-w-0 cursor-pointer px-1 rounded transition-colors hover:bg-black/5"
                @dblclick=${(e: Event) => {
                  e.stopPropagation();
                  if (valueDisplay.expandable) {
                    if (this.expandedVariables.has(currentPath + '-full')) {
                      this.expandedVariables.delete(currentPath + '-full');
                    } else {
                      this.expandedVariables.add(currentPath + '-full');
                    }
                  } else {
                    this.startEditingVariable(currentPath, variable.value);
                  }
                }}
                title=${valueDisplay.fullValue || variable.value}>
                ${displayValue}
              </span>
            `}
        ${variable.type
          ? html`<span class="text-[10px] ml-2 whitespace-nowrap opacity-70" style="color: var(--app-disabled-foreground);">${variable.type}</span>`
          : ""}
        <div class="hidden items-center gap-0.5 ml-2 group-hover:flex">
          ${!isEditing ? html`
            <button class="w-4 h-4 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-115"
                    style="color: var(--app-disabled-foreground);"
                    @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                    @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this.startEditingVariable(currentPath, variable.value);
                    }}
                    title="Edit value">
              <iconify-icon icon="mdi:pencil-outline" width="12"></iconify-icon>
            </button>
          ` : ''}
          <button class="w-4 h-4 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-115"
                  style="color: var(--app-disabled-foreground);"
                  @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                  @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                  @click=${(e: Event) => { e.stopPropagation(); this.togglePinVariable(currentPath); }}
                  title="${isPinned ? 'Unpin' : 'Pin'}">
            <iconify-icon icon="${isPinned ? 'mdi:pin' : 'mdi:pin-outline'}" width="12"></iconify-icon>
          </button>
          <button class="w-4 h-4 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-115"
                  style="color: var(--app-disabled-foreground);"
                  @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                  @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                  @click=${(e: Event) => { e.stopPropagation(); copyToClipboard(variable.value); }}
                  title="Copy value">
            <iconify-icon icon="mdi:content-copy" width="12"></iconify-icon>
          </button>
        </div>
      </div>
      ${isExpanded && variable.children
        ? html`
            <div>
              ${variable.children.map((child: Variable) => this.renderVariable(child, currentPath, true))}
            </div>
          `
        : ""}
    `;
  }

  private expandAllVariables() {
    const expandRecursive = (vars: Variable[], path: string) => {
      for (const v of vars) {
        const currentPath = path ? `${path}.${v.name}` : v.name;
        if (v.variablesReference > 0) {
          this.expandedVariables.add(currentPath);
          if (v.children) {
            expandRecursive(v.children, currentPath);
          }
        }
      }
    };
    expandRecursive(this.variables, '');
    this.requestUpdate();
  }

  private collapseAllVariables() {
    this.expandedVariables.clear();
    this.requestUpdate();
  }

  render() {
    if (!this.isDebugging) {
      return html`
        <div class="flex flex-col items-center justify-center py-6 gap-2" style="color: var(--app-disabled-foreground);">
          <iconify-icon class="text-2xl opacity-30" icon="mdi:bug-outline"></iconify-icon>
          <span class="text-[11px]">Start debugging to view variables</span>
        </div>
      `;
    }

    const filteredVars = this.variableFilter
      ? this.variables.filter(v => v.name.toLowerCase().includes(this.variableFilter.toLowerCase()))
      : this.variables;

    const pinnedVars = filteredVars.filter(v => this.pinnedVariables.has(v.name));
    const unpinnedVars = filteredVars.filter(v => !this.pinnedVariables.has(v.name));

    return html`
      <style>
        .variable-expand { transition: transform 0.15s ease; }
        .variable-expand.expanded { transform: rotate(90deg); }
      </style>
      <!-- Toolbar: filter + actions -->
      <div class="flex items-center gap-1.5 px-3 py-1 border-b" style="background-color: var(--app-tab-inactive); border-color: var(--app-border);">
        <input type="text"
               class="flex-1 px-2 py-0.5 text-xs border rounded outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
               style="background-color: var(--app-input-background); color: var(--app-input-foreground); border-color: var(--app-border);"
               placeholder="Filter..."
               .value=${this.variableFilter}
               @input=${(e: Event) => { this.variableFilter = (e.target as HTMLInputElement).value; this.requestUpdate(); }}/>
        <div class="flex gap-0.5">
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-110"
                  style="color: var(--app-disabled-foreground);"
                  @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                  @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                  @click=${() => this.expandAllVariables()} title="Expand All">
            <iconify-icon icon="mdi:arrow-expand-all" width="14"></iconify-icon>
          </button>
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-110"
                  style="color: var(--app-disabled-foreground);"
                  @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                  @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                  @click=${() => this.collapseAllVariables()} title="Collapse All">
            <iconify-icon icon="mdi:arrow-collapse-all" width="14"></iconify-icon>
          </button>
          <button class="w-5 h-5 flex items-center justify-center border-none rounded bg-transparent cursor-pointer transition-all hover:scale-110"
                  style="color: var(--app-disabled-foreground);"
                  @mouseenter=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'; }}
                  @mouseleave=${(e: Event) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                  @click=${() => this.refresh()} title="Refresh">
            <iconify-icon icon="mdi:refresh" width="14"></iconify-icon>
          </button>
        </div>
      </div>
      <!-- Content -->
      <div>
        ${this.isLoading ? html`
          <div class="p-2">
            <div class="h-5 rounded animate-pulse mb-1 w-2/5" style="background-color: var(--app-toolbar-hover);"></div>
            <div class="h-5 rounded animate-pulse mb-1 w-3/5" style="background-color: var(--app-toolbar-hover);"></div>
            <div class="h-5 rounded animate-pulse mb-1 w-4/5" style="background-color: var(--app-toolbar-hover);"></div>
            <div class="h-5 rounded animate-pulse w-3/5" style="background-color: var(--app-toolbar-hover);"></div>
          </div>
        ` : html`
          ${pinnedVars.length > 0 ? pinnedVars.map(v => this.renderVariable(v)) : ''}
          ${unpinnedVars.map(v => this.renderVariable(v))}
          ${filteredVars.length === 0 ? html`
            <div class="flex flex-col items-center justify-center min-h-[48px] px-3 py-2 text-xs" style="color: var(--app-disabled-foreground);">
              ${this.variableFilter ? 'No matching variables' : 'No variables in scope'}
            </div>
          ` : ''}
        `}
      </div>
    `;
  }
}
