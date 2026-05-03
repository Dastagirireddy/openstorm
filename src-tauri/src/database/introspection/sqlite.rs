/// SQLite Introspector - retrieves schema metadata from SQLite
///
/// Uses sqlx to query SQLite system tables (sqlite_master)

use crate::database::{Result, ConnectionConfig, DatabaseError};
use super::traits::{DatabaseIntrospector, DatabaseObject, ObjectKind};
use serde_json::json;
use std::path::PathBuf;

pub struct SqliteIntrospector;

impl SqliteIntrospector {
    pub fn new() -> Self {
        Self
    }

    fn get_connection_string(config: &ConnectionConfig) -> Result<String> {
        let file_path = config.file_path.as_ref()
            .ok_or_else(|| DatabaseError::ConnectionError("No file path provided for SQLite".to_string()))?;

        let path = PathBuf::from(file_path);
        if !path.exists() {
            return Err(DatabaseError::ConnectionError(format!("SQLite file not found: {}", file_path)));
        }

        Ok(format!("sqlite://{}?mode=ro", file_path))
    }
}

impl DatabaseIntrospector for SqliteIntrospector {
    fn get_root_objects(&self, config: &ConnectionConfig) -> Result<Vec<DatabaseObject>> {
        let connection_string = Self::get_connection_string(config)?;

        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| DatabaseError::ConnectionError(format!("Failed to create runtime: {}", e)))?;

        rt.block_on(async {
            let pool = sqlx::SqlitePool::connect(&connection_string).await
                .map_err(|e| DatabaseError::ConnectionError(format!("Failed to connect: {}", e)))?;

            // Get all tables from sqlite_master
            let tables: Vec<(String,)> = sqlx::query_as(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
            .fetch_all(&pool)
            .await
            .unwrap_or_default();

            pool.close().await;

            let objects = tables.iter()
                .map(|(name,)| DatabaseObject {
                    id: format!("table:{}", name),
                    name: name.clone(),
                    kind: ObjectKind::Table,
                    icon: "mdi:table".to_string(),
                    children: None,
                    expanded: false,
                    metadata: Some(json!({ "name": name })),
                })
                .collect();

            Ok(objects)
        })
    }

    fn get_children(&self, config: &ConnectionConfig, parent: &DatabaseObject) -> Result<Vec<DatabaseObject>> {
        let connection_string = Self::get_connection_string(config)?;

        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| DatabaseError::ConnectionError(format!("Failed to create runtime: {}", e)))?;

        rt.block_on(async {
            let pool = sqlx::SqlitePool::connect(&connection_string).await
                .map_err(|e| DatabaseError::ConnectionError(format!("Failed to connect: {}", e)))?;

            match parent.kind {
                ObjectKind::Table => {
                    // Get columns using PRAGMA table_info
                    let pragma = format!("PRAGMA table_info('{}')", parent.name);
                    let columns: Vec<(i64, String, String, bool, Option<String>, bool)> = sqlx::query_as(&pragma)
                        .fetch_all(&pool)
                        .await
                        .unwrap_or_default();

                    pool.close().await;

                    Ok(columns.iter().map(|(_, name, dtype, notnull, _, pk)| DatabaseObject {
                        id: format!("column:{}.{}", parent.name, name),
                        name: name.clone(),
                        kind: ObjectKind::Column,
                        icon: "mdi:form-textbox".to_string(),
                        children: None,
                        expanded: false,
                        metadata: Some(json!({
                            "table": parent.name,
                            "column": name,
                            "type": dtype,
                            "nullable": !notnull,
                            "primary_key": *pk
                        })),
                    }).collect())
                }
                _ => Ok(Vec::new()),
            }
        })
    }

    fn get_object_details(&self, config: &ConnectionConfig, object: &DatabaseObject) -> Result<serde_json::Value> {
        Ok(object.metadata.clone().unwrap_or(json!({})))
    }
}

impl Default for SqliteIntrospector {
    fn default() -> Self {
        Self::new()
    }
}
