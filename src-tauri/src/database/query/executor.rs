/// Query execution service
///
/// Executes SQL queries against PostgreSQL, MySQL, and SQLite databases.
/// Enforces a default LIMIT to prevent IDE freezing on large result sets.

use crate::database::{DatabaseError, AnyPool};
use super::types::{QueryResult, ColumnInfo};
use sqlx::{Row, Column, TypeInfo};
use std::time::Instant;

pub struct QueryExecutor;

/// Maximum rows to return by default (safety limit)
const DEFAULT_MAX_ROWS: u64 = 1000;

/// SQL keywords that indicate a LIMIT clause is already present
fn has_limit_clause(query: &str) -> bool {
    let query_upper = query.to_uppercase();
    // Check for LIMIT followed by a number
    query_upper.contains("LIMIT ") || query_upper.contains("LIMIT\n") || query_upper.contains("LIMIT\t")
}

/// Check if query already has LIMIT clause (case-insensitive, handles whitespace)
fn query_has_limit(query: &str) -> bool {
    let normalized = query.replace('\n', " ").replace('\t', " ");
    has_limit_clause(&normalized)
}

impl QueryExecutor {
    /// Execute a query and return results
    /// If query doesn't have LIMIT, applies DEFAULT_MAX_ROWS
    pub async fn execute(pool: &AnyPool, query: &str) -> Result<QueryResult, DatabaseError> {
        let start = Instant::now();

        // Check if query already has LIMIT
        let has_limit = query_has_limit(query);

        // Apply limit if not present
        let query_with_limit = if !has_limit {
            // Strip trailing semicolons and whitespace before appending LIMIT
            let trimmed_query = query.trim_end_matches(|c: char| c.is_whitespace() || c == ';');
            format!("{} LIMIT {}", trimmed_query, DEFAULT_MAX_ROWS)
        } else {
            query.to_string()
        };

        let (columns, rows, row_count) = match pool {
            AnyPool::Postgres(pool) => {
                Self::execute_postgres(pool, &query_with_limit).await?
            }
            AnyPool::MySql(pool) => {
                Self::execute_mysql(pool, &query_with_limit).await?
            }
            AnyPool::Sqlite(pool) => {
                Self::execute_sqlite(pool, &query_with_limit).await?
            }
        };

        Ok(QueryResult {
            columns,
            rows,
            row_count,
            execution_time_ms: start.elapsed().as_millis() as u64,
            truncated: !has_limit && row_count >= DEFAULT_MAX_ROWS,
            has_more: !has_limit && row_count >= DEFAULT_MAX_ROWS,
            limit_applied: if !has_limit { Some(DEFAULT_MAX_ROWS) } else { None },
        })
    }

    /// Execute query on PostgreSQL
    async fn execute_postgres(
        pool: &sqlx::PgPool,
        query: &str,
    ) -> Result<(Vec<ColumnInfo>, Vec<serde_json::Value>, u64), DatabaseError> {
        let rows = sqlx::query(query)
            .fetch_all(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        let row_count = rows.len() as u64;

        let columns = if let Some(first_row) = rows.first() {
            first_row
                .columns()
                .iter()
                .map(|col| ColumnInfo {
                    name: col.name().to_string(),
                    type_name: Some(col.type_info().name().to_string()),
                    nullable: None,
                })
                .collect()
        } else {
            Vec::new()
        };

        let rows: Vec<serde_json::Value> = rows
            .into_iter()
            .map(|row| {
                let mut map = serde_json::Map::new();
                for (i, col) in row.columns().iter().enumerate() {
                    let col_name = col.name();
                    let value = Self::extract_pg_value(&row, i);
                    map.insert(col_name.to_string(), value);
                }
                serde_json::Value::Object(map)
            })
            .collect();

        Ok((columns, rows, row_count))
    }

    /// Execute query on MySQL
    async fn execute_mysql(
        pool: &sqlx::MySqlPool,
        query: &str,
    ) -> Result<(Vec<ColumnInfo>, Vec<serde_json::Value>, u64), DatabaseError> {
        let rows = sqlx::query(query)
            .fetch_all(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        let row_count = rows.len() as u64;

        let columns = if let Some(first_row) = rows.first() {
            first_row
                .columns()
                .iter()
                .map(|col| ColumnInfo {
                    name: col.name().to_string(),
                    type_name: Some(col.type_info().name().to_string()),
                    nullable: None,
                })
                .collect()
        } else {
            Vec::new()
        };

        let rows: Vec<serde_json::Value> = rows
            .into_iter()
            .map(|row| {
                let mut map = serde_json::Map::new();
                for (i, col) in row.columns().iter().enumerate() {
                    let col_name = col.name();
                    let value = Self::extract_mysql_value(&row, i);
                    map.insert(col_name.to_string(), value);
                }
                serde_json::Value::Object(map)
            })
            .collect();

        Ok((columns, rows, row_count))
    }

    /// Execute query on SQLite
    async fn execute_sqlite(
        pool: &sqlx::SqlitePool,
        query: &str,
    ) -> Result<(Vec<ColumnInfo>, Vec<serde_json::Value>, u64), DatabaseError> {
        let rows = sqlx::query(query)
            .fetch_all(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        let row_count = rows.len() as u64;

        let columns = if let Some(first_row) = rows.first() {
            first_row
                .columns()
                .iter()
                .map(|col| ColumnInfo {
                    name: col.name().to_string(),
                    type_name: Some(col.type_info().name().to_string()),
                    nullable: None,
                })
                .collect()
        } else {
            Vec::new()
        };

        let rows: Vec<serde_json::Value> = rows
            .into_iter()
            .map(|row| {
                let mut map = serde_json::Map::new();
                for (i, col) in row.columns().iter().enumerate() {
                    let col_name = col.name();
                    let value = Self::extract_sqlite_value(&row, i);
                    map.insert(col_name.to_string(), value);
                }
                serde_json::Value::Object(map)
            })
            .collect();

        Ok((columns, rows, row_count))
    }

    /// Extract PostgreSQL row value as JSON
    fn extract_pg_value(row: &sqlx::postgres::PgRow, index: usize) -> serde_json::Value {
        // Try to get value as various types
        // Note: Using get_ref for dynamic type access is complex in sqlx
        // We use a simpler approach: try common types in sequence

        // Try string first (most common fallback)
        if let Ok(val) = row.try_get::<String, _>(index) {
            return serde_json::json!(val);
        }

        // Try integer
        if let Ok(val) = row.try_get::<i64, _>(index) {
            return serde_json::json!(val);
        }

        // Try float
        if let Ok(val) = row.try_get::<f64, _>(index) {
            return serde_json::json!(val);
        }

        // Try boolean
        if let Ok(val) = row.try_get::<bool, _>(index) {
            return serde_json::json!(val);
        }

        // Try JSON
        if let Ok(val) = row.try_get::<serde_json::Value, _>(index) {
            return val;
        }

        // Try date/time
        if let Ok(val) = row.try_get::<chrono::NaiveDateTime, _>(index) {
            return serde_json::json!(val.to_string());
        }

        if let Ok(val) = row.try_get::<chrono::NaiveDate, _>(index) {
            return serde_json::json!(val.to_string());
        }

        // Try UUID
        if let Ok(val) = row.try_get::<uuid::Uuid, _>(index) {
            return serde_json::json!(val.to_string());
        }

        // Default to NULL
        serde_json::Value::Null
    }

    /// Extract MySQL row value as JSON
    fn extract_mysql_value(row: &sqlx::mysql::MySqlRow, index: usize) -> serde_json::Value {
        // Try string first (most common fallback)
        if let Ok(val) = row.try_get::<String, _>(index) {
            return serde_json::json!(val);
        }

        // Try integer
        if let Ok(val) = row.try_get::<i64, _>(index) {
            return serde_json::json!(val);
        }

        // Try float
        if let Ok(val) = row.try_get::<f64, _>(index) {
            return serde_json::json!(val);
        }

        // Try boolean
        if let Ok(val) = row.try_get::<bool, _>(index) {
            return serde_json::json!(val);
        }

        // Try JSON
        if let Ok(val) = row.try_get::<serde_json::Value, _>(index) {
            return val;
        }

        // Try date/time
        if let Ok(val) = row.try_get::<chrono::NaiveDateTime, _>(index) {
            return serde_json::json!(val.to_string());
        }

        if let Ok(val) = row.try_get::<chrono::NaiveDate, _>(index) {
            return serde_json::json!(val.to_string());
        }

        // Default to NULL
        serde_json::Value::Null
    }

    /// Extract SQLite row value as JSON
    fn extract_sqlite_value(row: &sqlx::sqlite::SqliteRow, index: usize) -> serde_json::Value {
        // Try string first (most common fallback)
        if let Ok(val) = row.try_get::<String, _>(index) {
            return serde_json::json!(val);
        }

        // Try integer
        if let Ok(val) = row.try_get::<i64, _>(index) {
            return serde_json::json!(val);
        }

        // Try float
        if let Ok(val) = row.try_get::<f64, _>(index) {
            return serde_json::json!(val);
        }

        // Try boolean
        if let Ok(val) = row.try_get::<bool, _>(index) {
            return serde_json::json!(val);
        }

        // Try JSON
        if let Ok(val) = row.try_get::<serde_json::Value, _>(index) {
            return val;
        }

        // Try date/time
        if let Ok(val) = row.try_get::<chrono::NaiveDateTime, _>(index) {
            return serde_json::json!(val.to_string());
        }

        if let Ok(val) = row.try_get::<chrono::NaiveDate, _>(index) {
            return serde_json::json!(val.to_string());
        }

        // Default to NULL
        serde_json::Value::Null
    }
}
