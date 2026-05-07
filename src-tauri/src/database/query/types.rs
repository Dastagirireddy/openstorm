/// Query execution types

use serde::{Deserialize, Serialize};

/// Query result returned to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<serde_json::Value>,
    pub row_count: u64,
    pub execution_time_ms: u64,
    #[serde(default)]
    pub truncated: bool,
    #[serde(default)]
    pub has_more: bool,
    #[serde(default)]
    pub limit_applied: Option<u64>,
}

/// Column information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub type_name: Option<String>,
    pub nullable: Option<bool>,
}

/// Chunk of rows for streaming
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResultChunk {
    pub rows: Vec<serde_json::Value>,
    pub is_last: bool,
}

impl QueryResultChunk {
    pub fn new(rows: Vec<serde_json::Value>, is_last: bool) -> Self {
        Self { rows, is_last }
    }
}

/// Query execution summary
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuerySummary {
    pub row_count: u64,
    pub execution_time_ms: u64,
}

/// Saved query in workspace
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedQuery {
    pub id: String,
    pub title: String,
    pub sql: String,
    pub connection_id: String,
    pub last_run: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl SavedQuery {
    pub fn new(id: String, title: String, sql: String, connection_id: String) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id,
            title,
            sql,
            connection_id,
            last_run: None,
            created_at: now.clone(),
            updated_at: now,
        }
    }

    pub fn mark_run(&mut self) {
        self.last_run = Some(chrono::Utc::now().to_rfc3339());
    }
}
