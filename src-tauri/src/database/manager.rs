/// Database connection manager
///
/// Manages the lifecycle of database connections, including:
/// - Loading/saving connections (global and project-specific)
/// - Creating and removing connections
/// - Merging global and project connections

use std::path::Path;
use std::sync::Arc;
use dashmap::DashMap;
use sqlx::postgres::PgPool;
use sqlx::mysql::MySqlPool;
use sqlx::SqlitePool;
use crate::config::PathConfig;
use crate::database::{DatabaseError, Result, ConnectionConfig, ConnectionInfo, ConnectionScope, DatabaseType};
use crate::database::providers::*;

/// Union type for database pools
pub enum AnyPool {
    Postgres(PgPool),
    MySql(MySqlPool),
    Sqlite(SqlitePool),
}

impl Clone for AnyPool {
    fn clone(&self) -> Self {
        match self {
            AnyPool::Postgres(p) => AnyPool::Postgres(p.clone()),
            AnyPool::MySql(p) => AnyPool::MySql(p.clone()),
            AnyPool::Sqlite(p) => AnyPool::Sqlite(p.clone()),
        }
    }
}

/// Database manager - handles connection lifecycle
#[derive(Clone)]
pub struct DatabaseManager {
    path_config: Arc<PathConfig>,
    active_pools: Arc<DashMap<String, AnyPool>>,
}

impl DatabaseManager {
    /// Create a new database manager
    pub fn new() -> Self {
        Self {
            path_config: Arc::new(PathConfig::new()),
            active_pools: Arc::new(DashMap::new()),
        }
    }

    /// Get or create a pool for a connection (async version)
    pub async fn get_or_create_pool(&self, config: &ConnectionConfig) -> Result<AnyPool> {
        let connection_id = config.id.as_ref().unwrap().to_string();

        // Check if pool already exists
        if let Some(pool) = self.active_pools.get(&connection_id) {
            return Ok(pool.value().clone());
        }

        // Create new pool based on database type
        let pool = self.create_pool(config).await?;

        // Store in active pools
        self.active_pools.insert(connection_id, pool.clone());

        Ok(pool)
    }

    /// Create a new pool for a connection
    async fn create_pool(&self, config: &ConnectionConfig) -> Result<AnyPool> {
        match config.db_type {
            DatabaseType::PostgreSQL => {
                let connection_string = Self::build_postgres_connection_string(config);
                let pool = PgPool::connect(&connection_string).await
                    .map_err(|e| DatabaseError::ConnectionError(format!("Failed to connect: {}", e)))?;
                Ok(AnyPool::Postgres(pool))
            }
            DatabaseType::MySQL | DatabaseType::MariaDB => {
                let connection_string = Self::build_mysql_connection_string(config);
                let pool = MySqlPool::connect(&connection_string).await
                    .map_err(|e| DatabaseError::ConnectionError(format!("Failed to connect: {}", e)))?;
                Ok(AnyPool::MySql(pool))
            }
            DatabaseType::SQLite => {
                let connection_string = Self::build_sqlite_connection_string(config);
                let pool = SqlitePool::connect(&connection_string).await
                    .map_err(|e| DatabaseError::ConnectionError(format!("Failed to connect: {}", e)))?;
                Ok(AnyPool::Sqlite(pool))
            }
            _ => Err(DatabaseError::ConnectionError("Unsupported database type for pooling".to_string())),
        }
    }

    /// Build PostgreSQL connection string
    fn build_postgres_connection_string(config: &ConnectionConfig) -> String {
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
        let port = if config.port > 0 { format!(":{}", config.port) } else { String::from(":5432") };
        let dbname = config.database.as_deref().unwrap_or("postgres");

        format!("postgresql://{}{}{}/{}", auth, host, port, dbname)
    }

    /// Build MySQL connection string
    fn build_mysql_connection_string(config: &ConnectionConfig) -> String {
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

    /// Build SQLite connection string
    fn build_sqlite_connection_string(config: &ConnectionConfig) -> String {
        config.file_path.clone().unwrap_or_else(|| ":memory:".to_string())
    }

    /// Close and remove a pool
    pub async fn close_pool(&self, connection_id: &str) -> Result<()> {
        if let Some((_, pool)) = self.active_pools.remove(connection_id) {
            // Close the pool
            match pool {
                AnyPool::Postgres(p) => p.close().await,
                AnyPool::MySql(p) => p.close().await,
                AnyPool::Sqlite(p) => p.close().await,
            }
        }
        Ok(())
    }

    /// Close all pools (on app shutdown)
    pub async fn close_all_pools(&self) -> Result<()> {
        let keys: Vec<_> = self.active_pools.iter().map(|r| r.key().clone()).collect();
        for key in keys {
            let _ = self.close_pool(&key).await;
        }
        Ok(())
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
