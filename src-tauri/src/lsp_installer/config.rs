/// LSP Server configuration
///
/// This module defines the configuration for LSP servers that can be installed
/// and managed by the LSP installer.

use std::path::PathBuf;

/// LSP Server download configuration
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct LspServerConfig {
    pub language_id: String,
    pub server_name: String,
    pub github_repo: Option<String>,
    pub npm_package: Option<String>,
    pub binary_name: String,
    pub extract_binary: Option<String>, // Path inside archive to extract
    pub install_via_go_tool: bool,      // Use `go install` for installation (e.g., gopls)
}

/// Get the LSP server configuration for a language
pub fn get_server_config(language_id: &str) -> Option<LspServerConfig> {
    match language_id {
        "rust" => Some(LspServerConfig {
            language_id: "rust".to_string(),
            server_name: "rust-analyzer".to_string(),
            github_repo: Some("rust-lang/rust-analyzer".to_string()),
            npm_package: None,
            binary_name: "rust-analyzer".to_string(),
            extract_binary: Some("rust-analyzer".to_string()),
            install_via_go_tool: false,
        }),
        "typescript" | "javascript" => Some(LspServerConfig {
            language_id: language_id.to_string(),
            server_name: "typescript-language-server".to_string(),
            github_repo: None,
            npm_package: Some("typescript-language-server".to_string()),
            binary_name: "typescript-language-server".to_string(),
            extract_binary: Some("node_modules/typescript-language-server/lib/cli.js".to_string()),
            install_via_go_tool: false,
        }),
        "python" => Some(LspServerConfig {
            language_id: "python".to_string(),
            server_name: "pyright".to_string(),
            github_repo: None,
            npm_package: Some("pyright".to_string()),
            binary_name: "pyright".to_string(),
            extract_binary: None, // npm install handles this
            install_via_go_tool: false,
        }),
        "go" => Some(LspServerConfig {
            language_id: "go".to_string(),
            server_name: "gopls".to_string(),
            github_repo: None,
            npm_package: None,
            binary_name: "gopls".to_string(),
            extract_binary: None,
            // gopls doesn't provide pre-built binaries, use go install
            install_via_go_tool: true,
        }),
        "cpp" | "c" => Some(LspServerConfig {
            language_id: "cpp".to_string(),
            server_name: "clangd".to_string(),
            github_repo: None, // LLVM is too large, use system package
            npm_package: None,
            binary_name: "clangd".to_string(),
            extract_binary: None,
            install_via_go_tool: false,
        }),
        _ => None,
    }
}

/// Get the cache directory for LSP servers
pub fn get_lsp_cache_dir() -> PathBuf {
    crate::config::get_paths().lsp_server_dir.clone()
}

/// Get the binary path for a config
pub fn get_binary_path(config: &LspServerConfig) -> PathBuf {
    let cache_dir = get_lsp_cache_dir();
    cache_dir.join(&config.binary_name)
}
