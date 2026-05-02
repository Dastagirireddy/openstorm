/// Database connection manager
///
/// Manages the lifecycle of database connections, including:
/// - Loading/saving connections (global and project-specific)
/// - Creating and removing connections
/// - Merging global and project connections

use std::path::Path;
use std::sync::Mutex;
use crate::config::PathConfig;
use crate::database::{DatabaseError, Result, ConnectionConfig, ConnectionInfo, ConnectionScope};

/// Inner state of the database manager (mutable operations)
struct DatabaseManagerInner {
    // Placeholder for future connection pooling
}

/// Database manager - handles connection lifecycle
pub struct DatabaseManager {
    path_config: PathConfig,
    _inner: Mutex<DatabaseManagerInner>,
}

impl DatabaseManager {
    /// Create a new database manager
    pub fn new() -> Self {
        Self {
            path_config: PathConfig::new(),
            _inner: Mutex::new(DatabaseManagerInner {}),
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

        // Store password in keychain, then save metadata
        if let Some(password) = config.password.take() {
            self.store_password(&id, &password)?;
        }

        match config.scope {
            ConnectionScope::Global => {
                self.save_to_global(&config)?;
            }
            ConnectionScope::Project => {
                if let Some(project) = project_path {
                    self.save_to_project(&config, project)?;
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

    /// Test a connection (try to connect and disconnect)
    pub fn test_connection(&self, config: ConnectionConfig) -> Result<bool> {
        // TODO: Implement actual connection testing once we have providers
        // For now, just validate the config
        if config.host.is_empty() || config.username.is_empty() {
            return Ok(false);
        }
        Ok(true)
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

    // === Keychain operations ===

    fn store_password(&self, connection_id: &str, password: &str) -> Result<()> {
        use keyring::Entry;

        let entry = Entry::new("openstorm", connection_id)
            .map_err(|e| DatabaseError::KeychainError(e.to_string()))?;

        entry.set_password(password)
            .map_err(|e| DatabaseError::KeychainError(e.to_string()))?;

        Ok(())
    }

    fn get_password(&self, connection_id: &str) -> Result<Option<String>> {
        use keyring::Entry;

        let entry = Entry::new("openstorm", connection_id)
            .map_err(|e| DatabaseError::KeychainError(e.to_string()))?;

        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(DatabaseError::KeychainError(e.to_string())),
        }
    }

    fn delete_password(&self, connection_id: &str) -> Result<()> {
        use keyring::Entry;

        let entry = Entry::new("openstorm", connection_id)
            .map_err(|e| DatabaseError::KeychainError(e.to_string()))?;

        let _ = entry.delete_credential(); // Ignore if doesn't exist

        Ok(())
    }
}

impl Default for DatabaseManager {
    fn default() -> Self {
        Self::new()
    }
}
