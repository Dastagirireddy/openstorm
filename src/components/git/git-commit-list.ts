/**
 * Git Commit List Component
 *
 * Renders the list of commits with graph visualization.
 */

import { html, css, svg, type CSSResultGroup } from "lit";
import { customElement, property } from "lit/decorators.js";
import { TailwindElement, getTailwindStyles } from "../../tailwind-element.js";
import type { CommitEntryWithStats } from "../../lib/git-types.js";
import type { GraphData } from "../../lib/git-graph.js";
import "../layout/icon.js";

interface LogEntry extends CommitEntryWithStats {
  shortHash: string;
  date: string;
  dateTitle: string;
  branchLabels: string[];
  graphColor: string;
}

@customElement("git-commit-list")
export class GitCommitList extends TailwindElement() {
  static override styles: CSSResultGroup[] = [
    getTailwindStyles(),
    css`
      :host {
        display: block;
        height: 100%;
        overflow: hidden;
      }

      .scroll-container {
        height: 100%;
        overflow-y: auto;
      }
    `,
  ];

  @property() commits: LogEntry[] = [];
  @property() graphData: GraphData | null = null;
  @property() showGraph = true;
  @property() selectedCommit: LogEntry | null = null;
  @property() searchQuery = "";

  private readonly ROW_H = 36;
  private readonly LANE_W = 24;
  private readonly DOT_R = 4;
  private readonly OFFSET_X = 24;

  render(): ReturnType<typeof html> {
    const filteredCommits = this._getFilteredCommits();

    if (filteredCommits.length === 0) {
      return this._renderEmptyState();
    }

    const graphWidth = this._getGraphWidth();

    return html`
      <div class="scroll-container">
        <div class="flex" style="position: relative;">
          ${this._renderGraphColumn(graphWidth, filteredCommits)}
          <div class="flex-1" style="min-width: 0;">
            <div class="flex flex-col">
              ${filteredCommits.map(commit => this._renderCommitRow(commit))}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _getFilteredCommits(): LogEntry[] {
    if (!this.searchQuery) return this.commits;

    const query = this.searchQuery.toLowerCase();
    return this.commits.filter(commit =>
      commit.subject.toLowerCase().includes(query) ||
      commit.author.toLowerCase().includes(query) ||
      commit.shortHash.toLowerCase().includes(query)
    );
  }

  private _renderEmptyState(): ReturnType<typeof html> {
    return html`
      <div class="flex-1 flex flex-col items-center justify-center py-8">
        <os-icon name="circle-dot" size="36" color="var(--app-secondary-foreground)"></os-icon>
        <p class="mt-3 text-[12px] font-medium text-[var(--app-foreground)]">
          ${this.commits.length === 0 ? "No Commits" : "No matching commits"}
        </p>
        <p class="mt-1 text-[11px] text-[var(--app-secondary-foreground)]">
          ${this.commits.length === 0 ? "Repository is empty" : "Try adjusting filters"}
        </p>
      </div>
    `;
  }

  private _renderGraphColumn(graphWidth: number, filteredCommits: LogEntry[]): ReturnType<typeof html> {
    if (!this.showGraph || !this.graphData || filteredCommits.length === 0) {
      return html`<div style="width: ${graphWidth}px;"></div>`;
    }

    return html`
      <div class="flex-shrink-0" style="width: ${graphWidth}px;">
        ${this._renderCommitGraph(filteredCommits)}
      </div>
    `;
  }

  private _renderCommitRow(commit: LogEntry): ReturnType<typeof html> {
    const isSelected = this.selectedCommit?.hash === commit.hash;

    return html`
      <div
        class="group flex items-center gap-2 px-3 cursor-pointer h-9"
        @click=${() => this.dispatchEvent(new CustomEvent("commit-selected", { detail: { commit } }))}>

        <!-- Commit hash -->
        <span class="text-[10px] font-mono px-2 py-0.5 rounded flex-shrink-0 bg-[var(--app-toolbar-hover)] text-[var(--app-secondary-foreground)]">
          ${commit.shortHash}
        </span>

        <!-- Author avatar -->
        <div
          class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 text-[var(--app-bg)] shadow-sm"
          style="background-color: ${this._getAuthorColor(commit.author)}"
          title="${commit.author}">
          ${this._getAuthorInitials(commit.author)}
        </div>

        <!-- Subject -->
        <span
          class="text-[12px] truncate px-2 py-0.5 rounded flex-1 font-medium cursor-pointer ${isSelected ? "bg-[var(--brand-primary)]/20 text-[var(--brand-primary)]" : "text-[var(--app-foreground)]"}"
          title="${commit.subject}">
          ${commit.subject}
        </span>

        <!-- Branch labels -->
        ${commit.branchLabels.slice(0, 2).map(b => html`
          <span class="text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 font-medium bg-[var(--brand-primary)] text-(--text-inverse)">
            ${b}
          </span>
        `)}

        <!-- File changes -->
        ${commit.files_changed > 0 ? html`
          <span class="flex items-center gap-1.5 flex-shrink-0 text-[10px] text-[var(--app-secondary-foreground)]"
                title="${commit.files_changed} files changed, +${commit.additions} -${commit.deletions}">
            <os-icon name="file-diff" size="10"></os-icon>
            <span>${commit.files_changed}</span>
            ${commit.additions > 0 ? html`<span class="text-[var(--git-added)]">+${commit.additions}</span>` : ""}
            ${commit.deletions > 0 ? html`<span class="text-[var(--git-deleted)]">-${commit.deletions}</span>` : ""}
          </span>
        ` : ""}

        <!-- Date -->
        <span class="text-[10px] flex-shrink-0 px-2 py-0.5 rounded-md text-[var(--app-secondary-foreground)] bg-[var(--app-toolbar-hover)]"
              title="${commit.dateTitle}">
          ${commit.date}
        </span>
      </div>
    `;
  }

  private _renderCommitGraph(filteredCommits: LogEntry[]): ReturnType<typeof html> {
    const posMap = new Map<string, { x: number; y: number; color: string }>();

    filteredCommits.forEach((commit, i) => {
      const laneData = this.graphData!.commits.find(c => c.hash === commit.hash);
      const lane = laneData?.lane ?? 0;
      posMap.set(commit.hash, {
        x: this.OFFSET_X + (lane * this.LANE_W),
        y: (i * this.ROW_H) + (this.ROW_H / 2),
        color: laneData?.laneColor ?? "var(--app-secondary-foreground)"
      });
    });

    const elements: any[] = [];

    // Lines
    filteredCommits.forEach((commit, i) => {
      const childPos = posMap.get(commit.hash);
      if (!childPos) return;

      const commitData = this.graphData!.commits.find(c => c.hash === commit.hash);
      const parents = commitData?.parent_hashes || [];
      let connected = false;

      parents.forEach(pHash => {
        const parentPos = posMap.get(pHash);
        if (parentPos) {
          connected = true;
          elements.push(this._createSvgLine(childPos, parentPos, childPos.color));
        }
      });

      if (!connected && i < filteredCommits.length - 1) {
        const nextPos = posMap.get(filteredCommits[i + 1].hash);
        if (nextPos) {
          elements.push(this._createSvgLine(childPos, nextPos, nextPos.color));
        }
      }
    });

    // Dots
    filteredCommits.forEach(commit => {
      const pos = posMap.get(commit.hash);
      if (pos) {
        elements.push(svg`
          <circle cx="${pos.x}" cy="${pos.y}" r="${this.DOT_R}"
                  fill="${pos.color}" stroke="var(--app-bg)" stroke-width="2" />
        `);
      }
    });

    const width = (Math.max(...this.graphData.lanes.map(l => l.id), 0) + 1) * this.LANE_W + (this.OFFSET_X * 2);
    const height = filteredCommits.length * this.ROW_H;

    return html`
      <svg width="${width}" height="${height}" class="block pointer-events-none">
        <g id="graph-content">${elements}</g>
      </svg>
    `;
  }

  private _createSvgLine(start: { x: number; y: number }, end: { x: number; y: number }, color: string) {
    if (start.x === end.x) {
      return svg`
        <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}"
              stroke="${color}" stroke-width="2" />
      `;
    }

    const midY = (start.y + end.y) / 2;
    const d = `M ${start.x} ${start.y} C ${start.x} ${midY}, ${end.x} ${midY}, ${end.x} ${end.y}`;
    return svg`
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />
    `;
  }

  private _getGraphWidth(): number {
    if (!this.graphData || this.graphData.commits.length === 0) return 60;
    const maxLane = Math.max(...this.graphData.commits.map(c => c.lane), 0);
    return (maxLane + 1) * this.LANE_W + (this.OFFSET_X * 2);
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
