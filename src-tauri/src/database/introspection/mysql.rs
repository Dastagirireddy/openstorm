/// MySQL Introspector - retrieves schema metadata from MySQL
///
/// Uses sqlx to query MySQL system catalogs (information_schema)

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
        children: Some(vec![]), // Placeholder - will be loaded on expand
        expanded: false,
        has_children: true,
        metadata: Some(metadata),
    }
}

pub struct MySqlIntrospector;

impl MySqlIntrospector {
    pub fn new() -> Self {
        Self
    }

    async fn get_database_children(&self, pool: &sqlx::MySqlPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let db_name = parent.metadata.as_ref()
            .and_then(|m| m.get("database"))
            .and_then(|v| v.as_str())
            .unwrap_or(&parent.name);

        // Get counts for each object type
        let table_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.tables
             WHERE table_schema = ? AND table_type = 'BASE TABLE'"
        )
        .bind(db_name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        let view_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.views
             WHERE table_schema = ?"
        )
        .bind(db_name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        let function_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.routines
             WHERE routine_schema = ? AND routine_type = 'FUNCTION'"
        )
        .bind(db_name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        let procedure_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.routines
             WHERE routine_schema = ? AND routine_type = 'PROCEDURE'"
        )
        .bind(db_name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        // Build folders array
        let mut folders = vec![
            folder_node(
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
            ),
            folder_node(
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
            ),
        ];

        // Add Functions folder if there are functions
        if function_count > 0 {
            folders.push(folder_node(
                format!("functions_folder:{}", db_name),
                "Functions".to_string(),
                ObjectKind::Table,
                "mdi:math-function".to_string(),
                json!({
                    "database": db_name,
                    "folder": "functions",
                    "count": function_count,
                    "iconColor": "#60A5FA"
                }),
            ));
        }

        // Add Procedures folder if there are procedures
        if procedure_count > 0 {
            folders.push(folder_node(
                format!("procedures_folder:{}", db_name),
                "Procedures".to_string(),
                ObjectKind::Table,
                "mdi:code-braces".to_string(),
                json!({
                    "database": db_name,
                    "folder": "procedures",
                    "count": procedure_count,
                    "iconColor": "#A78BFA"
                }),
            ));
        }

        // Filter out empty folders
        folders.retain(|f| {
            let count = f.metadata.as_ref().and_then(|m| m.get("count")).and_then(|v| v.as_i64()).unwrap_or(0);
            count > 0
        });

        folders
    }

    async fn get_tables_folder_children(&self, pool: &sqlx::MySqlPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let db_name = parent.metadata.as_ref()
            .and_then(|m| m.get("database"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let tables: Vec<(String, String)> = sqlx::query_as(
            "SELECT CAST(table_name AS CHAR) AS table_name, CAST(table_type AS CHAR) AS table_type
             FROM information_schema.tables
             WHERE table_schema = ? AND table_type = 'BASE TABLE'
             ORDER BY table_name"
        )
        .bind(db_name)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        tables.iter().map(|(name, _)| DatabaseObject {
            id: format!("table:{}", name),
            name: name.clone(),
            kind: ObjectKind::Table,
            icon: "mdi:table".to_string(),
            children: None,
            expanded: false,
            has_children: true, // Tables have Columns, Indexes, Keys folders
            metadata: Some(json!({
                "database": db_name,
                "table": name,
                "iconColor": "#34D399"
            })),
        }).collect()
    }

    async fn get_views_folder_children(&self, pool: &sqlx::MySqlPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let db_name = parent.metadata.as_ref()
            .and_then(|m| m.get("database"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let views: Vec<(String,)> = sqlx::query_as(
            "SELECT CAST(table_name AS CHAR) AS table_name
             FROM information_schema.views
             WHERE table_schema = ?
             ORDER BY table_name"
        )
        .bind(db_name)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        views.iter().map(|(name,)| DatabaseObject {
            id: format!("view:{}", name),
            name: name.clone(),
            kind: ObjectKind::View,
            icon: "mdi:database-view".to_string(),
            children: None,
            expanded: false,
            has_children: true, // Views have Columns, Indexes, Keys folders
            metadata: Some(json!({
                "database": db_name,
                "view": name,
                "iconColor": "#C084FC"
            })),
        }).collect()
    }

    async fn get_functions_folder_children(&self, pool: &sqlx::MySqlPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let db_name = parent.metadata.as_ref()
            .and_then(|m| m.get("database"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let functions: Vec<(String, String)> = sqlx::query_as(
            "SELECT CAST(routine_name AS CHAR) AS routine_name,
                    COALESCE(CAST(dtd_identifier AS CHAR) AS CHAR), '') as arguments
             FROM information_schema.routines
             WHERE routine_schema = ? AND routine_type = 'FUNCTION'
             ORDER BY routine_name"
        )
        .bind(db_name)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        functions.iter().map(|(name, _)| leaf_node(
            format!("function:{}", name),
            name.clone(),
            ObjectKind::Table,
            "mdi:math-function".to_string(),
            json!({
                "database": db_name,
                "function": name,
                "iconColor": "#60A5FA"
            }),
        )).collect()
    }

    async fn get_procedures_folder_children(&self, pool: &sqlx::MySqlPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let db_name = parent.metadata.as_ref()
            .and_then(|m| m.get("database"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let procedures: Vec<(String,)> = sqlx::query_as(
            "SELECT CAST(routine_name AS CHAR) AS routine_name
             FROM information_schema.routines
             WHERE routine_schema = ? AND routine_type = 'PROCEDURE'
             ORDER BY routine_name"
        )
        .bind(db_name)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        procedures.iter().map(|(name,)| leaf_node(
            format!("procedure:{}", name),
            name.clone(),
            ObjectKind::Table,
            "mdi:code-braces".to_string(),
            json!({
                "database": db_name,
                "procedure": name,
                "iconColor": "#A78BFA"
            }),
        )).collect()
    }

    async fn get_users_folder_children(&self, pool: &sqlx::MySqlPool, _parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let users: Vec<(String, String)> = sqlx::query_as(
            "SELECT CAST(user AS CHAR) AS user, CAST(host AS CHAR) AS host
             FROM mysql.user
             WHERE user NOT LIKE 'mysql.%'
             ORDER BY user, host"
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        users.iter().map(|(user, host)| leaf_node(
            format!("user:{}@{}", user, host),
            format!("{}@{}", user, host),
            ObjectKind::Role,
            "mdi:account".to_string(),
            json!({
                "user": user,
                "host": host,
                "iconColor": "#F472B6"
            }),
        )).collect()
    }

    async fn get_engines_folder_children(&self, pool: &sqlx::MySqlPool, _parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let engines: Vec<(String, String, String)> = sqlx::query_as(
            "SELECT CAST(engine AS CHAR) AS engine,
                    CAST(support AS CHAR) AS support,
                    CAST(comment AS CHAR) AS comment
             FROM information_schema.engines
             WHERE engine != 'MEMORY'
             ORDER BY engine"
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        engines.iter().map(|(name, support, comment)| leaf_node(
            format!("engine:{}", name),
            name.clone(),
            ObjectKind::Engine,
            "mdi:engine".to_string(),
            json!({
                "engine": name,
                "support": support,
                "comment": comment,
                "iconColor": "#FBBF24"
            }),
        )).collect()
    }

    async fn get_plugins_folder_children(&self, pool: &sqlx::MySqlPool, _parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let plugins: Vec<(String, String, String)> = sqlx::query_as(
            "SELECT CAST(plugin_name AS CHAR) AS plugin_name,
                    CAST(plugin_type AS CHAR) AS plugin_type,
                    CAST(plugin_description AS CHAR) AS plugin_description
             FROM information_schema.plugins
             WHERE plugin_status = 'ACTIVE'
             ORDER BY plugin_name"
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        plugins.iter().map(|(name, ptype, desc)| leaf_node(
            format!("plugin:{}", name),
            name.clone(),
            ObjectKind::Plugin,
            "mdi:puzzle".to_string(),
            json!({
                "plugin": name,
                "type": ptype,
                "description": desc,
                "iconColor": "#A78BFA"
            }),
        )).collect()
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
            folder_node(
                format!("indexes:{}.{}", db_name, table_name),
                "Indexes".to_string(),
                ObjectKind::Index,
                "oui:index-runtime".to_string(),
                json!({
                    "database": db_name,
                    "table": table_name,
                    "folder": "indexes",
                    "count": index_count,
                    "iconColor": "#FBBF24"
                }),
            ),
            folder_node(
                format!("keys:{}.{}", db_name, table_name),
                "Keys".to_string(),
                ObjectKind::Key,
                "mdi:key-chain".to_string(),
                json!({
                    "database": db_name,
                    "table": table_name,
                    "folder": "keys",
                    "count": key_count,
                    "iconColor": "#FBBF24"
                }),
            ),
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

        columns.iter().map(|(name, dtype, nullable)| leaf_node(
            format!("column:{}.{}.{}", db_name, table_name, name),
            name.clone(),
            ObjectKind::Column,
            "mdi:letter-a".to_string(),
            json!({
                "database": db_name,
                "table": table_name,
                "column": name,
                "dataType": dtype,
                "isNullable": nullable == "YES",
                "iconColor": "#64748B"
            }),
        )).collect()
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

        indexes.iter().map(|(name, non_unique, columns)| leaf_node(
            format!("index:{}.{}.{}", db_name, table_name, name),
            name.clone(),
            ObjectKind::Index,
            "mdi:database-outline".to_string(),
            json!({
                "database": db_name,
                "table": table_name,
                "indexName": name,
                "isUnique": !non_unique,
                "columns": columns,
                "iconColor": "#F59E0B"
            }),
        )).collect()
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

        keys.into_iter().map(|(name, ctype, columns, ref_table)| leaf_node(
            format!("key:{}:{}.{}.{}", ctype, db_name, table_name, name),
            name.clone(),
            ObjectKind::Key,
            "mdi:key".to_string(),
            json!({
                "database": db_name,
                "table": table_name,
                "keyName": name,
                "constraintType": ctype,
                "columns": columns,
                "referenceTable": ref_table,
                "iconColor": "#F59E0B"
            }),
        )).collect()
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
                // Get server-level objects counts
                let users_count: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM mysql.user WHERE user NOT LIKE 'mysql.%'"
                )
                .fetch_one(pool)
                .await
                .unwrap_or(0);

                let engines_count: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM information_schema.engines WHERE engine != 'MEMORY'"
                )
                .fetch_one(pool)
                .await
                .unwrap_or(0);

                let plugins_count: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM information_schema.plugins WHERE plugin_status = 'ACTIVE'"
                )
                .fetch_one(pool)
                .await
                .unwrap_or(0);

                // Build server objects children
                let mut server_objects_children = vec![];

                if users_count > 0 {
                    server_objects_children.push(folder_node(
                        format!("users_folder:{}", db_name),
                        "Users".to_string(),
                        ObjectKind::Role,
                        "mdi:account-group".to_string(),
                        json!({
                            "folder": "users",
                            "count": users_count,
                            "iconColor": "#F472B6"
                        }),
                    ));
                }

                if engines_count > 0 {
                    server_objects_children.push(folder_node(
                        format!("engines_folder:{}", db_name),
                        "Engines".to_string(),
                        ObjectKind::Engine,
                        "mdi:engine".to_string(),
                        json!({
                            "folder": "engines",
                            "count": engines_count,
                            "iconColor": "#FBBF24"
                        }),
                    ));
                }

                if plugins_count > 0 {
                    server_objects_children.push(folder_node(
                        format!("plugins_folder:{}", db_name),
                        "Plugins".to_string(),
                        ObjectKind::Plugin,
                        "mdi:puzzle".to_string(),
                        json!({
                            "folder": "plugins",
                            "count": plugins_count,
                            "iconColor": "#A78BFA"
                        }),
                    ));
                }

                // Return both Database and Server Objects as siblings
                let mut result = vec![
                    DatabaseObject {
                        id: format!("database:{}", db_name),
                        name: db_name.to_string(),
                        kind: ObjectKind::Database,
                        icon: "mdi:database".to_string(),
                        children: None,
                        expanded: false,
                        has_children: true,
                        metadata: Some(json!({ "database": db_name, "iconColor": "#60A5FA" })),
                    }
                ];

                // Add Server Objects as sibling if it has children
                if !server_objects_children.is_empty() {
                    result.push(DatabaseObject {
                        id: "server_objects".to_string(),
                        name: "Server Objects".to_string(),
                        kind: ObjectKind::Role,
                        icon: "mdi:server".to_string(),
                        children: Some(server_objects_children),
                        expanded: false,
                        has_children: true,
                        metadata: Some(json!({
                            "folder": "server_objects",
                            "iconColor": "#9CA3AF"
                        })),
                    });
                }

                Ok(result)
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
                    ObjectKind::Database => self.get_database_children(pool, parent).await,
                    // Handle folder types via metadata
                    _ => {
                        let folder = parent.metadata.as_ref()
                            .and_then(|m| m.get("folder"))
                            .and_then(|v| v.as_str());
                        match folder {
                            Some("server_objects") => {
                                eprintln!("[MySqlIntrospector] get_children - returning server_objects pre-populated children");
                                return parent.children.clone().unwrap_or_default();
                            }
                            Some("users") => {
                                eprintln!("[MySqlIntrospector] get_children - calling get_users_folder_children");
                                return self.get_users_folder_children(pool, parent).await;
                            }
                            Some("engines") => {
                                eprintln!("[MySqlIntrospector] get_children - calling get_engines_folder_children");
                                return self.get_engines_folder_children(pool, parent).await;
                            }
                            Some("plugins") => {
                                eprintln!("[MySqlIntrospector] get_children - calling get_plugins_folder_children");
                                return self.get_plugins_folder_children(pool, parent).await;
                            }
                            Some("tables") => self.get_tables_folder_children(pool, parent).await,
                            Some("views") => self.get_views_folder_children(pool, parent).await,
                            Some("functions") => self.get_functions_folder_children(pool, parent).await,
                            Some("procedures") => self.get_procedures_folder_children(pool, parent).await,
                            _ => {
                                match parent.kind {
                                    ObjectKind::Table | ObjectKind::View => self.get_table_children(pool, parent).await,
                                    ObjectKind::Column => self.get_column_children(pool, parent).await,
                                    ObjectKind::Index => self.get_index_children(pool, parent).await,
                                    ObjectKind::Key => self.get_key_children(pool, parent).await,
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

impl Default for MySqlIntrospector {
    fn default() -> Self {
        Self::new()
    }
}
