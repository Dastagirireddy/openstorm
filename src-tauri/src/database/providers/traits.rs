/// Database Provider Trait - Single Responsibility Principle
///
/// Each database vendor implements this trait, allowing us to:
/// - Add new databases without modifying existing code (Open/Closed)
/// - Swap implementations easily (Dependency Inversion)
/// - Test each provider independently

use crate::database::{Result, ConnectionConfig};

/// Database provider interface - each vendor implements this
pub trait DatabaseProvider: Send + Sync {
    /// Returns the database type this provider handles
    fn db_type(&self) -> crate::database::DatabaseType;

    /// Test connection - returns true if successfully connected
    fn test_connection(&self, config: &ConnectionConfig) -> Result<bool>;

    /// Get connection string or URI for display/debug
    fn get_connection_string(&self, config: &ConnectionConfig) -> String;
}
