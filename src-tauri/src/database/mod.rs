/// Database module - connection management and query execution
///
/// This module provides a plugin-based architecture for supporting multiple
/// database vendors (SQL and NoSQL) following SOLID principles.
///
/// # Architecture
///
/// - `types.rs` - Connection types, configuration, and query results
/// - `error.rs` - Database error types
/// - `manager.rs` - Connection lifecycle management
/// - `traits/` - Trait definitions for database providers (future)
/// - `providers/` - Database-specific implementations (future)

pub mod error;
pub mod types;
pub mod manager;

pub use error::{DatabaseError, Result};
pub use manager::DatabaseManager;
pub use types::{ConnectionConfig, ConnectionInfo, ConnectionScope, DatabaseType};
