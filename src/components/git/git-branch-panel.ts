/**
 * Git Branch Panel Component
 *
 * Shows the list of branches with visibility toggles.
 */

import { html, css, type CSSResultGroup } from "lit";
import { customElement, property } from "lit/decorators.js";
import { TailwindElement, getTailwindStyles } from "../../tailwind-element.js";
import type { BranchInfo, RepoStatus } from "../../lib/git-types.js";
import "../layout/icon.js";

@customElement("git-branch-panel")
export class GitBranchPanel extends TailwindElement() {
  static override styles: CSSResultGroup[] = [
    getTailwindStyles(),
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }
    `,
  ];

  @property() branches: BranchInfo[] = [];
  @property() currentBranch = "";
  @property() visibleBranches: Set<string> = new Set();
  @property() repoStatus: RepoStatus | null = null;

  render(): ReturnType<typeof html> {
    const localBranches = this.branches.filter(b => !b.is_remote);

    return html`
      <div class="flex flex-col h-full">
        <!-- Header -->
        <div class="px-3 py-2 flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-toolbar-background)]">
          <div class="flex items-center gap-2">
            <os-icon name="git-branch" size="12" color="var(--app-secondary-foreground)"></os-icon>
            <span class="text-[11px] font-semibold text-[var(--app-foreground)] uppercase tracking-wide">
              Branches
            </span>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-[var(--app-toolbar-hover)] text-[var(--app-secondary-foreground)]">
            ${localBranches.length}
          </span>
        </div>

        <!-- Branches list -->
        <div class="flex-1 overflow-y-auto">
          ${localBranches.map(branch => html`
            <div class="group flex items-center gap-2 px-3 py-2 hover:bg-[var(--app-hover-background)] transition-colors border-b border-[var(--app-border)] last:border-b-0">
              <!-- Checkbox -->
              <input
                type="checkbox"
                class="w-4 h-4 rounded cursor-pointer"
                style="accent-color: var(--brand-primary);"
                ?checked="${this.visibleBranches.has(branch.name) || this.visibleBranches.size === 0}"
                @change=${(e: Event) => this._toggleBranchVisibility(branch.name, (e.target as HTMLInputElement).checked)}
              />

              <!-- Branch icon -->
              <div class="relative">
                <os-icon name="git-branch" size="14"
                         color="${branch.name === this.currentBranch ? "var(--brand-primary)" : "var(--app-secondary-foreground)"}"></os-icon>
                ${branch.name === this.currentBranch
                  ? html`<span class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--brand-primary)] ring-2 ring-[var(--app-bg)]"></span>`
                  : ""}
              </div>

              <!-- Branch name -->
              <span class="text-[12px] flex-1 font-medium ${branch.name === this.currentBranch ? "text-[var(--brand-primary)]" : "text-[var(--app-foreground)]"}"
                    title="${branch.name}">
                ${branch.name}
              </span>

              <!-- Ahead/behind indicator -->
              ${this._renderAheadBehind(branch.name)}
            </div>
          `)}
        </div>

        <!-- Sync status -->
        ${this.repoStatus ? html`
          <div class="px-3 py-2 text-[11px] border-t border-[var(--app-border)] bg-[var(--app-toolbar-background)]">
            <div class="flex items-center gap-2">
              <os-icon name="${this.repoStatus.ahead || this.repoStatus.behind ? "circle-alert" : "check-circle"}"
                       size="12"
                       color="${this.repoStatus.ahead || this.repoStatus.behind ? "var(--git-added)" : "var(--app-secondary-foreground)"}"></os-icon>
              <span style="color: var(--app-secondary-foreground);">
                ${this.repoStatus.ahead ? `${this.repoStatus.ahead} ahead` : ""}
                ${this.repoStatus.ahead && this.repoStatus.behind ? ", " : ""}
                ${this.repoStatus.behind ? `${this.repoStatus.behind} behind` : ""}
                ${!this.repoStatus.ahead && !this.repoStatus.behind ? "Up to date with remote" : ""}
              </span>
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }

  private _toggleBranchVisibility(branchName: string, visible: boolean): void {
    this.dispatchEvent(new CustomEvent("branch-visibility-changed", {
      detail: { branchName, visible }
    }));
  }

  private _renderAheadBehind(branchName: string): ReturnType<typeof html> {
    if (!this.repoStatus) return html``;

    const { ahead, behind } = this.repoStatus;
    if (!ahead && !behind) return html``;

    return html`
      <span class="text-[9px] flex items-center gap-0.5 text-[var(--app-secondary-foreground)]">
        ${ahead ? html`<span class="text-[var(--git-added)]">↑${ahead}</span>` : ""}
        ${behind ? html`<span class="text-[var(--git-deleted)]">↓${behind}</span>` : ""}
      </span>
    `;
  }
}
