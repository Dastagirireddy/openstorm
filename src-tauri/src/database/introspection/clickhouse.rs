/// ClickHouse Introspector - retrieves schema metadata from ClickHouse
///
/// Uses the clickhouse crate to query system catalogs (system.databases, system.tables, system.columns)

use crate::database::{Result, ConnectionConfig, manager::AnyPool};
use super::traits::{DatabaseIntrospector, DatabaseObject, ObjectKind};
use serde_json::json;

/// Helper to create a leaf node (no children)
fn leaf_node(
    id: String,
    name: String,
    kind: ObjectKind,
    icon: String,
    metadata: serde_json::Value,
) -> DatabaseObject {
    DatabaseObject {
        id,
        name,
        kind,
        icon,
        children: None,
        expanded: false,
        has_children: false,
        metadata: Some(metadata),
    }
}

/// Helper to create a folder node (can have children)
fn folder_node(
    id: String,
    name: String,
    kind: ObjectKind,
    icon: String,
    metadata: serde_json::Value,
) -> DatabaseObject {
    DatabaseObject {
        id,
        name,
        kind,
        icon,
        children: Some(vec![]),
        expanded: false,
        has_children: true,
        metadata: Some(metadata),
    }
}

pub struct ClickHouseIntrospector;

impl ClickHouseIntrospector {
    pub fn new() -> Self {
        Self
    }

    /// Get the ClickHouse client from an AnyPool
    fn get_client(pool: &AnyPool) -> Result<&clickhouse::Client> {
        match pool {
            AnyPool::ClickHouse(client) => Ok(client),
            _ => Err(crate::database::DatabaseError::ConnectionError(
                "Wrong pool type - expected ClickHouse".to_string()
            )),
        }
    }

    /// Get database children (Tables, Views folders)
    async fn get_database_children(&self, client: &clickhouse::Client, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let db_name = parent.metadata.as_ref()
            .and_then(|m| m.get("database"))
            .and_then(|v| v.as_str())
            .unwrap_or(&parent.name);

        // Get table counts by engine category
        let table_count: u64 = client
            .query("SELECT count() FROM system.tables WHERE database = ? AND engine NOT IN ('View', 'MaterializedView')")
            .bind(db_name)
            .fetch_one()
            .await
            .unwrap_or(0);

        let view_count: u64 = client
            .query("SELECT count() FROM system.tables WHERE database = ? AND engine = 'View'")
            .bind(db_name)
            .fetch_one()
            .await
            .unwrap_or(0);

        let mv_count: u64 = client
            .query("SELECT count() FROM system.tables WHERE database = ? AND engine = 'MaterializedView'")
            .bind(db_name)
            .fetch_one()
            .await
            .unwrap_or(0);

        let mut folders = vec![];

        if table_count > 0 {
            folders.push(folder_node(
                format!("tables_folder:{}", db_name),
                "Tables".to_string(),
                ObjectKind::Table,
                "mdi:table-multiple".to_string(),
                json!({
                    "database": db_name,
                    "folder": "tables",
                    "count": table_count,
                    "iconColor": "#34D399"
                }),
            ));
        }

        if view_count > 0 {
            folders.push(folder_node(
                format!("views_folder:{}", db_name),
                "Views".to_string(),
                ObjectKind::View,
                "mdi:database-view".to_string(),
                json!({
                    "database": db_name,
                    "folder": "views",
                    "count": view_count,
                    "iconColor": "#C084FC"
                }),
            ));
        }

        if mv_count > 0 {
            folders.push(folder_node(
                format!("mviews_folder:{}", db_name),
                "Materialized Views".to_string(),
                ObjectKind::View,
                "mdi:database-export".to_string(),
                json!({
                    "database": db_name,
                    "folder": "materialized_views",
                    "count": mv_count,
                    "iconColor": "#F472B6"
                }),
            ));
        }

        folders
    }

    /// Get tables in a database
    async fn get_tables_folder_children(&self, client: &clickhouse::Client, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let db_name = parent.metadata.as_ref()
            .and_then(|m| m.get("database"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let rows = client
            .query(
                "SELECT name, engine, partition_key, sorting_key, total_rows, total_bytes_on_disk
                 FROM system.tables
                 WHERE database = ? AND engine NOT IN ('View', 'MaterializedView')
                 ORDER BY name"
            )
            .bind(db_name)
            .fetch_all::<(String, String, String, String, u64, u64)>()
            .await
            .unwrap_or_default();

        rows.into_iter().map(|(name, engine, partition_key, sorting_key, total_rows, total_bytes)| {
            let icon_color = match engine.as_str() {
                "MergeTree" | "ReplacingMergeTree" | "SummingMergeTree" | "AggregatingMergeTree" |
                "CollapsingMergeTree" | "VersionedCollapsingMergeTree" => "#34D399",
                "Log" | "TinyLog" | "StripeLog" => "#60A5FA",
                "Memory" => "#FBBF24",
                "Distributed" => "#A78BFA",
                _ => "#9CA3AF",
            };

            DatabaseObject {
                id: format!("table:{}.{}", db_name, name),
                name: name.clone(),
                kind: ObjectKind::Table,
                icon: "mdi:table".to_string(),
                children: None,
                expanded: false,
                has_children: true,
                metadata: Some(json!({
                    "database": db_name,
                    "table": name,
                    "engine": engine,
                    "partitionKey": partition_key,
                    "sortingKey": sorting_key,
                    "totalRows": total_rows,
                    "totalBytes": total_bytes,
                    "iconColor": icon_color
                })),
            }
        }).collect()
    }

    /// Get views in a database
    async fn get_views_folder_children(&self, client: &clickhouse::Client, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let db_name = parent.metadata.as_ref()
            .and_then(|m| m.get("database"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let rows = client
            .query(
                "SELECT name, engine, as_select
                 FROM system.tables
                 WHERE database = ? AND engine = 'View'
                 ORDER BY name"
            )
            .bind(db_name)
            .fetch_all::<(String, String, String)>()
            .await
            .unwrap_or_default();

        rows.into_iter().map(|(name, engine, as_select)| {
            DatabaseObject {
                id: format!("view:{}.{}", db_name, name),
                name: name.clone(),
                kind: ObjectKind::View,
                icon: "mdi:database-view".to_string(),
                children: None,
                expanded: false,
                has_children: true,
                metadata: Some(json!({
                    "database": db_name,
                    "view": name,
                    "engine": engine,
                    "asSelect": as_select,
                    "iconColor": "#C084FC"
                })),
            }
        }).collect()
    }

    /// Get materialized views in a database
    async fn get_mviews_folder_children(&self, client: &clickhouse::Client, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let db_name = parent.metadata.as_ref()
            .and_then(|m| m.get("database"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let rows = client
            .query(
                "SELECT name, engine, as_select, engine_full
                 FROM system.tables
                 WHERE database = ? AND engine = 'MaterializedView'
                 ORDER BY name"
            )
            .bind(db_name)
            .fetch_all::<(String, String, String, String)>()
            .await
            .unwrap_or_default();

        rows.into_iter().map(|(name, engine, as_select, _engine_full)| {
            DatabaseObject {
                id: format!("mview:{}.{}", db_name, name),
                name: name.clone(),
                kind: ObjectKind::View,
                icon: "mdi:database-export".to_string(),
                children: None,
                expanded: false,
                has_children: true,
                metadata: Some(json!({
                    "database": db_name,
                    "view": name,
                    "engine": engine,
                    "asSelect": as_select,
                    "iconColor": "#F472B6"
                })),
            }
        }).collect()
    }

    /// Get children of a table (Columns folder)
    async fn get_table_children(&self, client: &clickhouse::Client, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let db_name = parent.metadata.as_ref()
            .and_then(|m| m.get("database"))
            .and_then(|v| v.as_str())
            .unwrap_or(&parent.name);
        let table_name = &parent.name;

        let column_count: u64 = client
            .query("SELECT count() FROM system.columns WHERE database = ? AND table = ?")
            .bind(db_name)
            .bind(table_name)
            .fetch_one()
            .await
            .unwrap_or(0);

        vec![
            folder_node(
                format!("columns:{}.{}", db_name, table_name),
                "Columns".to_string(),
                ObjectKind::Column,
                "mdi:format-list-bulleted".to_string(),
                json!({
                    "database": db_name,
                    "table": table_name,
                    "folder": "columns",
                    "count": column_count,
                    "iconColor": "#9CA3AF"
                }),
            ),
        ]
    }

    /// Get columns for a table
    async fn get_column_children(&self, client: &clickhouse::Client, parent: &DatabaseObject) -> Vec<DatabaseObject> {
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

        let rows = client
            .query(
                "SELECT name, type, default_kind, default_expression, comment,
                        is_in_primary_key, is_in_sorting_key, is_in_partition_key
                 FROM system.columns
                 WHERE database = ? AND table = ?
                 ORDER BY position"
            )
            .bind(db_name)
            .bind(table_name)
            .fetch_all::<(String, String, String, String, String, u8, u8, u8)>()
            .await
            .unwrap_or_default();

        rows.into_iter().map(|(name, data_type, default_kind, default_expr, comment, is_pk, is_sort, is_part)| {
            let mut meta = json!({
                "database": db_name,
                "table": table_name,
                "column": name,
                "dataType": data_type,
                "isNullable": data_type.starts_with("Nullable"),
                "isInPrimaryKey": is_pk == 1,
                "isInSortingKey": is_sort == 1,
                "isInPartitionKey": is_part == 1,
                "iconColor": "#64748B"
            });

            if !default_kind.is_empty() {
                meta["defaultKind"] = json!(default_kind);
            }
            if !default_expr.is_empty() {
                meta["defaultExpression"] = json!(default_expr);
            }
            if !comment.is_empty() {
                meta["comment"] = json!(comment);
            }

            leaf_node(
                format!("column:{}.{}.{}", db_name, table_name, name),
                name.clone(),
                ObjectKind::Column,
                "mdi:letter-a".to_string(),
                meta,
            )
        }).collect()
    }
}

impl DatabaseIntrospector for ClickHouseIntrospector {
    fn get_root_objects(&self, pool: &AnyPool, config: &ConnectionConfig) -> Result<Vec<DatabaseObject>> {
        let client = Self::get_client(pool)?;

        let target_db = config.database.as_deref().unwrap_or("default");

        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                // Get all databases except system internals
                let rows = client
                    .query(
                        "SELECT name, engine
                         FROM system.databases
                         WHERE name NOT IN ('system', '_system', 'INFORMATION_SCHEMA', 'information_schema')
                         ORDER BY name"
                    )
                    .fetch_all::<(String, String)>()
                    .await
                    .unwrap_or_default();

                let mut result: Vec<DatabaseObject> = rows.into_iter().map(|(name, engine)| {
                    let is_target = name == target_db;
                    DatabaseObject {
                        id: format!("database:{}", name),
                        name: name.clone(),
                        kind: ObjectKind::Database,
                        icon: "mdi:database".to_string(),
                        children: None,
                        expanded: is_target,
                        has_children: true,
                        metadata: Some(json!({
                            "database": name,
                            "engine": engine,
                            "iconColor": "#FADB14"
                        })),
                    }
                }).collect();

                // If target database not found in system tables, add it anyway
                if !result.iter().any(|r| r.name == target_db) {
                    result.insert(0, DatabaseObject {
                        id: format!("database:{}", target_db),
                        name: target_db.to_string(),
                        kind: ObjectKind::Database,
                        icon: "mdi:database".to_string(),
                        children: None,
                        expanded: true,
                        has_children: true,
                        metadata: Some(json!({
                            "database": target_db,
                            "engine": "Unknown",
                            "iconColor": "#FADB14"
                        })),
                    });
                }

                Ok(result)
            })
        })
    }

    fn get_children(&self, pool: &AnyPool, parent: &DatabaseObject) -> Result<Vec<DatabaseObject>> {
        let client = Self::get_client(pool)?;

        Ok(tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                match parent.kind {
                    ObjectKind::Database => self.get_database_children(client, parent).await,
                    _ => {
                        let folder = parent.metadata.as_ref()
                            .and_then(|m| m.get("folder"))
                            .and_then(|v| v.as_str());
                        match folder {
                            Some("tables") => self.get_tables_folder_children(client, parent).await,
                            Some("views") => self.get_views_folder_children(client, parent).await,
                            Some("materialized_views") => self.get_mviews_folder_children(client, parent).await,
                            _ => {
                                match parent.kind {
                                    ObjectKind::Table | ObjectKind::View => self.get_table_children(client, parent).await,
                                    ObjectKind::Column => self.get_column_children(client, parent).await,
                                    _ => Vec::new(),
                                }
                            }
                        }
                    }
                }
            })
        }))
    }

    fn get_object_details(&self, _pool: &AnyPool, object: &DatabaseObject) -> Result<serde_json::Value> {
        Ok(object.metadata.clone().unwrap_or(json!({})))
    }
}

impl Default for ClickHouseIntrospector {
    fn default() -> Self {
        Self::new()
    }
}
