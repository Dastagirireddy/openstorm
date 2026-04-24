/// Markdown to HTML conversion using pulldown-cmark
///
/// Converts LSP markdown content to HTML with syntax highlighting via syntect

use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use syntect::easy::HighlightLines;
use syntect::highlighting::ThemeSet;
use syntect::html::{append_highlighted_html_for_styled_line, IncludeBackground};
use syntect::parsing::SyntaxSet;
use std::sync::LazyLock;

static SYNTAX_SET: LazyLock<SyntaxSet> = LazyLock::new(SyntaxSet::load_defaults_newlines);
static THEME_SET: LazyLock<ThemeSet> = LazyLock::new(ThemeSet::load_defaults);

/// Convert markdown text to HTML with syntax highlighting
pub fn markdown_to_html(markdown: &str) -> String {
    if markdown.is_empty() {
        return String::new();
    }

    let mut html_output = String::new();
    let mut current_lang: Option<String> = None;

    // Set up parser options for GFM support
    let mut options = Options::empty();
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(markdown, options);

    let mut in_code_block = false;
    let mut code_block_content = String::new();

    for event in parser {
        match event {
            Event::Start(tag) => match tag {
                Tag::Paragraph => {
                    html_output.push_str("<p>");
                }
                Tag::CodeBlock(kind) => {
                    in_code_block = true;
                    code_block_content.clear();
                    current_lang = match kind {
                        CodeBlockKind::Fenced(lang) => {
                            let lang_str = lang.to_string();
                            // Map common language IDs to syntect names
                            Some(map_language(&lang_str))
                        }
                        CodeBlockKind::Indented => Some("rust".to_string()), // Default for indented
                    };
                }
                Tag::Emphasis => {
                    html_output.push_str("<em>");
                }
                Tag::Strong => {
                    html_output.push_str("<strong>");
                }
                Tag::Link { dest_url, .. } => {
                    html_output.push_str(&format!(
                        "<a href=\"{}\" target=\"_blank\" rel=\"noopener\">",
                        escape_html(&dest_url)
                    ));
                }
                Tag::List(_) => {
                    html_output.push_str("<ul>");
                }
                Tag::Item => {
                    html_output.push_str("<li>");
                }
                Tag::BlockQuote => {
                    html_output.push_str("<blockquote>");
                }
                Tag::Heading { level, .. } => {
                    let level_num = level as u32;
                    html_output.push_str(&format!("<h{}>", level_num));
                }
                Tag::Table(_) => {
                    html_output.push_str("<div class=\"table-container\">");
                }
                Tag::TableHead => {
                    html_output.push_str("<div class=\"table-header\">");
                }
                Tag::TableRow => {
                    html_output.push_str("<div class=\"table-row\">");
                }
                Tag::TableCell => {
                    html_output.push_str("<div class=\"table-cell\">");
                }
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Paragraph => {
                    html_output.push_str("</p>");
                }
                TagEnd::CodeBlock => {
                    in_code_block = false;
                    let highlighted = highlight_code(&code_block_content, current_lang.as_deref());
                    html_output.push_str(&format!(
                        "<pre class=\"code-block\"><code>{}</code></pre>",
                        highlighted
                    ));
                    current_lang = None;
                }
                TagEnd::Emphasis => {
                    html_output.push_str("</em>");
                }
                TagEnd::Strong => {
                    html_output.push_str("</strong>");
                }
                TagEnd::Link => {
                    html_output.push_str("</a>");
                }
                TagEnd::List(_) => {
                    html_output.push_str("</ul>");
                }
                TagEnd::Item => {
                    html_output.push_str("</li>");
                }
                TagEnd::BlockQuote => {
                    html_output.push_str("</blockquote>");
                }
                TagEnd::Heading(_) => {
                    html_output.push_str("</h1>");
                }
                TagEnd::Table => {
                    html_output.push_str("</div>");
                }
                TagEnd::TableHead => {
                    html_output.push_str("</div>");
                }
                TagEnd::TableRow => {
                    html_output.push_str("</div>");
                }
                TagEnd::TableCell => {
                    html_output.push_str("</div>");
                }
                _ => {}
            },
            Event::Text(text) => {
                if in_code_block {
                    code_block_content.push_str(&text);
                } else {
                    html_output.push_str(&escape_html(&text));
                }
            }
            Event::Code(text) => {
                html_output.push_str(&format!(
                    "<code class=\"code-pill\">{}</code>",
                    escape_html(&text)
                ));
            }
            Event::Html(html) => {
                html_output.push_str(&html);
            }
            Event::SoftBreak | Event::HardBreak => {
                html_output.push(' ');
            }
            Event::Rule => {
                html_output.push_str("<hr/>");
            }
            Event::TaskListMarker(checked) => {
                html_output.push_str(if checked {
                    "<input type=\"checkbox\" checked disabled/>"
                } else {
                    "<input type=\"checkbox\" disabled/>"
                });
            }
            Event::FootnoteReference(_) | Event::InlineHtml(_) => {}
        }
    }

    // If output is plain text (no block elements), wrap in paragraph
    if !html_output.is_empty()
        && !html_output.contains("<p>")
        && !html_output.contains("<pre>")
        && !html_output.contains("<ul>")
        && !html_output.contains("<blockquote>")
        && !html_output.contains("<h")
    {
        html_output = format!("<p>{}</p>", html_output);
    }

    html_output
}

/// Map language IDs to syntect syntax names
fn map_language(lang: &str) -> String {
    match lang.to_lowercase().as_str() {
        "rs" => "rust".to_string(),
        "rust" => "rust".to_string(),
        "js" => "javascript".to_string(),
        "javascript" => "javascript".to_string(),
        "ts" => "typescript".to_string(),
        "typescript" => "typescript".to_string(),
        "tsx" => "tsx".to_string(),
        "py" => "python".to_string(),
        "python" => "python".to_string(),
        "go" => "go".to_string(),
        "c" => "c".to_string(),
        "cpp" => "cpp".to_string(),
        "c++" => "cpp".to_string(),
        "java" => "java".to_string(),
        "cs" => "csharp".to_string(),
        "csharp" => "csharp".to_string(),
        "sh" => "bash".to_string(),
        "bash" => "bash".to_string(),
        "shell" => "bash".to_string(),
        "json" => "json".to_string(),
        "yaml" => "yaml".to_string(),
        "yml" => "yaml".to_string(),
        "toml" => "toml".to_string(),
        "md" => "markdown".to_string(),
        "html" => "html".to_string(),
        "css" => "css".to_string(),
        "sql" => "sql".to_string(),
        _ => lang.to_string(),
    }
}

/// Apply syntax highlighting to code using syntect
fn highlight_code(code: &str, lang: Option<&str>) -> String {
    let syntax = lang
        .and_then(|l| SYNTAX_SET.find_syntax_by_token(l))
        .unwrap_or_else(|| SYNTAX_SET.find_syntax_plain_text());

    // Use a neutral theme (we'll style with CSS variables)
    let theme = &THEME_SET.themes["base16-ocean.dark"];
    let mut highlighter = HighlightLines::new(syntax, theme);

    let mut result = String::new();
    for line in code.lines() {
        let regions = highlighter
            .highlight_line(line, &SYNTAX_SET)
            .unwrap_or_default();

        append_highlighted_html_for_styled_line(
            &regions,
            IncludeBackground::No,
            &mut result,
        )
        .unwrap_or_else(|_| result.push_str(&escape_html(line)));
    }

    result
}

/// Escape HTML special characters
fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_markdown_to_html_with_code_block() {
        let markdown = r#"```rust
fn println(args: Arguments)
```

Prints a formatted string to stdout"#;

        let html = markdown_to_html(markdown);
        println!("HTML Output:\n{}", html);
        assert!(html.contains("<pre class=\"code-block\">"));
        assert!(html.contains("println"));
        assert!(html.contains("<p>Prints a formatted string to stdout</p>"));
    }

    #[test]
    fn test_markdown_to_html_plain_text() {
        let markdown = "Hello world";
        let html = markdown_to_html(markdown);
        assert!(html.contains("<p>Hello world</p>"));
    }

    #[test]
    fn test_markdown_to_html_real_rust_analyzer() {
        // Real hover content from rust-analyzer for println!
        let markdown = r#"```rust
macro_rules! println
```

Prints to the standard output, with a newline. On all platforms, the newline is the LINE FEED character (`\n`/`U+000A`) alone (no additional CARRIAGE RETURN (`\r`/`U+000D`)).

This macro uses the same syntax as `format!`, but writes to the standard output instead. See `std::fmt` for more information.

---

[MDN Documentation](https://doc.rust-lang.org/std/macro.println.html)

**Performance Note:** The `println!` macro will lock the standard output on each call."#;

        let html = markdown_to_html(markdown);
        println!("\n=== Real rust-analyzer Hover HTML Output ===\n{}\n=== End HTML ===\n", html);

        assert!(html.contains("<pre class=\"code-block\">"));
        assert!(html.contains("macro_rules"));
        assert!(html.contains("println"));
        assert!(html.contains("<p>Prints to the standard output"));
        assert!(html.contains("<code>"));
        assert!(html.contains("format!"));
        assert!(html.contains("<a href="));
        assert!(html.contains("doc.rust-lang.org"));
    }
}
