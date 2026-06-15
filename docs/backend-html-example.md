# Backend HTML Generation - Actual Example

## Input: Raw Markdown from rust-analyzer

```markdown
```rust
macro_rules! println
```

Prints to the standard output, with a newline. On all platforms, the newline is the LINE FEED character (`\n`/`U+000A`) alone (no additional CARRIAGE RETURN (`\r`/`U+000D`)).

This macro uses the same syntax as `format!`, but writes to the standard output instead. See `std::fmt` for more information.

---

[MDN Documentation](https://doc.rust-lang.org/std/macro.println.html)

**Performance Note:** The `println!` macro will lock the standard output on each call.
```

---

## Output: HTML from Backend (`markdown_to_html()`)

```html
<pre class="code-block"><code>
  <span style="color:#96b5b4;">macro_rules! </span>
  <span style="color:#c0c5ce;">println</span>
</code></pre>

<p>Prints to the standard output, with a newline. On all platforms, the newline is the LINE FEED character 
  <code class="code-pill">\n</code>/<code class="code-pill">U+000A</code>) alone (no additional CARRIAGE RETURN 
  <code class="code-pill">\r</code>/<code class="code-pill">U+000D</code>)).
</p>

<p>This macro uses the same syntax as <code class="code-pill">format!</code>, but writes to the standard output instead. See <code class="code-pill">std::fmt</code> for more information.</p>

<hr/>

<p><a href="https://doc.rust-lang.org/std/macro.println.html" target="_blank" rel="noopener">MDN Documentation</a></p>

<p><strong>Performance Note:</strong> The <code class="code-pill">println!</code> macro will lock the standard output on each call.</p>
```

---

## Analysis

### What the Backend Currently Generates

| Element | HTML Output | Styling |
|---------|-------------|---------|
| **Code block** | `<pre class="code-block"><code>...` | Inline `style="color:#xxx"` from syntect |
| **Inline code** | `<code class="code-pill">...</code>` | No inline style |
| **Paragraphs** | `<p>...</p>` | No inline style |
| **Links** | `<a href="..." target="_blank" rel="noopener">` | No inline style |
| **Horizontal rule** | `<hr/>` | Default browser styling |
| **Bold text** | `<strong>...</strong>` | No inline style |

### Key Observations

1. **Syntax highlighting uses inline styles**: The backend uses `syntect` with the `base16-ocean.dark` theme, which generates inline `style="color:#xxx"` attributes.

2. **No semantic structure**: Everything is flat HTML - no:
   - Header bar with category
   - Signature section separation
   - Admonition boxes (Performance Note is just `<p><strong>...</strong></p>`)
   - Footer section

3. **Basic markdown conversion**: The backend correctly converts:
   - Fenced code blocks → `<pre class="code-block">`
   - Inline code → `<code class="code-pill">`
   - Links → `<a>` with target="_blank"
   - Bold → `<strong>`
   - Horizontal rules → `<hr/>`

---

## What the Frontend Receives

In `src/lib/lsp-client.ts`:

```typescript
export interface HoverInfo {
  contents: string,  // Raw markdown (for debugging)
  html: string,      // The HTML shown above
  range?: { ... }
}
```

In `src/components/hover-tooltip.ts`:

```typescript
// Frontend applies ADDITIONAL syntax highlighting via regex
this.renderedHtml = highlightCodeInHtml(rawHtml);

// Then renders:
<div class="tooltip-content">${unsafeHTML(this.renderedHtml)}</div>
```

---

## Current CSS Applied (Frontend)

From `src/components/hover-tooltip.ts`:

```css
.tooltip-content {
  max-width: 450px;
  max-height: 280px;
  overflow: auto;
  padding: 8px 12px;
  border: 1px solid var(--app-input-border);
  background: var(--app-bg);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 11px;
}

.tooltip-content .code-block {
  background: var(--app-toolbar-hover);
  padding: 8px 10px;
  border-radius: 4px;
  margin: 8px 0;
}

.tooltip-content .code-pill {
  background: var(--app-toolbar-hover);
  padding: 2px 6px;
  border-radius: 3px;
  color: var(--app-type);
}

.tooltip-content .hl-kw { color: var(--app-keyword); }
.tooltip-content .hl-type { color: var(--app-type); }
/* etc. */
```

---

## Gap to IntelliJ-Style

### Current Output (Simplified)

```
┌─────────────────────────────────────────────┐
│ [code block with inline styles]             │
│                                             │
│ Prints to the standard output...            │
│                                             │
│ This macro uses...                          │
│                                             │
│ ─────────────────────────────────           │
│                                             │
│ MDN Documentation                           │
│                                             │
│ Performance Note: The println! macro...     │
└─────────────────────────────────────────────┘
```

### Target IntelliJ-Style

```
┌─────────────────────────────────────────────┐
│ DEFINITION          std::macros             │ ← Header bar
├─────────────────────────────────────────────┤
│ macro_rules! println                        │ ← Signature section
├─────────────────────────────────────────────┤
│ Prints to the standard output...            │
│ This macro uses...                          │
├─────────────────────────────────────────────┤
│ ⚠️ PERFORMANCE NOTE                         │ ← Admonition box
│ The println! macro will lock...             │
├─────────────────────────────────────────────┤
│ [macro]  [std]  📖 MDN Documentation →      │ ← Footer badges
└─────────────────────────────────────────────┘
```

---

## Required Changes

### Backend (`markdown.rs`)

1. **Detect admonitions**: Parse `**Note:**`, `**Warning:**`, `**Performance Note:**` patterns
2. **Extract signature**: First code block → separate field
3. **Extract module path**: From symbol resolution (not in markdown)
4. **Generate structured HTML**: Wrap sections in semantic divs

### Frontend (`hover-tooltip.ts`)

1. **Update interface**: Add `category`, `modulePath`, `admonitions`, `footer`
2. **Structured rendering**: Render header, signature, body, admonitions, footer separately
3. **Add CSS**: Styles for `.hover-header`, `.hover-admonition`, `.hover-footer`
