/**
 * Git Commit Details Component
 *
 * Shows details of a selected commit including message, author, stats, and changed files.
 */

import { html, css, type CSSResultGroup } from "lit";
import { customElement, property } from "lit/decorators.js";
import { TailwindElement, getTailwindStyles } from "../../tailwind-element.js";
import type { CommitEntryWithStats, ChangedFile } from "../../lib/git/git-types.js";
import "../layout/icon.js";

interface LogEntry extends CommitEntryWithStats {
  shortHash: string;
  date: string;
  dateTitle: string;
  branchLabels: string[];
}

@customElement("git-commit-details")
export class GitCommitDetails extends TailwindElement() {
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

  @property() commit: LogEntry | null = null;
  @property() changedFiles: ChangedFile[] = [];
  @property() diffPreview = "";

  render(): ReturnType<typeof html> {
    if (!this.commit) {
      return this._renderEmptyState();
    }

    const c = this.commit;

    return html`
      <div class="flex flex-col h-full overflow-y-auto">
        <!-- Commit header -->
        <div class="px-4 py-3 border-b border-[var(--app-border)]">
          <p class="text-[12px] font-semibold text-[var(--app-foreground)]">${c.subject}</p>
          ${c.body
            ? html`<p class="text-[10px] mt-1 text-[var(--app-secondary-foreground)] leading-relaxed">${c.body}</p>`
            : ""}

          <div class="flex items-center gap-2 mt-2">
            <p class="flex-1 text-[9px] font-mono text-[var(--app-foreground)] bg-[var(--app-toolbar-hover)] px-2 py-1 rounded truncate"
               title="${c.hash}">
              ${c.hash}
            </p>
            <button
              class="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[var(--app-toolbar-hover)] transition-colors flex-shrink-0"
              title="Copy commit hash"
              @click=${(e: Event) => {
                e.stopPropagation();
                navigator.clipboard.writeText(c.hash);
              }}>
              <os-icon name="copy" size="12" color="var(--app-foreground)"></os-icon>
            </button>
          </div>
        </div>

        <!-- Metadata row -->
        <div class="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--app-border)]">
          <div class="flex items-center gap-2">
            <div
              class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-[var(--app-bg)] shadow-sm"
              style="background-color: ${this._getAuthorColor(c.author)}"
              title="${c.author}">
              ${this._getAuthorInitials(c.author)}
            </div>
            <div class="flex flex-col">
              <span class="text-[11px] font-medium text-[var(--app-foreground)]">${c.author}</span>
              <span class="text-[9px] text-[var(--app-secondary-foreground)]" title="${c.dateTitle}">${c.date}</span>
            </div>
          </div>
        </div>

        <!-- Stats bar -->
        <div class="flex items-center gap-3 px-4 py-2 text-[11px] border-b border-[var(--app-border)] bg-[var(--app-toolbar-hover)]">
          <span class="text-[var(--app-foreground)]">
            <strong>${c.files_changed}</strong> files changed
          </span>
          ${c.additions > 0
            ? html`
                <span class="flex items-center gap-1 text-[var(--git-added)]">
                  <os-icon name="plus" size="8"></os-icon>${c.additions}
                </span>
              `
            : ""}
          ${c.deletions > 0
            ? html`
                <span class="flex items-center gap-1 text-[var(--git-deleted)]">
                  <os-icon name="minus" size="8"></os-icon>${c.deletions}
                </span>
              `
            : ""}
        </div>

        <!-- Branch labels -->
        ${c.branchLabels.length > 0
          ? html`
              <div class="px-4 py-2 flex items-center gap-2 flex-wrap border-b border-[var(--app-border)]">
                <os-icon name="git-branch" size="12" color="var(--app-secondary-foreground)"></os-icon>
                ${c.branchLabels.map(b => html`
                  <span class="text-[10px] px-2 py-0.5 rounded-full bg-[var(--brand-primary)] text-white font-medium">
                    ${b}
                  </span>
                `)}
              </div>
            `
          : ""}

        <!-- Changed files list -->
        <div>
          <div class="px-4 py-2 flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-toolbar-background)]">
            <div class="flex items-center gap-2">
              <os-icon name="files" size="12" color="var(--app-secondary-foreground)"></os-icon>
              <span class="text-[10px] font-semibold text-[var(--app-foreground)] uppercase tracking-wide">
                Changed Files
              </span>
            </div>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-[var(--app-toolbar-hover)] text-[var(--app-secondary-foreground)]">
              ${this.changedFiles.length}
            </span>
          </div>

          <div>
            ${this.changedFiles.length === 0
              ? html`<p class="px-4 py-3 text-[10px] text-[var(--app-secondary-foreground)]">No file changes</p>`
              : html`
                  ${this.changedFiles.map(file => html`
                    <div class="group flex items-center gap-2 px-4 py-2 hover:bg-[var(--app-hover-background)] transition-colors border-b border-[var(--app-border)] last:border-b-0">
                      ${this._renderFileStatusIcon(file.status)}
                      <span class="text-[11px] flex-1 truncate text-[var(--app-foreground)]" title="${file.path}">
                        ${file.path}
                      </span>
                      ${!file.binary && (file.additions > 0 || file.deletions > 0)
                        ? html`
                            <span class="text-[10px] flex items-center gap-2 flex-shrink-0">
                              ${file.additions > 0
                                ? html`<span class="text-[var(--git-added)] font-medium">+${file.additions}</span>`
                                : ""}
                              ${file.deletions > 0
                                ? html`<span class="text-[var(--git-deleted)] font-medium">-${file.deletions}</span>`
                                : ""}
                            </span>
                          `
                        : file.binary
                          ? html`<span class="text-[9px] px-2 py-0.5 rounded-md bg-[var(--app-toolbar-hover)] text-[var(--app-secondary-foreground)]">binary</span>`
                          : ""}
                    </div>
                  `)}
                `}
          </div>
        </div>
      </div>
    `;
  }

  private _renderEmptyState(): ReturnType<typeof html> {
    return html`
      <div class="flex-1 flex flex-col items-center justify-center py-8">
        <os-icon name="git-commit" size="40" color="var(--app-secondary-foreground)"></os-icon>
        <p class="mt-4 text-[12px] font-medium text-[var(--app-foreground)]">Select a commit to view details</p>
        <p class="mt-1 text-[11px] text-[var(--app-secondary-foreground)]">Click on any commit in the list</p>
      </div>
    `;
  }

  private _renderFileStatusIcon(status: string): ReturnType<typeof html> {
    const iconMap: Record<string, { icon: string; color: string }> = {
      added: { icon: "plus", color: "var(--git-added)" },
      deleted: { icon: "trash-2", color: "var(--git-deleted)" },
      modified: { icon: "file-diff", color: "var(--git-modified)" },
      renamed: { icon: "arrow-right", color: "var(--git-renamed)" },
    };

    const { icon, color } = iconMap[status] || { icon: "file", color: "var(--app-foreground)" };
    return html`<os-icon name="${icon}" size="12" color="${color}"></os-icon>`;
  }

  private _getAuthorColor(author: string): string {
    // Modern, vibrant color palette for author avatars
    const colors = [
      "#d8a7ab", // Cotton Rose
      "#e5957f", // Sweet Salmon
      "#88a89d", // Muted Teal
      "#4a536b", // Charcoal Blue
      "#6b8e9f", // Dusty Azure
      "#b8a78e", // Warm Taupe
      "#9a8fb8", // Soft Lavender
      "#d4a76e", // Golden Sand
      "#7a9b8e", // Sage Green
      "#a78fb8", // Muted Violet
      "#e0b89a", // Peach Cream
      "#6b7a8e", // Slate Blue
    ];

    // Hash the author name to get a consistent index
    let hash = 0;
    for (let i = 0; i < author.length; i++) {
      hash = (hash << 5) - hash + author.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % colors.length;

    return colors[index];
  }

  private _getAuthorInitials(author: string): string {
    const parts = author.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return author.slice(0, 2).toUpperCase();
  }
}
