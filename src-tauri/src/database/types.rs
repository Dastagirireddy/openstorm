/// Database connection types
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Supported database types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseType {
    PostgreSQL,
    MySQL,
    MariaDB,
    SQLite,
    MongoDB,
    Redis,
    SQLServer,
    Oracle,
    Cassandra,
    ClickHouse,
    CockroachDB,
    Neo4j,
    DynamoDB,
    Elasticsearch,
}

impl std::fmt::Display for DatabaseType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DatabaseType::PostgreSQL => write!(f, "PostgreSQL"),
            DatabaseType::MySQL => write!(f, "MySQL"),
            DatabaseType::MariaDB => write!(f, "MariaDB"),
            DatabaseType::SQLite => write!(f, "SQLite"),
            DatabaseType::MongoDB => write!(f, "MongoDB"),
            DatabaseType::Redis => write!(f, "Redis"),
            DatabaseType::SQLServer => write!(f, "SQL Server"),
            DatabaseType::Oracle => write!(f, "Oracle"),
            DatabaseType::Cassandra => write!(f, "Cassandra"),
            DatabaseType::ClickHouse => write!(f, "ClickHouse"),
            DatabaseType::CockroachDB => write!(f, "CockroachDB"),
            DatabaseType::Neo4j => write!(f, "Neo4j"),
            DatabaseType::DynamoDB => write!(f, "DynamoDB"),
            DatabaseType::Elasticsearch => write!(f, "Elasticsearch"),
        }
    }
}

impl DatabaseType {
    /// Get the default port for this database type
    pub fn default_port(&self) -> u16 {
        match self {
            DatabaseType::PostgreSQL => 5432,
            DatabaseType::MySQL => 3306,
            DatabaseType::MariaDB => 3306,
            DatabaseType::SQLite => 0,
            DatabaseType::MongoDB => 27017,
            DatabaseType::Redis => 6379,
            DatabaseType::SQLServer => 1433,
            DatabaseType::Oracle => 1521,
            DatabaseType::Cassandra => 9042,
            DatabaseType::ClickHouse => 8123,
            DatabaseType::CockroachDB => 26257,
            DatabaseType::Neo4j => 7687,
            DatabaseType::DynamoDB => 0,
            DatabaseType::Elasticsearch => 9200,
        }
    }

    /// Get the Iconify icon name for this database type
    pub fn icon(&self) -> &'static str {
        match self {
            DatabaseType::PostgreSQL => "simple-icons:postgresql",
            DatabaseType::MySQL => "simple-icons:mysql",
            DatabaseType::MariaDB => "simple-icons:mariadb",
            DatabaseType::SQLite => "simple-icons:sqlite",
            DatabaseType::MongoDB => "simple-icons:mongodb",
            DatabaseType::Redis => "simple-icons:redis",
            DatabaseType::SQLServer => "simple-icons:microsoftsqlserver",
            DatabaseType::Oracle => "simple-icons:oracle",
            DatabaseType::Cassandra => "simple-icons:apache",
            DatabaseType::ClickHouse => "simple-icons:clickhouse",
            DatabaseType::CockroachDB => "simple-icons:cockroach",
            DatabaseType::Neo4j => "simple-icons:neo4j",
            DatabaseType::DynamoDB => "simple-icons:amazondynamodb",
            DatabaseType::Elasticsearch => "simple-icons:elasticsearch",
        }
    }
}

/// Connection scope - determines where the connection is stored
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionScope {
    /// Available in all projects (stored in global config)
    Global,
    /// Only available in specific project (stored in .openstorm/connections.json)
    Project,
}

/// Connection information (without sensitive data)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub id: String,
    pub name: String,
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub database: Option<String>,
    pub scope: ConnectionScope,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
}

impl ConnectionInfo {
    /// Create a new connection info from a config
    pub fn from_config(config: &ConnectionConfig) -> Self {
        let now = chrono::Utc::now();
        Self {
            id: config.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string()),
            name: config.name.clone(),
            db_type: config.db_type.clone(),
            host: config.host.clone(),
            port: config.port,
            username: config.username.clone(),
            database: config.database.clone(),
            scope: config.scope.clone(),
            created_at: now,
            updated_at: now,
            file_path: config.file_path.clone(),
        }
    }
}

/// Connection configuration (includes sensitive data)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    #[serde(rename = "type")]
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>, // Stored in keychain, not serialized to file
    #[serde(skip_serializing_if = "Option::is_none")]
    pub database: Option<String>,
    pub scope: ConnectionScope,
    #[serde(default)]
    pub options: std::collections::HashMap<String, String>, // Driver-specific options (SSL, timeout, etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>, // For SQLite file-based databases
}

impl ConnectionConfig {
    /// Create a new connection config
    pub fn new(name: String, db_type: DatabaseType, host: String, username: String) -> Self {
        let port = db_type.default_port();
        Self {
            id: None,
            name,
            db_type,
            host,
            port,
            username,
            password: None,
            database: None,
            scope: ConnectionScope::Project,
            options: std::collections::HashMap::new(),
            file_path: None,
        }
    }

    /// Set the connection scope
    pub fn with_scope(mut self, scope: ConnectionScope) -> Self {
        self.scope = scope;
        self
    }

    /// Set the database name
    pub fn with_database(mut self, database: String) -> Self {
        self.database = Some(database);
        self
    }

    /// Set the password
    pub fn with_password(mut self, password: String) -> Self {
        self.password = Some(password);
        self
    }

    /// Set the file path (for SQLite)
    pub fn with_file_path(mut self, file_path: String) -> Self {
        self.file_path = Some(file_path);
        self
    }
}

/// Query result from database execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Row>,
    pub rows_affected: Option<u64>,
    pub execution_time_ms: u64,
}

/// Column information in a query result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub type_name: Option<String>,
    pub nullable: Option<bool>,
}

/// A single row in a query result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Row {
    pub values: Vec<serde_json::Value>,
}

/// Table information from schema introspection
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub name: String,
    pub schema: Option<String>,
    pub kind: TableKind, // table, view, etc.
}

/// Type of table-like object
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TableKind {
    Table,
    View,
    MaterializedView,
    Collection, // For NoSQL
}

/// Column information from schema introspection
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaColumnInfo {
    pub name: String,
    pub type_name: String,
    pub nullable: bool,
    pub default: Option<String>,
    pub is_primary_key: bool,
    pub is_auto_increment: bool,
}

/// Index information from schema introspection
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    pub is_primary: bool,
}
