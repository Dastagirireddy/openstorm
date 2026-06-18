import { html, css, unsafeCSS } from 'lit';
import { customElement, state, query, property } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { TailwindElement } from '../../tailwind-element.js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import '../layout/icon.js';
import '../layout/code-block.js';
import { aiState } from '../../lib/ai/ai-state.js';
import type { ChatMessage, ModelInfo, AISession, ProviderInfo, AiProviderConfig } from '../../lib/types/ai-types.js';
import { parseMessage, extractFilePaths, type MessageBlock } from '../../lib/ai/ai-message-parser.js';
import { getToolIcon, getToolColor, getToolArgsSummary, formatToolArgs } from '../../lib/ai/ai-tool-registry.js';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import hljsTheme from 'highlight.js/styles/monokai-sublime.css?inline';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const lang = token.info ? token.info.trim().split(/\s+/)[0] : '';
  const code = token.content;
  
  // Escape HTML attributes
  const escapedCode = code.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  return `<code-block language="${lang}" code="${escapedCode}"></code-block>`;
};

const AI_COMMANDS = [
  { name: '/clear', description: 'Clear current session', icon: 'x' },
  { name: '/model', description: 'Switch model', icon: 'sparkles' },
  { name: '/help', description: 'Show available commands', icon: 'info' },
  { name: '/context', description: 'Show context window usage', icon: 'layers' },
  { name: '/export', description: 'Export conversation', icon: 'arrow-down-to-line' },
  { name: '/reset', description: 'Reset session and start fresh', icon: 'rotate-ccw' },
];

const ASCII_LOGO = `░██                                        
░██                                        
 ░███████  ░████████   ░███████  ░████████   ░███████  ░████████  ░███████  ░██░████ ░█████████████  
░██    ░██ ░██    ░██ ░██    ░██ ░██    ░██ ░██           ░██    ░██    ░██ ░███     ░██   ░██   ░██ 
░██    ░██ ░██    ░██ ░█████████ ░██    ░██  ░███████     ░██    ░██    ░██ ░██      ░██   ░██   ░██ 
░██    ░██ ░███   ░██ ░██        ░██    ░██        ░██    ░██    ░██    ░██ ░██      ░██   ░██   ░██ 
 ░███████  ░██░█████   ░███████  ░██    ░██  ░███████      ░████  ░███████  ░██      ░██   ░██   ░██ 
           ░██                                                                                       
           ░██`;

const AI_TIPS = [
  'Use /model to switch between available models',
  'Drag and drop files to attach them to your message',
  'Press Ctrl+N for a new chat session',
  'Use /clear to clear the current conversation',
  'Ask about your codebase — the AI can read your files',
  'Use /export to save your conversation',
  'Press Esc to interrupt a running response',
  'Use /context to check your token usage',
];

function preprocessTodos(text: string): string {
  return text
    .replace(/\[✓\]/g, '<span class="ai-todo-checkbox completed">✓</span>')
    .replace(/\[•\]/g, '<span class="ai-todo-checkbox in-progress">•</span>')
    .replace(/\[ \]/g, '<span class="ai-todo-checkbox pending">○</span>');
}

@customElement('ai-panel')
export class AiPanel extends TailwindElement(css`
    :host {
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Consolas', monospace;
      font-size: 13px;
      color: var(--ai-text);
      background: var(--ai-background);
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      
      /* Code block component variables */
      --code-bg: var(--ai-code-background, #0d1117);
      --code-border: var(--ai-code-border, #30363d);
      --code-header-bg: var(--ai-code-header-background, #161b22);
      --code-lang-color: var(--ai-accent, #58a6ff);
      --code-text: var(--ai-text, #e6edf3);
      --code-text-dim: var(--ai-text-dim, #6e7681);
      --code-success: var(--ai-success, #3fb950);
    }

    /* Markdown content */
    .ai-markdown-content {
      font-size: 14px;
      line-height: 1.7;
    }
    .ai-markdown-content p {
      margin: 0.6em 0;
    }
    .ai-markdown-content p:first-child {
      margin-top: 0;
    }
    .ai-markdown-content p:last-child {
      margin-bottom: 0;
    }
    .ai-markdown-content code {
      background: var(--ai-code-background);
      padding: 0.15em 0.3em;
      border-radius: 3px;
      font-size: 0.9em;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
    }
    .ai-code-block {
      background: var(--ai-code-background);
      border: 1px solid var(--ai-code-border);
      margin: 0.5em 0;
      overflow: hidden;
    }
    .ai-code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.4em 0.75em;
      background: var(--ai-code-header-background);
      border-bottom: 1px solid var(--ai-code-border);
      font-size: 11px;
    }
    .ai-code-lang {
      color: var(--ai-accent);
      font-weight: 500;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
    }
    .ai-code-lines {
      color: var(--ai-text-dim);
      font-size: 10px;
    }
    .ai-code-copy {
      background: none;
      border: 1px solid var(--ai-code-border);
      color: var(--ai-code-header-text);
      cursor: pointer;
      font-size: 11px;
      padding: 0.25em 0.6em;
      border-radius: 3px;
      transition: all 0.15s;
    }
    .ai-code-copy:hover {
      background: var(--ai-tool-background);
      color: var(--ai-text);
      border-color: var(--ai-text-dim);
    }
    .ai-code-copy.copied {
      background: color-mix(in srgb, var(--ai-success) 15%, transparent);
      color: var(--ai-success);
      border-color: var(--ai-success);
    }
    .ai-code-content {
      display: flex;
      overflow-x: auto;
    }
    .ai-code-line-numbers {
      display: flex;
      flex-direction: column;
      padding: 0.75em 0;
      background: var(--ai-code-header-background);
      border-right: 1px solid var(--ai-code-border);
      user-select: none;
      font-size: 11px;
      line-height: 1.5;
      color: var(--ai-text-dim);
      text-align: right;
      min-width: 2.5em;
    }
    .ai-code-line-numbers span {
      padding: 0 0.5em;
    }
    .ai-code-block code {
      display: block;
      padding: 0.75em;
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.5;
      background: transparent;
      flex: 1;
    }

    /* Diff view */
    .ai-diff-block {
      margin: 0.5em 0;
      border: 1px solid var(--ai-code-border);
      border-radius: 6px;
      overflow: hidden;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
      font-size: 12px;
    }
    .ai-diff-header {
      display: flex;
      align-items: center;
      gap: 0.5em;
      padding: 0.4em 0.75em;
      background: var(--ai-code-header-background);
      border-bottom: 1px solid var(--ai-code-border);
      font-size: 11px;
      color: var(--ai-text-dim);
    }
    .ai-diff-stats {
      display: flex;
      gap: 0.5em;
      margin-left: auto;
    }
    .ai-diff-stat-added {
      color: var(--ai-success);
    }
    .ai-diff-stat-removed {
      color: var(--ai-error);
    }
    .ai-diff-content {
      background: var(--ai-code-background);
    }
    .ai-diff-line {
      display: flex;
      padding: 0.1em 0;
      line-height: 1.5;
    }
    .ai-diff-line.added {
      background: color-mix(in srgb, var(--ai-success) 12%, transparent);
    }
    .ai-diff-line.removed {
      background: color-mix(in srgb, var(--ai-error) 12%, transparent);
    }
    .ai-diff-line-header {
      background: color-mix(in srgb, var(--ai-primary) 10%, transparent);
      font-weight: 500;
    }
    .ai-diff-line-number {
      min-width: 3em;
      text-align: right;
      padding: 0 0.75em;
      color: var(--ai-text-dim);
      user-select: none;
      border-right: 1px solid var(--ai-code-border);
    }
    .ai-diff-line-prefix {
      min-width: 1.5em;
      text-align: center;
      font-weight: 500;
    }
    .ai-diff-line.added .ai-diff-line-prefix {
      color: var(--ai-success);
    }
    .ai-diff-line.removed .ai-diff-line-prefix {
      color: var(--ai-error);
    }
    .ai-diff-line-content {
      flex: 1;
      padding: 0 0.75em;
      white-space: pre;
    }

    /* File reference */
    .ai-file-ref {
      display: inline-flex;
      align-items: center;
      gap: 0.3em;
      padding: 0.15em 0.5em;
      background: var(--ai-tool-background);
      border: 1px solid var(--ai-tool-border);
      color: var(--ai-accent);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .ai-file-ref:hover {
      background: var(--ai-tool-header-background);
      border-color: var(--ai-accent);
    }

    .ai-markdown-content ul, .ai-markdown-content ol {
      margin: 0.4em 0;
      padding-left: 1.5em;
    }
    .ai-markdown-content li {
      margin: 0.2em 0;
    }
    .ai-markdown-content blockquote {
      border-left: 3px solid var(--ai-panel-border);
      margin: 0.5em 0;
      padding: 0.5em 0.75em;
      color: var(--ai-text-muted);
      background: var(--ai-panel-background);
    }
    .ai-markdown-content h1, .ai-markdown-content h2, .ai-markdown-content h3,
    .ai-markdown-content h4, .ai-markdown-content h5, .ai-markdown-content h6 {
      margin: 0.75em 0 0.5em 0;
      font-weight: 600;
      color: var(--ai-text);
    }
    .ai-markdown-content h1 { font-size: 1.3em; }
    .ai-markdown-content h2 { font-size: 1.15em; }
    .ai-markdown-content h3 { font-size: 1.05em; }
    .ai-markdown-content a {
      color: var(--ai-accent);
      text-decoration: none;
    }
    .ai-markdown-content a:hover {
      text-decoration: underline;
    }
    .ai-markdown-content table {
      border-collapse: collapse;
      margin: 0.75em 0;
      width: 100%;
    }
    .ai-markdown-content th, .ai-markdown-content td {
      border: 1px solid var(--ai-panel-border);
      padding: 0.4em 0.6em;
      text-align: left;
    }
    .ai-markdown-content th {
      background: var(--ai-panel-background);
      font-weight: 600;
    }
    .ai-markdown-content hr {
      border: none;
      border-top: 1px solid var(--ai-panel-border);
      margin: 1em 0;
    }

    /* Thought block - faded with opacity */
    .ai-thought-block {
      display: flex;
      align-items: center;
      gap: 0.5em;
      padding: 0.3em 0;
      color: var(--ai-thinking-color);
      font-size: 13px;
      opacity: var(--ai-thinking-opacity);
    }
    .ai-thought-block .thought-label {
      color: var(--ai-thinking-color);
      font-weight: 500;
    }
    .ai-thought-block .thought-duration {
      color: var(--ai-text-muted);
    }

    /* L2: Tool use/result - indented, subtle */
    .ai-tool-block {
      margin: 0.5em 0 0.5em 1.5em;
      font-size: 13px;
    }
    .ai-tool-header {
      display: flex;
      align-items: center;
      gap: 0.5em;
      padding: 0.4em 0;
      color: var(--ai-text-muted);
      cursor: pointer;
      transition: background 0.15s;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
    }
    .ai-tool-header:hover {
      background: var(--ai-tool-header-background);
      color: var(--ai-text);
    }
    .ai-tool-icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }
    .ai-tool-icon svg {
      width: 100%;
      height: 100%;
    }
    .ai-tool-icon.pending { color: var(--ai-warning); }
    .ai-tool-icon.running { color: var(--ai-primary); }
    .ai-tool-icon.success { color: var(--ai-success); }
    .ai-tool-icon.error { color: var(--ai-error); }
    .ai-tool-name {
      color: var(--ai-accent);
      font-weight: 500;
    }
    .ai-tool-content {
      color: var(--ai-text-dim);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
    }
    .ai-tool-status {
      font-size: 10px;
      padding: 0.15em 0.4em;
      border-radius: 3px;
      font-weight: 500;
    }
    .ai-tool-status.running {
      background: color-mix(in srgb, var(--ai-primary) 12%, transparent);
      color: var(--ai-primary);
    }
    .ai-tool-status.success {
      background: color-mix(in srgb, var(--ai-success) 12%, transparent);
      color: var(--ai-success);
    }
    .ai-tool-status.error {
      background: color-mix(in srgb, var(--ai-error) 12%, transparent);
      color: var(--ai-error);
    }
    .ai-tool-arrow {
      color: var(--ai-text-dim);
      font-size: 10px;
      width: 1em;
      text-align: center;
    }
    .ai-tool-details {
      padding: 0.5em 0.75em;
      background: var(--ai-code-background);
      border-top: 1px solid var(--ai-code-border);
      font-size: 12px;
      color: var(--ai-text-muted);
    }
    .ai-tool-details pre {
      margin: 0;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }
    .ai-tool-result {
      margin: 0.25em 0 0.75em 1.5em;
    }
    .ai-tool-result-header {
      display: none;
    }
    .ai-tool-result-content {
      white-space: pre;
      overflow-x: auto;
      color: var(--ai-text);
      line-height: 1.6;
    }

    /* L2: Error block - indented, readable */
    .ai-error-block {
      margin: 0.5em 0 0.5em 1.5em;
      padding: 0.75em 1em;
      color: #f85149;
      font-size: 13px;
      background: #1c1215;
      border: 1px solid #3d1f23;
    }
    .ai-error-block .error-title {
      color: #ff7b72;
      font-weight: 600;
      margin-bottom: 0.25em;
    }

    .ai-system-msg {
      margin: 0.5em 0 0.5em 1.5em;
      padding: 0.75em 1em;
      color: var(--ai-text-dim);
      font-size: 13px;
      background: var(--ai-tool-background);
      border: 1px solid var(--ai-panel-border);
      border-left: 3px solid var(--ai-primary);
    }

    /* Empty state */
    .ai-empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 1.5em;
      color: var(--ai-text-muted);
      font-size: 14px;
      text-align: center;
      padding: 2em;
    }
    .ai-empty-logo {
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
      font-size: 10px;
      line-height: 1.2;
      color: var(--ai-primary);
      white-space: pre;
      letter-spacing: 0.05em;
      user-select: none;
    }
    .ai-empty-input-preview {
      display: flex;
      align-items: center;
      width: 100%;
      max-width: 480px;
      padding: 0.75em 1em;
      border: 1px solid var(--ai-input-border);
      background: var(--ai-input-background);
      color: var(--ai-input-placeholder);
      font-size: 13px;
      cursor: text;
      transition: border-color 0.2s ease;
    }
    .ai-empty-input-preview:hover {
      border-color: var(--ai-text-dim);
    }
    .ai-empty-model-info {
      display: flex;
      align-items: center;
      gap: 0.5em;
      font-size: 12px;
      color: var(--ai-text-dim);
    }
    .ai-empty-model-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--ai-success);
    }
    .ai-empty-model-dot.disconnected {
      background: var(--ai-error);
    }
    .ai-empty-shortcuts {
      display: flex;
      align-items: center;
      gap: 1em;
      font-size: 11px;
      color: var(--ai-text-dim);
    }
    .ai-empty-shortcuts kbd {
      background: var(--ai-tool-background);
      border: 1px solid var(--ai-panel-border);
      padding: 0.1em 0.35em;
      border-radius: 3px;
      font-family: inherit;
      font-size: 10px;
      color: var(--ai-text);
    }
    .ai-empty-tip {
      display: flex;
      align-items: center;
      gap: 0.5em;
      font-size: 12px;
      color: var(--ai-text-dim);
      opacity: 0.8;
      transition: opacity 0.3s ease;
    }
    .ai-empty-tip-dot {
      color: var(--ai-primary);
    }

    /* Status indicators */
    .ai-status-item {
      display: flex;
      align-items: center;
      gap: 0.4em;
      font-size: 12px;
    }
    .ai-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .ai-status-dot.connected {
      background: var(--ai-success);
      box-shadow: 0 0 4px var(--ai-success);
    }
    .ai-status-dot.disconnected {
      background: var(--ai-error);
    }

    /* Input area - OpenCode TUI style */
    .ai-input-area {
      background: transparent;
      padding: 0.75em 1em 0.5em;
      display: flex;
      flex-direction: column;
      gap: 0.4em;
    }
    .ai-input-container {
      position: relative;
      margin: 0;
      border: none;
      background: transparent;
      transition: all 0.2s ease;
    }
    .ai-input-container.dragging {
      background: color-mix(in srgb, var(--ai-primary) 5%, var(--ai-input-background));
    }

    /* OpenCode-style prompt frame */
    .ai-prompt-frame {
      display: flex;
      flex-direction: column;
      position: relative;
      gap: 0.4rem;
      border: none;
    }

    /* Top bar with model and token info */
    .ai-prompt-topbar {
      display: flex;
      align-items: center;
      gap: 0.75em;
      padding: 0.4em 0.6em;
      font-size: 11px;
      color: var(--ai-text-dim);
      border-bottom: 1px solid var(--ai-panel-border);
    }
    .ai-prompt-model {
      display: flex;
      align-items: center;
      gap: 0.4em;
      color: var(--ai-text);
      font-weight: 500;
    }
    .ai-model-bare {
      background: none;
      border: none;
      color: var(--ai-text);
      font-family: inherit;
      font-size: inherit;
      font-weight: 500;
      padding: 0;
      margin: 0;
      cursor: pointer;
      outline: none;
      appearance: none;
      -webkit-appearance: none;
    }
    .ai-model-bare option {
      background: var(--ai-panel-background);
      color: var(--ai-text);
    }
    .ai-prompt-model-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .ai-prompt-stats {
      display: flex;
      align-items: center;
      gap: 0.75em;
      margin-left: auto;
    }
    .ai-prompt-stat {
      display: flex;
      align-items: center;
      gap: 0.3em;
      color: var(--ai-text-muted);
    }
    .ai-prompt-stat svg {
      width: 11px;
      height: 11px;
      opacity: 0.6;
    }
    .ai-prompt-stat.cost {
      color: var(--ai-success);
    }

    /* Main input area with heavy border */
    .ai-prompt-content {
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .ai-prompt-border-left {
      width: 3px;
      background: var(--ai-primary);
      flex-shrink: 0;
    }
    .ai-prompt-input-row {
      display: flex;
      align-items: flex-end;
      padding: 0.6em 0.8em;
      gap: 0.5em;
    }
    .ai-prompt-textarea {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--ai-input-text);
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
      font-size: 13px;
      line-height: 1.5;
      resize: none;
      outline: none;
      min-height: 1.5em;
      max-height: 8em;
      padding: 0;
      caret-color: transparent;
    }
    .ai-custom-caret {
      position: absolute;
      width: 10px;
      height: 1.2em;
      background: var(--ai-primary);
      pointer-events: none;
      top: 0;
      left: 0;
    }
    .ai-prompt-textarea::placeholder {
      color: var(--ai-input-placeholder);
    }
    .ai-prompt-actions {
      display: flex;
      align-items: center;
      gap: 0.25em;
      padding-bottom: 0.1em;
    }
    .ai-prompt-icon-btn {
      background: none;
      border: none;
      color: var(--ai-text-dim);
      cursor: pointer;
      padding: 0.35em;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }
    .ai-prompt-icon-btn:hover {
      background: var(--ai-tool-background);
      color: var(--ai-text);
    }
    .ai-prompt-icon-btn svg {
      width: 15px;
      height: 15px;
    }

    /* Bottom bar with attachments */
    .ai-prompt-attachments-bar {
      display: flex;
      align-items: center;
      gap: 0.5em;
      padding: 0.4em 0.6em;
      border-top: 1px solid var(--ai-panel-border);
    }
    .ai-prompt-attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4em;
      flex: 1;
    }
    .ai-attachment-chip {
      display: flex;
      align-items: center;
      gap: 0.3em;
      padding: 0.15em 0.4em;
      background: var(--ai-tool-background);
      border: 1px solid var(--ai-panel-border);
      border-radius: 3px;
      font-size: 10px;
      color: var(--ai-text);
    }
    .ai-attachment-chip button {
      background: none;
      border: none;
      color: var(--ai-text-dim);
      cursor: pointer;
      padding: 0;
      font-size: 12px;
      line-height: 1;
    }
    .ai-attachment-chip button:hover {
      color: var(--ai-error);
    }

    /* Body wrapper */
    .ai-prompt-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      border-left: 3px solid var(--ai-primary);
      background: var(--activitybar-background);
    }

    /* Attachments bar */
    .ai-prompt-attachments-bar {
      display: flex;
      align-items: center;
      padding: 0.3em 0.6em;
      border-top: 1px solid var(--ai-panel-border);
    }

    /* Stats bar at bottom */
    .ai-prompt-stats-bar {
      display: flex;
      align-items: center;
      gap: 0.5em;
      padding: 0.35em 0.6em;
      border-top: none;
      font-size: 11px;
      color: var(--ai-text-dim);
    }

    /* Bottom border with Unicode blocks */
    .ai-prompt-border-bottom {
      display: flex;
      height: 6px;
      background: var(--ai-panel-background);
    }
    .ai-prompt-border-bottom-corner {
      width: 6px;
      height: 6px;
      background: var(--ai-panel-border);
      clip-path: polygon(0 0, 100% 0, 0 100%);
    }

    /* Hints bar */
    .ai-prompt-hints {
      display: flex;
      align-items: center;
      gap: 0.75em;
      padding: 0.5em 0.6em;
      font-size: 11px;
      color: var(--ai-text-muted);
      opacity: 0.8;
      margin-top: 0.4em;
      border: none;
      background: transparent;
    }
    .ai-prompt-hint {
      display: flex;
      align-items: center;
      gap: 0.25em;
    }
    .ai-prompt-hint kbd {
      background: var(--ai-tool-background);
      border: 1px solid var(--ai-panel-border);
      padding: 0.05em 0.25em;
      border-radius: 2px;
      font-family: inherit;
      font-size: 9px;
    }

    /* Command menu */
    .ai-command-menu {
      position: absolute;
      bottom: 100%;
      left: 3px;
      right: 0;
      max-height: 180px;
      overflow-y: auto;
      background: var(--ai-panel-background);
      border: 1px solid var(--ai-panel-border);
      border-bottom: none;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
      z-index: 100;
    }
    .ai-command-item {
      display: flex;
      align-items: center;
      gap: 0.6em;
      padding: 0.5em 0.75em;
      cursor: pointer;
      transition: background 0.1s ease;
      font-size: 12px;
    }
    .ai-command-item:hover,
    .ai-command-item.selected {
      background: var(--ai-tool-background);
    }
    .ai-command-item.selected {
      background: var(--ai-primary-bg, color-mix(in srgb, var(--ai-primary) 12%, transparent));
    }
    .ai-command-item-icon {
      width: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ai-command-item-name {
      color: var(--ai-text);
      font-weight: 500;
    }
    .ai-command-item-desc {
      color: var(--ai-text-dim);
      margin-left: auto;
      font-size: 11px;
    }

    /* Drop overlay */
    .ai-drop-overlay {
      position: absolute;
      inset: 0;
      background: color-mix(in srgb, var(--ai-primary) 8%, transparent);
      border: 2px dashed var(--ai-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      color: var(--ai-primary);
      font-weight: 500;
      pointer-events: none;
      z-index: 50;
    }

    /* ============================================
       OpenCode-style MESSAGE SYSTEM
       Clean, minimal, terminal-like
       ============================================ */

    /* L0: User message - highlighted block */
    .ai-msg-user {
      padding: 1em 1.25em;
      margin: 3em 0 0.5em 0;
      background: var(--ai-user-background);
      border: 1px solid var(--ai-panel-border);
      border-left: 3px solid var(--ai-user-border);
    }
    .ai-msg-user:first-child {
      margin-top: 0;
    }
    .ai-msg-user-label {
      display: none;
    }

    /* L1: Thinking - indented under user, clean text */
    .ai-msg-thinking {
      display: flex;
      align-items: center;
      gap: 0.5em;
      padding: 0.4em 0 0.4em 1.5em;
      margin: 0.5em 0;
      color: var(--ai-thinking-color);
      font-size: 13px;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
    }
    .ai-msg-thinking .thinking-icon {
      display: none;
    }
    .ai-msg-thinking .thinking-label {
      font-weight: 500;
    }
    .ai-msg-thinking .thinking-time {
      color: var(--ai-text-muted);
      font-size: 12px;
    }
    .ai-msg-thinking .thinking-dots::after {
      content: '...';
      animation: thinking-dots 1.5s infinite;
    }
    @keyframes thinking-dots {
      0%, 20% { content: '.'; }
      40% { content: '..'; }
      60%, 100% { content: '...'; }
    }

    /* L2: Assistant message - indented under user */
    .ai-msg-assistant {
      padding: 0.75em 0 0.75em 1.5em;
      margin: 0.5em 0 2em 0;
    }
    .ai-msg-header {
      display: none;
    }
    .ai-msg-assistant-label {
      display: none;
    }
    .ai-msg-copy-btn {
      display: none;
    }
    .ai-msg-assistant:hover .ai-msg-copy-btn {
      opacity: 1;
    }
    .ai-msg-copy-btn:hover {
      background: var(--ai-tool-background);
      color: var(--ai-text);
      border-color: var(--ai-panel-border);
    }

    .ai-icon-btn {
      background: none;
      border: 1px solid var(--ai-panel-border);
      color: var(--ai-text-dim);
      cursor: pointer;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }
    .ai-icon-btn:hover {
      background: var(--ai-tool-background);
      color: var(--ai-text);
      border-color: var(--ai-text-dim);
    }

    /* Footer with model + time */
    .ai-msg-footer {
      display: flex;
      align-items: center;
      gap: 0.5em;
      margin-top: 0.75em;
      padding: 0.4em 0.6em;
      background: var(--ai-tool-background);
      border: 1px solid var(--ai-panel-border);
      font-size: 11px;
      color: var(--ai-text-dim);
    }
    .ai-msg-footer-icon {
      display: flex;
      align-items: center;
      color: var(--ai-primary);
    }
    .ai-msg-footer-model {
      color: var(--ai-text);
      font-weight: 500;
    }
    .ai-msg-footer-separator {
      color: var(--ai-text-dim);
      opacity: 0.5;
    }
    .ai-msg-footer-tokens {
      color: var(--ai-text-muted);
    }
    .ai-msg-footer-cost {
      color: var(--ai-success);
    }
    .ai-msg-footer-time {
      color: var(--ai-text-muted);
    }

    /* Todo items */
    .ai-todo-item {
      display: flex;
      align-items: flex-start;
      gap: 0.5em;
      padding: 0.2em 0;
      font-size: 13px;
    }
    .ai-todo-checkbox {
      flex-shrink: 0;
      width: 1em;
      text-align: center;
    }
    .ai-todo-checkbox.completed {
      color: var(--ai-success);
    }
    .ai-todo-checkbox.in-progress {
      color: var(--ai-warning);
    }
    .ai-todo-checkbox.pending {
      color: var(--ai-text-dim);
    }
    .ai-todo-content {
      flex: 1;
    }
    .ai-todo-content.completed {
      color: var(--ai-text-dim);
      text-decoration: line-through;
    }
    .ai-todo-content.in-progress {
      color: var(--ai-text);
    }
    .ai-todo-content.pending {
      color: var(--ai-text-muted);
    }
  `, unsafeCSS(hljsTheme)) {
  @property({ type: String }) projectPath = '';
  @state() private sessions: AISession[] = [];
  @state() private activeSessionId: string | null = null;
  @state() private inputText = '';
  @state() private models: ModelInfo[] = [];
  @state() private selectedModel = '';
  @state() private currentProvider = 'ollama';
  @state() private providers: ProviderInfo[] = [];
  @state() private providerConnected = false;
  @state() private providerLoading = false;
  @state() private isThinking = false;
  @state() private isStreaming = false;
  @state() private showToolDetails = new Set<string>();
  @state() private thinkingStartTime: number = 0;
  @state() private responseStartTime: number = 0;
  @state() private lastResponseTime: number = 0;
  @state() private sessionStats = { tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0, messageCount: 0 };
  @state() private isDragging = false;
  @state() private showCommands = false;
  @state() private commandFilter = '';
  @state() private selectedCommandIndex = 0;
  @state() private attachments: AIAttachment[] = [];
  @state() private currentTipIndex = 0;

  @query('#chat-scroll') private chatScroll!: HTMLDivElement;
  @query('#chat-input') private chatInput!: HTMLTextAreaElement;

  private unlistenFn?: () => void;
  private tipTimer?: ReturnType<typeof setInterval>;

  connectedCallback() {
    super.connectedCallback();
    this.setupEventListeners();
    this.loadState();
    this.tipTimer = setInterval(() => {
      this.currentTipIndex = (this.currentTipIndex + 1) % AI_TIPS.length;
    }, 6000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unlistenFn?.();
    if (this.tipTimer) {
      clearInterval(this.tipTimer);
      this.tipTimer = undefined;
    }
  }

  private loadState() {
    this.sessions = aiState.sessions;
    this.activeSessionId = aiState.activeSessionId;
    this.models = aiState.models;
    this.selectedModel = aiState.selectedModel;
    this.providerConnected = aiState.ollamaConnected;
    this.updateSessionStats();

    aiState.on('session-created', (session: AISession) => {
      this.sessions = [...aiState.sessions];
      this.activeSessionId = session.id;
      this.updateSessionStats();
    });

    aiState.on('session-switched', (sessionId: string) => {
      this.activeSessionId = sessionId;
      this.attachments = [];
      this.updateSessionStats();
    });

    aiState.on('session-deleted', () => {
      this.sessions = [...aiState.sessions];
      this.activeSessionId = aiState.activeSessionId;
      this.updateSessionStats();
    });

    aiState.on('session-cleared', () => {
      this.sessions = [...aiState.sessions];
      this.updateSessionStats();
    });

    aiState.on('models-updated', (models: ModelInfo[]) => {
      this.models = models;
    });

    aiState.on('model-selected', (modelId: string) => {
      this.selectedModel = modelId;
    });

    aiState.on('ollama-status', (connected: boolean) => {
      this.providerConnected = connected;
    });
  }

  private async setupEventListeners() {
    this.unlistenFn = await listen('ai-agent-event', (event: any) => {
      this.handleAgentEvent(event.payload);
    });
  }

  private async initialize() {
    this.providerLoading = true;
    this.providerConnected = false;
    try {
      const config = await invoke<AiProviderConfig>('ai_get_config');
      this.currentProvider = config.provider || 'ollama';
      this.providers = await invoke<ProviderInfo[]>('ai_list_providers');

      const connected = await invoke<boolean>('ai_check_connection', { providerId: this.currentProvider });
      this.providerConnected = connected;
      aiState.setOllamaConnected(connected);

      if (connected) {
        const models = await invoke<ModelInfo[]>('ai_list_models', { providerId: this.currentProvider });
        aiState.setModels(models);
        if (models.length > 0) {
          const savedModel = config.model;
          const match = savedModel ? models.find(m => m.id === savedModel) : null;
          aiState.setSelectedModel(match ? match.id : models[0].id);
        }
      }
    } catch (e) {
      console.error('[AI] Failed to initialize:', e);
      this.providerConnected = false;
    } finally {
      this.providerLoading = false;
    }
  }

  firstUpdated() {
    this.initialize();
    this.createSession();
    setTimeout(() => {
      this.chatInput?.focus();
      this.updateCustomCaret();
    }, 100);
  }

  private async switchProvider(providerId: string) {
    if (providerId === this.currentProvider) return;
    this.currentProvider = providerId;
    this.providerLoading = true;
    this.providerConnected = false;
    aiState.setModels([]);
    aiState.setSelectedModel('');
    try {
      await invoke('ai_set_config', { config: { provider: providerId, base_url: '', api_key: '', model: '' } });
      const connected = await invoke<boolean>('ai_check_connection', { providerId });
      this.providerConnected = connected;
      aiState.setOllamaConnected(connected);
      if (connected) {
        const models = await invoke<ModelInfo[]>('ai_list_models', { providerId });
        aiState.setModels(models);
        if (models.length > 0) {
          aiState.setSelectedModel(models[0].id);
          await invoke('ai_set_config', { config: { provider: providerId, base_url: '', api_key: '', model: models[0].id } });
        }
      }
    } catch (e) {
      console.error('[AI] Failed to switch provider:', e);
      this.providerConnected = false;
    } finally {
      this.providerLoading = false;
    }
  }

  private async selectModel(modelId: string) {
    aiState.setSelectedModel(modelId);
    try {
      await invoke('ai_set_config', { config: { provider: this.currentProvider, base_url: '', api_key: '', model: modelId } });
    } catch (e) {
      console.error('[AI] Failed to save model:', e);
    }
  }

  private getActiveSession(): AISession | undefined {
    return this.sessions.find(s => s.id === this.activeSessionId);
  }

  private getMessages(): ChatMessage[] {
    return this.getActiveSession()?.messages || [];
  }

  private createSession() {
    aiState.createSession();
  }

  private updateSessionStats() {
    if (this.activeSessionId) {
      this.sessionStats = aiState.getSessionStats(this.activeSessionId);
    } else {
      this.sessionStats = { tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0, messageCount: 0 };
    }
  }

  private clearSession() {
    if (!this.activeSessionId) return;
    aiState.clearSession(this.activeSessionId);
    this.sessions = [...aiState.sessions];
    this.attachments = [];
    this.updateSessionStats();
  }

  private handleAgentEvent(event: any) {
    const sessionId = this.activeSessionId;
    if (!sessionId) return;

    switch (event.type) {
      case 'thinking':
        this.thinkingStartTime = Date.now();
        aiState.addMessage(sessionId, {
          id: `think-${Date.now()}`,
          role: 'thinking',
          content: event.message,
          timestamp: Date.now(),
        });
        break;

      case 'tool_use':
        aiState.addMessage(sessionId, {
          id: `tool-${Date.now()}`,
          role: 'tool_use',
          content: `Using ${event.tool_name}...`,
          timestamp: Date.now(),
          toolName: event.tool_name,
          toolArgs: event.arguments,
        });
        break;

      case 'tool_result': {
        const messages = this.getMessages();
        const lastToolUse = [...messages].reverse().find(
          m => m.role === 'tool_use' && m.toolName === event.tool_name && !m.content.includes('Done')
        );
        if (lastToolUse) {
          aiState.updateMessage(sessionId, lastToolUse.id, {
            content: `Used ${event.tool_name} — Done`,
          });
        }
        aiState.addMessage(sessionId, {
          id: `tresult-${Date.now()}`,
          role: 'tool_result',
          content: event.result,
          timestamp: Date.now(),
          toolName: event.tool_name,
        });
        break;
      }

      case 'text_delta':
        if (!this.responseStartTime) {
          this.responseStartTime = Date.now();
        }
        this.appendToOrCreateAssistant(sessionId, event.content);
        break;

      case 'response':
        this.appendToOrCreateAssistant(sessionId, event.content);
        if (this.responseStartTime) {
          this.lastResponseTime = (Date.now() - this.responseStartTime) / 1000;
          this.responseStartTime = 0;
        }
        aiState.setThinking(false);
        aiState.setStreaming(false);
        this.updateSessionStats();
        break;

      case 'error':
        aiState.addMessage(sessionId, {
          id: `err-${Date.now()}`,
          role: 'error',
          content: event.message,
          timestamp: Date.now(),
        });
        aiState.setThinking(false);
        aiState.setStreaming(false);
        break;
    }
    this.sessions = [...aiState.sessions];
    this.scrollToBottom();
  }

  private appendToOrCreateAssistant(sessionId: string, content: string) {
    const messages = this.getMessages();
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
      aiState.updateMessage(sessionId, lastMsg.id, {
        content: lastMsg.content + content,
      });
    } else {
      aiState.addMessage(sessionId, {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content,
        timestamp: Date.now(),
        isStreaming: true,
      });
    }
  }

  private scrollToBottom() {
    requestAnimationFrame(() => {
      if (this.chatScroll) {
        this.chatScroll.scrollTop = this.chatScroll.scrollHeight;
      }
    });
  }

  private async sendMessage() {
    const text = this.inputText.trim();
    if (!text || this.isThinking) return;

    if (text.startsWith('/')) {
      this.handleCommand(text);
      return;
    }

    if (!this.activeSessionId) {
      this.createSession();
    }
    const sessionId = this.activeSessionId!;

    aiState.addMessage(sessionId, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });

    this.inputText = '';
    aiState.setThinking(true);

    const messages = this.getMessages();
    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));

    try {
      await invoke('ai_chat', {
        providerId: this.currentProvider,
        model: this.selectedModel,
        message: text,
        projectPath: this.projectPath,
        history,
      });
    } catch (e) {
      aiState.addMessage(sessionId, {
        id: `err-${Date.now()}`,
        role: 'error',
        content: String(e),
        timestamp: Date.now(),
      });
      aiState.setThinking(false);
    }
    this.sessions = [...aiState.sessions];
  }

  private async abortRequest() {
    try {
      await invoke('ai_abort');
      aiState.setThinking(false);
      aiState.setStreaming(false);
    } catch (e) {
      console.error('[AI] Abort failed:', e);
    }
  }

  private async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error('[AI] Failed to copy:', e);
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    // Handle command menu navigation
    if (this.showCommands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedCommandIndex = Math.min(this.selectedCommandIndex + 1, this.getFilteredCommands().length - 1);
        this.scrollSelectedIntoView();
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedCommandIndex = Math.max(this.selectedCommandIndex - 1, 0);
        this.scrollSelectedIntoView();
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        this.selectCommand(this.getFilteredCommands()[this.selectedCommandIndex]);
        return;
      } else if (e.key === 'Escape') {
        this.showCommands = false;
        return;
      }
    }

    // ESC to interrupt
    if (e.key === 'Escape' && this.isThinking) {
      e.preventDefault();
      this.abortRequest();
      return;
    }

    // Enter to send (Shift+Enter for newline)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    } else if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.createSession();
    } else if (e.key === 'x' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.clearSession();
    }
  }

  private handleInput(e: Event) {
    const ta = e.target as HTMLTextAreaElement;
    this.inputText = ta.value;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';

    // Check for command trigger
    if (this.inputText.startsWith('/')) {
      this.commandFilter = this.inputText;
      this.showCommands = true;
      this.selectedCommandIndex = 0;
    } else {
      this.showCommands = false;
    }
    this.updateCustomCaret();
  }

  private updateCustomCaret = () => {
    requestAnimationFrame(() => {
      const ta = this.chatInput;
      const caret = this.renderRoot.querySelector('#custom-caret') as HTMLElement;
      const inputRow = this.renderRoot.querySelector('.ai-prompt-input-row') as HTMLElement;
      if (!ta || !caret || !inputRow) return;

      if (ta.selectionStart === null || ta.selectionStart !== ta.selectionEnd) {
        caret.style.display = 'none';
        return;
      }

      const text = ta.value.substring(0, ta.selectionStart);
      const lines = text.split('\n');
      const currentLine = lines.length - 1;
      const currentCol = lines[currentLine].length;

      const taStyle = getComputedStyle(ta);
      const fontSize = parseFloat(taStyle.fontSize);
      const lineHeight = parseFloat(taStyle.lineHeight) || fontSize * 1.5;

      const rowStyle = getComputedStyle(inputRow);
      const rowPaddingLeft = parseFloat(rowStyle.paddingLeft) || 0;
      const rowPaddingTop = parseFloat(rowStyle.paddingTop) || 0;

      const charWidth = fontSize * 0.602;
      const x = rowPaddingLeft + currentCol * charWidth;
      const y = rowPaddingTop + currentLine * lineHeight;

      caret.style.display = 'block';
      caret.style.left = `${x}px`;
      caret.style.top = `${y}px`;
    });
  };

  private getFilteredCommands() {
    if (!this.commandFilter) return AI_COMMANDS;
    return AI_COMMANDS.filter(cmd => 
      cmd.name.toLowerCase().includes(this.commandFilter.toLowerCase())
    );
  }

  private scrollSelectedIntoView() {
    requestAnimationFrame(() => {
      const menu = this.renderRoot.querySelector('.ai-command-menu');
      const selected = menu?.querySelector('.ai-command-item.selected');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  private selectCommand(command: { name: string; description: string }) {
    this.inputText = command.name + ' ';
    this.showCommands = false;
    this.commandFilter = '';
    this.chatInput?.focus();
  }

  private handleCommand(text: string) {
    const cmd = text.split(/\s+/)[0].toLowerCase();
    this.inputText = '';

    switch (cmd) {
      case '/clear':
        this.clearSession();
        break;
      case '/reset':
        this.clearSession();
        this.createSession();
        break;
      case '/help':
        this.showHelp();
        break;
      case '/context':
        this.showContext();
        break;
      case '/export':
        this.exportConversation();
        break;
      case '/model':
        this.focusModelSelector();
        break;
      default:
        this.addSystemMessage(`Unknown command: ${cmd}. Type /help for available commands.`);
        break;
    }
  }

  private addSystemMessage(content: string) {
    if (!this.activeSessionId) {
      this.createSession();
    }
    aiState.addMessage(this.activeSessionId!, {
      id: `sys-${Date.now()}`,
      role: 'system',
      content,
      timestamp: Date.now(),
    });
    this.sessions = [...aiState.sessions];
  }

  private showHelp() {
    const help = AI_COMMANDS.map(c => `**${c.name}** — ${c.description}`).join('\n');
    this.addSystemMessage(help);
  }

  private showContext() {
    if (!this.activeSessionId) return;
    const stats = aiState.getSessionStats(this.activeSessionId);
    const lines = [
      `**Session:** ${this.activeSessionId}`,
      `**Messages:** ${stats.messageCount}`,
      `**Tokens in:** ${this.formatTokenCount(stats.tokens.input)}`,
      `**Tokens out:** ${this.formatTokenCount(stats.tokens.output)}`,
    ];
    if (stats.cost > 0) lines.push(`**Cost:** $${stats.cost.toFixed(4)}`);
    this.addSystemMessage(lines.join('\n'));
  }

  private exportConversation() {
    const session = aiState.getActiveSession();
    if (!session) return;
    const lines = session.messages.map(m => {
      const role = m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Assistant' : m.role;
      return `**${role}:**\n${m.content}`;
    });
    const md = `# ${session.name}\n\n${lines.join('\n\n')}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.name.replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    this.addSystemMessage('Conversation exported.');
  }

  private focusModelSelector() {
    const select = this.renderRoot.querySelector('.ai-model-bare') as HTMLSelectElement;
    select?.focus();
    this.addSystemMessage('Use the model selector below to switch models.');
  }

  private handleDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging = true;
  }

  private handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging = false;
  }

  private handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  private handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging = false;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      this.attachFiles(Array.from(files));
    }
  }

  private attachFiles(files: File[]) {
    for (const file of files.slice(0, 5)) { // Limit to 5 files
      const attachment: AIAttachment = {
        id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        path: file.name,
        name: file.name,
        type: 'file',
      };
      this.attachments = [...this.attachments, attachment];
    }
  }

  private attachImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.gif';
    input.multiple = true;
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.files) {
        this.attachFiles(Array.from(target.files));
      }
    };
    input.click();
  }

  private removeAttachment(id: string) {
    this.attachments = this.attachments.filter(a => a.id !== id);
  }

  private toggleToolDetails(id: string) {
    const next = new Set(this.showToolDetails);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.showToolDetails = next;
  }

  private formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private formatTokenCount(count: number): string {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  }

  private formatToolArgs(args: string): string {
    try {
      return JSON.stringify(JSON.parse(args), null, 2);
    } catch {
      return args;
    }
  }

  private renderMessage(msg: ChatMessage) {
    switch (msg.role) {
      case 'user':
        return html`
          <div class="ai-msg-user">
            <div class="ai-msg-user-label">You</div>
            <div>${msg.content}</div>
          </div>`;

      case 'assistant': {
        const renderedHtml = md.render(preprocessTodos(msg.content || ''));
        const modelName = this.selectedModel || 'Unknown';
        const timeStr = this.lastResponseTime > 0 ? `${this.lastResponseTime.toFixed(1)}s` : '';
        const tokens = this.sessionStats.tokens;
        const totalTokens = tokens.input + tokens.output;
        const tokenStr = totalTokens > 0 ? `${this.formatTokenCount(totalTokens)} tok` : '';
        const costStr = this.sessionStats.cost > 0 ? `$${this.sessionStats.cost.toFixed(4)}` : '';
        return html`
          <div class="ai-msg-assistant">
            <div class="ai-markdown-content">
              ${unsafeHTML(renderedHtml)}
            </div>
            <div class="ai-msg-footer">
              <span class="ai-msg-footer-icon">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="2" y="2" width="20" height="20" rx="4"/>
                </svg>
              </span>
              <span class="ai-msg-footer-model">${modelName}</span>
              ${tokenStr ? html`<span class="ai-msg-footer-separator">·</span><span class="ai-msg-footer-tokens">${tokenStr}</span>` : ''}
              ${costStr ? html`<span class="ai-msg-footer-separator">·</span><span class="ai-msg-footer-cost">${costStr}</span>` : ''}
              ${timeStr ? html`<span class="ai-msg-footer-separator">·</span><span class="ai-msg-footer-time">${timeStr}</span>` : ''}
            </div>
          </div>`;
      }

      case 'thinking': {
        const elapsed = this.thinkingStartTime ? ((Date.now() - this.thinkingStartTime) / 1000).toFixed(1) : '';
        return html`
          <div class="ai-msg-thinking">
            <span class="thinking-label">+ Thought:</span>
            ${elapsed ? html`<span class="thinking-time">${elapsed}s</span>` : html`<span class="thinking-dots"></span>`}
          </div>`;
      }

      case 'tool_use': {
        const toolIcon = getToolIcon(msg.toolName || '');
        const toolColor = getToolColor(msg.toolName || '');
        const argsSummary = getToolArgsSummary(msg.toolName || '', msg.toolArgs);
        return html`
          <div class="ai-tool-block">
            <div class="ai-tool-header" @click=${() => this.toggleToolDetails(msg.id)}>
              <span class="ai-tool-arrow">${this.showToolDetails.has(msg.id) ? '▾' : '▸'}</span>
              <span class="ai-tool-icon running" style="color: ${toolColor}">${unsafeHTML(toolIcon)}</span>
              <span class="ai-tool-name">${msg.toolName}</span>
              ${argsSummary ? html`<span class="ai-tool-content">${argsSummary}</span>` : ''}
              <span class="ai-tool-status running">running</span>
            </div>
            ${this.showToolDetails.has(msg.id) && msg.toolArgs ? html`
              <div class="ai-tool-details">
                <pre>${formatToolArgs(msg.toolArgs)}</pre>
              </div>
            ` : ''}
          </div>`;
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
        const renderedHtml = md.render(msg.content || '');
        return html`
          <div class="ai-system-msg">
            <div class="ai-markdown-content">${unsafeHTML(renderedHtml)}</div>
          </div>`;
      }

      default:
        return html``;
    }
  }

  render() {
    const messages = this.getMessages();

    return html`
      <div style="display: flex; flex-direction: column; height: 100%; background: rgba(13, 17, 23, 0.5);">
        <!-- Header -->
        <div style="display: flex; align-items: center; gap: 0.8em; padding: 0.5em 0.8em; border-bottom: 1px solid var(--ai-panel-border); background: var(--ai-panel-background);">
          <span style="font-weight: 500;">AI</span>
          <span style="color: var(--ai-text-dim);">·</span>
          <span class="ai-status-item">
            <span class="ai-status-dot ${this.providerLoading ? '' : this.providerConnected ? 'connected' : 'disconnected'}" style="${this.providerLoading ? 'background: var(--ai-warning); animation: pulse 1.5s infinite;' : ''}"></span>
            <span>${this.providerLoading ? 'Connecting...' : this.providerConnected ? (this.currentProvider === 'lmstudio' ? 'LM Studio' : 'Ollama') : 'Disconnected'}</span>
          </span>
          <div style="flex: 1;"></div>
          <button class="ai-icon-btn" @click=${this.clearSession} title="Clear chat (Ctrl+Shift+X)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>

        <!-- Messages area -->
        <div id="chat-scroll" style="flex: 1; overflow-y: auto; padding: 0.8em 1em;">
          ${messages.length === 0 ? html`
            <div class="ai-empty-state">
              <div class="ai-empty-logo">${ASCII_LOGO}</div>
              <div class="ai-empty-input-preview" @click=${() => this.chatInput?.focus()}>
                Ask anything... "Fix a TODO in the codebase"
              </div>
              <div class="ai-empty-model-info">
                <span class="ai-empty-model-dot ${this.providerConnected ? '' : 'disconnected'}"></span>
                <span>${this.selectedModel || 'No model'}</span>
                <span>·</span>
                <span>${this.providerConnected ? `${this.models.length} model${this.models.length !== 1 ? 's' : ''} ready` : 'Disconnected'}</span>
              </div>
              <div class="ai-empty-shortcuts">
                <span>tab agents</span>
                <span>ctrl+p commands</span>
              </div>
              <div class="ai-empty-tip">
                <span class="ai-empty-tip-dot">●</span>
                <span>Tip ${AI_TIPS[this.currentTipIndex]}</span>
              </div>
            </div>
          ` : html`
            ${messages.map(msg => html`
              <div>${this.renderMessage(msg)}</div>
            `)}
            ${this.isThinking && !this.isStreaming ? html`
              <div class="ai-msg-thinking">
                <span>+ Thought:</span>
                <span>Thinking...</span>
              </div>
            ` : ''}
          `}
        </div>

        <!-- Input area - OpenCode TUI style -->
        <div class="ai-input-area">
          <div class="ai-input-container ${this.isDragging ? 'dragging' : ''}"
               @dragenter=${this.handleDragEnter}
               @dragleave=${this.handleDragLeave}
               @dragover=${this.handleDragOver}
               @drop=${this.handleDrop}>
            
            ${this.isDragging ? html`<div class="ai-drop-overlay">Drop files here</div>` : ''}
            
            ${this.showCommands ? html`
              <div class="ai-command-menu">
                ${this.getFilteredCommands().map((cmd, i) => html`
                  <div class="ai-command-item ${i === this.selectedCommandIndex ? 'selected' : ''}"
                       @click=${() => this.selectCommand(cmd)}>
                    <span class="ai-command-item-icon"><os-icon name="${cmd.icon}" size="14"></os-icon></span>
                    <span class="ai-command-item-name">${cmd.name}</span>
                    <span class="ai-command-item-desc">${cmd.description}</span>
                  </div>
                `)}
              </div>
            ` : ''}

            <div class="ai-prompt-frame">
                <div class="ai-prompt-content">
                  <div class="ai-prompt-border-left"></div>
                  <div class="ai-prompt-body">
                    <div class="ai-prompt-input-row" style="position: relative;">
                      <textarea
                        id="chat-input"
                        class="ai-prompt-textarea"
                        placeholder=""
                        .disabled=${!this.providerConnected}
                        .value=${this.inputText}
                        @input=${this.handleInput}
                        @keydown=${this.handleKeyDown}
                        @click=${this.updateCustomCaret}
                        @keyup=${this.updateCustomCaret}
                        @focus=${this.updateCustomCaret}
                        autocomplete="off"
                      ></textarea>
                      <div id="custom-caret" class="ai-custom-caret"></div>
                      <div class="ai-prompt-actions">
                        ${this.isThinking ? html`
                          <button class="ai-prompt-icon-btn" title="Stop generation" @click=${this.abortRequest} style="color: var(--ai-error);">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                              <rect x="6" y="6" width="12" height="12" rx="2"/>
                            </svg>
                          </button>
                        ` : ''}
                      </div>
                    </div>
    
                    <div class="ai-prompt-stats-bar">
                      <div class="ai-prompt-border-left"></div>
                      <div class="ai-prompt-model">
                        <span class="ai-prompt-model-dot" style="background: ${this.providerLoading ? 'var(--ai-warning)' : this.providerConnected ? 'var(--ai-success)' : 'var(--ai-error)'}; ${this.providerLoading ? 'animation: pulse 1.5s infinite;' : ''}"></span>
                        <select class="ai-model-bare" .value=${this.currentProvider}
                                .disabled=${this.providerLoading}
                                @change=${(e: Event) => this.switchProvider((e.target as HTMLSelectElement).value)}>
                          ${this.providers.map(p => html`<option value="${p.id}">${p.name}</option>`)}
                        </select>
                      </div>
                      <div class="ai-prompt-model">
                        <select class="ai-model-bare" .value=${this.selectedModel}
                                @change=${(e: Event) => this.selectModel((e.target as HTMLSelectElement).value)}>
                          ${this.models.length === 0
                            ? html`<option value="">No models</option>`
                            : this.models.map(m => html`<option value="${m.id}">${m.name}</option>`)
                          }
                        </select>
                      </div>
                      <div class="ai-prompt-stats">
                        <span class="ai-prompt-stat">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                          </svg>
                          ${this.formatTokenCount(this.sessionStats.tokens.input)} in
                        </span>
                        <span class="ai-prompt-stat">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                          </svg>
                          ${this.formatTokenCount(this.sessionStats.tokens.output)} out
                        </span>
                        ${this.sessionStats.cost > 0 ? html`
                          <span class="ai-prompt-stat cost">
                            $${this.sessionStats.cost.toFixed(4)}
                          </span>
                        ` : ''}
                      </div>
                    </div>
                  </div>
                </div>
    
                <div class="ai-prompt-hints">
                  <span class="ai-prompt-hint"><kbd>/</kbd> commands</span>
                  <span class="ai-prompt-hint"><kbd>⌘</kbd><kbd>↵</kbd> send</span>
                  <span class="ai-prompt-hint"><kbd>esc</kbd> interrupt</span>
                  <span class="ai-prompt-hint"><kbd>drop</kbd> files</span>
                </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
