//! DAP Installer - Types
//!
//! Adapter installation metadata and result types

use serde::{Deserialize, Serialize};

/// Adapter installation metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdapterInfo {
    pub id: String,
    pub name: String,
    pub languages: Vec<String>,
    pub download_url: Option<String>,
    pub install_command: Option<String>,
    pub binary_name: String,
    pub binary_args: Vec<String>,
    pub size_mb: u32,
}

/// Adapter installation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdapterInstallResult {
    pub success: bool,
    pub adapter_id: String,
    pub message: String,
    pub binary_path: Option<String>,
}

/// Adapter info response for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterInfoResponse {
    pub id: String,
    pub name: String,
    pub languages: Vec<String>,
    pub size_mb: u32,
    pub install_command: Option<String>,
    pub is_installed: bool,
}
