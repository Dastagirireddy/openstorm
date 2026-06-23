import { html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { ChatMessage } from '../../lib/types/ai-types.js';
import { getToolIcon, getToolColor, getToolLabel } from '../../lib/ai/ai-tool-registry.js';
import { renderMarkdown } from './ai-markdown.js';
import { formatTokenCount } from './ai-commands.js';
import '../layout/code-block.js';
import '../layout/icon.js';
import './tool-output-widget.js';

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface MessageRenderContext {
  selectedModel: string;
  lastResponseTime: number;
  lastUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  sessionStats: { tokens: { input: number; output: number }; cost: number };
  handleToolApproval: (approved: boolean) => void;
}

export function renderMessage(msg: ChatMessage, ctx: MessageRenderContext) {
  switch (msg.role) {
    case 'user': {
      const highlighted = msg.content.replace(
        /@([\w\-\.\/]+)/g,
        '<span class="file-mention">@$1</span>'
      );
      return html`
        <div class="ai-msg-user">
          <div class="ai-msg-user-label">You</div>
          <div class="ai-msg-user-content">${unsafeHTML(highlighted)}</div>
        </div>`;
    }

    case 'thinking':
      return html``;

    case 'assistant': {
      const renderedHtml = renderMarkdown(msg.content || '');
      const modelName = ctx.selectedModel || 'Unknown';
      const timeStr = ctx.lastResponseTime > 0 ? `${ctx.lastResponseTime.toFixed(1)}s` : '';
      const usage = ctx.lastUsage;
      const tokenParts: string[] = [];
      if (usage?.prompt_tokens) tokenParts.push(`${formatTokenCount(usage.prompt_tokens)} in`);
      if (usage?.completion_tokens) tokenParts.push(`${formatTokenCount(usage.completion_tokens)} out`);
      const tokenStr = tokenParts.length > 0 ? tokenParts.join(' · ') : '';
      const costStr = ctx.sessionStats.cost > 0 ? `$${ctx.sessionStats.cost.toFixed(4)}` : '';
      return html`
        <div class="ai-msg-assistant">
          <div class="ai-markdown-content">
            ${unsafeHTML(renderedHtml)}
          </div>
          <div class="ai-msg-footer">
            <iconify-icon icon="lucide:bot" width="12" style="color: var(--ai-text-dim)"></iconify-icon>
            <span class="ai-msg-footer-model">${modelName}</span>
            ${tokenStr ? html`<span class="ai-msg-footer-separator">·</span><span class="ai-msg-footer-tokens">${tokenStr}</span>` : ''}
            ${costStr ? html`<span class="ai-msg-footer-separator">·</span><span class="ai-msg-footer-cost">${costStr}</span>` : ''}
            ${timeStr ? html`<span class="ai-msg-footer-separator">·</span><span class="ai-msg-footer-time">${timeStr}</span>` : ''}
          </div>
        </div>`;
    }

    case 'tool_use': {
      const toolIcon = getToolIcon(msg.toolName || '');
      const toolColor = getToolColor(msg.toolName || '');
      const toolLabel = getToolLabel(msg.toolName || '', msg.toolArgs);
      const isCompleted = msg.content.includes('Done') || msg.toolCompleted;
      const hasStreamingOutput = !!msg.streamingOutput;
      const hasDecision = !!msg.decision;

      // Compact approved/denied display (from bottom modal decision)
      if (hasDecision) {
        const isApproved = msg.decision === 'approved';
        return html`
          <div class="ai-msg-thinking tool-use-line">
            <iconify-icon icon="${toolIcon}" width="14" style="color: ${toolColor}"></iconify-icon>
            <span class="thinking-label">${toolLabel}</span>
            <span class="ai-tool-status ${isApproved ? 'success' : 'error'}"
                  style="margin-left: 0.5em; color: ${isApproved ? 'var(--ai-success, #22c55e)' : 'var(--ai-error, #ef4444)'}">
              ${isApproved ? 'Approved' : 'Denied'}
            </span>
          </div>`;
      }

      // For write/edit operations, show a diff preview
      let diffPreview = '';
      if (msg.toolName === 'write_file' || msg.toolName === 'edit_file') {
        try {
          const args = JSON.parse(msg.toolArgs || '{}');
          if (msg.toolName === 'write_file' && args.content) {
            const lines = args.content.split('\n').slice(0, 20);
            const preview = lines.join('\n');
            const truncated = args.content.split('\n').length > 20;
            diffPreview = `<div class="ai-diff-preview"><code-block code="${escapeAttr(preview)}${truncated ? '\n... (truncated)' : ''}"></code-block></div>`;
          } else if (msg.toolName === 'edit_file' && args.new_content) {
            const lines = args.new_content.split('\n').slice(0, 20);
            const preview = lines.join('\n');
            const truncated = args.new_content.split('\n').length > 20;
            const lineInfo = `lines ${args.start_line || '?'}-${args.end_line || '?'}`;
            diffPreview = `<div class="ai-diff-preview"><div class="ai-diff-label">Replace ${lineInfo}:</div><code-block code="${escapeAttr(preview)}${truncated ? '\n... (truncated)' : ''}"></code-block></div>`;
          }
        } catch {}
      }

      return html`
        <div class="ai-msg-thinking tool-use-line">
          <iconify-icon icon="${toolIcon}" width="14" style="color: ${toolColor}"></iconify-icon>
          <span class="thinking-label">${toolLabel}</span>
          ${isCompleted
            ? html`<span class="ai-tool-status success" style="margin-left: 0.5em; color: var(--ai-success, #22c55e);">Done</span>`
            : hasStreamingOutput
              ? html`<span class="ai-tool-status running" style="margin-left: 0.5em; color: var(--ai-warning, #f59e0b);">Running</span>`
              : html`<span class="ai-tool-status pending" style="margin-left: 0.5em; color: var(--ai-text-dim, #888);">...</span>`
          }
        </div>
        ${hasStreamingOutput ? html`
          <tool-output-widget
            .output=${msg.streamingOutput || ''}
            .outputType=${msg.streamingOutputType || 'stdout'}
            .completed=${isCompleted}>
          </tool-output-widget>
        ` : ''}
        ${diffPreview ? unsafeHTML(diffPreview) : ''}`;
    }

    case 'tool_result': {
      let resultContent = msg.content;
      try {
        const parsed = JSON.parse(msg.content);
        resultContent = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
      } catch {}
      return html`
        <div class="ai-tool-result">
          <code-block code="${resultContent}"></code-block>
        </div>`;
    }

    case 'error': {
      let errorMsg = msg.content;
      return html`
        <div class="ai-error-block">
          <div class="error-title">Error</div>
          <div>${errorMsg}</div>
        </div>`;
    }

    case 'system': {
      const renderedHtml = renderMarkdown(msg.content || '');
      return html`
        <div class="ai-system-msg">
          <div class="ai-markdown-content">${unsafeHTML(renderedHtml)}</div>
        </div>`;
    }

    default:
      return html``;
  }
}
