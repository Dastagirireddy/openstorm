import { css } from 'lit';

export const aiPanelStyles = css`
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
      color: var(--ai-text);
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
    /* Inline code */
    .ai-markdown-content code,
    .ai-inline-code {
      background: var(--ai-code-background);
      padding: 0.15em 0.4em;
      border-radius: 4px;
      font-size: 0.9em;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
      border: 1px solid var(--ai-code-border);
      color: #e06c75;
    }
    /* Syntax highlighting colors - Vibrant VS Code Dark+ style */
    .ai-hl-keyword {
      color: #c586c0;
      font-weight: 500;
    }
    .ai-hl-string {
      color: #ce9178;
    }
    .ai-hl-number {
      color: #b5cea8;
    }
    .ai-hl-function {
      color: #dcdcaa;
    }
    .ai-hl-file {
      color: #9cdcfe;
      text-decoration: underline;
      text-decoration-style: dotted;
      text-underline-offset: 2px;
    }
    .ai-hl-type {
      color: #4ec9b0;
    }
    .ai-hl-variable {
      color: #9cdcfe;
    }
    .ai-hl-comment {
      color: #6a9955;
      font-style: italic;
    }
    /* Lists - OpenStorm style */
    .ai-markdown-content ul,
    .ai-markdown-content ol {
      margin: 0.75em 0;
      padding-left: 0;
      list-style: none;
    }
    .ai-markdown-content ul li,
    .ai-markdown-content ol li {
      margin: 0.4em 0;
      padding-left: 1.5em;
      position: relative;
    }
    .ai-markdown-content ul li::before {
      content: '•';
      color: #58a6ff;
      font-weight: bold;
      position: absolute;
      left: 0;
      font-size: 1.2em;
    }
    .ai-markdown-content ol li {
      counter-increment: list-counter;
    }
    .ai-markdown-content ol li::before {
      content: counter(list-counter) '.';
      color: #58a6ff;
      font-weight: 600;
      position: absolute;
      left: 0;
      min-width: 1.2em;
    }
    .ai-markdown-content ol {
      counter-reset: list-counter;
    }
    /* Nested lists */
    .ai-markdown-content ul ul li::before {
      content: '◦';
      color: #7ee787;
    }
    .ai-markdown-content ul ul ul li::before {
      content: '▪';
      color: #d2a8ff;
    }
    /* Tables */
    .ai-markdown-content table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.75em 0;
      font-size: 13px;
    }
    .ai-markdown-content th,
    .ai-markdown-content td {
      border: 1px solid var(--ai-code-border);
      padding: 0.5em 0.75em;
      text-align: left;
    }
    .ai-markdown-content th {
      background: var(--ai-code-header-background);
      font-weight: 600;
      color: var(--ai-text);
    }
    .ai-markdown-content td {
      background: var(--ai-code-background);
    }
    .ai-markdown-content tr:nth-child(even) td {
      background: color-mix(in srgb, var(--ai-code-background) 95%, var(--ai-code-header-background));
    }
    /* Blockquotes */
    .ai-markdown-content blockquote {
      border-left: 3px solid var(--ai-accent);
      margin: 0.75em 0;
      padding: 0.5em 1em;
      background: color-mix(in srgb, var(--ai-accent) 5%, transparent);
      color: var(--ai-text-dim);
      border-radius: 0 4px 4px 0;
    }
    .ai-markdown-content blockquote p {
      margin: 0.25em 0;
    }
    /* Headings - Vibrant OpenStorm style */
    .ai-markdown-content h1,
    .ai-markdown-content h2,
    .ai-markdown-content h3,
    .ai-markdown-content h4,
    .ai-markdown-content h5,
    .ai-markdown-content h6 {
      margin: 1.2em 0 0.6em 0;
      font-weight: 700;
      color: #e6edf3;
      letter-spacing: -0.02em;
    }
    .ai-markdown-content h1 { 
      font-size: 1.5em; 
      color: #ff7b72;
      border-bottom: 2px solid #ff7b72;
      padding-bottom: 0.3em;
    }
    .ai-markdown-content h2 { 
      font-size: 1.3em; 
      color: #d2a8ff;
      border-bottom: 1px solid #d2a8ff40;
      padding-bottom: 0.2em;
    }
    .ai-markdown-content h3 { 
      font-size: 1.15em; 
      color: #7ee787;
    }
    .ai-markdown-content h4 { 
      font-size: 1.05em; 
      color: #79c0ff;
    }
    /* Horizontal rules */
    .ai-markdown-content hr {
      border: none;
      border-top: 1px solid var(--ai-code-border);
      margin: 1em 0;
    }
    /* Links */
    .ai-markdown-content a {
      color: var(--ai-accent);
      text-decoration: none;
    }
    .ai-markdown-content a:hover {
      text-decoration: underline;
    }
    /* Strong/Emphasis */
    .ai-markdown-content strong {
      font-weight: 600;
      color: var(--ai-text);
    }
    .ai-markdown-content em {
      font-style: italic;
      color: var(--ai-text-dim);
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

    .ai-markdown-content blockquote {
      border-left: 3px solid var(--ai-panel-border);
      margin: 0.5em 0;
      padding: 0.5em 0.75em;
      color: var(--ai-text-muted);
      background: var(--ai-panel-background);
    }
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

    /* Diff preview for write/edit tools */
    .ai-diff-preview {
      margin: 0.25em 0 0.5em 1.5em;
      border-radius: 4px;
      overflow: hidden;
      font-size: 0.85em;
    }
    .ai-diff-preview code-block {
      display: block;
    }
    .ai-diff-removed {
      background: var(--ai-error-bg, rgba(248, 81, 73, 0.1));
      border-left: 3px solid var(--ai-error, #f85149);
      padding: 0.25em 0.5em;
    }
    .ai-diff-removed code-block {
      --code-bg: transparent;
    }
    .ai-diff-added {
      background: var(--ai-success-bg, rgba(63, 185, 80, 0.1));
      border-left: 3px solid var(--ai-success, #3fb950);
      padding: 0.25em 0.5em;
    }
    .ai-diff-added code-block {
      --code-bg: transparent;
    }
    .ai-diff-label {
      font-size: 0.85em;
      color: var(--ai-text-dim);
      margin-bottom: 0.25em;
      font-style: italic;
    }

    /* Tool approval */
    .ai-tool-approval {
      margin: 0.5em 0 0.75em 1.5em;
      border: 1px solid var(--ai-warning, #d29922);
      border-radius: 6px;
      overflow: hidden;
    }
    .ai-tool-approval-header {
      display: flex;
      align-items: center;
      gap: 0.5em;
      padding: 0.5em 0.75em;
      background: rgba(210, 153, 34, 0.1);
      border-bottom: 1px solid var(--ai-warning, #d29922);
    }
    .ai-tool-approval-header .ai-tool-icon {
      width: 14px;
      height: 14px;
    }
    .ai-tool-approval-header .ai-tool-name {
      font-weight: 500;
      color: var(--ai-text);
    }
    .ai-tool-approval-header .ai-tool-status {
      margin-left: auto;
      font-size: 11px;
      color: var(--ai-warning, #d29922);
    }
    .ai-tool-approval-preview {
      max-height: 300px;
      overflow-y: auto;
      background: var(--ai-code-background, #0d1117);
    }
    .ai-tool-approval-preview pre {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--ai-text);
      white-space: pre-wrap;
      word-break: break-word;
      padding: 0.75em;
    }

    /* Diff viewer */
    .diff-viewer {
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
      font-size: 12px;
      background: var(--ai-code-bg, #0d1117);
      border: 1px solid var(--ai-code-border, #30363d);
      border-radius: 6px;
      overflow: hidden;
    }
    .diff-header {
      display: flex;
      align-items: center;
      gap: 0.5em;
      padding: 0.5em 0.75em;
      background: var(--ai-code-header-bg, #161b22);
      border-bottom: 1px solid var(--ai-code-border, #30363d);
      color: var(--ai-text);
    }
    .diff-header svg {
      color: var(--ai-text-dim);
    }
    .diff-stats {
      margin-left: auto;
      color: var(--ai-text-dim);
      font-size: 11px;
    }
    .diff-content {
      line-height: 1.5;
      background: var(--ai-code-bg, #0d1117);
    }
    .diff-line {
      display: flex;
      align-items: stretch;
      min-height: 22px;
    }
    .diff-line.context {
      background: var(--ai-code-bg, #0d1117);
    }
    .diff-line.removed {
      background: #3d1f1f;
    }
    .diff-line.added {
      background: #1a3a2a;
    }
    .line-num {
      width: 50px;
      padding: 0 8px;
      text-align: right;
      color: var(--ai-text-dim, #6e7681);
      user-select: none;
      border-right: 1px solid var(--ai-code-border, #30363d);
      flex-shrink: 0;
      font-size: 11px;
      line-height: 22px;
    }
    .line-num.old {
      background: rgba(248, 81, 73, 0.15);
    }
    .line-num.new {
      background: rgba(63, 185, 80, 0.15);
    }
    .line-prefix {
      width: 20px;
      text-align: center;
      font-weight: bold;
      flex-shrink: 0;
      line-height: 22px;
    }
    .diff-line.removed .line-prefix {
      color: #f85149;
    }
    .diff-line.added .line-prefix {
      color: #3fb950;
    }
    .line-code {
      flex: 1;
      padding: 0 8px;
      white-space: pre;
      overflow-x: auto;
      line-height: 22px;
      color: #c9d1d9;
    }

    /* Syntax highlighting tokens */
    .line-code .keyword { color: #ff7b72; }
    .line-code .string { color: #a5d6ff; }
    .line-code .comment { color: #8b949e; font-style: italic; }
    .line-code .function { color: #d2a8ff; }
    .line-code .type { color: #79c0ff; }
    .line-code .number { color: #79c0ff; }
    .line-code .macro { color: #d2a8ff; }
    .line-code .punctuation { color: #c9d1d9; }
    .line-code .operator { color: #ff7b72; }

    /* Command preview */
    .diff-command {
      font-family: 'SF Mono', monospace;
    }
    .diff-command-header {
      display: flex;
      align-items: center;
      gap: 0.5em;
      padding: 0.5em 0.75em;
      background: var(--ai-code-header-bg, #161b22);
      border-bottom: 1px solid var(--ai-code-border, #30363d);
      color: var(--ai-warning);
    }
    .diff-command-content {
      padding: 0.75em;
      background: rgba(210, 153, 34, 0.1);
    }
    .diff-command-content code {
      color: var(--ai-text);
      font-size: 13px;
    }
    .diff-plain {
      margin: 0;
      padding: 0.75em;
      font-size: 12px;
      line-height: 1.5;
      color: var(--ai-text);
      white-space: pre-wrap;
    }
    .ai-tool-approval-actions {
      display: flex;
      gap: 0.5em;
      padding: 0.5em 0.75em;
      background: rgba(210, 153, 34, 0.05);
    }
    .ai-tool-approval-btn {
      padding: 0.4em 1em;
      border: 1px solid;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .ai-tool-approval-btn.deny {
      background: transparent;
      border-color: var(--ai-text-dim, #6e7681);
      color: var(--ai-text-dim, #6e7681);
    }
    .ai-tool-approval-btn.deny:hover {
      background: rgba(110, 118, 129, 0.1);
      border-color: var(--ai-text);
      color: var(--ai-text);
    }
    .ai-tool-approval-btn.approve {
      background: #58a6ff;
      border-color: #58a6ff;
      color: #fff;
    }
    .ai-tool-approval-btn.approve:hover {
      background: #79b8ff;
      border-color: #79b8ff;
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

    /* Input area - OpenStorm TUI style */
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

    /* OpenStorm-style prompt frame */
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

    /* Attachments bar - ABOVE input */
    .ai-prompt-attachments-bar {
      display: flex;
      align-items: center;
      gap: 0.5em;
      padding: 0.4em 0.6em;
      border-bottom: 1px solid var(--ai-panel-border);
      background: color-mix(in srgb, var(--ai-primary) 5%, transparent);
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
      padding: 0.25em 0.5em;
      background: var(--ai-tool-background);
      border: 1px solid var(--ai-primary);
      border-radius: 4px;
      font-size: 11px;
      color: var(--ai-text);
      max-width: 200px;
    }
    .ai-attachment-chip-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--ai-primary);
      font-weight: 500;
    }
    .ai-attachment-chip-meta {
      color: var(--ai-text-dim);
      font-size: 10px;
      margin-left: 0.2em;
    }
    .ai-attachment-chip button {
      background: none;
      border: none;
      color: var(--ai-text-dim);
      cursor: pointer;
      padding: 0;
      font-size: 12px;
      line-height: 1;
      margin-left: 0.2em;
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
       OpenStorm-style MESSAGE SYSTEM
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
    .ai-msg-user-content {
      white-space: pre-wrap;
    }
    .ai-msg-user-content .file-mention {
      color: var(--ai-primary);
      font-weight: 500;
      background: color-mix(in srgb, var(--ai-primary) 10%, transparent);
      padding: 0.1em 0.3em;
      border-radius: 3px;
    }

    /* L1: Thinking - clean text */
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

    /* Floating thinking indicator - subtle */
    .ai-floating-thinking {
      display: flex;
      align-items: center;
      gap: 0.5em;
      padding: 0.3em 0.6em;
      margin-bottom: 0.5em;
      color: var(--ai-thinking-color);
      font-size: 12px;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
    }
    .ai-msg-thinking.completed {
      color: var(--ai-text-muted);
      font-style: italic;
    }
    .ai-msg-thinking.tool-use-line {
      color: var(--ai-accent);
      font-style: normal;
    }
    .thinking-spinner {
      display: inline-block;
      width: 1em;
      text-align: center;
    }
    .thinking-spinner::after {
      content: '⠋';
      animation: spinner-cycle 0.8s infinite;
    }
    @keyframes spinner-cycle {
      0% { content: '⠋'; }
      12.5% { content: '⠙'; }
      25% { content: '⠹'; }
      37.5% { content: '⠸'; }
      50% { content: '⠴'; }
      62.5% { content: '⠦'; }
      75% { content: '⠧'; }
      87.5% { content: '⠇'; }
      100% { content: '⠏'; }
    }

    /* Streaming indicator - blinking cursor */
    .ai-msg-streaming {
      display: flex;
      align-items: center;
      padding: 0.4em 0 0.4em 1.5em;
      margin: 0.5em 0;
    }
    .ai-streaming-cursor {
      display: inline-block;
      width: 8px;
      height: 16px;
      background-color: var(--ai-text-color, #ccc);
      animation: cursor-blink 0.8s infinite;
      border-radius: 1px;
    }
    @keyframes cursor-blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }

    /* Streaming indicator - segmented loader filling left to right */
    .ai-streaming-indicator {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 4px 0;
    }
    .ai-loader-segment {
      width: 8px;
      height: 8px;
      background: var(--ai-border, #333);
      border-radius: 1px;
      animation: segment-fill 1.6s ease-in-out infinite;
    }
    .ai-loader-segment:nth-child(1) { animation-delay: 0s; }
    .ai-loader-segment:nth-child(2) { animation-delay: 0.15s; }
    .ai-loader-segment:nth-child(3) { animation-delay: 0.3s; }
    .ai-loader-segment:nth-child(4) { animation-delay: 0.45s; }
    .ai-loader-segment:nth-child(5) { animation-delay: 0.6s; }
    @keyframes segment-fill {
      0%, 100% { 
        background: var(--ai-border, #333);
        opacity: 0.4;
      }
      25% { 
        background: var(--ai-accent, #58a6ff);
        opacity: 1;
      }
      50% { 
        background: var(--ai-accent, #58a6ff);
        opacity: 0.6;
      }
    }
    .ai-prompt-hints-spacer {
      flex: 1;
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
`;
