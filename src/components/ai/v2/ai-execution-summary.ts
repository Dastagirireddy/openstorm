import { html, unsafeCSS, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

export interface DiffLine {
  line_type: string;
  line_num: number;
  content: string;
}

export interface FileModification {
  path: string;
  diff: DiffLine[];
  lines_added: number;
  lines_removed: number;
}

export interface CostSnapshot {
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cost: number;
}

const SUMMARY_STYLES = `
  :host { display: block; }
  .sb { display: flex; flex-direction: column; gap: 14px; padding: 16px; background: #0d0f12; border: 1px solid #1e2128; border-radius: 8px; margin-top: 12px; }
  .sh { font-size: 14px; font-weight: 700; color: #e0e0e0; border-bottom: 1px solid #1e2128; padding-bottom: 10px; }
  .sg { display: flex; gap: 28px; flex-wrap: wrap; }
  .sp { display: flex; flex-direction: column; gap: 2px; }
  .sp .l { font-size: 10px; text-transform: uppercase; color: #5c6370; font-weight: 700; letter-spacing: 0.5px; }
  .sp .v { font-size: 13px; font-family: 'SF Mono','Fira Code',monospace; color: #98c379; font-weight: 600; }
  .dc { border: 1px solid #1e2128; background: #0a0c0f; border-radius: 6px; font-family: 'SF Mono','Fira Code',monospace; font-size: 11px; overflow: hidden; }
  .db { background: #141618; padding: 6px 12px; color: #828997; font-size: 11px; display: flex; justify-content: space-between; border-bottom: 1px solid #1e2128; }
  .dl { display: flex; line-height: 1.6; }
  .dn { width: 36px; text-align: right; padding-right: 8px; color: #3e4451; background: #0d0f12; user-select: none; border-right: 1px solid #1e2128; margin-right: 8px; flex-shrink: 0; }
  .dct { flex: 1; white-space: pre; color: #abb2bf; padding-right: 12px; }
  .dl.add { background: #0f1f16; } .dl.add .dct { color: #a7f3d0; }
  .dl.del { background: #1f0f12; } .dl.del .dct { color: #f87171; }
`;

@customElement('ai-execution-summary')
export class AiExecutionSummary extends LitElement {
  static styles = unsafeCSS(SUMMARY_STYLES);

  @property({ type: String }) status = '';
  @property({ type: Array }) filesModified: FileModification[] = [];
  @property({ type: Number }) totalToolCalls = 0;
  @property({ type: Number }) durationMs = 0;
  @property({ type: Object }) costSummary: CostSnapshot | null = null;
  @state() private expandedFiles: Set<number> = new Set();

  private toggleFile(index: number) {
    if (this.expandedFiles.has(index)) {
      this.expandedFiles.delete(index);
    } else {
      this.expandedFiles.add(index);
    }
    this.requestUpdate();
  }

  private fmtDuration(ms: number) {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  private fmtCost(cost: number) {
    if (cost === 0) return '$0.00';
    return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
  }

  render() {
    return html`
      <div class="sb">
        <div class="sh">Execution Summary</div>
        <div class="sg">
          <div class="sp"><span class="l">Status</span><span class="v">\u25CF ${this.status.toUpperCase()}</span></div>
          <div class="sp"><span class="l">Tool Calls</span><span class="v">${this.totalToolCalls}</span></div>
          <div class="sp"><span class="l">Duration</span><span class="v">${this.fmtDuration(this.durationMs)}</span></div>
          ${this.costSummary ? html`
            <div class="sp"><span class="l">Tokens</span><span class="v">${(this.costSummary.total_prompt_tokens + this.costSummary.total_completion_tokens).toLocaleString()}</span></div>
            <div class="sp"><span class="l">Cost</span><span class="v">${this.fmtCost(this.costSummary.total_cost)}</span></div>
          ` : ''}
        </div>
        ${this.filesModified?.length ? html`
          <div style="display:flex;flex-direction:column;gap:10px;">
            <span style="font-size:11px;text-transform:uppercase;color:#5c6370;font-weight:700;letter-spacing:0.5px;">Files Modified</span>
            ${this.filesModified.map((mod, idx) => {
              const isExpanded = this.expandedFiles.has(idx);
              const previewLines = mod.diff.slice(0, 5);
              const hasMore = mod.diff.length > 5;
              return html`
                <div class="dc">
                  <div class="db" style="cursor:pointer;" @click=${() => this.toggleFile(idx)}>
                    <span>${mod.path}</span>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="color:#98c379;">+${mod.lines_added} lines, -${mod.lines_removed} lines</span>
                      ${hasMore ? html`<span style="color:#60a5fa;font-size:10px;">${isExpanded ? 'Collapse' : `Expand (${mod.diff.length} lines)`}</span>` : ''}
                    </div>
                  </div>
                  ${(isExpanded || !hasMore) ? html`
                    ${mod.diff.map(line => html`
                      <div class="dl ${line.line_type}">
                        <span class="dn">${line.line_num || ''}</span>
                        <span class="dct">${line.line_type === 'delete' ? '- ' : line.line_type === 'add' ? '+ ' : ''}${line.content}</span>
                      </div>
                    `)}
                  ` : html`
                    ${previewLines.map(line => html`
                      <div class="dl ${line.line_type}">
                        <span class="dn">${line.line_num || ''}</span>
                        <span class="dct">${line.line_type === 'delete' ? '- ' : line.line_type === 'add' ? '+ ' : ''}${line.content}</span>
                      </div>
                    `)}
                    <div class="dl" style="background:#141618;color:#60a5fa;cursor:pointer;justify-content:center;" @click=${() => this.toggleFile(idx)}>
                      <span class="dct">Click to expand ${mod.diff.length - 5} more lines...</span>
                    </div>
                  `}
                </div>
              `;
            })}
          </div>
        ` : ''}
      </div>
    `;
  }
}
