/// LSP Tauri Commands
///
/// This module contains all the #[tauri::command] functions for LSP operations.
/// These are thin wrappers that delegate to the underlying services.

use super::client::{FormattingOptions, LspClient};
use super::pool::{get_pool, init_connection_pool};
use crate::lsp_installer;

/// LSP Server info
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LspServerInfo {
    pub language_id: String,
    pub server_name: String,
    pub install_command: String,
    pub is_installed: bool,
}

/// Progress event for frontend
#[derive(Clone, serde::Serialize)]
pub struct ProgressEvent {
    pub language_id: String,
    pub stage: String,
    pub percentage: f64,
}

/// Completion item for frontend
#[derive(Debug, Clone, serde::Serialize)]
pub struct CompletionItemInfo {
    pub label: String,
    pub kind: i32,
    pub detail: Option<String>,
    pub documentation: Option<String>,
    pub sort_text: Option<String>,
    pub filter_text: Option<String>,
    pub insert_text: Option<String>,
}

/// Hover info for frontend
#[derive(Debug, Clone, serde::Serialize)]
pub struct HoverInfo {
    pub contents: String,      // Raw markdown (for debugging)
    pub html: String,          // Pre-rendered HTML with Tailwind classes
    pub range: Option<RangeInfo>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RangeInfo {
    pub start_line: u32,
    pub start_char: u32,
    pub end_line: u32,
    pub end_char: u32,
}

/// Location info for frontend (go to definition)
#[derive(Debug, Clone, serde::Serialize)]
pub struct LocationInfo {
    pub uri: String,
    pub start_line: u32,
    pub start_char: u32,
    pub end_line: u32,
    pub end_char: u32,
}

/// Tauri command: Get status of all LSP servers
#[tauri::command]
pub fn get_lsp_server_status() -> Vec<LspServerInfo> {
    let servers = vec![
        ("rust", "rust-analyzer"),
        ("go", "gopls"),
        ("python", "pyright"),
        ("cpp", "clangd"),
        ("typescript", "typescript-language-server"),
        ("javascript", "typescript-language-server"),
    ];

    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();

    for (lang, server) in servers {
        if seen.contains(server) {
            continue;
        }
        seen.insert(server);

        // Check if installed via our installer or system PATH
        let is_installed = if let Some(config) = lsp_installer::get_server_config(lang) {
            lsp_installer::is_server_installed_cached(&config)
        } else {
            // Fall back to system PATH check
            lsp_installer::is_server_installed(server)
        };

        // Get install source for display
        let install_source = if let Some(config) = lsp_installer::get_server_config(lang) {
            if let Some(repo) = &config.github_repo {
                format!("GitHub: {}", repo)
            } else if let Some(npm) = &config.npm_package {
                format!("npm: {}", npm)
            } else {
                "Direct download".to_string()
            }
        } else {
            "System package".to_string()
        };

        result.push(LspServerInfo {
            language_id: lang.to_string(),
            server_name: server.to_string(),
            install_command: install_source,
            is_installed,
        });
    }

    result
}

/// Tauri command: Install an LSP server (async, with progress events to frontend)
#[tauri::command]
pub async fn install_lsp_server(
    language_id: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use tauri::Emitter;

    let language_id_clone = language_id.clone();

    let result = lsp_installer::install_server(&language_id, move |progress| {
        let _ = app_handle.emit("lsp-install-progress", &ProgressEvent {
            language_id: language_id_clone.clone(),
            stage: progress.stage.clone(),
            percentage: progress.percentage,
        });
    })
    .await;

    result
}

/// Tauri command: Format code for a given language
#[tauri::command]
pub fn format_code(language: String, content: String, tab_width: u32) -> Result<String, String> {
    let options = FormattingOptions {
        tab_size: tab_width,
        insert_spaces: true,
        ..Default::default()
    };

    match language.as_str() {
        "rust" => match format_with_lsp("rust", "/tmp", "file:///tmp/test.rs", &content, &options) {
            Ok(formatted) => Ok(formatted),
            Err(_) => format_with_rustfmt(&content, tab_width),
        },
        "go" => match format_with_lsp("go", "/tmp", "file:///tmp/test.go", &content, &options) {
            Ok(formatted) => Ok(formatted),
            Err(_) => format_with_gofmt(&content),
        },
        "python" => match format_with_lsp("python", "/tmp", "file:///tmp/test.py", &content, &options) {
            Ok(formatted) => Ok(formatted),
            Err(_) => format_with_black(&content, tab_width),
        },
        "cpp" | "c" => match format_with_lsp("cpp", "/tmp", "file:///tmp/test.cpp", &content, &options) {
            Ok(formatted) => Ok(formatted),
            Err(_) => format_with_clang_format(&content, tab_width),
        },
        "javascript" => match format_with_lsp("javascript", "/tmp", "file:///tmp/test.js", &content, &options) {
            Ok(formatted) => Ok(formatted),
            Err(_) => Ok(content),
        },
        "typescript" => match format_with_lsp("typescript", "/tmp", "file:///tmp/test.ts", &content, &options) {
            Ok(formatted) => Ok(formatted),
            Err(_) => Ok(content),
        },
        _ => Err(format!("Unsupported language: {}", language)),
    }
}

/// Tauri command: Get completions at position
#[tauri::command]
pub fn get_completions(
    language_id: String,
    uri: String,
    content: String,
    line: u32,
    column: u32,
) -> Result<Vec<CompletionItemInfo>, String> {
    let pool = get_pool().ok_or("Connection pool not initialized")?;
    let mut pool_guard = pool.lock().map_err(|e| format!("Lock error: {}", e))?;
    let client = pool_guard.get_or_create(&language_id)?;

    let items = client.get_completions(&uri, &content, &language_id, line, column)?;

    Ok(items
        .into_iter()
        .map(|item| CompletionItemInfo {
            label: item.label,
            kind: item.kind.map(|k| match k {
                lsp_types::CompletionItemKind::TEXT => 1,
                lsp_types::CompletionItemKind::METHOD => 2,
                lsp_types::CompletionItemKind::FUNCTION => 3,
                lsp_types::CompletionItemKind::CONSTRUCTOR => 4,
                lsp_types::CompletionItemKind::FIELD => 5,
                lsp_types::CompletionItemKind::VARIABLE => 6,
                lsp_types::CompletionItemKind::CLASS => 7,
                lsp_types::CompletionItemKind::INTERFACE => 8,
                lsp_types::CompletionItemKind::MODULE => 9,
                lsp_types::CompletionItemKind::PROPERTY => 10,
                lsp_types::CompletionItemKind::UNIT => 11,
                lsp_types::CompletionItemKind::VALUE => 12,
                lsp_types::CompletionItemKind::ENUM => 13,
                lsp_types::CompletionItemKind::KEYWORD => 14,
                lsp_types::CompletionItemKind::SNIPPET => 15,
                lsp_types::CompletionItemKind::COLOR => 16,
                lsp_types::CompletionItemKind::FILE => 17,
                lsp_types::CompletionItemKind::REFERENCE => 18,
                lsp_types::CompletionItemKind::FOLDER => 19,
                lsp_types::CompletionItemKind::ENUM_MEMBER => 20,
                lsp_types::CompletionItemKind::CONSTANT => 21,
                lsp_types::CompletionItemKind::STRUCT => 22,
                lsp_types::CompletionItemKind::EVENT => 23,
                lsp_types::CompletionItemKind::OPERATOR => 24,
                lsp_types::CompletionItemKind::TYPE_PARAMETER => 25,
                _ => 1,
            }).unwrap_or(1),
            detail: item.detail,
            documentation: item.documentation.map(|doc| match doc {
                lsp_types::Documentation::String(s) => s,
                lsp_types::Documentation::MarkupContent(markup) => markup.value,
            }),
            sort_text: item.sort_text,
            filter_text: item.filter_text,
            insert_text: item.insert_text,
        })
        .collect())
}

/// Tauri command: Get hover information at position
#[tauri::command]
pub fn get_hover(
    language_id: String,
    uri: String,
    content: String,
    line: u32,
    column: u32,
) -> Result<Option<HoverInfo>, String> {
    use super::markdown::markdown_to_html;

    let pool = get_pool().ok_or("Connection pool not initialized")?;
    let mut pool_guard = pool.lock().map_err(|e| format!("Lock error: {}", e))?;
    let client = pool_guard.get_or_create(&language_id)?;

    match client.get_hover(&uri, &content, &language_id, line, column)? {
        Some(hover) => {
            let contents = match hover.contents {
                lsp_types::HoverContents::Scalar(marked_string) => match marked_string {
                    lsp_types::MarkedString::String(s) => s,
                    lsp_types::MarkedString::LanguageString(ls) => ls.value,
                },
                lsp_types::HoverContents::Array(arr) => arr
                    .into_iter()
                    .map(|ms| match ms {
                        lsp_types::MarkedString::String(s) => s,
                        lsp_types::MarkedString::LanguageString(ls) => ls.value,
                    })
                    .collect::<Vec<_>>()
                    .join("\n\n"),
                lsp_types::HoverContents::Markup(markup) => markup.value,
            };

            // Convert markdown to HTML with syntax highlighting
            let html = markdown_to_html(&contents);

            let range = hover.range.map(|r| RangeInfo {
                start_line: r.start.line,
                start_char: r.start.character,
                end_line: r.end.line,
                end_char: r.end.character,
            });

            Ok(Some(HoverInfo { contents, html, range }))
        }
        None => Ok(None),
    }
}

/// Tauri command: Get definition location at position
#[tauri::command]
pub fn get_definition(
    language_id: String,
    uri: String,
    content: String,
    line: u32,
    column: u32,
) -> Result<Vec<LocationInfo>, String> {
    let pool = get_pool().ok_or("Connection pool not initialized")?;
    let mut pool_guard = pool.lock().map_err(|e| format!("Lock error: {}", e))?;
    let client = pool_guard.get_or_create(&language_id)?;

    let locations = client.get_definition(&uri, &content, &language_id, line, column)?;

    Ok(locations
        .into_iter()
        .map(|loc| {
            let uri_str = loc.uri.to_string();
            LocationInfo {
                uri: uri_str,
                start_line: loc.range.start.line,
                start_char: loc.range.start.character,
                end_line: loc.range.end.line,
                end_char: loc.range.end.character,
            }
        })
        .collect())
}

/// Tauri command: Initialize LSP connection pool for a project
#[tauri::command]
pub fn initialize_lsp_pool(root_path: String) -> Result<(), String> {
    init_connection_pool(root_path);
    Ok(())
}

/// Tauri command: Notify document opened (for sync)
#[tauri::command]
pub fn notify_document_opened(
    language_id: String,
    uri: String,
    content: String,
    _version: i32,
) -> Result<(), String> {
    let pool = get_pool().ok_or("Connection pool not initialized")?;
    let mut pool_guard = pool.lock().map_err(|e| format!("Lock error: {}", e))?;
    let client = pool_guard.get_or_create(&language_id)?;
    client.did_open(&uri, &content, &language_id)
}

/// Tauri command: Notify document changed (for sync)
#[tauri::command]
pub fn notify_document_changed(
    language_id: String,
    uri: String,
    content: String,
    version: i32,
) -> Result<(), String> {
    let pool = get_pool().ok_or("Connection pool not initialized")?;
    let mut pool_guard = pool.lock().map_err(|e| format!("Lock error: {}", e))?;
    let client = pool_guard.get_or_create(&language_id)?;
    client.did_change(&uri, &content, &language_id, version)
}

/// Tauri command: Notify document closed
#[tauri::command]
pub fn notify_document_closed(language_id: String, uri: String) -> Result<(), String> {
    let pool = get_pool().ok_or("Connection pool not initialized")?;
    let mut pool_guard = pool.lock().map_err(|e| format!("Lock error: {}", e))?;
    let client = pool_guard.get_or_create(&language_id)?;
    client.did_close(&uri)
}

/// Tauri command: Notify document saved
#[tauri::command]
pub fn notify_document_saved(
    language_id: String,
    uri: String,
    content: Option<String>,
) -> Result<(), String> {
    let pool = get_pool().ok_or("Connection pool not initialized")?;
    let mut pool_guard = pool.lock().map_err(|e| format!("Lock error: {}", e))?;
    let client = pool_guard.get_or_create(&language_id)?;
    client.did_save(&uri, content.as_deref())
}

/// Format code using LSP - creates a temporary client for each request
/// This is simpler than managing a pool of clients and works well for on-demand formatting
fn format_with_lsp(
    language_id: &str,
    root_path: &str,
    uri: &str,
    content: &str,
    options: &FormattingOptions,
) -> Result<String, String> {
    let (server, args) = super::pool::get_server_for_language(language_id)
        .ok_or_else(|| format!("No LSP server configured for language: {}", language_id))?;

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let mut client = LspClient::new(&server, &args_ref)?;
    client.initialize(root_path)?;
    client.format_document(uri, content, language_id, options)
}

// Fallback formatters are in a separate module to keep commands clean
use super::fallbacks::{format_with_rustfmt, format_with_gofmt, format_with_black, format_with_clang_format};
