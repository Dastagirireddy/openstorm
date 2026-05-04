//! Database Introspection Commands - IPC handlers for schema metadata
//!
//! This module provides Tauri commands for:
//! - Getting database objects (databases, schemas, tables)
//! - Getting children of database objects
//! - Getting object details
//! - Disconnecting database connections

use tauri::State;
use crate::database::{DatabaseManager, ConnectionConfig};
use crate::database::introspection::{DatabaseIntrospector, DatabaseObject};
use std::path::PathBuf;

/// Get root database objects for a connection
#[tauri::command]
pub async fn db_get_objects(
    manager: State<'_, DatabaseManager>,
    connection_id: String,
    project_path: Option<String>,
) -> Result<Vec<DatabaseObject>, String> {
    let project = project_path.as_ref().map(|p| PathBuf::from(p));

    // Get the connection config
    let connections = manager.list_connections(project.as_deref());
    let connection = connections.iter()
        .find(|c| c.id == connection_id)
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;

    eprintln!("[db_get_objects] Found connection: {} (type: {:?})", connection.name, connection.db_type);
    eprintln!("[db_get_objects] Host: {}, Port: {}, Database: {:?}", connection.host, connection.port, connection.database);

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

    eprintln!("[db_get_objects] Creating pool...");
    // Get or create pool for this connection
    let pool = manager.get_or_create_pool(&config).await
        .map_err(|e| {
            eprintln!("[db_get_objects] Failed to create pool: {}", e);
            format!("Failed to get connection pool: {}", e)
        })?;
    eprintln!("[db_get_objects] Pool created/fetched successfully");

    // Get the appropriate introspector
    let introspector = get_introspector(connection.db_type.clone());

    eprintln!("[db_get_objects] Calling get_root_objects...");
    let result = introspector.get_root_objects(&pool, &config).map_err(|e| {
        eprintln!("[db_get_objects] get_root_objects failed: {}", e);
        e.to_string()
    })?;
    eprintln!("[db_get_objects] Returned {} objects", result.len());
    Ok(result)
}

/// Get children of a database object
#[tauri::command]
pub async fn db_get_children(
    manager: State<'_, DatabaseManager>,
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

    eprintln!("[db_get_children] parent.kind: {:?}, parent.name: {}", parent.kind, parent.name);

    // Get password from keychain
    let password = manager.get_password(&connection.id).ok().flatten();

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

    // Get or create pool for this connection
    let pool = manager.get_or_create_pool(&config).await
        .map_err(|e| {
            eprintln!("[db_get_children] Failed to create pool: {}", e);
            format!("Failed to get connection pool: {}", e)
        })?;

    // Get the appropriate introspector
    let introspector = get_introspector(connection.db_type.clone());

    eprintln!("[db_get_children] Calling get_children...");
    let result = introspector.get_children(&pool, &parent).map_err(|e| {
        eprintln!("[db_get_children] get_children failed: {}", e);
        e.to_string()
    })?;
    eprintln!("[db_get_children] Returned {} children", result.len());
    Ok(result)
}

/// Get detailed metadata for a database object
#[tauri::command]
pub async fn db_get_object_details(
    manager: State<'_, DatabaseManager>,
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

    // Get password from keychain
    let password = manager.get_password(&connection.id).ok().flatten();

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

    // Get or create pool for this connection
    let pool = manager.get_or_create_pool(&config).await
        .map_err(|e| format!("Failed to get connection pool: {}", e))?;

    // Get the appropriate introspector
    let introspector = get_introspector(connection.db_type.clone());

    introspector.get_object_details(&pool, &object).map_err(|e| e.to_string())
}

/// Close a database connection (remove from active pools)
#[tauri::command]
pub async fn db_disconnect(
    manager: State<'_, DatabaseManager>,
    connection_id: String,
) -> Result<(), String> {
    manager.close_pool(&connection_id).await
        .map_err(|e| format!("Failed to disconnect: {}", e))
}

fn get_introspector(db_type: crate::database::DatabaseType) -> Box<dyn DatabaseIntrospector> {
    match db_type {
        crate::database::DatabaseType::PostgreSQL => Box::new(crate::database::introspection::PostgresIntrospector::new()),
        crate::database::DatabaseType::MySQL | crate::database::DatabaseType::MariaDB => Box::new(crate::database::introspection::MySqlIntrospector::new()),
        crate::database::DatabaseType::SQLite => Box::new(crate::database::introspection::SqliteIntrospector::new()),
        _ => Box::new(crate::database::introspection::PostgresIntrospector::new()),
    }
}
