/// MySQL Introspector - retrieves schema metadata from MySQL
///
/// Uses sqlx to query MySQL system catalogs (information_schema)

use crate::database::{Result, ConnectionConfig, DatabaseError};
use super::traits::{DatabaseIntrospector, DatabaseObject, ObjectKind};
use serde_json::json;

pub struct MySqlIntrospector;

impl MySqlIntrospector {
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
        let port = if config.port > 0 { format!(":{}", config.port) } else { String::from(":3306") };
        let dbname = config.database.as_deref().unwrap_or("mysql");

        format!("mysql://{}{}{}/{}", auth, host, port, dbname)
    }
}

impl DatabaseIntrospector for MySqlIntrospector {
    fn get_root_objects(&self, config: &ConnectionConfig) -> Result<Vec<DatabaseObject>> {
        let connection_string = Self::get_connection_string(config);

        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| DatabaseError::ConnectionError(format!("Failed to create runtime: {}", e)))?;

        rt.block_on(async {
            let pool = sqlx::MySqlPool::connect(&connection_string).await
                .map_err(|e| DatabaseError::ConnectionError(format!("Failed to connect: {}", e)))?;

            // Get all databases
            let databases: Vec<(String,)> = sqlx::query_as("SHOW DATABASES")
                .fetch_all(&pool)
                .await
                .unwrap_or_default();

            pool.close().await;

            let objects = databases.iter()
                .map(|(name,)| DatabaseObject {
                    id: format!("db:{}", name),
                    name: name.clone(),
                    kind: ObjectKind::Database,
                    icon: "mdi:database".to_string(),
                    children: None,
                    expanded: false,
                    metadata: Some(json!({ "name": name })),
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
            let pool = sqlx::MySqlPool::connect(&connection_string).await
                .map_err(|e| DatabaseError::ConnectionError(format!("Failed to connect: {}", e)))?;

            match parent.kind {
                ObjectKind::Database => {
                    // Get tables in the database
                    let tables: Vec<(String, String)> = sqlx::query_as(
                        "SELECT table_name, table_type FROM information_schema.tables
                         WHERE table_schema = $1
                         ORDER BY table_name"
                    )
                    .bind(&parent.name)
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default();

                    pool.close().await;

                    Ok(tables.iter().map(|(name, kind)| DatabaseObject {
                        id: format!("table:{}", name),
                        name: name.clone(),
                        kind: if kind == "VIEW" { ObjectKind::View } else { ObjectKind::Table },
                        icon: if kind == "VIEW" { "mdi:eye".to_string() } else { "mdi:table".to_string() },
                        children: None,
                        expanded: false,
                        metadata: Some(json!({ "database": parent.name, "table": name, "type": kind })),
                    }).collect())
                }
                ObjectKind::Table | ObjectKind::View => {
                    // Get columns for the table/view
                    let columns: Vec<(String, String, String)> = sqlx::query_as(
                        "SELECT column_name, data_type, is_nullable
                         FROM information_schema.columns
                         WHERE table_schema = $1 AND table_name = $2
                         ORDER BY ordinal_position"
                    )
                    .bind(&parent.name)
                    .bind(&parent.metadata.as_ref()
                        .and_then(|m| m.get("database"))
                        .and_then(|v| v.as_str())
                        .unwrap_or(&parent.name))
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default();

                    pool.close().await;

                    Ok(columns.iter().map(|(name, dtype, nullable)| DatabaseObject {
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
                            "nullable": nullable == "YES"
                        })),
                    }).collect())
                }
                _ => Ok(Vec::new()),
            }
        })
    }

    fn get_object_details(&self, config: &ConnectionConfig, object: &DatabaseObject) -> Result<serde_json::Value> {
        Ok(object.metadata.clone().unwrap_or(json!({})))
    }
}

impl Default for MySqlIntrospector {
    fn default() -> Self {
        Self::new()
    }
}
