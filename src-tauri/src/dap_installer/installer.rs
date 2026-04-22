//! DAP Installer - Main Installer Logic
//!
//! Debug adapter installer with cache management

use std::path::{Path, PathBuf};
use std::fs;
use std::process::Command;

use super::types::{AdapterInfo, AdapterInstallResult, AdapterInfoResponse};
use super::registry::AdapterRegistry;
use super::installers::{find_binary, install_lldb, install_js_debug, install_debugpy, install_delve};

/// Debug Adapter Installer
pub struct DebugAdapterInstaller {
    cache_dir: PathBuf,
}

impl DebugAdapterInstaller {
    pub fn new() -> Self {
        let cache_dir = crate::config::get_paths().adapter_dir.clone();
        fs::create_dir_all(&cache_dir).ok();
        Self { cache_dir }
    }

    pub fn cache_dir(&self) -> &Path {
        &self.cache_dir
    }

    pub fn is_adapter_installed(&self, adapter: &AdapterInfo) -> bool {
        match adapter.id.as_str() {
            "js-debug" => {
                let debug_server = self.cache_dir.join("js-debug").join("src").join("dapDebugServer.js");
                debug_server.exists()
            }
            "debugpy" => {
                Command::new("python3")
                    .args(["-c", "import debugpy"])
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
            }
            "delve" | "lldb" => find_binary(&adapter.binary_name).is_some(),
            _ => find_binary(&adapter.binary_name).is_some(),
        }
    }

    pub async fn install_adapter(&self, adapter: &AdapterInfo) -> Result<AdapterInstallResult, String> {
        match adapter.id.as_str() {
            "lldb" => install_lldb(adapter),
            "js-debug" => install_js_debug(adapter, &self.cache_dir).await,
            "debugpy" => install_debugpy(adapter),
            "delve" => install_delve(adapter),
            _ => Err(format!("Unknown adapter: {}", adapter.id)),
        }
    }

    pub fn get_adapter_info(language: &str) -> Option<AdapterInfoResponse> {
        let adapter = AdapterRegistry::get_adapter_for_language(language)?;

        Some(AdapterInfoResponse {
            id: adapter.id.to_string(),
            name: adapter.name.to_string(),
            languages: adapter.languages.iter().map(|s| s.to_string()).collect(),
            size_mb: adapter.size_mb,
            install_command: adapter.install_command.map(|s| s.to_string()),
            is_installed: false,
        })
    }
}

impl Default for DebugAdapterInstaller {
    fn default() -> Self {
        Self::new()
    }
}
