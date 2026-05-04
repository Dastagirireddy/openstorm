/// MySQL Introspector - retrieves schema metadata from MySQL
///
/// Uses sqlx to query MySQL system catalogs (information_schema)

use crate::database::{Result, ConnectionConfig, manager::AnyPool};
use super::traits::{DatabaseIntrospector, DatabaseObject, ObjectKind};
use serde_json::json;

pub struct MySqlIntrospector;

impl MySqlIntrospector {
    pub fn new() -> Self {
        Self
    }

    async fn get_table_children(&self, pool: &sqlx::MySqlPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let db_name = parent.metadata.as_ref()
            .and_then(|m| m.get("database"))
            .and_then(|v| v.as_str())
            .unwrap_or(&parent.name);
        let table_name = &parent.name;

        eprintln!("[MySqlIntrospector] get_table_children - database: {}, table: {}", db_name, table_name);

        // Get counts for each folder
        let column_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = ? AND table_name = ?"
        )
        .bind(db_name)
        .bind(table_name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        let index_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.statistics
             WHERE table_schema = ? AND table_name = ?"
        )
        .bind(db_name)
        .bind(table_name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        let key_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.table_constraints
             WHERE table_schema = ? AND table_name = ?
             AND constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')"
        )
        .bind(db_name)
        .bind(table_name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        // Return folder nodes with counts (matching PostgreSQL structure)
        vec![
            DatabaseObject {
                id: format!("columns:{}.{}", db_name, table_name),
                name: "Columns".to_string(),
                kind: ObjectKind::Column,
                icon: "mdi:format-list-bulleted".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "database": db_name,
                    "table": table_name,
                    "folder": "columns",
                    "count": column_count,
                    "iconColor": "#9CA3AF"
                })),
            },
            DatabaseObject {
                id: format!("indexes:{}.{}", db_name, table_name),
                name: "Indexes".to_string(),
                kind: ObjectKind::Index,
                icon: "oui:index-runtime".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "database": db_name,
                    "table": table_name,
                    "folder": "indexes",
                    "count": index_count,
                    "iconColor": "#FBBF24"
                })),
            },
            DatabaseObject {
                id: format!("keys:{}.{}", db_name, table_name),
                name: "Keys".to_string(),
                kind: ObjectKind::Key,
                icon: "mdi:key-chain".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "database": db_name,
                    "table": table_name,
                    "folder": "keys",
                    "count": key_count,
                    "iconColor": "#FBBF24"
                })),
            },
        ]
    }

    async fn get_column_children(&self, pool: &sqlx::MySqlPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let db_name = parent.metadata.as_ref()
            .and_then(|m| m.get("database"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let table_name = parent.metadata.as_ref()
            .and_then(|m| m.get("table"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let folder = parent.metadata.as_ref()
            .and_then(|m| m.get("folder"))
            .and_then(|v| v.as_str())
            .unwrap_or("columns");

        if folder != "columns" {
            return Vec::new();
        }

        let columns: Vec<(String, String, String)> = match sqlx::query_as(
            "SELECT column_name, CAST(data_type AS CHAR) AS data_type, CAST(is_nullable AS CHAR) AS is_nullable
             FROM information_schema.columns
             WHERE table_schema = ? AND table_name = ?
             ORDER BY ordinal_position"
        )
        .bind(db_name)
        .bind(table_name)
        .fetch_all(pool)
        .await
        {
            Ok(cols) => cols,
            Err(e) => {
                eprintln!("[MySqlIntrospector] get_column_children query FAILED: {}", e);
                Vec::new()
            }
        };

        columns.iter().map(|(name, dtype, nullable)| DatabaseObject {
            id: format!("column:{}.{}.{}", db_name, table_name, name),
            name: name.clone(),
            kind: ObjectKind::Column,
            icon: "mdi:letter-a".to_string(),
            children: None,
            expanded: false,
            metadata: Some(json!({
                "database": db_name,
                "table": table_name,
                "column": name,
                "dataType": dtype,
                "isNullable": nullable == "YES",
                "iconColor": "#64748B"
            })),
        }).collect()
    }

    async fn get_index_children(&self, pool: &sqlx::MySqlPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let db_name = parent.metadata.as_ref()
            .and_then(|m| m.get("database"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let table_name = parent.metadata.as_ref()
            .and_then(|m| m.get("table"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let indexes: Vec<(String, bool, String)> = sqlx::query_as(
            "SELECT index_name, non_unique, GROUP_CONCAT(column_name ORDER BY seq_in_index) as columns
             FROM information_schema.statistics
             WHERE table_schema = ? AND table_name = ?
             GROUP BY index_name, non_unique"
        )
        .bind(db_name)
        .bind(table_name)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        indexes.iter().map(|(name, non_unique, columns)| DatabaseObject {
            id: format!("index:{}.{}.{}", db_name, table_name, name),
            name: name.clone(),
            kind: ObjectKind::Index,
            icon: "mdi:database-outline".to_string(),
            children: None,
            expanded: false,
            metadata: Some(json!({
                "database": db_name,
                "table": table_name,
                "indexName": name,
                "isUnique": !non_unique,
                "columns": columns,
                "iconColor": "#F59E0B"
            })),
        }).collect()
    }

    async fn get_key_children(&self, pool: &sqlx::MySqlPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let db_name = parent.metadata.as_ref()
            .and_then(|m| m.get("database"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let table_name = parent.metadata.as_ref()
            .and_then(|m| m.get("table"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let folder = parent.metadata.as_ref()
            .and_then(|m| m.get("folder"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        eprintln!("[MySqlIntrospector] get_key_children - database: {}, table: {}, folder: {}", db_name, table_name, folder);
        eprintln!("[MySqlIntrospector] parent.metadata: {:?}", parent.metadata);

        if folder != "keys" {
            eprintln!("[MySqlIntrospector] Not a keys folder, returning empty");
            return Vec::new();
        }

        let keys: Vec<(String, String, String, Option<String>)> = match sqlx::query_as(
            "SELECT kcu.constraint_name, CAST(tc.constraint_type AS CHAR) AS constraint_type,
                    GROUP_CONCAT(kcu.column_name ORDER BY kcu.ordinal_position) as columns,
                    CAST(kcu.referenced_table_name AS CHAR) as ref_table
             FROM information_schema.key_column_usage kcu
             JOIN information_schema.table_constraints tc
               ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
             WHERE kcu.table_schema = ? AND kcu.table_name = ?
             AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
             GROUP BY kcu.constraint_name, tc.constraint_type, kcu.referenced_table_name"
        )
        .bind(db_name)
        .bind(table_name)
        .fetch_all(pool)
        .await
        {
            Ok(keys) => {
                eprintln!("[MySqlIntrospector] Query succeeded, got {} keys", keys.len());
                keys
            }
            Err(e) => {
                eprintln!("[MySqlIntrospector] get_key_children query FAILED: {}", e);
                Vec::new()
            }
        };

        keys.into_iter().map(|(name, ctype, columns, ref_table)| DatabaseObject {
            id: format!("key:{}:{}.{}.{}", ctype, db_name, table_name, name),
            name: name.clone(),
            kind: ObjectKind::Key,
            icon: "mdi:key".to_string(),
            children: None,
            expanded: false,
            metadata: Some(json!({
                "database": db_name,
                "table": table_name,
                "keyName": name,
                "constraintType": ctype,
                "columns": columns,
                "referenceTable": ref_table,
                "iconColor": "#F59E0B"
            })),
        }).collect()
    }
}

impl DatabaseIntrospector for MySqlIntrospector {
    fn get_root_objects(&self, pool: &AnyPool, config: &ConnectionConfig) -> Result<Vec<DatabaseObject>> {
        let AnyPool::MySql(pool) = pool else {
            return Err(crate::database::DatabaseError::ConnectionError("Wrong pool type".to_string()));
        };

        let db_name = config.database.as_deref().unwrap_or("mysql");
        eprintln!("[MySqlIntrospector] get_root_objects - database: {}", db_name);

        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                // Get tables directly from the connected database (skip database list)
                eprintln!("[MySqlIntrospector] Querying tables for schema: {}", db_name);
                let tables: Vec<(String, String)> = sqlx::query_as(
                    "SELECT CAST(table_name AS CHAR) AS table_name, CAST(table_type AS CHAR) AS table_type FROM information_schema.tables
                     WHERE table_schema = ? AND table_type = 'BASE TABLE'
                     ORDER BY table_name"
                )
                .bind(db_name)
                .fetch_all(pool)
                .await
                .map_err(|e| {
                    eprintln!("[MySqlIntrospector] Query failed: {}", e);
                    crate::database::DatabaseError::ConnectionError(format!("Failed to query tables: {}", e))
                })?;

                eprintln!("[MySqlIntrospector] Found {} tables: {:?}", tables.len(), tables.iter().map(|(n, _)| n.as_str()).collect::<Vec<_>>());

                Ok(tables.iter()
                    .map(|(name, _)| DatabaseObject {
                        id: format!("table:{}", name),
                        name: name.clone(),
                        kind: ObjectKind::Table,
                        icon: "mdi:table".to_string(),
                        children: None,
                        expanded: false,
                        metadata: Some(json!({ "database": db_name, "table": name })),
                    })
                    .collect())
            })
        })
    }

    fn get_children(&self, pool: &AnyPool, parent: &DatabaseObject) -> Result<Vec<DatabaseObject>> {
        let AnyPool::MySql(pool) = pool else {
            return Err(crate::database::DatabaseError::ConnectionError("Wrong pool type".to_string()));
        };

        eprintln!("[MySqlIntrospector] get_children - parent.kind: {:?}, parent.name: {}", parent.kind, parent.name);

        Ok(tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                match parent.kind {
                    ObjectKind::Table | ObjectKind::View => self.get_table_children(pool, parent).await,
                    ObjectKind::Column => self.get_column_children(pool, parent).await,
                    ObjectKind::Index => self.get_index_children(pool, parent).await,
                    ObjectKind::Key => self.get_key_children(pool, parent).await,
                    _ => Vec::new(),
                }
            })
        }))
    }

    fn get_object_details(&self, _pool: &AnyPool, object: &DatabaseObject) -> Result<serde_json::Value> {
        Ok(object.metadata.clone().unwrap_or(json!({})))
    }
}

impl Default for MySqlIntrospector {
    fn default() -> Self {
        Self::new()
    }
}
