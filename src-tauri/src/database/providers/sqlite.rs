/// SQLite Provider - handles SQLite file-based connections using sqlx
///
/// SQLite uses a file path instead of host/port authentication.

use std::path::Path;
use crate::database::{Result, ConnectionConfig, DatabaseType};
use super::traits::DatabaseProvider;

pub struct SqliteProvider;

impl SqliteProvider {
    pub fn new() -> Self {
        Self
    }
}

impl DatabaseProvider for SqliteProvider {
    fn db_type(&self) -> DatabaseType {
        DatabaseType::SQLite
    }

    fn test_connection(&self, config: &ConnectionConfig) -> Result<bool> {
        // Get file path from config
        let file_path = config.file_path.as_deref()
            .ok_or_else(|| crate::database::DatabaseError::ConnectionError(
                "No file path provided for SQLite connection".to_string()
            ))?;

        // Check if file exists
        if !Path::new(file_path).exists() {
            return Err(crate::database::DatabaseError::ConnectionError(
                format!("SQLite file not found: {}", file_path)
            ));
        }

        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| crate::database::DatabaseError::ConnectionError(
                format!("Failed to create runtime: {}", e)
            ))?;

        rt.block_on(async {
            // Build SQLite connection URL
            let connection_string = format!("sqlite:{}", file_path);

            match sqlx::SqlitePool::connect(&connection_string).await {
                Ok(pool) => {
                    // Ping to verify connection
                    match sqlx::query("SELECT 1").fetch_optional(&pool).await {
                        Ok(_) => {
                            pool.close().await;
                            Ok(true)
                        }
                        Err(e) => {
                            pool.close().await;
                            Err(crate::database::DatabaseError::ConnectionError(
                                format!("Query failed: {}", e)
                            ))
                        }
                    }
                }
                Err(e) => Err(crate::database::DatabaseError::ConnectionError(
                    format!("Failed to connect: {}", e)
                ))
            }
        })
    }

    fn get_connection_string(&self, config: &ConnectionConfig) -> String {
        config.file_path.as_deref().unwrap_or("memory").to_string()
    }
}

impl Default for SqliteProvider {
    fn default() -> Self {
        Self::new()
    }
}
