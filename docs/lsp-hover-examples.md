# LSP Hover Response Format

## LSP Protocol Structure

The LSP (Language Server Protocol) defines hover responses using the `Hover` type from `lsp_types`:

```rust
pub struct Hover {
    pub contents: HoverContents,
    pub range: Option<Range>,
}

pub enum HoverContents {
    Scalar(MarkedString),
    Array(Vec<MarkedString>),
    Markup(MarkupContent),
}

pub enum MarkedString {
    String(String),                    // Plain markdown string
    LanguageString(LanguageString),    // Code with language hint
}

pub struct LanguageString {
    pub language: String,
    pub value: String,
}

pub struct MarkupContent {
    pub kind: MarkupKind,              // Markdown or PlainText
    pub value: String,
}
```

---

## Real-World Examples

### Example 1: rust-analyzer - `println!` macro

**Raw LSP Hover Response:**

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```rust\nmacro_rules! println\n```\n\nPrints to the standard output, with a newline. On all platforms, the newline is the LINE FEED character (`\\n`/`U+000A`) alone (no additional CARRIAGE RETURN (`\\r`/`U+000D`)).\n\nThis macro uses the same syntax as `format!`, but writes to the standard output instead. See `std::fmt` for more information.\n\n---\n\n[MDN Documentation](https://doc.rust-lang.org/std/macro.println.html)\n\n**Performance Note:** The `println!` macro will lock the standard output on each call. If you call `println!` within a hot loop, this behavior may be the bottleneck of the loop."
  },
  "range": {
    "start": { "line": 1, "character": 4 },
    "end": { "line": 1, "character": 11 }
  }
}
```

**Raw markdown value (formatted for readability):**

```markdown
```rust
macro_rules! println
```

Prints to the standard output, with a newline. On all platforms, the newline is the LINE FEED character (`\n`/`U+000A`) alone (no additional CARRIAGE RETURN (`\r`/`U+000D`)).

This macro uses the same syntax as `format!`, but writes to the standard output instead. See `std::fmt` for more information.

---

[MDN Documentation](https://doc.rust-lang.org/std/macro.println.html)

**Performance Note:** The `println!` macro will lock the standard output on each call. If you call `println!` within a hot loop, this behavior may be the bottleneck of the loop.
```

---

### Example 2: rust-analyzer - Function with documentation

Hovering over `std::iter::Iterator::collect`:

```markdown
```rust
fn collect<B>(self) -> B
where
    B: FromIterator<Self::Item>
```

Transforms an iterator into a collection.

`collect()` allows you to collect all the items of an iterator into a single collection. The type of the collection is determined by the context.

# Examples

Basic usage:

```rust
let a = vec![1, 2, 3];
let sum: i32 = a.iter().sum();
assert_eq!(sum, 6);
```

You can also collect into a `Vec`:

```rust
let a = vec![1, 2, 3];
let v: Vec<i32> = a.iter().copied().collect();
assert_eq!(v, vec![1, 2, 3]);
```

# See Also

- [`FromIterator`](trait.FromIterator.html)
- [`Iterator`](trait.Iterator.html)
```

---

### Example 3: TypeScript Language Server - Function

Hovering over `Array.prototype.map`:

```markdown
```typescript
(method) Array<T>.map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[]
```

Calls a defined callback function on each element of an array, and returns an array that contains the results.

**Parameters:**

- `callbackfn`: A function that accepts up to three arguments. The map method calls the callbackfn function one time for each element in the array.
- `thisArg`: An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.

**Returns:** `U[]`

**Remarks:** Available in ECMAScript 5 (JavaScript ES5) and later.
```

---

### Example 4: gopls (Go) - Function

Hovering over `fmt.Println`:

```markdown
```go
func Println(a ...any) (n int, err error)
```

Println formats using the default formats for its operands and writes to standard output. Spaces are always added between operands and a newline is appended. It returns the number of bytes written and any write error encountered.

[Documentation](https://pkg.go.dev/fmt#Println)
```

---

### Example 5: Pyright (Python) - Function

Hovering over `print`:

```markdown
```python
(function) def print(*values: object, sep: str | None = ' ', end: str | None = '\n', flush: bool = False) -> None
```

Prints the values to a stream, or to `sys.stdout` by default.

Optional keyword arguments:
- `file`: a file-like object (stream); defaults to the current `sys.stdout`.
- `sep`: string inserted between values, default a space.
- `end`: string appended after the last value, default a newline.
- `flush`: whether to forcibly flush the stream.

Added in version 3.0.
```

---

## Common Patterns in LSP Hover Responses

### 1. Signature Block (First)
```markdown
```rust
macro_rules! println
```
```
or
```markdown
```typescript
(method) Array<T>.map<U>(...)
```
```

### 2. Description Paragraphs
Plain markdown text after the signature.

### 3. Parameter Lists
```markdown
**Parameters:**
- `param1`: Description here
- `param2`: Description here
```

### 4. Examples Section
```markdown
# Examples

```rust
let x = 5;
```
```

### 5. Notes/Warnings (as bold text or blockquotes)
```markdown
**Note:** This is important.

> **Warning:** This may cause issues.
```

### 6. Links Section (at end, often after `---`)
```markdown
---

[Documentation](https://...)
[Source](https://...)
```

---

## Current Backend Processing

In `src-tauri/src/lsp/commands.rs`:

```rust
pub fn get_hover(...) -> Result<Option<HoverInfo>, String> {
    match client.get_hover(...)? {
        Some(hover) => {
            // Extract markdown string from various formats
            let contents = match hover.contents {
                HoverContents::Scalar(ms) => extract_string(ms),
                HoverContents::Array(arr) => join_strings(arr),
                HoverContents::Markup(markup) => markup.value,
            };

            // Convert markdown to HTML
            let html = markdown_to_html(&contents);

            Ok(Some(HoverInfo { contents, html, range }))
        }
        None => Ok(None),
    }
}
```

The current implementation:
1. Extracts the raw markdown string
2. Passes it to `markdown_to_html()` which uses `pulldown-cmark`
3. Returns both raw markdown (`contents`) and rendered HTML (`html`)

---

## What rust-analyzer Actually Returns

For `println!`, the raw markdown from rust-analyzer is:

```
```rust
macro_rules! println
```

Prints to the standard output, with a newline. On all platforms, the newline is the LINE FEED character (`\n`/`U+000A`) alone (no additional CARRIAGE RETURN (`\r`/`U+000D`)).

This macro uses the same syntax as `format!`, but writes to the standard output instead. See `std::fmt` for more information.

---

[MDN Documentation](https://doc.rust-lang.org/std/macro.println.html)
```

**Note:** rust-analyzer does NOT currently return:
- A separate "category" field (like "Definition")
- A separate "module path" field (like "std::macros")  
- Structured admonitions (Performance Note is just bold text)
- A structured footer

These would need to be **extracted via parsing** or **added via enhanced rust-analyzer integration**.

---

## Key Insight

The LSP protocol itself is **limited** - it returns basic markdown. IntelliJ IDEA's rich hover tooltips are achieved by:

1. **Parsing the markdown** to detect signature, description, notes
2. **Using IDE knowledge** (module path from symbol resolution)
3. **Custom rendering** based on detected structure

To match IntelliJ, we need to do similar parsing/enrichment on our backend.
