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

    async fn get_database_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let db_name = &parent.name;

        // Get counts for Database Objects categories
        let access_methods_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pg_am"
        )
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        let casts_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pg_cast"
        )
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        let extensions_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pg_extension"
        )
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        let languages_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pg_language WHERE lanname NOT IN ('internal', 'c', 'sql', 'plpgsql')"
        )
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        let _views_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pg_views WHERE schemaname NOT IN ('pg_catalog', 'information_schema')"
        )
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        // Count for Virtual Views (system catalog monitoring views)
        let virtual_views_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pg_class c
             JOIN pg_namespace n ON c.relnamespace = n.oid
             WHERE c.relkind = 'v'
               AND n.nspname = 'pg_catalog'
               AND (relname LIKE 'pg_stat_%'
                    OR relname LIKE 'pg_locks%'
                    OR relname LIKE 'pg_settings%'
                    OR relname LIKE 'pg_roles%'
                    OR relname LIKE 'pg_database%'
                    OR relname LIKE 'pg_tablespace%')"
        )
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        // Get schemas count
        let schemas_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.schemata
             WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
             AND schema_name NOT LIKE 'pg_%'"
        )
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        // Build Database Objects folder
        let mut db_objects_children = vec![];

        // Access Methods
        if access_methods_count > 0 {
            db_objects_children.push(DatabaseObject {
                id: format!("access_methods_folder:{}", db_name),
                name: "Access Methods".to_string(),
                kind: ObjectKind::Table,
                icon: "mdi:tree".to_string(),
                children: Some(vec![]), // Placeholder - will be loaded on expand
                expanded: false,
                metadata: Some(json!({
                    "database": db_name,
                    "folder": "access_methods",
                    "count": access_methods_count,
                    "iconColor": "#FBBF24"
                })),
            });
        }

        // Casts
        if casts_count > 0 {
            db_objects_children.push(DatabaseObject {
                id: format!("casts_folder:{}", db_name),
                name: "Casts".to_string(),
                kind: ObjectKind::Table,
                icon: "mdi:swap-horizontal".to_string(),
                children: Some(vec![]), // Placeholder - will be loaded on expand
                expanded: false,
                metadata: Some(json!({
                    "database": db_name,
                    "folder": "casts",
                    "count": casts_count,
                    "iconColor": "#60A5FA"
                })),
            });
        }

        // Extensions
        if extensions_count > 0 {
            db_objects_children.push(DatabaseObject {
                id: format!("extensions_folder:{}", db_name),
                name: "Extensions".to_string(),
                kind: ObjectKind::Table,
                icon: "mdi:puzzle".to_string(),
                children: Some(vec![]), // Placeholder - will be loaded on expand
                expanded: false,
                metadata: Some(json!({
                    "database": db_name,
                    "folder": "extensions",
                    "count": extensions_count,
                    "iconColor": "#A78BFA"
                })),
            });
        }

        // Languages
        if languages_count > 0 {
            db_objects_children.push(DatabaseObject {
                id: format!("languages_folder:{}", db_name),
                name: "Languages".to_string(),
                kind: ObjectKind::Table,
                icon: "mdi:code-tags".to_string(),
                children: Some(vec![]), // Placeholder - will be loaded on expand
                expanded: false,
                metadata: Some(json!({
                    "database": db_name,
                    "folder": "languages",
                    "count": languages_count,
                    "iconColor": "#F472B6"
                })),
            });
        }

        // Virtual Views (system catalog monitoring views)
        if virtual_views_count > 0 {
            db_objects_children.push(DatabaseObject {
                id: format!("virtual_views_folder:{}", db_name),
                name: "Virtual Views".to_string(),
                kind: ObjectKind::View,
                icon: "mdi:eye-outline".to_string(),
                children: Some(vec![]), // Placeholder - will be loaded on expand
                expanded: false,
                metadata: Some(json!({
                    "database": db_name,
                    "folder": "virtual_views",
                    "count": virtual_views_count,
                    "iconColor": "#2DD4BF"
                })),
            });
        }

        // Database Objects folder
        let mut result = vec![];

        // Add Schemas
        let schemas: Vec<(String,)> = sqlx::query_as(
            "SELECT schema_name FROM information_schema.schemata
             WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
             AND schema_name NOT LIKE 'pg_%'
             ORDER BY schema_name"
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        for (name,) in schemas {
            // Get object counts for this schema
            let schema_name = &name;
            let table_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'"
            ).bind(schema_name).fetch_one(pool).await.unwrap_or(0);
            let view_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = $1"
            ).bind(schema_name).fetch_one(pool).await.unwrap_or(0);
            let func_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = $1"
            ).bind(schema_name).fetch_one(pool).await.unwrap_or(0);

            let total_count = table_count + view_count + func_count;

            result.push(DatabaseObject {
                id: format!("schema:{}", name),
                name: name.clone(),
                kind: ObjectKind::Schema,
                icon: "ic:round-schema".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "database": parent.name,
                    "schema": name,
                    "iconColor": "#FBBF24",
                    "objectCount": total_count
                })),
            });
        }

        // Add Database Objects folder if it has children
        if !db_objects_children.is_empty() {
            result.push(DatabaseObject {
                id: format!("db_objects_folder:{}", db_name),
                name: "Database Objects".to_string(),
                kind: ObjectKind::Table,
                icon: "mdi:database-cog".to_string(),
                children: Some(db_objects_children),
                expanded: false,
                metadata: Some(json!({
                    "database": db_name,
                    "folder": "db_objects",
                    "iconColor": "#9CA3AF"
                })),
            });
        }

        result
    }

    async fn get_schema_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let schema_name = &parent.name;

        // Get counts for each object type in the schema
        let table_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.tables
             WHERE table_schema = $1 AND table_type = 'BASE TABLE'"
        )
        .bind(schema_name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        let view_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.views
             WHERE table_schema = $1"
        )
        .bind(schema_name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        let sequence_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM information_schema.sequences
             WHERE sequence_schema = $1"
        )
        .bind(schema_name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        // Get function count (excluding system functions)
        let function_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pg_proc p
             JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE n.nspname = $1"
        )
        .bind(schema_name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        // Get extension count
        let extension_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pg_extension e
             JOIN pg_namespace n ON e.extnamespace = n.oid
             WHERE n.nspname = $1"
        )
        .bind(schema_name)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

        // Build folders array with all object types
        let mut folders = vec![
            DatabaseObject {
                id: format!("tables_folder:{}", schema_name),
                name: "Tables".to_string(),
                kind: ObjectKind::Table,
                icon: "mdi:table-multiple".to_string(),
                children: Some(vec![]), // Placeholder - will be loaded on expand
                expanded: false,
                metadata: Some(json!({
                    "schema": schema_name,
                    "folder": "tables",
                    "count": table_count,
                    "iconColor": "#34D399"
                })),
            },
            DatabaseObject {
                id: format!("views_folder:{}", schema_name),
                name: "Views".to_string(),
                kind: ObjectKind::View,
                icon: "mdi:database-view".to_string(),
                children: Some(vec![]), // Placeholder - will be loaded on expand
                expanded: false,
                metadata: Some(json!({
                    "schema": schema_name,
                    "folder": "views",
                    "count": view_count,
                    "iconColor": "#C084FC"
                })),
            },
        ];

        // Add Sequences folder if there are sequences
        if sequence_count > 0 {
            folders.push(DatabaseObject {
                id: format!("sequences_folder:{}", schema_name),
                name: "Sequences".to_string(),
                kind: ObjectKind::Table,
                icon: "mdi:counter".to_string(),
                children: Some(vec![]), // Placeholder - will be loaded on expand
                expanded: false,
                metadata: Some(json!({
                    "schema": schema_name,
                    "folder": "sequences",
                    "count": sequence_count,
                    "iconColor": "#F472B6"
                })),
            });
        }

        // Add Functions folder if there are functions
        if function_count > 0 {
            folders.push(DatabaseObject {
                id: format!("functions_folder:{}", schema_name),
                name: "Functions".to_string(),
                kind: ObjectKind::Table,
                icon: "mdi:math-function".to_string(),
                children: Some(vec![]), // Placeholder - will be loaded on expand
                expanded: false,
                metadata: Some(json!({
                    "schema": schema_name,
                    "folder": "functions",
                    "count": function_count,
                    "iconColor": "#60A5FA"
                })),
            });
        }

        // Add Extensions folder if there are extensions
        if extension_count > 0 {
            folders.push(DatabaseObject {
                id: format!("extensions_folder:{}", schema_name),
                name: "Extensions".to_string(),
                kind: ObjectKind::Table,
                icon: "mdi:puzzle".to_string(),
                children: Some(vec![]), // Placeholder - will be loaded on expand
                expanded: false,
                metadata: Some(json!({
                    "schema": schema_name,
                    "folder": "extensions",
                    "count": extension_count,
                    "iconColor": "#A78BFA"
                })),
            });
        }

        // Filter out empty folders
        folders.retain(|f| {
            let count = f.metadata.as_ref().and_then(|m| m.get("count")).and_then(|v| v.as_i64()).unwrap_or(0);
            count > 0
        });

        folders
    }

    async fn get_sequences_folder_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let schema_name = parent.metadata.as_ref()
            .and_then(|m| m.get("schema"))
            .and_then(|v| v.as_str())
            .unwrap_or("public");

        let sequences: Vec<(String,)> = sqlx::query_as(
            "SELECT sequence_name FROM information_schema.sequences
             WHERE sequence_schema = $1
             ORDER BY sequence_name"
        )
        .bind(schema_name)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        sequences.iter()
            .map(|(name,)| DatabaseObject {
                id: format!("sequence:{}.{}", schema_name, name),
                name: name.clone(),
                kind: ObjectKind::Table,
                icon: "mdi:counter".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "schema": schema_name,
                    "sequence": name,
                    "iconColor": "#F472B6"
                })),
            })
            .collect()
    }

    async fn get_functions_folder_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let schema_name = parent.metadata.as_ref()
            .and_then(|m| m.get("schema"))
            .and_then(|v| v.as_str())
            .unwrap_or("public");

        let functions: Vec<(String, String)> = sqlx::query_as(
            "SELECT p.proname as function_name,
                    pg_get_function_identity_arguments(p.oid) as arguments
             FROM pg_proc p
             JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE n.nspname = $1
             ORDER BY p.proname"
        )
        .bind(schema_name)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        functions.iter()
            .map(|(name, args)| DatabaseObject {
                id: format!("function:{}.{}", schema_name, name),
                name: format!("{}({})", name, args),
                kind: ObjectKind::Table,
                icon: "mdi:math-function".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "schema": schema_name,
                    "function": name,
                    "arguments": args,
                    "iconColor": "#60A5FA"
                })),
            })
            .collect()
    }

    async fn get_extensions_folder_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        // pg_extension is a global system catalog - get all extensions in the database
        let extensions: Vec<(String, String)> = sqlx::query_as(
            "SELECT e.extname as extension_name,
                    COALESCE((SELECT description FROM pg_description WHERE objoid = e.oid), '') as description
             FROM pg_extension e
             ORDER BY e.extname"
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        extensions.iter()
            .map(|(name, desc)| DatabaseObject {
                id: format!("extension:{}", name),
                name: name.clone(),
                kind: ObjectKind::Table,
                icon: "mdi:puzzle".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "extension": name,
                    "description": desc,
                    "iconColor": "#A78BFA"
                })),
            })
            .collect()
    }

    async fn get_access_methods_folder_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let access_methods: Vec<(String, String)> = sqlx::query_as(
            "SELECT amname, amhandler::regproc::text
             FROM pg_am
             ORDER BY amname"
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        access_methods.iter()
            .map(|(name, handler)| DatabaseObject {
                id: format!("access_method:{}", name),
                name: name.clone(),
                kind: ObjectKind::Table,
                icon: "mdi:tree".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "access_method": name,
                    "handler": handler,
                    "iconColor": "#FBBF24"
                })),
            })
            .collect()
    }

    async fn get_casts_folder_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        eprintln!("[PostgresIntrospector] get_casts_folder_children - START");
        eprintln!("[PostgresIntrospector] get_casts_folder_children - parent.id: {}", parent.id);
        eprintln!("[PostgresIntrospector] get_casts_folder_children - parent.name: {}", parent.name);
        eprintln!("[PostgresIntrospector] get_casts_folder_children - parent.metadata: {:?}", parent.metadata);

        // pg_cast is a global system catalog - not schema-specific
        // Get all casts, but limit to common/useful ones to avoid overwhelming the UI
        // Note: castcontext is "char" type, need to cast to TEXT for sqlx compatibility
        let casts: Vec<(String, String, String)> = match sqlx::query_as(
            "SELECT pg_catalog.format_type(castsource, NULL) as source_type,
                    pg_catalog.format_type(casttarget, NULL) as target_type,
                    castcontext::TEXT
             FROM pg_cast
             ORDER BY source_type, target_type
             LIMIT 500"
        )
        .fetch_all(pool)
        .await {
            Ok(result) => {
                eprintln!("[PostgresIntrospector] get_casts_folder_children - Query succeeded, got {} casts", result.len());
                result
            }
            Err(e) => {
                eprintln!("[PostgresIntrospector] get_casts_folder_children - Query FAILED: {}", e);
                Vec::new()
            }
        };

        eprintln!("[PostgresIntrospector] get_casts_folder_children - Returning {} cast objects", casts.len());

        casts.iter()
            .map(|(source, target, context)| DatabaseObject {
                id: format!("cast:{}->{}", source, target),
                name: format!("{} → {}", source, target),
                kind: ObjectKind::Table,
                icon: "mdi:swap-horizontal".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "cast": format!("{}->{}", source, target),
                    "sourceType": source,
                    "targetType": target,
                    "context": context,
                    "iconColor": "#60A5FA"
                })),
            })
            .collect()
    }

    async fn get_languages_folder_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        // pg_language is a global system catalog - get all user-defined languages
        let languages: Vec<(String, bool)> = sqlx::query_as(
            "SELECT lanname, lanpltrusted
             FROM pg_language
             WHERE lanname NOT IN ('internal', 'c', 'sql', 'plpgsql')
             ORDER BY lanname"
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        languages.iter()
            .map(|(name, trusted)| DatabaseObject {
                id: format!("language:{}", name),
                name: name.clone(),
                kind: ObjectKind::Table,
                icon: "mdi:code-tags".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "language": name,
                    "isTrusted": trusted,
                    "iconColor": "#F472B6"
                })),
            })
            .collect()
    }

    async fn get_roles_folder_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let roles: Vec<(String, bool, bool, bool)> = sqlx::query_as(
            "SELECT rolname, rolsuper, rolinherit, rolcreaterole
             FROM pg_roles
             WHERE rolname NOT LIKE 'pg_%'
             ORDER BY rolname"
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        roles.iter()
            .map(|(name, superuser, inherit, create_role)| DatabaseObject {
                id: format!("role:{}", name),
                name: name.clone(),
                kind: ObjectKind::Role,
                icon: "mdi:account".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "role": name,
                    "isSuperuser": superuser,
                    "canInherit": inherit,
                    "canCreateRole": create_role,
                    "iconColor": "#F472B6"
                })),
            })
            .collect()
    }

    async fn get_tablespaces_folder_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let tablespaces: Vec<(String, String, i64)> = sqlx::query_as(
            "SELECT spcname,
                    pg_catalog.pg_get_userbyid(spcowner) as owner,
                    pg_size_pretty(pg_tablespace_size(spcname)) as size
             FROM pg_tablespace
             WHERE spcname NOT IN ('pg_default', 'pg_global')
             ORDER BY spcname"
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        tablespaces.iter()
            .map(|(name, owner, size)| DatabaseObject {
                id: format!("tablespace:{}", name),
                name: name.clone(),
                kind: ObjectKind::Tablespace,
                icon: "mdi:folder-network".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "tablespace": name,
                    "owner": owner,
                    "size": size,
                    "iconColor": "#FBBF24"
                })),
            })
            .collect()
    }

    async fn get_virtual_views_folder_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        // Virtual Views = PostgreSQL system catalog views for monitoring (like IntelliJ's "Virtual Views")
        // These are dynamic system views that show real-time database state
        // See: https://www.postgresql.org/docs/current/monitoring-stats.html

        let system_views: Vec<(String, String, String)> = sqlx::query_as(
            "SELECT 'pg_catalog'::text as schemaname,
                    CAST(relname AS text) as viewname,
                    'System View'::text as description
             FROM pg_class c
             JOIN pg_namespace n ON c.relnamespace = n.oid
             WHERE c.relkind = 'v'
               AND n.nspname = 'pg_catalog'
               AND (relname LIKE 'pg_stat_%'
                    OR relname LIKE 'pg_locks%'
                    OR relname LIKE 'pg_settings%'
                    OR relname LIKE 'pg_roles%'
                    OR relname LIKE 'pg_database%'
                    OR relname LIKE 'pg_tablespace%')
             ORDER BY relname"
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        system_views.iter()
            .map(|(schema, name, desc)| DatabaseObject {
                id: format!("virtual_view:{}", name),
                name: name.clone(),
                kind: ObjectKind::View,
                icon: "mdi:eye-outline".to_string(),
                children: None,
                expanded: false,
                metadata: Some(json!({
                    "virtual_view": name,
                    "schema": schema,
                    "description": desc,
                    "iconColor": "#2DD4BF"
                })),
            })
            .collect()
    }

    async fn get_tables_folder_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let schema_name = parent.metadata.as_ref()
            .and_then(|m| m.get("schema"))
            .and_then(|v| v.as_str())
            .unwrap_or("public");

        let tables: Vec<(String, String)> = sqlx::query_as(
            "SELECT table_name, table_type FROM information_schema.tables
             WHERE table_schema = $1 AND table_type = 'BASE TABLE'
             ORDER BY table_name"
        )
        .bind(schema_name)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        tables.iter().map(|(name, _)| DatabaseObject {
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
        }).collect()
    }

    async fn get_views_folder_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        let schema_name = parent.metadata.as_ref()
            .and_then(|m| m.get("schema"))
            .and_then(|v| v.as_str())
            .unwrap_or("public");

        let views: Vec<(String, String)> = sqlx::query_as(
            "SELECT table_name, table_type FROM information_schema.tables
             WHERE table_schema = $1 AND table_type = 'VIEW'
             ORDER BY table_name"
        )
        .bind(schema_name)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        views.iter().map(|(name, _)| DatabaseObject {
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
        }).collect()
    }

    async fn get_table_children(&self, pool: &sqlx::PgPool, parent: &DatabaseObject) -> Vec<DatabaseObject> {
        // This is for actual table/view nodes (not folders) - return Columns, Indexes, Keys
        let schema_name = parent.metadata.as_ref()
            .and_then(|m| m.get("schema"))
            .and_then(|v| v.as_str())
            .unwrap_or("public");
        let table_name = parent.metadata.as_ref()
            .and_then(|m| m.get("table"))
            .and_then(|v| v.as_str())
            .unwrap_or(&parent.name);

        eprintln!("[PostgresIntrospector] get_table_children - schema: {}, table/view: {}", schema_name, table_name);

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
                children: Some(vec![]), // Placeholder - will be loaded on expand
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
                children: Some(vec![]), // Placeholder - will be loaded on expand
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
                children: Some(vec![]), // Placeholder - will be loaded on expand
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
        let AnyPool::Postgres(pool) = pool else {
            return Err(crate::database::DatabaseError::ConnectionError("Wrong pool type".to_string()));
        };

        let connected_db = config.database.as_deref().unwrap_or("postgres");

        eprintln!("[PostgresIntrospector] get_root_objects - connected_db: {}", connected_db);

        let result = tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                // Get server-level objects counts
                let roles_count: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM pg_roles WHERE rolname NOT LIKE 'pg_%'"
                )
                .fetch_one(pool)
                .await
                .unwrap_or(0);

                let tablespaces_count: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM pg_tablespace WHERE spcname NOT IN ('pg_default', 'pg_global')"
                )
                .fetch_one(pool)
                .await
                .unwrap_or(0);

                // Build server objects children
                let mut server_objects_children = vec![];

                if roles_count > 0 {
                    server_objects_children.push(DatabaseObject {
                        id: format!("roles_folder:{}", connected_db),
                        name: "Roles".to_string(),
                        kind: ObjectKind::Role,
                        icon: "mdi:account-group".to_string(),
                        children: Some(vec![]),
                        expanded: false,
                        metadata: Some(json!({
                            "database": connected_db,
                            "folder": "roles",
                            "count": roles_count,
                            "iconColor": "#F472B6"
                        })),
                    });
                }

                if tablespaces_count > 0 {
                    server_objects_children.push(DatabaseObject {
                        id: format!("tablespaces_folder:{}", connected_db),
                        name: "Tablespaces".to_string(),
                        kind: ObjectKind::Tablespace,
                        icon: "mdi:folder-network".to_string(),
                        children: Some(vec![]),
                        expanded: false,
                        metadata: Some(json!({
                            "database": connected_db,
                            "folder": "tablespaces",
                            "count": tablespaces_count,
                            "iconColor": "#FBBF24"
                        })),
                    });
                }

                // Return both Database and Server Objects as siblings
                let mut result = vec![
                    DatabaseObject {
                        id: format!("database:{}", connected_db),
                        name: connected_db.to_string(),
                        kind: ObjectKind::Database,
                        icon: "mdi:database".to_string(),
                        children: None,
                        expanded: false,
                        metadata: Some(json!({ "database": connected_db, "iconColor": "#60A5FA" })),
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
                        metadata: Some(json!({
                            "folder": "server_objects",
                            "iconColor": "#9CA3AF"
                        })),
                    });
                }

                result
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
                // Check folder type FIRST (before checking kind)
                let folder = parent.metadata.as_ref()
                    .and_then(|m| m.get("folder"))
                    .and_then(|v| v.as_str());

                // Handle special folders first
                let folder = parent.metadata.as_ref()
                    .and_then(|m| m.get("folder"))
                    .and_then(|v| v.as_str());

                eprintln!("[PostgresIntrospector] get_children - folder type: {:?}", folder);
                eprintln!("[PostgresIntrospector] get_children - parent.id: {}", parent.id);
                eprintln!("[PostgresIntrospector] get_children - parent.name: {}", parent.name);
                eprintln!("[PostgresIntrospector] get_children - parent.kind: {:?}", parent.kind);

                match folder {
                    Some("server_objects") => {
                        eprintln!("[PostgresIntrospector] get_children - returning server_objects pre-populated children");
                        return parent.children.clone().unwrap_or_default();
                    }
                    Some("roles") => {
                        eprintln!("[PostgresIntrospector] get_children - calling get_roles_folder_children");
                        return self.get_roles_folder_children(pool, parent).await;
                    }
                    Some("tablespaces") => {
                        eprintln!("[PostgresIntrospector] get_children - calling get_tablespaces_folder_children");
                        return self.get_tablespaces_folder_children(pool, parent).await;
                    }
                    Some("access_methods") => {
                        eprintln!("[PostgresIntrospector] get_children - calling get_access_methods_folder_children");
                        return self.get_access_methods_folder_children(pool, parent).await;
                    }
                    Some("casts") => {
                        eprintln!("[PostgresIntrospector] get_children - calling get_casts_folder_children");
                        return self.get_casts_folder_children(pool, parent).await;
                    }
                    Some("languages") => {
                        eprintln!("[PostgresIntrospector] get_children - calling get_languages_folder_children");
                        return self.get_languages_folder_children(pool, parent).await;
                    }
                    Some("virtual_views") => {
                        eprintln!("[PostgresIntrospector] get_children - calling get_virtual_views_folder_children");
                        return self.get_virtual_views_folder_children(pool, parent).await;
                    }
                    Some("db_objects") => {
                        eprintln!("[PostgresIntrospector] get_children - returning db_objects pre-populated children");
                        return parent.children.clone().unwrap_or_default();
                    }
                    Some("sequences") => {
                        eprintln!("[PostgresIntrospector] get_children - calling get_sequences_folder_children");
                        return self.get_sequences_folder_children(pool, parent).await;
                    }
                    Some("functions") => {
                        eprintln!("[PostgresIntrospector] get_children - calling get_functions_folder_children");
                        return self.get_functions_folder_children(pool, parent).await;
                    }
                    Some("extensions") => {
                        eprintln!("[PostgresIntrospector] get_children - calling get_extensions_folder_children");
                        return self.get_extensions_folder_children(pool, parent).await;
                    }
                    Some("tables") => {
                        eprintln!("[PostgresIntrospector] get_children - calling get_tables_folder_children");
                        return self.get_tables_folder_children(pool, parent).await;
                    }
                    Some("views") => {
                        eprintln!("[PostgresIntrospector] get_children - calling get_views_folder_children");
                        return self.get_views_folder_children(pool, parent).await;
                    }
                    _ => {
                        eprintln!("[PostgresIntrospector] get_children - no matching folder type, falling through to kind match");
                    }
                }

                // Check if this is a leaf object (actual item, not a folder)
                // Note: tables and views are NOT leaf nodes - they have Columns, Indexes, Keys children
                let is_leaf = parent.metadata.as_ref()
                    .and_then(|m| m.get("access_method")).is_some()
                    || parent.metadata.as_ref().and_then(|m| m.get("cast")).is_some()
                    || parent.metadata.as_ref().and_then(|m| m.get("language")).is_some()
                    || parent.metadata.as_ref().and_then(|m| m.get("virtual_view")).is_some()
                    || parent.metadata.as_ref().and_then(|m| m.get("sequence")).is_some()
                    || parent.metadata.as_ref().and_then(|m| m.get("function")).is_some()
                    || parent.metadata.as_ref().and_then(|m| m.get("extension")).is_some();

                if is_leaf {
                    return Vec::new();
                }

                // Now match on kind for non-folder, non-leaf objects
                match parent.kind {
                    ObjectKind::Database => self.get_database_children(pool, parent).await,
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
