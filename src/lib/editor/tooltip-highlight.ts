/**
 * Tooltip Highlight - Syntax highlighting for tooltips
 *
 * Uses MutationObserver to watch for new tooltip elements in the DOM
 * and applies regex-based syntax highlighting to code blocks inside them.
 * Inspired by Ulka Editor's TooltipHighlightPlugin.
 */

import { ViewPlugin, PluginValue, EditorView } from '@codemirror/view';

const PROCESSED = new WeakSet<HTMLElement>();

/**
 * Apply regex-based syntax highlighting to a code element's text content.
 * Matches editor theme CSS variable colors.
 */
function highlightCodeBlock(codeEl: HTMLElement): void {
  if (PROCESSED.has(codeEl)) return;

  const text = codeEl.textContent || '';
  if (!text.trim()) return;

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Comments (must be first to avoid inner matches)
  html = html.replace(/(\/\/.*$)/gm, '<span class="hl-comment">$1</span>');
  html = html.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>');

  // Strings
  html = html.replace(/(&#39;)(.*?)\1/g, '<span class="hl-str">$1$2$1</span>');
  html = html.replace(/(["`])(.*?)\1/g, '<span class="hl-str">$1$2$1</span>');

  // Keywords
  html = html.replace(
    /\b(const|let|var|function|async|await|return|if|else|for|while|class|interface|type|enum|import|export|from|extends|implements|new|this|typeof|instanceof|in|of|void|null|undefined|true|false|try|catch|throw|switch|case|break|continue|default|yield|static|public|private|protected|readonly|abstract|declare|module|namespace|require|keyof|infer|fn|impl|struct|trait|use|mod|pub|crate|self|Self|mut|ref|dyn|where|as|box|loop|unsafe|macro_rules)\b/g,
    '<span class="hl-kw">$1</span>'
  );

  // Types (PascalCase)
  html = html.replace(/\b([A-Z][a-zA-Z0-9_]*)\b/g, '<span class="hl-type">$1</span>');

  // Built-in types
  html = html.replace(
    /\b(string|number|boolean|any|never|unknown|Object|Array|Promise|Map|Set|Vec|HashMap|Option|Result|i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64|bool|str)\b/g,
    '<span class="hl-type">$1</span>'
  );

  // Numbers
  html = html.replace(
    /\b(\d+\.?\d*(?:f32|f64|i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize)?)\b/g,
    '<span class="hl-num">$1</span>'
  );

  // Function calls
  html = html.replace(/([a-zA-Z_][a-zA-Z0-9_]*)\(/g, '<span class="hl-fn">$1</span>(');

  // Properties after dot
  html = html.replace(/\.([a-zA-Z_][a-zA-Z0-9_]*)/g, '.<span class="hl-prop">$1</span>');

  codeEl.innerHTML = html;
  codeEl.setAttribute('data-tooltip-highlighted', 'true');
  PROCESSED.add(codeEl);
}

/**
 * Find and highlight code blocks inside a tooltip element.
 */
function highlightTooltip(tooltip: HTMLElement): void {
  if (PROCESSED.has(tooltip)) return;

  // Find all <pre><code> blocks
  tooltip.querySelectorAll('pre code').forEach((codeEl) => {
    highlightCodeBlock(codeEl as HTMLElement);
  });

  PROCESSED.add(tooltip);
}

class TooltipHighlightPlugin implements PluginValue {
  private observer: MutationObserver;

  constructor(view: EditorView) {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLElement) {
            this.processNode(node);
          }
        }
      }
    });

    // Observe the editor's parent for tooltip additions
    this.observer.observe(view.dom.parentElement || view.dom, {
      childList: true,
      subtree: true,
    });

    // Process any existing tooltips
    this.processExisting(view.dom);
  }

  private processNode(node: HTMLElement): void {
    // Check if this node is a tooltip
    if (
      node.classList?.contains('cm-tooltip') ||
      node.classList?.contains('hover-tooltip') ||
      node.classList?.contains('hover-tooltip-content')
    ) {
      highlightTooltip(node);
    }

    // Also check children
    const tooltips = node.querySelectorAll?.(
      '.cm-tooltip, .hover-tooltip, .hover-tooltip-content'
    );
    tooltips?.forEach((el) => highlightTooltip(el as HTMLElement));
  }

  private processExisting(container: HTMLElement): void {
    const tooltips = container.querySelectorAll(
      '.cm-tooltip, .hover-tooltip, .hover-tooltip-content'
    );
    tooltips.forEach((el) => highlightTooltip(el as HTMLElement));
  }

  destroy(): void {
    this.observer.disconnect();
  }
}

/**
 * Tooltip highlighting extension.
 *
 * Watches for CodeMirror and LSP hover tooltips and applies
 * regex-based syntax highlighting to code blocks inside them.
 */
export function tooltipHighlight() {
  return ViewPlugin.fromClass(TooltipHighlightPlugin);
}
