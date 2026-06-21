import { html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { ChatMessage } from '../../lib/types/ai-types.js';
import { getToolIcon, getToolColor, getToolLabel } from '../../lib/ai/ai-tool-registry.js';
import { renderMarkdown, highlightDiffCode } from './ai-markdown.js';
import { formatTokenCount } from './ai-commands.js';
import '../layout/code-block.js';
import '../layout/icon.js';

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
      return html`
        <div class="ai-msg-thinking completed">
          <span class="thinking-label">+ Thought: ${msg.content}</span>
        </div>`;

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
        </div>
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

    case 'tool_approval': {
      const toolIcon = getToolIcon(msg.toolName || '');
      const toolColor = getToolColor(msg.toolName || '');

      let previewData: any;
      try {
        previewData = JSON.parse(msg.content);
      } catch {
        previewData = { type: 'text', content: msg.content };
      }

      return renderToolApproval(msg, previewData, toolIcon, toolColor, ctx.handleToolApproval);
    }

    case 'plan': {
      let steps: Array<{step: number, description: string, status: string}> = [];
      try {
        steps = JSON.parse(msg.content);
      } catch {}
      return html`
        <div class="ai-plan">
          <div class="ai-plan-header">
            <iconify-icon icon="lucide:list-checks" width="14" style="color: var(--ai-accent)"></iconify-icon>
            <span>Plan</span>
          </div>
          <div class="ai-plan-steps">
            ${steps.map(s => html`
              <div class="ai-plan-step ${s.status}">
                <iconify-icon icon="${
                  s.status === 'done' ? 'lucide:check-circle-2' :
                  s.status === 'in_progress' ? 'lucide:loader-2' :
                  s.status === 'failed' ? 'lucide:x-circle' : 'lucide:circle-dashed'
                }" width="14" class="plan-step-icon"></iconify-icon>
                <span class="ai-plan-step-desc">${s.description}</span>
              </div>
            `)}
          </div>
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

function renderToolApproval(
  msg: ChatMessage,
  previewData: any,
  toolIcon: string,
  toolColor: string,
  handleToolApproval: (approved: boolean) => void
) {
  const renderDiffPreview = (data: any) => {
    if (data.type === 'command') {
      return html`
        <div class="diff-command">
          <div class="diff-command-header">
            <iconify-icon icon="lucide:terminal" width="14" style="color: var(--ai-warning)"></iconify-icon>
            <span>Shell Command</span>
          </div>
          <div class="diff-command-content">
            <code>${data.command}</code>
          </div>
        </div>`;
    }

    if (data.type === 'diff') {
      const filePath = data.file_path || 'unknown';
      const oldLines = data.old_lines || 0;
      const newLines = data.new_lines || 0;
      const hunks = data.hunks || [];

      return html`
        <div class="diff-viewer">
          <div class="diff-header">
            <iconify-icon icon="lucide:pencil" width="14" style="color: var(--ai-accent)"></iconify-icon>
            <span>Edit ${filePath}</span>
            <span class="diff-stats">${oldLines} → ${newLines} lines (${oldLines > 0 ? '-' + oldLines : ''}${oldLines > 0 && newLines > 0 ? ' ' : ''}${newLines > 0 ? '+' + newLines : ''})</span>
          </div>
          <div class="diff-content">
            ${hunks.map((hunk: any) => {
              const lineClass = hunk.type || 'context';
              const prefix = hunk.type === 'removed' ? '-' : hunk.type === 'added' ? '+' : ' ';
              const lineNum = hunk.old_line || hunk.new_line || '';
              const numClass = hunk.type === 'removed' ? 'old' : hunk.type === 'added' ? 'new' : '';
              return html`
                <div class="diff-line ${lineClass}">
                  <span class="line-num ${numClass}">${lineNum}</span>
                  <span class="line-prefix">${prefix}</span>
                  <span class="line-code">${unsafeHTML(highlightDiffCode(hunk.content, data.language))}</span>
                </div>`;
            })}
          </div>
        </div>`;
    }

    return html`<pre class="diff-plain">${data.content || msg.content}</pre>`;
  };

  const isDecided = !!msg.decision;

  if (isDecided) {
    return html`
      <div class="ai-msg-thinking tool-use-line">
        <iconify-icon icon="${toolIcon}" width="14" style="color: ${toolColor}"></iconify-icon>
        <span class="thinking-label">${msg.toolName}</span>
        <span class="ai-tool-status ${msg.decision === 'approved' ? 'success' : 'error'}" style="margin-left: 0.5em">${msg.decision}</span>
      </div>`;
  }

  return html`
    <div class="ai-tool-approval">
      <div class="ai-tool-approval-header">
        <iconify-icon icon="${toolIcon}" width="14" style="color: var(--ai-warning)"></iconify-icon>
        <span class="ai-tool-name">${msg.toolName}</span>
        <span class="ai-tool-status pending">requires approval</span>
      </div>
      <div class="ai-tool-approval-preview">
        ${renderDiffPreview(previewData)}
      </div>
      <div class="ai-tool-approval-actions">
        <button class="ai-tool-approval-btn deny" @click=${() => handleToolApproval(false)}>
          Deny
        </button>
        <button class="ai-tool-approval-btn approve" @click=${() => handleToolApproval(true)}>
          Allow
        </button>
      </div>
    </div>`;
}
