# LSP Hover Tooltip Improvements

## Target: IntelliJ IDEA-Style Hover Tooltip

### Visual Reference

The target design (IntelliJ IDEA) features:
- **Header bar**: Orange/amber background with "DEFINITION" label and module path (`std::macros`)
- **Signature line**: Syntax-highlighted code (`` `macro_rules! println` ``) with gray comment (`// matched arm #1`)
- **Description**: Clean markdown text with inline code pills and links
- **Admonition boxes**: Yellow/amber "PERFORMANCE NOTE" boxes with warning icon, title, and code examples
- **Footer**: Subtle links to related documentation

---

## Current Implementation Analysis

### Backend (Rust)

**File**: `src-tauri/src/lsp/commands.rs`

```rust
/// Tauri command: Get hover information at position
#[tauri::command]
pub fn get_hover(
    language_id: String,
    uri: String,
    content: String,
    line: u32,
    column: u32,
) -> Result<Option<HoverInfo>, String>
```

**Current flow**:
1. Calls LSP client's `get_hover()` method
2. Extracts markdown content from LSP response
3. Converts markdown to HTML via `markdown_to_html()` in `src-tauri/src/lsp/markdown.rs`
4. Returns `HoverInfo { contents, html, range }`

**Backend HTML generation** (`markdown.rs`):
- Uses `pulldown-cmark` for markdown parsing
- Uses `syntect` for syntax highlighting code blocks
- Generates HTML with classes like:
  - `<pre class="code-block">` - Code blocks
  - `<code class="code-pill">` - Inline code
  - `<em>`, `<strong>` - Emphasis
  - `<a>` - Links
  - `<ul>`, `<li>` - Lists
  - `<blockquote>` - Blockquotes
  - `<h1>`-`<h6>` - Headers

**Missing from backend**:
- No "DEFINITION" header extraction
- No admonition/note box detection
- No structured signature/description separation
- No footer with type badges/links

---

### Frontend (TypeScript)

**File**: `src/lib/lsp-client.ts`

```typescript
export interface HoverInfo {
  contents: string;      // Raw markdown
  html: string;          // Pre-rendered HTML
  range?: { ... };
}
```

**File**: `src/lib/editor/editor-lsp.ts`

```typescript
export function showLspHoverTooltip(view: EditorView, pos: number, filePath: string): void
```

**Current flow**:
1. Calls `getHover()` from lsp-client
2. Dispatches `lsp-hover` event with `{ html, contents, position }`
3. Event consumed by `<hover-tooltip>` component

**File**: `src/components/hover-tooltip.ts`

```typescript
@customElement('hover-tooltip')
export class HoverTooltip extends TailwindElement()
```

**Current rendering**:
- Applies additional syntax highlighting via `highlightCodeInHtml()` regex
- Renders in a simple box with:
  - Max 450px width, 280px height
  - Basic border and shadow
  - CSS variable-based colors

**Current CSS classes supported**:
- `.code-block` - Code blocks
- `.code-pill` - Inline code
- `.hl-kw`, `.hl-type`, `.hl-str`, etc. - Syntax highlighting
- `.hover-signature` - Signature area
- `.hover-body` - Main content
- `.hover-footer` - Footer with badges/links

---

## Gap Analysis: Current vs Target

| Feature | Current | Target (IntelliJ) |
|---------|---------|-------------------|
| **Header bar** | None | Colored bar with category + module path |
| **Signature** | Inline with text | Dedicated code block with high contrast |
| **Description** | Plain markdown | Structured markdown with proper spacing |
| **Admonitions** | Plain blockquote | Colored boxes with icons and titles |
| **Footer** | Optional links | Structured badges (type, tags) + docs link |
| **Code blocks** | Basic highlighting | Full syntax highlighting with line numbers option |
| **Links** | Standard `<a>` tags | Styled with arrow icon, external indicator |

---

## Implementation Plan

### Phase 1: Backend Enhancements

#### 1.1 Parse Hover Response Structure

**File**: `src-tauri/src/lsp/commands.rs`

Add structured hover response:

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct HoverInfo {
    pub category: Option<String>,     // "Definition", "Documentation", etc.
    pub module_path: Option<String>,  // e.g., "std::macros"
    pub signature: Option<String>,    // Code signature
    pub description: String,          // Main markdown content
    pub admonitions: Vec<Admonition>, // Note/warning/performance boxes
    pub footer: Option<HoverFooter>,  // Type info, tags, links
    pub html: String,                 // Pre-rendered HTML (legacy fallback)
    pub range: Option<RangeInfo>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Admonition {
    pub kind: String,          // "note", "warning", "performance", "deprecated"
    pub title: String,
    pub content: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct HoverFooter {
    pub type_info: Option<String>,
    pub tags: Vec<String>,
    pub docs_link: Option<DocsLink>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DocsLink {
    pub text: String,
    pub url: String,
}
```

#### 1.2 Extract Definition Header

Parse first line of markdown to detect:
- Category (Definition, Documentation, etc.)
- Module path (e.g., `std::macros` from `println!`)

```rust
fn parse_hover_header(markdown: &str) -> (Option<String>, Option<String>) {
    // Detect patterns like:
    // "macro_rules! println" -> category: "Definition", module: "std::macros"
    // "pub fn println()" -> category: "Definition", module: "std::io"
}
```

#### 1.3 Detect Admonitions

Parse markdown for note/warning patterns:

```rust
fn extract_admonitions(markdown: &str) -> Vec<Admonition> {
    // Detect patterns:
    // > **Note:** ...
    // > **Warning:** ...
    // > **Performance Note:** ...
    // > \[!WARNING\] ...
}
```

#### 1.4 Enhanced HTML Generation

Update `markdown_to_html()` to:
- Wrap code blocks in proper structure
- Add admonition CSS classes
- Generate footer HTML when metadata exists

---

### Phase 2: Frontend Enhancements

#### 2.1 Update HoverInfo Interface

**File**: `src/lib/lsp-client.ts`

```typescript
export interface HoverInfo {
  category?: string;       // "Definition", "Documentation"
  modulePath?: string;     // "std::macros"
  signature?: string;      // Code signature
  description: string;     // Main content
  admonitions?: Admonition[];
  footer?: {
    typeInfo?: string;
    tags?: string[];
    docsLink?: { text: string; url: string };
  };
  html: string;            // Legacy fallback
  range?: { ... };
}

export interface Admonition {
  kind: "note" | "warning" | "performance" | "deprecated";
  title: string;
  content: string;
}
```

#### 2.2 Update Hover Tooltip Component

**File**: `src/components/hover-tooltip.ts`

Add structured rendering:

```typescript
render() {
  return html`
    <div class="hover-tooltip">
      ${this.category ? html`
        <div class="hover-header ${this.category.toLowerCase()}">
          <span class="hover-category">${this.category}</span>
          ${this.modulePath ? html`<span class="hover-module">${this.modulePath}</span>` : ''}
        </div>
      ` : ''}
      
      ${this.signature ? html`
        <div class="hover-signature"><code>${unsafeHTML(this.signature)}</code></div>
      ` : ''}
      
      <div class="hover-body">
        ${unsafeHTML(this.description)}
      </div>
      
      ${this.admonitions?.map(admonition => html`
        <div class="hover-admonition ${admonition.kind}">
          <div class="admonition-title">
            <os-icon name="${getAdmonitionIcon(admonition.kind)}"></os-icon>
            <span>${admonition.title}</span>
          </div>
          <div class="admonition-content">${unsafeHTML(admonition.content)}</div>
        </div>
      `)}
      
      ${this.footer ? html`
        <div class="hover-footer">
          ${this.footer.typeInfo ? html`<span class="type-badge">${this.footer.typeInfo}</span>` : ''}
          ${this.footer.tags?.map(tag => html`<span class="tag-badge">${tag}</span>`)}
          ${this.footer.docsLink ? html`
            <a href="${this.footer.docsLink.url}" class="docs-link" target="_blank">
              ${this.footer.docsLink.text} <os-icon name="external-link"></os-icon>
            </a>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `;
}
```

#### 2.3 Add CSS for New Elements

**File**: `src/components/hover-tooltip.ts` (styles)

```css
.hover-tooltip {
  /* Container stays similar */
}

/* Header Bar */
.hover-header {
  padding: 8px 12px;
  border-radius: 6px 6px 0 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
}

.hover-header.definition {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #1a1a1a;
}

.hover-header.documentation {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #ffffff;
}

.hover-category {
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.hover-module {
  font-weight: 400;
  opacity: 0.8;
  font-family: 'Fira Code', monospace;
}

/* Signature */
.hover-signature {
  background: var(--app-toolbar-hover);
  border-bottom: 1px solid var(--app-input-border);
  padding: 10px 12px;
  border-radius: 6px 6px 0 0;
}

.hover-signature code {
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
}

/* Admonitions */
.hover-admonition {
  margin: 12px 0;
  border-radius: 6px;
  border-left: 4px solid;
  overflow: hidden;
}

.hover-admonition.note {
  background: rgba(59, 130, 246, 0.1);
  border-left-color: #3b82f6;
}

.hover-admonition.warning {
  background: rgba(245, 158, 11, 0.1);
  border-left-color: #f59e0b;
}

.hover-admonition.performance {
  background: rgba(245, 158, 11, 0.15);
  border-left-color: #d97706;
}

.hover-admonition.deprecated {
  background: rgba(239, 68, 68, 0.1);
  border-left-color: #ef4444;
}

.admonition-title {
  padding: 8px 12px;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: 6px;
}

.admonition-content {
  padding: 8px 12px 12px;
  font-size: 12px;
  line-height: 1.6;
}

/* Footer */
.hover-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--app-input-border);
  background: var(--app-toolbar-hover);
  border-radius: 0 0 6px 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.type-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--app-button-background);
  color: #fff;
  font-weight: 500;
}

.tag-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--app-selection-background);
  color: var(--app-foreground);
  font-weight: 500;
}

.docs-link {
  font-size: 11px;
  color: var(--app-button-background);
  text-decoration: none;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

.docs-link:hover {
  text-decoration: underline;
}
```

---

### Phase 3: Integration

#### 3.1 Update Backend Markdown Parser

**File**: `src-tauri/src/lsp/markdown.rs`

Add admonition detection and structured output.

#### 3.2 Update Frontend Event Handler

**File**: `src/lib/editor/editor-lsp.ts`

Update `showLspHoverTooltip` to pass structured data.

#### 3.3 Fallback Handling

Ensure legacy `html` field still works for LSP servers that don't provide structured data.

---

## Key Technical Decisions

1. **Backend-first approach**: Parse and structure data on backend where LSP response is fresh
2. **Progressive enhancement**: Legacy `html` field remains for backward compatibility
3. **CSS variables**: All colors use theme variables for dark/light mode support
4. **Icon system**: Use existing `<os-icon>` component for admonition icons
5. **Admonition types**: Start with `note`, `warning`, `performance`, `deprecated`

---

## Files to Modify

| File | Changes |
|------|---------|
| `src-tauri/src/lsp/commands.rs` | Add `Admonition`, `HoverFooter` structs; update `HoverInfo` |
| `src-tauri/src/lsp/markdown.rs` | Add admonition parsing; structured HTML generation |
| `src/lib/lsp-client.ts` | Update `HoverInfo` interface |
| `src/lib/editor/editor-lsp.ts` | Update event dispatch to pass structured data |
| `src/components/hover-tooltip.ts` | Add structured rendering; new CSS styles |

---

## Testing Strategy

1. **Unit tests** (backend):
   - Test admonition extraction
   - Test header parsing
   - Test HTML generation

2. **Integration tests**:
   - Test with rust-analyzer hover responses
   - Test with other LSP servers (gopls, pyright)

3. **Visual testing**:
   - Compare against IntelliJ screenshots
   - Test dark/light themes
   - Test various content types (functions, macros, types)

---

## Future Enhancements

- **Signature help integration**: Show parameter hints inline
- **Quick fix actions**: Show available code actions in footer
- **Copy to clipboard**: Add copy button for signatures
- **Expand on hover**: Allow expanding truncated content
- **Multiple signature overloads**: Show all overloads with navigation
