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

/// Check if query is a DDL/DML statement that should not have LIMIT appended
fn is_non_select_query(query: &str) -> bool {
    let trimmed = query.trim_start().to_uppercase();
    trimmed.starts_with("CREATE ")
        || trimmed.starts_with("ALTER ")
        || trimmed.starts_with("DROP ")
        || trimmed.starts_with("TRUNCATE ")
        || trimmed.starts_with("INSERT ")
        || trimmed.starts_with("UPDATE ")
        || trimmed.starts_with("DELETE ")
        || trimmed.starts_with("SET ")
        || trimmed.starts_with("USE ")
        || trimmed.starts_with("SHOW ")
        || trimmed.starts_with("DESCRIBE ")
        || trimmed.starts_with("DESC ")
        || trimmed.starts_with("EXPLAIN ")
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

        // Check if query already has LIMIT or is a non-SELECT query (DDL/DML)
        let has_limit = query_has_limit(query);
        let skip_limit = is_non_select_query(query);

        // Apply limit only for SELECT-like queries without LIMIT
        let query_with_limit = if has_limit || skip_limit {
            query.to_string()
        } else {
            // Strip trailing semicolons and whitespace before appending LIMIT
            let trimmed_query = query.trim_end_matches(|c: char| c.is_whitespace() || c == ';');
            format!("{} LIMIT {}", trimmed_query, DEFAULT_MAX_ROWS)
        };

        let inner = match pool {
            AnyPool::Postgres(pool) => {
                Self::execute_postgres(pool, &query_with_limit).await?
            }
            AnyPool::MySql(pool) => {
                Self::execute_mysql(pool, &query_with_limit).await?
            }
            AnyPool::Sqlite(pool) => {
                Self::execute_sqlite(pool, &query_with_limit).await?
            }
            AnyPool::ClickHouse(client) => {
                Self::execute_clickhouse(client, &query_with_limit).await?
            }
        };

        let (kind, columns, rows, row_count) = inner;
        let truncated = !has_limit && !skip_limit && row_count >= DEFAULT_MAX_ROWS;
        Ok(QueryResult {
            kind: kind.to_string(),
            columns,
            rows,
            row_count,
            execution_time_ms: start.elapsed().as_millis() as u64,
            truncated,
            has_more: truncated,
            limit_applied: if !has_limit && !skip_limit { Some(DEFAULT_MAX_ROWS) } else { None },
        })
    }

    /// Execute query on PostgreSQL
    async fn execute_postgres(
        pool: &sqlx::PgPool,
        query: &str,
    ) -> Result<(&'static str, Vec<ColumnInfo>, Vec<serde_json::Value>, u64), DatabaseError> {
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

        Ok(("select", columns, rows, row_count))
    }

    /// Execute query on MySQL
    async fn execute_mysql(
        pool: &sqlx::MySqlPool,
        query: &str,
    ) -> Result<(&'static str, Vec<ColumnInfo>, Vec<serde_json::Value>, u64), DatabaseError> {
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

        Ok(("select", columns, rows, row_count))
    }

    /// Execute query on SQLite
    async fn execute_sqlite(
        pool: &sqlx::SqlitePool,
        query: &str,
    ) -> Result<(&'static str, Vec<ColumnInfo>, Vec<serde_json::Value>, u64), DatabaseError> {
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

        Ok(("select", columns, rows, row_count))
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

    /// Execute query on ClickHouse
    async fn execute_clickhouse(
        client: &clickhouse::Client,
        query: &str,
    ) -> Result<(&'static str, Vec<ColumnInfo>, Vec<serde_json::Value>, u64), DatabaseError> {
        let trimmed = query.trim_start().to_uppercase();
        let is_non_select = trimmed.starts_with("CREATE ")
            || trimmed.starts_with("ALTER ")
            || trimmed.starts_with("DROP ")
            || trimmed.starts_with("TRUNCATE ")
            || trimmed.starts_with("INSERT ")
            || trimmed.starts_with("UPDATE ")
            || trimmed.starts_with("DELETE ")
            || trimmed.starts_with("SET ")
            || trimmed.starts_with("USE ");

        if is_non_select {
            // DDL/DML statements don't return rows
            client.query(query)
                .execute()
                .await
                .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
            return Ok(("command", Vec::new(), Vec::new(), 0));
        }

        // Use ClickHouse's `FORMAT JSON` output so we get a typed response with column
        // metadata (`meta`) and a `data` array. We parse generically so any ClickHouse
        // type (UInt64, Float64, DateTime, String, etc.) decodes correctly without
        // requiring type-specific Rust deserializers like `fetch_one::<String>()`,
        // which fails with "UInt64 as String" schema errors.
        let json_query = format!(
            "{} FORMAT JSON",
            query.trim_end_matches(|c: char| c.is_whitespace() || c == ';')
        );

        // `fetch_bytes("JSON")` returns a raw byte stream with no per-column type
        // requirements, so it works for any SELECT result regardless of column types.
        let mut bytes_cursor = client
            .query(&json_query)
            .fetch_bytes("JSON")
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        // Drain the cursor into a single buffer.
        let body = bytes_cursor
            .collect()
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        let text_json = std::str::from_utf8(&body)
            .map_err(|e| DatabaseError::QueryFailed(format!("Non-UTF8 response: {}", e)))?;

        // Response shape:
        //   { "meta": [{"name":"...","type":"UInt64"}, ...],
        //     "data": [[v1, v2, ...], ...],
        //     "rows": N, "statistics": {...} }
        let parsed: serde_json::Value = serde_json::from_str(text_json)
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to parse JSON: {}", e)))?;


        let meta = parsed
            .get("meta")
            .and_then(|m| m.as_array())
            .cloned()
            .unwrap_or_default();

        let columns: Vec<ColumnInfo> = meta
            .iter()
            .filter_map(|m| {
                let name = m.get("name")?.as_str()?.to_string();
                let type_name = m
                    .get("type")
                    .and_then(|t| t.as_str())
                    .map(|s| s.to_string());
                Some(ColumnInfo {
                    name,
                    type_name,
                    nullable: None,
                })
            })
            .collect();

        let data = parsed
            .get("data")
            .and_then(|d| d.as_array())
            .cloned()
            .unwrap_or_default();

        // ClickHouse's `FORMAT JSON` returns each row as either:
        //   - a positional array (some versions/configs):  [v1, v2, ...]
        //   - an object keyed by column name:               { "col1": v1, "col2": v2 }
        // Handle both shapes so we always emit an object row keyed by column name.
        let col_names: Vec<String> = columns.iter().map(|c| c.name.clone()).collect();

        let mut rows: Vec<serde_json::Value> = Vec::with_capacity(data.len());
        for row in &data {
            let obj = if let Some(arr) = row.as_array() {
                // Positional: zip with declared column names
                let mut o = serde_json::Map::new();
                for (i, val) in arr.iter().enumerate() {
                    let key = col_names
                        .get(i)
                        .cloned()
                        .unwrap_or_else(|| format!("col_{}", i));
                    o.insert(key, val.clone());
                }
                serde_json::Value::Object(o)
            } else if let Some(o) = row.as_object() {
                // Object form: pass through
                serde_json::Value::Object(o.clone())
            } else {
                continue;
            };
            rows.push(obj);
        }

        let row_count = rows.len() as u64;
        Ok(("select", columns, rows, row_count))
    }
}
