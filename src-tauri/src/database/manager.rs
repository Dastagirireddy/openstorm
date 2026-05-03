/// Database connection manager
///
/// Manages the lifecycle of database connections, including:
/// - Loading/saving connections (global and project-specific)
/// - Creating and removing connections
/// - Merging global and project connections

use std::path::Path;
use std::sync::Arc;
use crate::config::PathConfig;
use crate::database::{DatabaseError, Result, ConnectionConfig, ConnectionInfo, ConnectionScope, DatabaseType};
use crate::database::providers::*;

/// Database manager - handles connection lifecycle
#[derive(Clone)]
pub struct DatabaseManager {
    path_config: Arc<PathConfig>,
}

impl DatabaseManager {
    /// Create a new database manager
    pub fn new() -> Self {
        Self {
            path_config: Arc::new(PathConfig::new()),
        }
    }

    /// List all connections (merged global + project)
    pub fn list_connections(&self, project_path: Option<&Path>) -> Vec<ConnectionInfo> {
        let mut connections = Vec::new();

        // Load global connections first
        if let Ok(global) = self.load_global_connections() {
            connections.extend(global);
        }

        // Load project-specific connections (override globals with same ID)
        if let Some(project) = project_path {
            if let Ok(project_conns) = self.load_project_connections(project) {
                for conn in project_conns {
                    if let Some(existing) = connections.iter_mut().find(|c| c.id == conn.id) {
                        *existing = conn;
                    } else {
                        connections.push(conn);
                    }
                }
            }
        }

        connections
    }

    /// Add a new connection
    pub fn add_connection(&self, config: ConnectionConfig, project_path: Option<&Path>) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let mut config = config;
        config.id = Some(id.clone());

        eprintln!("[DatabaseManager] Adding connection: {} (type: {:?})", config.name, config.db_type);
        eprintln!("[DatabaseManager] Password present: {}", config.password.is_some());

        // DEBUG MODE: Store password directly in JSON file (skip keychain entirely)
        // WARNING: This is insecure - only for debugging!
        let password_to_store = config.password.clone();

        // Remove password from config before saving to JSON
        config.password = None;

        match config.scope {
            ConnectionScope::Global => {
                self.save_to_global(&config)?;
                // After saving metadata, store password separately
                if let Some(pwd) = password_to_store {
                    self.save_password_to_file(&id, &pwd)?;
                }
            }
            ConnectionScope::Project => {
                if let Some(project) = project_path {
                    self.save_to_project(&config, project)?;
                    if let Some(pwd) = password_to_store {
                        self.save_password_to_file(&id, &pwd)?;
                    }
                } else {
                    return Err(DatabaseError::IoError(std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "No project path provided for project-scoped connection",
                    )));
                }
            }
        }

        Ok(id)
    }

    /// Remove a connection
    pub fn remove_connection(&self, id: &str, project_path: Option<&Path>) -> Result<()> {
        // Try to remove from project first, then global
        if let Some(project) = project_path {
            if self.delete_from_project(id, project).is_ok() {
                return Ok(());
            }
        }
        self.delete_from_global(id)
    }

    /// Update a connection
    pub fn update_connection(&self, config: ConnectionConfig, project_path: Option<&Path>) -> Result<()> {
        // Handle password update
        if let Some(password) = config.password.clone() {
            self.store_password(&config.id.as_ref().unwrap(), &password)?;
        }

        let mut config_no_password = config.clone();
        config_no_password.password = None;

        match config.scope {
            ConnectionScope::Global => {
                self.save_to_global(&config_no_password)?;
            }
            ConnectionScope::Project => {
                if let Some(project) = project_path {
                    self.save_to_project(&config_no_password, project)?;
                } else {
                    return Err(DatabaseError::IoError(std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "No project path provided for project-scoped connection",
                    )));
                }
            }
        }

        Ok(())
    }

    /// Test a connection using the appropriate provider
    pub fn test_connection(&self, config: ConnectionConfig) -> Result<bool> {
        // Get the appropriate provider for the database type
        let provider = self.get_provider(config.db_type.clone());
        provider.test_connection(&config)
    }

    /// Get the appropriate provider for a database type
    fn get_provider(&self, db_type: DatabaseType) -> Box<dyn crate::database::DatabaseProvider> {
        match db_type {
            DatabaseType::PostgreSQL => Box::new(PostgresProvider::new()),
            DatabaseType::MySQL | DatabaseType::MariaDB => Box::new(MySqlProvider::new()),
            DatabaseType::SQLite => Box::new(SqliteProvider::new()),
            DatabaseType::MongoDB => Box::new(MongoDbProvider::new()),
            DatabaseType::Redis => Box::new(RedisProvider::new()),
            // Default to Postgres for unknown types
            _ => Box::new(PostgresProvider::new()),
        }
    }

    /// Make a connection global (move from project to global storage)
    pub fn make_connection_global(&self, connection_id: &str, project_path: &Path) -> Result<()> {
        // Load from project storage
        let conn = self.load_from_project(connection_id, project_path)?;

        // Save to global storage
        self.save_to_global(&conn)?;

        // Remove from project storage
        self.delete_from_project(connection_id, project_path)?;

        Ok(())
    }

    /// Make a connection project-specific (move from global to project storage)
    pub fn make_connection_project(&self, connection_id: &str, project_path: &Path) -> Result<()> {
        // Load from global storage
        let conn = self.load_from_global(connection_id)?;

        // Save to project storage
        self.save_to_project(&conn, project_path)?;

        // Remove from global storage
        self.delete_from_global(connection_id)?;

        Ok(())
    }

    // === Private helper methods ===

    fn load_global_connections(&self) -> Result<Vec<ConnectionInfo>> {
        let path = self.path_config.global_connections_file();
        if !path.exists() {
            return Ok(Vec::new());
        }
        let content = std::fs::read_to_string(&path)?;
        let connections: Vec<ConnectionInfo> = serde_json::from_str(&content)?;
        Ok(connections)
    }

    fn load_project_connections(&self, project_path: &Path) -> Result<Vec<ConnectionInfo>> {
        let path = self.path_config.project_connections_file(project_path);
        if !path.exists() {
            return Ok(Vec::new());
        }
        let content = std::fs::read_to_string(&path)?;
        let connections: Vec<ConnectionInfo> = serde_json::from_str(&content)?;
        Ok(connections)
    }

    fn load_from_global(&self, id: &str) -> Result<ConnectionConfig> {
        let connections = self.load_global_connections()?;
        connections.into_iter()
            .find(|c| c.id == id)
            .map(|info| self.connection_info_to_config(info))
            .ok_or_else(|| DatabaseError::ConnectionNotFound(id.to_string()))
    }

    fn load_from_project(&self, id: &str, project_path: &Path) -> Result<ConnectionConfig> {
        let connections = self.load_project_connections(project_path)?;
        connections.into_iter()
            .find(|c| c.id == id)
            .map(|info| self.connection_info_to_config(info))
            .ok_or_else(|| DatabaseError::ConnectionNotFound(id.to_string()))
    }

    fn connection_info_to_config(&self, info: ConnectionInfo) -> ConnectionConfig {
        ConnectionConfig {
            id: Some(info.id),
            name: info.name,
            db_type: info.db_type,
            host: info.host,
            port: info.port,
            username: info.username,
            password: None, // Password stored in keychain
            database: info.database,
            scope: info.scope,
            options: std::collections::HashMap::new(),
            file_path: info.file_path,
        }
    }

    fn save_to_global(&self, config: &ConnectionConfig) -> Result<()> {
        let mut connections = self.load_global_connections()?;

        // Update or add connection
        let info = ConnectionInfo::from_config(config);
        if let Some(existing) = connections.iter_mut().find(|c| c.id == info.id) {
            *existing = info;
        } else {
            connections.push(info);
        }

        let content = serde_json::to_string_pretty(&connections)?;
        std::fs::write(self.path_config.global_connections_file(), content)?;
        Ok(())
    }

    fn save_to_project(&self, config: &ConnectionConfig, project_path: &Path) -> Result<()> {
        let mut connections = self.load_project_connections(project_path)?;

        // Update or add connection
        let info = ConnectionInfo::from_config(config);
        if let Some(existing) = connections.iter_mut().find(|c| c.id == info.id) {
            *existing = info;
        } else {
            connections.push(info);
        }

        // Ensure directory exists
        let dir = self.path_config.project_config_dir(project_path);
        std::fs::create_dir_all(&dir)?;

        let content = serde_json::to_string_pretty(&connections)?;
        std::fs::write(self.path_config.project_connections_file(project_path), content)?;
        Ok(())
    }

    fn delete_from_global(&self, id: &str) -> Result<()> {
        let mut connections = self.load_global_connections()?;
        connections.retain(|c| c.id != id);

        let content = serde_json::to_string_pretty(&connections)?;
        std::fs::write(self.path_config.global_connections_file(), content)?;

        // Also remove password from keychain
        let _ = self.delete_password(id);

        Ok(())
    }

    fn delete_from_project(&self, id: &str, project_path: &Path) -> Result<()> {
        let mut connections = self.load_project_connections(project_path)?;
        connections.retain(|c| c.id != id);

        let content = serde_json::to_string_pretty(&connections)?;
        std::fs::write(self.path_config.project_connections_file(project_path), content)?;

        // Also remove password from keychain
        let _ = self.delete_password(id);

        Ok(())
    }

    // === Password file operations (DEBUG - replacing keychain) ===

    fn save_password_to_file(&self, connection_id: &str, password: &str) -> Result<()> {
        eprintln!("[PasswordFile] Storing password for connection: {}", connection_id);

        // Get the app data directory for storing passwords
        let password_file = self.path_config.app_data_dir().join("passwords").join(format!("{}.txt", connection_id));

        // Ensure directory exists
        if let Some(parent) = password_file.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Write password to file
        std::fs::write(&password_file, password)?;
        eprintln!("[PasswordFile] Password stored to: {:?}", password_file);
        Ok(())
    }

    pub fn get_password(&self, connection_id: &str) -> Result<Option<String>> {
        eprintln!("[PasswordFile] Retrieving password for connection: {}", connection_id);

        let password_file = self.path_config.app_data_dir().join("passwords").join(format!("{}.txt", connection_id));

        if !password_file.exists() {
            eprintln!("[PasswordFile] Password file not found: {:?}", password_file);
            return Ok(None);
        }

        match std::fs::read_to_string(&password_file) {
            Ok(password) => {
                eprintln!("[PasswordFile] Password retrieved successfully");
                Ok(Some(password))
            }
            Err(e) => {
                eprintln!("[PasswordFile] Error reading password: {}", e);
                Err(DatabaseError::IoError(e))
            }
        }
    }

    fn delete_password(&self, connection_id: &str) -> Result<()> {
        let password_file = self.path_config.app_data_dir().join("passwords").join(format!("{}.txt", connection_id));
        if password_file.exists() {
            let _ = std::fs::remove_file(&password_file);
            eprintln!("[PasswordFile] Password deleted: {:?}", password_file);
        }
        Ok(())
    }

    // === Keychain operations (deprecated - kept for reference) ===

    #[allow(dead_code)]
    fn store_password(&self, connection_id: &str, password: &str) -> Result<()> {
        use keyring::Entry;

        eprintln!("[Keychain] Storing password for connection: {}", connection_id);
        let entry = Entry::new("openstorm", connection_id)
            .map_err(|e| {
                eprintln!("[Keychain] Failed to create entry: {}", e);
                DatabaseError::KeychainError(e.to_string())
            })?;

        entry.set_password(password)
            .map_err(|e| {
                eprintln!("[Keychain] Failed to set password: {}", e);
                DatabaseError::KeychainError(e.to_string())
            })?;

        eprintln!("[Keychain] Password stored successfully");
        Ok(())
    }
}

impl Default for DatabaseManager {
    fn default() -> Self {
        Self::new()
    }
}
