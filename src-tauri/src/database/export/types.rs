/// Export types

use serde::{Deserialize, Serialize};

/// Export format
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Json,
    Xlsx,
}

impl std::fmt::Display for ExportFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExportFormat::Csv => write!(f, "CSV"),
            ExportFormat::Json => write!(f, "JSON"),
            ExportFormat::Xlsx => write!(f, "XLSX"),
        }
    }
}

/// Export options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub format: ExportFormat,
    pub max_rows: Option<u64>,
    pub include_headers: bool,
    pub destination_path: String,
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            format: ExportFormat::Csv,
            max_rows: Some(100_000),
            include_headers: true,
            destination_path: String::new(),
        }
    }
}

/// Export result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub success: bool,
    pub file_path: String,
    pub rows_exported: u64,
    pub file_size_bytes: u64,
    pub execution_time_ms: u64,
    pub error: Option<String>,
}

/// Export progress update
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    pub rows_exported: u64,
    pub total_rows: Option<u64>,
    pub percent_complete: f64,
    pub is_complete: bool,
}
