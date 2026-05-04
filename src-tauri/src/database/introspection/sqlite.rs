/// SQLite Introspector - retrieves schema metadata from SQLite
///
/// Uses sqlx to query SQLite system tables (sqlite_master)

use crate::database::{Result, ConnectionConfig, manager::AnyPool};
use super::traits::{DatabaseIntrospector, DatabaseObject, ObjectKind};
use serde_json::json;

pub struct SqliteIntrospector;

impl SqliteIntrospector {
    pub fn new() -> Self {
        Self
    }

    async fn get_table_children(&self, pool: &sqlx::SqlitePool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        // Get columns using PRAGMA table_info
        let pragma = format!("PRAGMA table_info('{}')", parent.name);
        let columns: Vec<(i64, String, String, bool, Option<String>, bool)> = sqlx::query_as(&pragma)
            .fetch_all(pool)
            .await
            .unwrap_or_default();

        eprintln!("[SqliteIntrospector] Found {} columns for table {}: {:?}", columns.len(), parent.name, columns.iter().map(|(_,n,_,_,_,_)| n.as_str()).collect::<Vec<_>>());

        columns.iter().map(|(_, name, dtype, notnull, _, pk)| DatabaseObject {
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
        }).collect()
    }
}

impl DatabaseIntrospector for SqliteIntrospector {
    fn get_root_objects(&self, pool: &AnyPool, _config: &ConnectionConfig) -> Result<Vec<DatabaseObject>> {
        let AnyPool::Sqlite(pool) = pool else {
            return Err(crate::database::DatabaseError::ConnectionError("Wrong pool type".to_string()));
        };

        eprintln!("[SqliteIntrospector] get_root_objects");

        let result = tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                // Get all tables from sqlite_master
                let tables: Vec<(String,)> = sqlx::query_as(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
                )
                .fetch_all(pool)
                .await
                .unwrap_or_default();

                eprintln!("[SqliteIntrospector] Found {} tables: {:?}", tables.len(), tables);

                Ok(tables.iter()
                    .map(|(name,)| DatabaseObject {
                        id: format!("table:{}", name),
                        name: name.clone(),
                        kind: ObjectKind::Table,
                        icon: "mdi:table".to_string(),
                        children: None,
                        expanded: false,
                        metadata: Some(json!({ "name": name })),
                    })
                    .collect::<Vec<_>>())
            })
        });

        result
    }

    fn get_children(&self, pool: &AnyPool, parent: &DatabaseObject) -> Result<Vec<DatabaseObject>> {
        let AnyPool::Sqlite(pool) = pool else {
            return Err(crate::database::DatabaseError::ConnectionError("Wrong pool type".to_string()));
        };

        eprintln!("[SqliteIntrospector] get_children - parent: {}", parent.name);

        let result = tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                match parent.kind {
                    ObjectKind::Table => self.get_table_children(pool, parent).await,
                    _ => Vec::new(),
                }
            })
        });

        Ok(result)
    }

    fn get_object_details(&self, _pool: &AnyPool, object: &DatabaseObject) -> Result<serde_json::Value> {
        Ok(object.metadata.clone().unwrap_or(json!({})))
    }
}

impl Default for SqliteIntrospector {
    fn default() -> Self {
        Self::new()
    }
}
