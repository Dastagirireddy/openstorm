# Semantic HTML Structure for LSP Hover Tooltips

## Current vs. Semantic Structure Comparison

### Input Markdown (from rust-analyzer)

```markdown
```rust
macro_rules! println
```

Prints to the standard output, with a newline. On all platforms, the newline is the LINE FEED character.

This macro uses the same syntax as `format!`, but writes to the standard output instead.

---

[MDN Documentation](https://doc.rust-lang.org/std/macro.println.html)

**Performance Note:** The `println!` macro will lock the standard output on each call.
```

---

## Current Backend Output (Flat HTML)

```html
<pre class="code-block"><code><span style="color:#96b5b4;">macro_rules! </span><span style="color:#c0c5ce;">println</span></code></pre>

<p>Prints to the standard output, with a newline. On all platforms, the newline is the LINE FEED character.</p>

<p>This macro uses the same syntax as <code class="code-pill">format!</code>, but writes to the standard output instead.</p>

<hr/>

<p><a href="https://doc.rust-lang.org/std/macro.println.html" target="_blank" rel="noopener">MDN Documentation</a></p>

<p><strong>Performance Note:</strong> The <code class="code-pill">println!</code> macro will lock the standard output on each call.</p>
```

**Visual result**: Plain paragraphs, no visual hierarchy, "Performance Note" looks like regular text.

---

## Proposed Semantic Output (Structured HTML)

```html
<div class="hover-tooltip-content">
  
  <!-- Header: Category + Module Path -->
  <div class="hover-header" data-category="definition">
    <span class="hover-category">Definition</span>
    <span class="hover-module">std::macros</span>
  </div>

  <!-- Signature: Extracted first code block -->
  <div class="hover-signature">
    <code>
      <span class="hl-kw">macro_rules!</span>
      <span class="hl-fn">println</span>
    </code>
  </div>

  <!-- Body: Main description -->
  <div class="hover-body">
    <p>Prints to the standard output, with a newline. On all platforms, the newline is the LINE FEED character (<code class="code-pill">\n</code>).</p>
    <p>This macro uses the same syntax as <code class="code-pill">format!</code>, but writes to the standard output instead.</p>
  </div>

  <!-- Admonitions: Detected from **Note:**, **Warning:**, etc. -->
  <div class="hover-admonition admonition-performance">
    <div class="admonition-header">
      <os-icon name="warning" class="admonition-icon"></os-icon>
      <span class="admonition-title">Performance Note</span>
    </div>
    <div class="admonition-content">
      <p>The <code class="code-pill">println!</code> macro will lock the standard output on each call. If you call <code class="code-pill">println!</code> within a hot loop, this behavior may be the bottleneck.</p>
      <pre class="admonition-code"><code>io::stdout().lock();</code></pre>
    </div>
  </div>

  <!-- Footer: Type badges, tags, documentation links -->
  <div class="hover-footer">
    <span class="type-badge" data-type="macro">macro</span>
    <span class="module-badge">std</span>
    <a href="https://doc.rust-lang.org/std/macro.println.html" class="docs-link" target="_blank" rel="noopener">
      <span>Documentation</span>
      <os-icon name="external-link" class="link-icon"></os-icon>
    </a>
  </div>

</div>
```

---

## CSS for Semantic Structure

```css
/* Container */
.hover-tooltip-content {
  display: flex;
  flex-direction: column;
  min-width: 300px;
  max-width: 500px;
  max-height: 400px;
  overflow: hidden;
  border: 1px solid var(--app-input-border);
  border-radius: 8px;
  background: var(--app-bg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
}

/* Header Bar */
.hover-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.hover-header[data-category="definition"] {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #1a1a1a;
}

.hover-header[data-category="documentation"] {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #ffffff;
}

.hover-header[data-category="deprecated"] {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: #ffffff;
}

.hover-module {
  font-weight: 400;
  opacity: 0.85;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
}

/* Signature Section */
.hover-signature {
  padding: 12px;
  background: var(--app-toolbar-hover);
  border-bottom: 1px solid var(--app-input-border);
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
}

.hover-signature code {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Body */
.hover-body {
  padding: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--app-foreground);
  overflow-y: auto;
  flex: 1;
}

.hover-body p {
  margin: 0 0 12px 0;
}

.hover-body p:last-child {
  margin: 0;
}

/* Admonitions */
.hover-admonition {
  margin: 0;
  border-left: 4px solid;
}

.admonition-performance {
  background: rgba(245, 158, 11, 0.08);
  border-left-color: #f59e0b;
}

.admonition-warning {
  background: rgba(239, 68, 68, 0.08);
  border-left-color: #ef4444;
}

.admonition-note {
  background: rgba(59, 130, 246, 0.08);
  border-left-color: #3b82f6;
}

.admonition-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--app-foreground);
}

.admonition-icon {
  width: 14px;
  height: 14px;
  color: inherit;
}

.admonition-content {
  padding: 8px 12px 12px;
  font-size: 11px;
  line-height: 1.5;
}

.admonition-content p {
  margin: 0 0 8px 0;
}

.admonition-code {
  background: rgba(0, 0, 0, 0.2);
  padding: 8px 10px;
  border-radius: 4px;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  overflow-x: auto;
}

/* Footer */
.hover-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--app-toolbar-hover);
  border-top: 1px solid var(--app-input-border);
}

.type-badge,
.module-badge {
  font-size: 9px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
  text-transform: lowercase;
}

.type-badge[data-type="macro"] {
  background: #f59e0b;
  color: #1a1a1a;
}

.type-badge[data-type="function"] {
  background: #3b82f6;
  color: #ffffff;
}

.type-badge[data-type="struct"] {
  background: #22c55e;
  color: #1a1a1a;
}

.type-badge[data-type="trait"] {
  background: #a855f7;
  color: #ffffff;
}

.module-badge {
  background: var(--app-selection-background);
  color: var(--app-foreground);
}

.docs-link {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--app-button-background);
  text-decoration: none;
  font-weight: 500;
  margin-left: auto;
}

.docs-link:hover {
  text-decoration: underline;
}

.link-icon {
  width: 10px;
  height: 10px;
}
```

---

## Visual Comparison

### Current (Flat HTML)

```
┌────────────────────────────────────────┐
│ macro_rules! println                   │
│                                        │
│ Prints to the standard output...       │
│ This macro uses the same syntax as     │
│ format!, but writes to stdout...       │
│                                        │
│ ─────────────────────────────────      │
│                                        │
│ MDN Documentation                      │
│                                        │
│ Performance Note: The println! macro   │
│ will lock the standard output...       │
└────────────────────────────────────────┘
```

### With Semantic Structure

```
┌────────────────────────────────────────┐
│ DEFINITION        std::macros          │ ← Orange header bar
├────────────────────────────────────────┤
│ macro_rules! println                   │ ← Code signature on colored background
├────────────────────────────────────────┤
│ Prints to the standard output, with    │
│ a newline. On all platforms, the       │
│ newline is the LINE FEED character.    │
│                                        │
│ This macro uses the same syntax as     │
│ format!, but writes to stdout.         │
├────────────────────────────────────────┤
│ ⚠️ PERFORMANCE NOTE                    │ ← Amber admonition box
│ The println! macro will lock the       │
│ standard output on each call.          │
│                                        │
│ io::stdout().lock();                   │
├────────────────────────────────────────┤
│ [macro] [std]           Documentation↗ │ ← Footer with badges + link
└────────────────────────────────────────┘
```

---

## Backend Changes Required

### New Rust Structs (`src-tauri/src/lsp/commands.rs`)

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct HoverInfo {
    pub category: Option<String>,      // "Definition", "Documentation", "Deprecated"
    pub module_path: Option<String>,   // "std::macros", "std::io"
    pub signature: Option<String>,     // Highlighted HTML or raw code
    pub description: String,           // Main markdown content
    pub admonitions: Vec<Admonition>,  // Parsed notes/warnings
    pub footer: Option<HoverFooter>,   // Badges and links
    pub raw_markdown: String,          // For debugging/fallback
    pub range: Option<RangeInfo>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Admonition {
    pub kind: String,                  // "note", "warning", "performance", "deprecated"
    pub title: String,
    pub content: String,
    pub code_example: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct HoverFooter {
    pub symbol_kind: Option<String>,   // "macro", "function", "struct", "trait"
    pub module: Option<String>,        // "std"
    pub docs_link: Option<DocsLink>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DocsLink {
    pub text: String,
    pub url: String,
}
```

### Updated `markdown_to_html()` Function

```rust
pub fn markdown_to_html_structured(markdown: &str, context: HoverContext) -> String {
    // 1. Extract first code block as signature
    let signature = extract_signature(markdown);
    
    // 2. Detect category from context or content
    let category = context.symbol_kind.map(|k| {
        match k.as_str() {
            "Macro" => "Definition",
            "Function" => "Definition",
            _ => "Documentation"
        }.to_string()
    });
    
    // 3. Extract admonitions from markdown
    let admonitions = extract_admonitions(markdown);
    
    // 4. Remove admonitions from main content
    let description = remove_admonitions(markdown);
    
    // 5. Build structured HTML
    build_semantic_html(signature, category, description, admonitions, context)
}

fn build_semantic_html(
    signature: Option<String>,
    category: Option<String>,
    description: String,
    admonitions: Vec<Admonition>,
    context: HoverContext,
) -> String {
    let mut html = String::from("<div class=\"hover-tooltip-content\">");
    
    // Header
    if let Some(cat) = category {
        html.push_str(&format!(
            "<div class=\"hover-header\" data-category=\"{}\">",
            cat.to_lowercase()
        ));
        html.push_str(&format!("<span class=\"hover-category\">{}</span>", cat));
        if let Some(module) = context.module_path {
            html.push_str(&format!(
                "<span class=\"hover-module\">{}</span>",
                module
            ));
        }
        html.push_str("</div>");
    }
    
    // Signature
    if let Some(sig) = signature {
        html.push_str(&format!(
            "<div class=\"hover-signature\"><code>{}</code></div>",
            sig
        ));
    }
    
    // Body
    html.push_str("<div class=\"hover-body\">");
    html.push_str(&markdown_to_html_simple(&description));
    html.push_str("</div>");
    
    // Admonitions
    for admonition in &admonitions {
        html.push_str(&format!(
            "<div class=\"hover-admonition admonition-{}\">",
            admonition.kind
        ));
        html.push_str(&format!(
            "<div class=\"admonition-header\"><span class=\"admonition-title\">{}</span></div>",
            admonition.title
        ));
        html.push_str(&format!(
            "<div class=\"admonition-content\">{}</div>",
            markdown_to_html_simple(&admonition.content)
        ));
        html.push_str("</div>");
    }
    
    // Footer
    if context.symbol_kind.is_some() || context.docs_link.is_some() {
        html.push_str("<div class=\"hover-footer\">");
        if let Some(kind) = context.symbol_kind {
            html.push_str(&format!(
                "<span class=\"type-badge\" data-type=\"{}\">{}</span>",
                kind.to_lowercase(),
                kind
            ));
        }
        if let Some(module) = context.module {
            html.push_str(&format!(
                "<span class=\"module-badge\">{}</span>",
                module
            ));
        }
        if let Some(link) = context.docs_link {
            html.push_str(&format!(
                "<a href=\"{}\" class=\"docs-link\" target=\"_blank\">{}</a>",
                link.url,
                link.text
            ));
        }
        html.push_str("</div>");
    }
    
    html.push_str("</div>");
    html
}
```

---

## Summary

Semantic HTML provides:

1. **Visual hierarchy**: Clear separation between signature, description, notes
2. **Theming support**: CSS variables for dark/light mode
3. **Icon integration**: Structured places for icons
4. **Better accessibility**: Semantic structure for screen readers
5. **Easier maintenance**: Change CSS once, affects all tooltips

The key is the backend needs to **parse and structure** the markdown, not just convert it to HTML.
