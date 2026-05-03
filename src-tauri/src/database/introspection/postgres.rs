/// PostgreSQL Introspector - retrieves schema metadata from PostgreSQL
///
/// Uses sqlx to query PostgreSQL system catalogs (information_schema, pg_catalog)

use crate::database::{Result, ConnectionConfig, DatabaseError};
use super::traits::{DatabaseIntrospector, DatabaseObject, ObjectKind};
use serde_json::json;

pub struct PostgresIntrospector;

impl PostgresIntrospector {
    pub fn new() -> Self {
        Self
    }

    fn get_connection_string(config: &ConnectionConfig) -> String {
        let auth = if !config.username.is_empty() {
            if let Some(password) = &config.password {
                if !password.is_empty() {
                    format!("{}:{}@", config.username, password)
                } else {
                    format!("{}@", config.username)
                }
            } else {
                format!("{}@", config.username)
            }
        } else {
            String::new()
        };

        let host = if config.host.is_empty() { "localhost" } else { &config.host };
        let port = if config.port > 0 { format!(":{}", config.port) } else { String::from(":5432") };
        let dbname = config.database.as_deref().unwrap_or("postgres");

        format!("postgresql://{}{}{}/{}", auth, host, port, dbname)
    }
}

impl DatabaseIntrospector for PostgresIntrospector {
    fn get_root_objects(&self, config: &ConnectionConfig) -> Result<Vec<DatabaseObject>> {
        let connection_string = Self::get_connection_string(config);
        let connected_db = config.database.as_deref().unwrap_or("postgres");

        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| DatabaseError::ConnectionError(format!("Failed to create runtime: {}", e)))?;

        rt.block_on(async {
            let pool = sqlx::PgPool::connect(&connection_string).await
                .map_err(|e| {
                    DatabaseError::ConnectionError(format!("Failed to connect: {}", e))
                })?;

            // Get schemas in the connected database (skip system schemas)
            let schemas: Vec<(String,)> = sqlx::query_as(
                "SELECT schema_name FROM information_schema.schemata
                 WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
                 AND schema_name NOT LIKE 'pg_%'
                 ORDER BY schema_name"
            )
            .fetch_all(&pool)
            .await
            .unwrap_or_default();

            pool.close().await;

            // Return schemas directly under the connection (skip database level)
            let objects: Vec<DatabaseObject> = schemas.iter()
                .map(|(name,)| DatabaseObject {
                    id: format!("schema:{}", name),
                    name: name.clone(),
                    kind: ObjectKind::Schema,
                    icon: "mdi:folder".to_string(),
                    children: None,
                    expanded: false,
                    metadata: Some(json!({ "database": connected_db, "schema": name, "iconColor": "#F59E0B" })),
                })
                .collect();

            Ok(objects)
        })
    }

    fn get_children(&self, config: &ConnectionConfig, parent: &DatabaseObject) -> Result<Vec<DatabaseObject>> {
        let connection_string = Self::get_connection_string(config);

        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| DatabaseError::ConnectionError(format!("Failed to create runtime: {}", e)))?;

        rt.block_on(async {
            let pool = sqlx::PgPool::connect(&connection_string).await
                .map_err(|e| {
                    DatabaseError::ConnectionError(format!("Failed to connect: {}", e))
                })?;

            match parent.kind {
                ObjectKind::Database => {
                    // Get schemas in the database (legacy - should not be used anymore)
                    let schemas: Vec<(String,)> = sqlx::query_as(
                        "SELECT schema_name FROM information_schema.schemata
                         WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
                         ORDER BY schema_name"
                    )
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default();

                    pool.close().await;

                    Ok(schemas.iter().map(|(name,)| DatabaseObject {
                        id: format!("schema:{}", name),
                        name: name.clone(),
                        kind: ObjectKind::Schema,
                        icon: "mdi:folder-outline".to_string(),
                        children: None,
                        expanded: false,
                        metadata: Some(json!({ "database": parent.name, "schema": name })),
                    }).collect())
                }
                ObjectKind::Schema => {
                    // Get counts for tables and views
                    let table_count: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*) FROM information_schema.tables
                         WHERE table_schema = $1 AND table_type = 'BASE TABLE'"
                    )
                    .bind(&parent.name)
                    .fetch_one(&pool)
                    .await
                    .unwrap_or(0);

                    let view_count: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*) FROM information_schema.tables
                         WHERE table_schema = $1 AND table_type = 'VIEW'"
                    )
                    .bind(&parent.name)
                    .fetch_one(&pool)
                    .await
                    .unwrap_or(0);

                    pool.close().await;

                    // Return folder nodes for Tables and Views
                    let mut folders = vec![
                        DatabaseObject {
                            id: format!("tables_folder:{}", parent.name),
                            name: "Tables".to_string(),
                            kind: ObjectKind::Table,
                            icon: "mdi:folder-outline".to_string(),
                            children: None,
                            expanded: false,
                            metadata: Some(json!({
                                "schema": parent.name,
                                "folder": "tables",
                                "count": table_count,
                                "iconColor": "#10B981"
                            })),
                        },
                        DatabaseObject {
                            id: format!("views_folder:{}", parent.name),
                            name: "Views".to_string(),
                            kind: ObjectKind::View,
                            icon: "mdi:folder-outline".to_string(),
                            children: None,
                            expanded: false,
                            metadata: Some(json!({
                                "schema": parent.name,
                                "folder": "views",
                                "count": view_count,
                                "iconColor": "#A855F7"
                            })),
                        },
                    ];

                    // Filter out empty folders
                    folders.retain(|f| {
                        let count = f.metadata.as_ref().and_then(|m| m.get("count")).and_then(|v| v.as_i64()).unwrap_or(0);
                        count > 0
                    });

                    Ok(folders)
                }
                ObjectKind::Table | ObjectKind::View => {
                    // Check if this is a "Tables" or "Views" folder
                    let folder_type = parent.metadata.as_ref()
                        .and_then(|m| m.get("folder"))
                        .and_then(|v| v.as_str());

                    if let Some(ftype) = folder_type {
                        let schema_name = parent.metadata.as_ref()
                            .and_then(|m| m.get("schema"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("public");

                        if ftype == "tables" {
                            let tables: Vec<(String, String)> = sqlx::query_as(
                                "SELECT table_name, table_type FROM information_schema.tables
                                 WHERE table_schema = $1 AND table_type = 'BASE TABLE'
                                 ORDER BY table_name"
                            )
                            .bind(schema_name)
                            .fetch_all(&pool)
                            .await
                            .unwrap_or_default();

                            pool.close().await;

                            return Ok(tables.iter().map(|(name, _)| DatabaseObject {
                                id: format!("table:{}.{}", schema_name, name),
                                name: name.clone(),
                                kind: ObjectKind::Table,
                                icon: "mdi:table".to_string(),
                                children: None,
                                expanded: false,
                                metadata: Some(json!({
                                    "schema": schema_name,
                                    "table": name,
                                    "iconColor": "#10B981"
                                })),
                            }).collect());
                        } else if ftype == "views" {
                            let views: Vec<(String, String)> = sqlx::query_as(
                                "SELECT table_name, table_type FROM information_schema.tables
                                 WHERE table_schema = $1 AND table_type = 'VIEW'
                                 ORDER BY table_name"
                            )
                            .bind(schema_name)
                            .fetch_all(&pool)
                            .await
                            .unwrap_or_default();

                            pool.close().await;

                            return Ok(views.iter().map(|(name, _)| DatabaseObject {
                                id: format!("view:{}.{}", schema_name, name),
                                name: name.clone(),
                                kind: ObjectKind::View,
                                icon: "mdi:eye".to_string(),
                                children: None,
                                expanded: false,
                                metadata: Some(json!({
                                    "schema": schema_name,
                                    "table": name,
                                    "iconColor": "#A855F7"
                                })),
                            }).collect());
                        }
                    }

                    // Return folder structure: Columns, Indexes, Keys with counts for actual tables/views
                    let schema_name = parent.metadata.as_ref()
                        .and_then(|m| m.get("schema"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("public");
                    let table_name = parent.metadata.as_ref()
                        .and_then(|m| m.get("table"))
                        .and_then(|v| v.as_str())
                        .unwrap_or(&parent.name);

                    // Get counts for each folder
                    let column_count: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*) FROM information_schema.columns
                         WHERE table_schema = $1 AND table_name = $2"
                    )
                    .bind(schema_name)
                    .bind(table_name)
                    .fetch_one(&pool)
                    .await
                    .unwrap_or(0);

                    let index_count: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*) FROM pg_indexes
                         WHERE schemaname = $1 AND tablename = $2"
                    )
                    .bind(schema_name)
                    .bind(table_name)
                    .fetch_one(&pool)
                    .await
                    .unwrap_or(0);

                    let key_count: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*) FROM information_schema.table_constraints
                         WHERE table_schema = $1 AND table_name = $2
                         AND constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')"
                    )
                    .bind(schema_name)
                    .bind(table_name)
                    .fetch_one(&pool)
                    .await
                    .unwrap_or(0);

                    pool.close().await;

                    // Return folder nodes with counts
                    Ok(vec![
                        DatabaseObject {
                            id: format!("columns:{}.{}", schema_name, table_name),
                            name: "Columns".to_string(),
                            kind: ObjectKind::Column,
                            icon: "mdi:folder-outline".to_string(),
                            children: None,
                            expanded: false,
                            metadata: Some(json!({
                                "schema": schema_name,
                                "table": table_name,
                                "folder": "columns",
                                "count": column_count,
                                "iconColor": "#64748B"
                            })),
                        },
                        DatabaseObject {
                            id: format!("indexes:{}.{}", schema_name, table_name),
                            name: "Indexes".to_string(),
                            kind: ObjectKind::Index,
                            icon: "mdi:folder-outline".to_string(),
                            children: None,
                            expanded: false,
                            metadata: Some(json!({
                                "schema": schema_name,
                                "table": table_name,
                                "folder": "indexes",
                                "count": index_count,
                                "iconColor": "#F59E0B"
                            })),
                        },
                        DatabaseObject {
                            id: format!("keys:{}.{}", schema_name, table_name),
                            name: "Keys".to_string(),
                            kind: ObjectKind::Key,
                            icon: "mdi:folder-outline".to_string(),
                            children: None,
                            expanded: false,
                            metadata: Some(json!({
                                "schema": schema_name,
                                "table": table_name,
                                "folder": "keys",
                                "count": key_count,
                                "iconColor": "#F59E0B"
                            })),
                        },
                    ])
                }
                ObjectKind::Column => {
                    // Load actual columns from a "Columns" folder
                    let schema_name = parent.metadata.as_ref()
                        .and_then(|m| m.get("schema"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("public");
                    let table_name = parent.metadata.as_ref()
                        .and_then(|m| m.get("table"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let folder = parent.metadata.as_ref()
                        .and_then(|m| m.get("folder"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("columns");

                    if folder != "columns" {
                        return Ok(Vec::new());
                    }

                    // Get columns
                    let columns: Vec<(String, String, String, bool)> = sqlx::query_as(
                        "SELECT column_name, data_type, is_nullable,
                         EXISTS(SELECT 1 FROM information_schema.key_column_usage ku
                               WHERE ku.table_schema = columns.table_schema
                               AND ku.table_name = columns.table_name
                               AND ku.column_name = columns.column_name) as is_pk
                         FROM information_schema.columns columns
                         WHERE table_schema = $1 AND table_name = $2
                         ORDER BY ordinal_position"
                    )
                    .bind(schema_name)
                    .bind(table_name)
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default();

                    pool.close().await;

                    Ok(columns.iter().map(|(name, dtype, nullable, is_pk)| DatabaseObject {
                        id: format!("column:{}.{}.{}", schema_name, table_name, name),
                        name: name.clone(),
                        kind: ObjectKind::Column,
                        icon: "mdi:letter-a".to_string(),
                        children: None,
                        expanded: false,
                        metadata: Some(json!({
                            "schema": schema_name,
                            "table": table_name,
                            "column": name,
                            "dataType": dtype,
                            "isNullable": nullable == "YES",
                            "isPrimaryKey": is_pk,
                            "iconColor": "#64748B"
                        })),
                    }).collect())
                }
                ObjectKind::Index => {
                    // Load indexes with columns
                    let schema_name = parent.metadata.as_ref()
                        .and_then(|m| m.get("schema"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("public");
                    let table_name = parent.metadata.as_ref()
                        .and_then(|m| m.get("table"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    let indexes: Vec<(String, String, bool, Option<String>)> = sqlx::query_as(
                        "SELECT i.indexname, pg_get_indexdef(i.indexrelid), ix.indisunique,
                         (SELECT string_agg(a.attname, ', ')
                          FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
                          JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum) as columns
                         FROM pg_index ix
                         JOIN pg_class c ON c.oid = ix.indrelid
                         JOIN pg_namespace n ON n.oid = c.relnamespace
                         JOIN pg_i i ON i.indexrelid = ix.indexrelid
                         WHERE n.nspname = $1 AND c.relname = $2"
                    )
                    .bind(schema_name)
                    .bind(table_name)
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default();

                    pool.close().await;

                    Ok(indexes.iter().map(|(name, def, unique, columns)| DatabaseObject {
                        id: format!("index:{}.{}.{}", schema_name, table_name, name),
                        name: name.clone(),
                        kind: ObjectKind::Index,
                        icon: "mdi:database-outline".to_string(),
                        children: None,
                        expanded: false,
                        metadata: Some(json!({
                            "schema": schema_name,
                            "table": table_name,
                            "indexName": name,
                            "definition": def,
                            "isUnique": unique,
                            "columns": columns,
                            "iconColor": "#F59E0B"
                        })),
                    }).collect())
                }
                ObjectKind::Key => {
                    // Load keys (primary and foreign) with columns and references
                    let schema_name = parent.metadata.as_ref()
                        .and_then(|m| m.get("schema"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("public");
                    let table_name = parent.metadata.as_ref()
                        .and_then(|m| m.get("table"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    // Get all keys with columns and foreign key references
                    let keys: Vec<(String, String, Option<String>, Option<String>)> = sqlx::query_as(
                        "SELECT kcu.column_name, tc.constraint_type,
                                string_agg(kcu.column_name, ', ') OVER (PARTITION BY tc.constraint_name) as columns,
                                ccu.table_name as ref_table
                         FROM information_schema.table_constraints tc
                         JOIN information_schema.key_column_usage kcu
                           ON tc.constraint_name = kcu.constraint_name
                          AND tc.table_schema = kcu.table_schema
                         LEFT JOIN information_schema.constraint_column_usage ccu
                           ON ccu.constraint_name = tc.constraint_name
                         WHERE tc.table_schema = $1 AND tc.table_name = $2
                         AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
                         ORDER BY tc.constraint_type, tc.constraint_name, kcu.ordinal_position"
                    )
                    .bind(schema_name)
                    .bind(table_name)
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default();

                    pool.close().await;

                    // Deduplicate and format keys
                    let mut seen = std::collections::HashSet::new();
                    Ok(keys.into_iter()
                        .filter(|(name, ctype, _, _)| {
                            let key = format!("{}:{}", ctype, name);
                            if seen.contains(&key) {
                                false
                            } else {
                                seen.insert(key);
                                true
                            }
                        })
                        .map(|(name, ctype, columns, ref_table)| DatabaseObject {
                            id: format!("key:{}:{}.{}.{}", ctype, schema_name, table_name, name),
                            name: format!("{} ({})", name, ctype),
                            kind: ObjectKind::Key,
                            icon: "mdi:key".to_string(),
                            children: None,
                            expanded: false,
                            metadata: Some(json!({
                                "schema": schema_name,
                                "table": table_name,
                                "keyName": name,
                                "constraintType": ctype,
                                "columns": columns,
                                "referenceTable": ref_table,
                                "iconColor": "#F59E0B"
                            })),
                        })
                        .collect())
                }
                _ => Ok(Vec::new()),
            }
        })
    }

    fn get_object_details(&self, config: &ConnectionConfig, object: &DatabaseObject) -> Result<serde_json::Value> {
        // Return the metadata as details
        Ok(object.metadata.clone().unwrap_or(json!({})))
    }
}

impl Default for PostgresIntrospector {
    fn default() -> Self {
        Self::new()
    }
}
