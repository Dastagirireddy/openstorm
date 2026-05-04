/// PostgreSQL Introspector - retrieves schema metadata from PostgreSQL
///
/// Uses sqlx to query PostgreSQL system catalogs (information_schema, pg_catalog)

use crate::database::{Result, ConnectionConfig, manager::AnyPool};
use super::traits::{DatabaseIntrospector, DatabaseObject, ObjectKind};
use serde_json::json;

pub struct PostgresIntrospector;

impl PostgresIntrospector {
    pub fn new() -> Self {
        Self
    }

    async fn get_schema_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        // Get counts for tables and views
        let table_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.tables
             WHERE table_schema = $1 AND table_type = 'BASE TABLE'"
        )
        .bind(&parent.name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        let view_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.tables
             WHERE table_schema = $1 AND table_type = 'VIEW'"
        )
        .bind(&parent.name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        // Return folder nodes for Tables and Views
        let mut folders = vec![
            DatabaseObject {
                id: format!("tables_folder:{}", parent.name),
                name: "Tables".to_string(),
                kind: ObjectKind::Table,
                icon: "mdi:table-multiple".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "schema": parent.name,
                    "folder": "tables",
                    "count": table_count,
                    "iconColor": "#34D399"
                })),
            },
            DatabaseObject {
                id: format!("views_folder:{}", parent.name),
                name: "Views".to_string(),
                kind: ObjectKind::View,
                icon: "mdi:database-view".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "schema": parent.name,
                    "folder": "views",
                    "count": view_count,
                    "iconColor": "#C084FC"
                })),
            },
        ];

        // Filter out empty folders
        folders.retain(|f| {
            let count = f.metadata.as_ref().and_then(|m| m.get("count")).and_then(|v| v.as_i64()).unwrap_or(0);
            count > 0
        });

        folders
    }

    async fn get_table_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
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
                .fetch_all(pool)
                .await
                .unwrap_or_default();

                return tables.iter().map(|(name, _)| DatabaseObject {
                    id: format!("table:{}.{}", schema_name, name),
                    name: name.clone(),
                    kind: ObjectKind::Table,
                    icon: "bi:table".to_string(),
                    children: None,
                    expanded: false,
                    metadata: Some(json!({
                        "schema": schema_name,
                        "table": name,
                        "iconColor": "#34D399"
                    })),
                }).collect();
            } else if ftype == "views" {
                let views: Vec<(String, String)> = sqlx::query_as(
                    "SELECT table_name, table_type FROM information_schema.tables
                     WHERE table_schema = $1 AND table_type = 'VIEW'
                     ORDER BY table_name"
                )
                .bind(schema_name)
                .fetch_all(pool)
                .await
                .unwrap_or_default();

                return views.iter().map(|(name, _)| DatabaseObject {
                    id: format!("view:{}.{}", schema_name, name),
                    name: name.clone(),
                    kind: ObjectKind::View,
                    icon: "mdi:database-view".to_string(),
                    children: None,
                    expanded: false,
                    metadata: Some(json!({
                        "schema": schema_name,
                        "table": name,
                        "iconColor": "#C084FC"
                    })),
                }).collect();
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

        eprintln!("[PostgresIntrospector] get_table_children - schema: {}, table/view: {}", schema_name, table_name);

        // Get counts for each folder
        let column_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = $1 AND table_name = $2"
        )
        .bind(schema_name)
        .bind(table_name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        let index_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pg_indexes
             WHERE schemaname = $1 AND tablename = $2"
        )
        .bind(schema_name)
        .bind(table_name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        let key_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.table_constraints
             WHERE table_schema = $1 AND table_name = $2
             AND constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')"
        )
        .bind(schema_name)
        .bind(table_name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        eprintln!("[PostgresIntrospector] Counts - columns: {}, indexes: {}, keys: {}", column_count, index_count, key_count);

        // Return folder nodes with counts
        vec![
            DatabaseObject {
                id: format!("columns:{}.{}", schema_name, table_name),
                name: "Columns".to_string(),
                kind: ObjectKind::Column,
                icon: "mdi:format-list-bulleted".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "schema": schema_name,
                    "table": table_name,
                    "folder": "columns",
                    "count": column_count,
                    "iconColor": "#9CA3AF"
                })),
            },
            DatabaseObject {
                id: format!("indexes:{}.{}", schema_name, table_name),
                name: "Indexes".to_string(),
                kind: ObjectKind::Index,
                icon: "oui:index-runtime".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "schema": schema_name,
                    "table": table_name,
                    "folder": "indexes",
                    "count": index_count,
                    "iconColor": "#FBBF24"
                })),
            },
            DatabaseObject {
                id: format!("keys:{}.{}", schema_name, table_name),
                name: "Keys".to_string(),
                kind: ObjectKind::Key,
                icon: "mdi:key-chain".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "schema": schema_name,
                    "table": table_name,
                    "folder": "keys",
                    "count": key_count,
                    "iconColor": "#FBBF24"
                })),
            },
        ]
    }

    async fn get_column_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
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
            return Vec::new();
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
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        columns.iter().map(|(name, dtype, nullable, is_pk)| DatabaseObject {
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
        }).collect()
    }

    async fn get_index_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
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
            .unwrap_or("");

        eprintln!("[PostgresIntrospector] get_index_children - schema: {}, table: {}, folder: {}", schema_name, table_name, folder);

        if folder != "indexes" {
            eprintln!("[PostgresIntrospector] Not an indexes folder, returning empty");
            return Vec::new();
        }

        let indexes: Vec<(String, String, bool, Option<String>)> = match sqlx::query_as(
            "SELECT ci.relname AS indexname, pg_get_indexdef(ix.indexrelid), ix.indisunique,
             (SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
              FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum) as columns
             FROM pg_index ix
             JOIN pg_class ct ON ct.oid = ix.indrelid
             JOIN pg_namespace n ON n.oid = ct.relnamespace
             JOIN pg_class ci ON ci.oid = ix.indexrelid
             WHERE n.nspname = $1 AND ct.relname = $2"
        )
        .bind(schema_name)
        .bind(table_name)
        .fetch_all(pool)
        .await
        {
            Ok(idx) => {
                eprintln!("[PostgresIntrospector] Index query succeeded, got {} indexes", idx.len());
                idx
            }
            Err(e) => {
                eprintln!("[PostgresIntrospector] get_index_children query FAILED: {}", e);
                Vec::new()
            }
        };

        indexes.iter().map(|(name, def, unique, columns)| DatabaseObject {
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
        }).collect()
    }

    async fn get_key_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
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
            .unwrap_or("");

        eprintln!("[PostgresIntrospector] get_key_children - schema: {}, table: {}, folder: {}", schema_name, table_name, folder);

        if folder != "keys" {
            eprintln!("[PostgresIntrospector] Not a keys folder, returning empty");
            return Vec::new();
        }

        // Get all keys with columns and foreign key references
        let keys: Vec<(String, String, Option<String>, Option<String>)> = match sqlx::query_as(
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
        .fetch_all(pool)
        .await
        {
            Ok(k) => {
                eprintln!("[PostgresIntrospector] Key query succeeded, got {} keys", k.len());
                k
            }
            Err(e) => {
                eprintln!("[PostgresIntrospector] get_key_children query FAILED: {}", e);
                Vec::new()
            }
        };

        // Deduplicate and format keys
        let mut seen = std::collections::HashSet::new();
        keys.into_iter()
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
                name: name.clone(),
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
            .collect()
    }
}

impl DatabaseIntrospector for PostgresIntrospector {
    fn get_root_objects(&self, pool: &AnyPool, config: &ConnectionConfig) -> Result<Vec<DatabaseObject>> {
        let connected_db = config.database.as_deref().unwrap_or("postgres");

        let AnyPool::Postgres(pool) = pool else {
            return Err(crate::database::DatabaseError::ConnectionError("Wrong pool type".to_string()));
        };

        eprintln!("[PostgresIntrospector] get_root_objects - connected_db: {}", connected_db);

        let result = tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                // Get schemas in the connected database (skip system schemas)
                let schemas: Vec<(String,)> = sqlx::query_as(
                    "SELECT schema_name FROM information_schema.schemata
                     WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
                     AND schema_name NOT LIKE 'pg_%'
                     ORDER BY schema_name"
                )
                .fetch_all(pool)
                .await
                .unwrap_or_default();

                eprintln!("[PostgresIntrospector] Found {} schemas: {:?}", schemas.len(), schemas);

                // Return schemas directly under the connection (skip database level)
                schemas.iter()
                    .map(|(name,)| DatabaseObject {
                        id: format!("schema:{}", name),
                        name: name.clone(),
                        kind: ObjectKind::Schema,
                        icon: "ic:round-schema".to_string(),
                        children: None,
                        expanded: false,
                        metadata: Some(json!({ "database": connected_db, "schema": name, "iconColor": "#FBBF24" })),
                    })
                    .collect::<Vec<_>>()
            })
        });

        Ok(result)
    }

    fn get_children(&self, pool: &AnyPool, parent: &DatabaseObject) -> Result<Vec<DatabaseObject>> {
        let AnyPool::Postgres(pool) = pool else {
            return Err(crate::database::DatabaseError::ConnectionError("Wrong pool type".to_string()));
        };

        eprintln!("[PostgresIntrospector] get_children - parent.kind: {:?}, parent.name: {}", parent.kind, parent.name);

        let result = tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                match parent.kind {
                    ObjectKind::Schema => self.get_schema_children(pool, parent).await,
                    ObjectKind::Table | ObjectKind::View => self.get_table_children(pool, parent).await,
                    ObjectKind::Column => self.get_column_children(pool, parent).await,
                    ObjectKind::Index => self.get_index_children(pool, parent).await,
                    ObjectKind::Key => self.get_key_children(pool, parent).await,
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

impl Default for PostgresIntrospector {
    fn default() -> Self {
        Self::new()
    }
}
