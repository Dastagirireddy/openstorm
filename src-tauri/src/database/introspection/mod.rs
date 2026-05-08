/// Database introspection - retrieves schema/metadata from databases
///
/// This module provides functionality to:
/// - List databases/schemas
/// - List tables, views, collections
/// - Get column information
/// - Get index information

mod traits;
mod postgres;
mod mysql;
mod sqlite;

pub use traits::{DatabaseIntrospector, DatabaseObject};
pub use postgres::PostgresIntrospector;
pub use mysql::MySqlIntrospector;
pub use sqlite::SqliteIntrospector;
