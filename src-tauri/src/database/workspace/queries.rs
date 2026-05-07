/// Queries workspace persistence
///
/// Saves and loads queries from .openstorm/databases/queries.json

use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use crate::database::DatabaseError;

/// Saved query structure
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
        self.updated_at = chrono::Utc::now().to_rfc3339();
    }
}

/// Container for queries file
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct QueriesFile {
    pub queries: Vec<SavedQuery>,
}

/// Workspace queries manager
pub struct QueriesWorkspace {
    project_path: PathBuf,
}

impl QueriesWorkspace {
    pub fn new(project_path: &Path) -> Self {
        Self {
            project_path: project_path.to_path_buf(),
        }
    }

    /// Get path to queries.json file
    fn queries_file(&self) -> PathBuf {
        self.project_path
            .join(".openstorm")
            .join("databases")
            .join("queries.json")
    }

    /// Load all queries
    pub fn load_queries(&self) -> Result<QueriesFile, DatabaseError> {
        let path = self.queries_file();
        if !path.exists() {
            return Ok(QueriesFile::default());
        }

        let content = std::fs::read_to_string(&path)?;
        let queries: QueriesFile = serde_json::from_str(&content)?;
        Ok(queries)
    }

    /// Load queries for a specific connection
    pub fn load_queries_for_connection(&self, connection_id: &str) -> Result<QueriesFile, DatabaseError> {
        let all = self.load_queries()?;
        let filtered = all.queries.into_iter()
            .filter(|q| q.connection_id == connection_id)
            .collect();
        Ok(QueriesFile { queries: filtered })
    }

    /// Save a query (create or update)
    pub fn save_query(&self, query: &SavedQuery) -> Result<(), DatabaseError> {
        let mut file = self.load_queries()?;

        // Update or insert
        if let Some(existing) = file.queries.iter_mut().find(|q| q.id == query.id) {
            *existing = query.clone();
        } else {
            file.queries.push(query.clone());
        }

        self.write_queries(file)?;
        Ok(())
    }

    /// Delete a query
    pub fn delete_query(&self, query_id: &str) -> Result<(), DatabaseError> {
        let mut file = self.load_queries()?;
        file.queries.retain(|q| q.id != query_id);
        self.write_queries(file)?;
        Ok(())
    }

    /// Update query last_run timestamp
    pub fn mark_query_run(&self, query_id: &str) -> Result<(), DatabaseError> {
        let mut file = self.load_queries()?;

        if let Some(query) = file.queries.iter_mut().find(|q| q.id == query_id) {
            query.mark_run();
            self.write_queries(file)?;
        }

        Ok(())
    }

    /// Write queries to file
    fn write_queries(&self, file: QueriesFile) -> Result<(), DatabaseError> {
        // Ensure directory exists
        if let Some(parent) = self.queries_file().parent() {
            std::fs::create_dir_all(parent)?;
        }

        let content = serde_json::to_string_pretty(&file)?;
        std::fs::write(self.queries_file(), content)?;
        Ok(())
    }
}
