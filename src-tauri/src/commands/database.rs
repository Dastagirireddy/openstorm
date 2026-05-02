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

/// Connection info returned to frontend (without sensitive data)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfoDto {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub db_type: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub database: Option<String>,
    pub scope: String,
}

impl From<ConnectionInfo> for ConnectionInfoDto {
    fn from(info: ConnectionInfo) -> Self {
        Self {
            id: info.id,
            name: info.name,
            db_type: format!("{:?}", info.db_type).to_lowercase(),
            host: info.host,
            port: info.port,
            username: info.username,
            database: info.database,
            scope: match info.scope {
                ConnectionScope::Global => "global".to_string(),
                ConnectionScope::Project => "project".to_string(),
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
    let connection_config = config.into();
    let project = project_path.as_ref().map(|p| PathBuf::from(p));
    manager.add_connection(connection_config, project.as_deref())
        .map_err(|e| e.to_string())
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
pub fn db_test_connection(
    manager: State<DatabaseManager>,
    config: ConnectionConfigDto,
) -> Result<bool, String> {
    let connection_config = config.into();
    manager.test_connection(connection_config)
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
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub database: Option<String>,
    pub scope: String,
    #[serde(default)]
    pub options: std::collections::HashMap<String, String>,
}

impl From<ConnectionConfigDto> for ConnectionConfig {
    fn from(dto: ConnectionConfigDto) -> Self {
        let db_type = match dto.db_type.as_str() {
            "postgresql" => crate::database::DatabaseType::PostgreSQL,
            "mysql" => crate::database::DatabaseType::MySQL,
            "sqlite" => crate::database::DatabaseType::SQLite,
            "mongodb" => crate::database::DatabaseType::MongoDB,
            "redis" => crate::database::DatabaseType::Redis,
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
            host: dto.host,
            port: dto.port,
            username: dto.username,
            password: dto.password,
            database: dto.database,
            scope,
            options: dto.options,
        }
    }
}
