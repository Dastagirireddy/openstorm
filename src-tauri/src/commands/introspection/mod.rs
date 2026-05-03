//! Database Introspection Commands - IPC handlers for schema metadata
//!
//! This module provides Tauri commands for:
//! - Getting database objects (databases, schemas, tables)
//! - Getting children of database objects
//! - Getting object details

use tauri::State;
use crate::database::{DatabaseManager, ConnectionConfig};
use crate::database::introspection::{DatabaseIntrospector, DatabaseObject};
use std::path::PathBuf;

/// Get root database objects for a connection
#[tauri::command]
pub fn db_get_objects(
    manager: State<DatabaseManager>,
    connection_id: String,
    project_path: Option<String>,
) -> Result<Vec<DatabaseObject>, String> {
    let project = project_path.as_ref().map(|p| PathBuf::from(p));

    // Get the connection config
    let connections = manager.list_connections(project.as_deref());
    let connection = connections.iter()
        .find(|c| c.id == connection_id)
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;

    // Get the appropriate introspector
    let introspector = get_introspector(connection.db_type.clone());

    // Get password from keychain
    let password_result = manager.get_password(&connection.id);

    // Build connection config
    let password = password_result.ok().flatten();
    let config = ConnectionConfig {
        id: Some(connection.id.clone()),
        name: connection.name.clone(),
        db_type: connection.db_type.clone(),
        host: connection.host.clone(),
        port: connection.port,
        username: connection.username.clone(),
        password: password,
        database: connection.database.clone(),
        scope: connection.scope.clone(),
        options: std::collections::HashMap::new(),
        file_path: connection.file_path.clone(),
    };

    introspector.get_root_objects(&config).map_err(|e| e.to_string())
}

/// Get children of a database object
#[tauri::command]
pub fn db_get_children(
    manager: State<DatabaseManager>,
    connection_id: String,
    parent: DatabaseObject,
    project_path: Option<String>,
) -> Result<Vec<DatabaseObject>, String> {
    let project = project_path.as_ref().map(|p| PathBuf::from(p));

    // Get the connection config
    let connections = manager.list_connections(project.as_deref());
    let connection = connections.iter()
        .find(|c| c.id == connection_id)
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;

    // Get password from keychain
    let password = manager.get_password(&connection.id).ok().flatten();

    // Get the appropriate introspector
    let introspector = get_introspector(connection.db_type.clone());

    // Build connection config
    let config = ConnectionConfig {
        id: Some(connection.id.clone()),
        name: connection.name.clone(),
        db_type: connection.db_type.clone(),
        host: connection.host.clone(),
        port: connection.port,
        username: connection.username.clone(),
        password,
        database: connection.database.clone(),
        scope: connection.scope.clone(),
        options: std::collections::HashMap::new(),
        file_path: connection.file_path.clone(),
    };

    introspector.get_children(&config, &parent).map_err(|e| e.to_string())
}

/// Get detailed metadata for a database object
#[tauri::command]
pub fn db_get_object_details(
    manager: State<DatabaseManager>,
    connection_id: String,
    object: DatabaseObject,
    project_path: Option<String>,
) -> Result<serde_json::Value, String> {
    let project = project_path.as_ref().map(|p| PathBuf::from(p));

    // Get the connection config
    let connections = manager.list_connections(project.as_deref());
    let connection = connections.iter()
        .find(|c| c.id == connection_id)
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;

    // Get the appropriate introspector
    let introspector = get_introspector(connection.db_type.clone());

    // Build connection config
    let config = ConnectionConfig {
        id: Some(connection.id.clone()),
        name: connection.name.clone(),
        db_type: connection.db_type.clone(),
        host: connection.host.clone(),
        port: connection.port,
        username: connection.username.clone(),
        password: None,
        database: connection.database.clone(),
        scope: connection.scope.clone(),
        options: std::collections::HashMap::new(),
        file_path: connection.file_path.clone(),
    };

    introspector.get_object_details(&config, &object).map_err(|e| e.to_string())
}

fn get_introspector(db_type: crate::database::DatabaseType) -> Box<dyn DatabaseIntrospector> {
    match db_type {
        crate::database::DatabaseType::PostgreSQL => Box::new(crate::database::introspection::PostgresIntrospector::new()),
        crate::database::DatabaseType::MySQL | crate::database::DatabaseType::MariaDB => Box::new(crate::database::introspection::MySqlIntrospector::new()),
        crate::database::DatabaseType::SQLite => Box::new(crate::database::introspection::SqliteIntrospector::new()),
        _ => Box::new(crate::database::introspection::PostgresIntrospector::new()),
    }
}
