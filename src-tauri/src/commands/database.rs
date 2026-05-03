//! Database commands - IPC handlers for database connection management
//!
//! This module provides Tauri commands for:
//! - Listing, adding, updating, and removing database connections
//! - Testing connections
//! - Moving connections between global and project scope

use tauri::State;
use std::path::PathBuf;
use crate::database::{DatabaseManager, ConnectionConfig, ConnectionInfo, ConnectionScope};
use serde::{Deserialize, Serialize};

/// Connection info returned to frontend (matches AnyDataSource structure)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfoDto {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub data_source_type: String,
    pub scope: String,
    pub config: DatabaseConfigDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseConfigDto {
    pub db_type: String,
    pub host: Option<String>,
    pub port: u16,
    pub username: Option<String>,
    pub database: Option<String>,
    pub file_path: Option<String>,
}

impl From<ConnectionInfo> for ConnectionInfoDto {
    fn from(info: ConnectionInfo) -> Self {
        Self {
            id: info.id,
            name: info.name,
            data_source_type: "database".to_string(),
            scope: match info.scope {
                ConnectionScope::Global => "global".to_string(),
                ConnectionScope::Project => "project".to_string(),
            },
            config: DatabaseConfigDto {
                db_type: format!("{:?}", info.db_type).to_lowercase(),
                host: if info.host.is_empty() { None } else { Some(info.host) },
                port: info.port,
                username: if info.username.is_empty() { None } else { Some(info.username) },
                database: info.database,
                file_path: info.file_path,
            },
        }
    }
}

/// List all database connections (merged global + project)
#[tauri::command]
pub fn db_list_connections(
    manager: State<DatabaseManager>,
    project_path: Option<String>,
) -> Result<Vec<ConnectionInfoDto>, String> {
    let project = project_path.as_ref().map(|p| PathBuf::from(p));
    let connections = manager.list_connections(project.as_deref());
    Ok(connections.into_iter().map(|c| c.into()).collect())
}

/// Add a new database connection
#[tauri::command]
pub fn db_add_connection(
    manager: State<DatabaseManager>,
    config: ConnectionConfigDto,
    project_path: Option<String>,
) -> Result<String, String> {
    eprintln!("[db_add_connection] === Adding connection ===");
    eprintln!("[db_add_connection] Name: {}", config.name);
    eprintln!("[db_add_connection] Type: {}", config.db_type);
    eprintln!("[db_add_connection] Host: {:?}", config.host);
    eprintln!("[db_add_connection] Port: {}", config.port);
    eprintln!("[db_add_connection] Username: {:?}", config.username);
    eprintln!("[db_add_connection] Password present: {}", config.password.is_some());
    eprintln!("[db_add_connection] Password value: {:?}", config.password.as_ref().map(|_| "***"));
    eprintln!("[db_add_connection] Database: {:?}", config.database);
    eprintln!("[db_add_connection] Scope: {}", config.scope);

    let connection_config: ConnectionConfig = config.into();
    eprintln!("[db_add_connection] Converted config - password: {:?}", connection_config.password.as_ref().map(|_| "***"));

    let project = project_path.as_ref().map(|p| PathBuf::from(p));
    match manager.add_connection(connection_config, project.as_deref()) {
        Ok(id) => {
            eprintln!("[db_add_connection] Connection added successfully: {}", id);
            Ok(id)
        }
        Err(e) => {
            eprintln!("[db_add_connection] Failed to add connection: {}", e);
            Err(e.to_string())
        }
    }
}

/// Update an existing database connection
#[tauri::command]
pub fn db_update_connection(
    manager: State<DatabaseManager>,
    config: ConnectionConfigDto,
    project_path: Option<String>,
) -> Result<(), String> {
    let connection_config = config.into();
    let project = project_path.as_ref().map(|p| PathBuf::from(p));
    manager.update_connection(connection_config, project.as_deref())
        .map_err(|e| e.to_string())
}

/// Remove a database connection
#[tauri::command]
pub fn db_remove_connection(
    manager: State<DatabaseManager>,
    connection_id: String,
    project_path: Option<String>,
) -> Result<(), String> {
    let project = project_path.as_ref().map(|p| PathBuf::from(p));
    manager.remove_connection(&connection_id, project.as_deref())
        .map_err(|e| e.to_string())
}

/// Test a database connection (validate and try to connect)
#[tauri::command]
pub async fn db_test_connection(
    manager: State<'_, DatabaseManager>,
    config: ConnectionConfigDto,
) -> Result<bool, String> {
    let connection_config = config.into();
    // Run blocking operation in a separate thread pool to avoid blocking the UI
    let manager_clone = manager.inner().clone();
    tokio::task::spawn_blocking(move || {
        manager_clone.test_connection(connection_config)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(|e| e.to_string())
}

/// Make a connection global (move from project to global storage)
#[tauri::command]
pub fn db_make_connection_global(
    manager: State<DatabaseManager>,
    connection_id: String,
    project_path: String,
) -> Result<(), String> {
    manager.make_connection_global(&connection_id, &PathBuf::from(project_path))
        .map_err(|e| e.to_string())
}

/// Make a connection project-specific (move from global to project storage)
#[tauri::command]
pub fn db_make_connection_project(
    manager: State<DatabaseManager>,
    connection_id: String,
    project_path: String,
) -> Result<(), String> {
    manager.make_connection_project(&connection_id, &PathBuf::from(project_path))
        .map_err(|e| e.to_string())
}

/// Connection config DTO from frontend
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfigDto {
    pub id: Option<String>,
    pub name: String,
    #[serde(rename = "type")]
    pub db_type: String,
    #[serde(default)]
    pub host: Option<String>,
    pub port: u16,
    #[serde(default)]
    pub username: Option<String>,
    pub password: Option<String>,
    pub database: Option<String>,
    pub scope: String,
    #[serde(default)]
    pub options: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub file_path: Option<String>,
}

impl From<ConnectionConfigDto> for ConnectionConfig {
    fn from(dto: ConnectionConfigDto) -> Self {
        let db_type = match dto.db_type.as_str() {
            "postgresql" => crate::database::DatabaseType::PostgreSQL,
            "mysql" => crate::database::DatabaseType::MySQL,
            "mariadb" => crate::database::DatabaseType::MariaDB,
            "sqlite" => crate::database::DatabaseType::SQLite,
            "mongodb" => crate::database::DatabaseType::MongoDB,
            "redis" => crate::database::DatabaseType::Redis,
            "sqlserver" => crate::database::DatabaseType::SQLServer,
            "oracle" => crate::database::DatabaseType::Oracle,
            "cassandra" => crate::database::DatabaseType::Cassandra,
            "clickhouse" => crate::database::DatabaseType::ClickHouse,
            "cockroachdb" => crate::database::DatabaseType::CockroachDB,
            "neo4j" => crate::database::DatabaseType::Neo4j,
            "dynamodb" => crate::database::DatabaseType::DynamoDB,
            "elasticsearch" => crate::database::DatabaseType::Elasticsearch,
            _ => crate::database::DatabaseType::PostgreSQL, // Default
        };

        let scope = if dto.scope == "global" {
            ConnectionScope::Global
        } else {
            ConnectionScope::Project
        };

        ConnectionConfig {
            id: dto.id,
            name: dto.name,
            db_type,
            host: dto.host.unwrap_or_else(|| "localhost".to_string()),
            port: dto.port,
            username: dto.username.unwrap_or_default(),
            password: dto.password,
            database: dto.database,
            scope,
            options: dto.options,
            file_path: dto.file_path,
        }
    }
}
