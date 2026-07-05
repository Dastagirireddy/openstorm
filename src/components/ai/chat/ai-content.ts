import { html, css, LitElement, TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { marked, Tokens } from 'marked';
import '../primitives/os-code-block.js';
import '../primitives/os-button.js';
import '../../layout/mermaid-block.js';

const renderer = new marked.Renderer();

renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  return `CODE_BLOCK:${lang || ''}:${text}CODE_BLOCK_END`;
};

renderer.codespan = ({ text }: { text: string }) => `<code class="inline-code">${text}</code>`;

marked.setOptions({ renderer, breaks: true, gfm: true });

@customElement('openstorm-ai-content')
export class AIContent extends LitElement {
  static styles = css`
    :host { display: block; }
    .content {
      font-size: 14px;
      line-height: 1.65;
      color: var(--ai-text, #1f2937);
      word-break: break-word;
    }
    .content p { margin: 0 0 12px 0; }
    .content p:last-child { margin-bottom: 0; }
    .content ul, .content ol { margin: 8px 0; padding-left: 24px; }
    .content li { margin: 4px 0; }
    .content h1, .content h2, .content h3, .content h4 {
      margin: 16px 0 8px 0;
      font-weight: 600;
      color: var(--ai-text, #1f2937);
    }
    .content h1 { font-size: 1.4em; }
    .content h2 { font-size: 1.2em; }
    .content h3 { font-size: 1.1em; }
    .content a {
      color: var(--ai-primary, #3574f0);
      text-decoration: none;
    }
    .content a:hover { text-decoration: underline; }
    .content blockquote {
      margin: 8px 0;
      padding: 8px 16px;
      border-left: 3px solid var(--ai-primary, #3574f0);
      background: color-mix(in srgb, var(--ai-primary, #3574f0) 5%, transparent);
      border-radius: 0 4px 4px 0;
      color: var(--ai-text-muted, #6b7280);
    }
    .content strong { font-weight: 600; }
    .content em { font-style: italic; }
    .inline-code {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.9em;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--ai-tool-header-background, #f3f4f6);
      color: var(--ai-primary, #3574f0);
      border: 1px solid var(--ai-panel-border, #e5e7eb);
    }
    .content table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 13px;
    }
    .content th, .content td {
      padding: 8px 12px;
      text-align: left;
      border: 1px solid var(--ai-panel-border, #e5e7eb);
    }
    .content th {
      background: var(--ai-tool-header-background, #f3f4f6);
      font-weight: 600;
      color: var(--ai-text, #1f2937);
    }
    .content tr:nth-child(even) {
      background: color-mix(in srgb, var(--ai-tool-background, #f9fafb) 50%, transparent);
    }
    .content tr:hover {
      background: color-mix(in srgb, var(--ai-primary, #3574f0) 5%, transparent);
    }
    .streaming::after {
      content: '';
      display: inline-block;
      width: 2px;
      height: 1em;
      background: var(--ai-primary, #3574f0);
      margin-left: 2px;
      animation: blink 1s step-end infinite;
      vertical-align: text-bottom;
    }
    @keyframes blink { 50% { opacity: 0; } }
  `;

  @property({ type: String }) content = '';
  @property({ type: Boolean }) streaming = false;
  @property({ type: Boolean }) filterPlan = false;

  private filterPlanSection(text: string): string {
    if (!this.filterPlan) return text;
    let filtered = text
      .replace(/```json\s*\{[\s\S]*?"plan"[\s\S]*?\}\s*```/g, '')
      .replace(/\{"plan":\s*\[[\s\S]*?\]\}/g, '')
      .replace(/Plan:\s*\n([\s\S]*?)(?=\n\n|\n[^1-9]|$)/g, '')
      .replace(/^\d+\.\s+.*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return filtered;
  }

  private renderMarkdown(text: string): TemplateResult {
    const placeholder = 'CODE_BLOCK:';
    const endPlaceholder = 'CODE_BLOCK_END';
    
    let processed = text;
    const codeBlocks: Array<{ lang: string; code: string }> = [];
    
    processed = processed.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const index = codeBlocks.length;
      codeBlocks.push({ lang, code: code.trim() });
      return `${placeholder}${index}${endPlaceholder}`;
    });

    let markdownHtml: string;
    try {
      markdownHtml = marked.parse(processed) as string;
    } catch {
      markdownHtml = processed.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    const parts: TemplateResult[] = [];
    const regex = new RegExp(`${placeholder}(\\d+)${endPlaceholder}`, 'g');
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(markdownHtml)) !== null) {
      if (match.index > lastIndex) {
        parts.push(html`${unsafeHTML(markdownHtml.slice(lastIndex, match.index))}`);
      }
      
      const blockIndex = parseInt(match[1], 10);
      const block = codeBlocks[blockIndex];
      if (block) {
        if (block.lang === 'mermaid') {
          parts.push(html`<ai-mermaid .code=${block.code}></ai-mermaid>`);
        } else {
          parts.push(html`<os-code-block .code=${block.code} .language=${block.lang}></os-code-block>`);
        }
      }
      
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < markdownHtml.length) {
      parts.push(html`${unsafeHTML(markdownHtml.slice(lastIndex))}`);
    }

    return html`${parts}`;
  }

  render() {
    const filtered = this.filterPlanSection(this.content);
    const rendered = this.renderMarkdown(filtered);
    return html`
      <div class="content ${this.streaming ? 'streaming' : ''}">${rendered}</div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openstorm-ai-content': AIContent;
  }
}
