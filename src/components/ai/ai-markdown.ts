import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

md.renderer.rules.code_inline = (tokens, idx) => {
  const content = tokens[idx].content;
  const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<code class="ai-inline-code">${escaped}</code>`;
};

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const lang = token.info ? token.info.trim().split(/\s+/)[0] : '';
  const code = token.content;
  
  const escapedCode = code.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  return `<code-block language="${lang}" code="${escapedCode}"></code-block>`;
};

export function highlightKeywords(text: string): string {
  const keywords = /\b(fn|let|mut|const|pub|use|mod|struct|impl|trait|enum|if|else|match|return|while|for|loop|break|continue|async|await|self|super|crate|where|move|ref|type|static|extern|unsafe|true|false|undefined|null|function|import|export|from|class|new|this|yield|typeof|instanceof|in|of|func|go|defer|select|chan|map|string|int|bool|error|nil|package|var|println|Println|Print|fmt)\b/g;
  const strings = /(&quot;[^&]*&quot;|&#39;[^&]*&#39;|`[^`]*`)/g;
  const numbers = /\b(\d+\.?\d*)\b/g;
  const filePaths = /\b([a-zA-Z0-9_\-\.\/]+\.(rs|ts|js|tsx|jsx|py|go|java|cpp|c|h|json|toml|yaml|yml|md|txt))\b/g;
  const functions = /\b([a-z_][a-z_0-9]*)\s*\(/g;
  const types = /\b([A-Z][a-zA-Z0-9_]*)\b/g;
  const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
  
  let result = text;
  result = result.replace(comments, '<span class="ai-hl-comment">$1</span>');
  result = result.replace(strings, '<span class="ai-hl-string">$1</span>');
  result = result.replace(keywords, '<span class="ai-hl-keyword">$1</span>');
  result = result.replace(filePaths, '<span class="ai-hl-file">$1</span>');
  result = result.replace(types, '<span class="ai-hl-type">$1</span>');
  result = result.replace(functions, '<span class="ai-hl-function">$1</span>(');
  result = result.replace(numbers, '<span class="ai-hl-number">$1</span>');
  
  return result;
}

export function highlightRenderedHtml(html: string): string {
  const parts = html.split(/(<[^>]+>)/);
  
  return parts.map((part, i) => {
    if (i % 2 === 0) {
      return highlightKeywords(part);
    }
    return part;
  }).join('');
}

export function preprocessTodos(text: string): string {
  return text
    .replace(/\[✓\]/g, '<span class="ai-todo-checkbox completed">✓</span>')
    .replace(/\[•\]/g, '<span class="ai-todo-checkbox in-progress">•</span>')
    .replace(/\[ \]/g, '<span class="ai-todo-checkbox pending">○</span>');
}

export function renderMarkdown(content: string): string {
  const preprocessed = preprocessTodos(content);
  const renderedHtml = md.render(preprocessed);
  return highlightRenderedHtml(renderedHtml);
}

export function highlightDiffCode(code: string, lang?: string): string {
  if (!lang || lang === 'text') return code;
  let h = code;
  if (lang === 'rust' || lang === 'javascript' || lang === 'typescript') {
    h = h.replace(/\b(fn|let|mut|const|pub|use|mod|struct|impl|trait|enum|if|else|match|return|while|for|loop|break|continue|async|await|self|super|crate|where|move|ref|type|static|extern|unsafe|true|false|undefined|null|function|import|export|from|class|new|this|yield|typeof|instanceof|in|of)\b/g, '<span class="keyword">$1</span>');
    h = h.replace(/(&quot;[^&]*&quot;|&#39;[^&]*&#39;)/g, '<span class="string">$1</span>');
    h = h.replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>');
    h = h.replace(/\b(\d+\.?\d*)\b/g, '<span class="number">$1</span>');
    h = h.replace(/\b([a-z_][a-z_0-9]*!)\b/g, '<span class="macro">$1</span>');
  }
  return h;
}

export { md };
