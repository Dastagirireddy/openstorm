/// Database error types
use thiserror::Error;

/// Database operation errors
#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("Connection not found: {0}")]
    ConnectionNotFound(String),

    #[error("Connection already exists: {0}")]
    ConnectionAlreadyExists(String),

    #[error("Failed to connect to database: {0}")]
    ConnectionError(String),

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Query execution failed: {0}")]
    QueryFailed(String),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Keychain error: {0}")]
    KeychainError(String),

    #[error("Unsupported database type: {0}")]
    UnsupportedDatabaseType(String),
}

pub type Result<T> = std::result::Result<T, DatabaseError>;
