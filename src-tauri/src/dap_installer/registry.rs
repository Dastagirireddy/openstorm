//! DAP Installer - Adapter Registry
//!
//! Registry of available debug adapters for installation

use super::types::AdapterInfo;

/// Adapter registry for installation purposes
pub struct AdapterRegistry;

impl AdapterRegistry {
    pub fn get_all_adapters() -> Vec<AdapterInfo> {
        vec![
            AdapterInfo {
                id: "lldb".to_string(),
                name: "LLDB Debugger".to_string(),
                languages: vec!["rust".to_string(), "cpp".to_string(), "c".to_string()],
                download_url: None,
                install_command: Some("xcode-select --install".to_string()),
                binary_name: "lldb-dap".to_string(),
                binary_args: vec!["--adapter".to_string()],
                size_mb: 0,
            },
            AdapterInfo {
                id: "delve".to_string(),
                name: "Go Debugger".to_string(),
                languages: vec!["go".to_string()],
                download_url: None,
                install_command: Some("go install github.com/go-delve/delve/cmd/dlv@latest".to_string()),
                binary_name: "dlv".to_string(),
                binary_args: vec!["dap".to_string()],
                size_mb: 15,
            },
            AdapterInfo {
                id: "js-debug".to_string(),
                name: "JavaScript Debugger".to_string(),
                languages: vec!["javascript".to_string(), "typescript".to_string()],
                download_url: None,
                install_command: None,
                binary_name: "node".to_string(),
                binary_args: vec!["js-debug/src/dapDebugServer.js".to_string()],
                size_mb: 2,
            },
            AdapterInfo {
                id: "debugpy".to_string(),
                name: "Python Debugger".to_string(),
                languages: vec!["python".to_string()],
                download_url: None,
                install_command: Some("pip install debugpy".to_string()),
                binary_name: "python".to_string(),
                binary_args: vec!["-m".to_string(), "debugpy.adapter".to_string()],
                size_mb: 5,
            },
        ]
    }

    pub fn get_adapter_for_language(language: &str) -> Option<AdapterInfo> {
        Self::get_all_adapters().into_iter().find(|adapter| adapter.languages.iter().any(|l| l == language))
    }
}
