/// Database providers - concrete implementations for each database type
///
/// This module contains the actual database connection implementations
/// following the Provider pattern for extensibility.

mod traits;
mod postgres;
mod mysql;
mod sqlite;
mod mongodb;
mod redis;

pub use traits::DatabaseProvider;
pub use postgres::PostgresProvider;
pub use mysql::MySqlProvider;
pub use sqlite::SqliteProvider;
pub use mongodb::MongoDbProvider;
pub use redis::RedisProvider;
