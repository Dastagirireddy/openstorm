/// PostgreSQL Provider - handles PostgreSQL connections using sqlx
///
/// Uses sqlx for async, native connection testing with TLS support.

use crate::database::{Result, ConnectionConfig, DatabaseType};
use super::traits::DatabaseProvider;

pub struct PostgresProvider;

impl PostgresProvider {
    pub fn new() -> Self {
        Self
    }
}

impl DatabaseProvider for PostgresProvider {
    fn db_type(&self) -> DatabaseType {
        DatabaseType::PostgreSQL
    }

    fn test_connection(&self, config: &ConnectionConfig) -> Result<bool> {
        let connection_string = self.get_connection_string(config);

        // Use tokio to run async sqlx in blocking context
        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| crate::database::DatabaseError::ConnectionError(
                format!("Failed to create runtime: {}", e)
            ))?;

        rt.block_on(async {
            // Try to connect using sqlx
            match sqlx::PgPool::connect(&connection_string).await {
                Ok(pool) => {
                    // Ping to verify connection is alive
                    match sqlx::query("SELECT 1").fetch_optional(&pool).await {
                        Ok(_) => {
                            pool.close().await;
                            Ok(true)
                        }
                        Err(e) => {
                            pool.close().await;
                            Err(crate::database::DatabaseError::ConnectionError(
                                format!("Query failed: {}", e)
                            ))
                        }
                    }
                }
                Err(e) => Err(crate::database::DatabaseError::ConnectionError(
                    format!("Failed to connect: {}", e)
                ))
            }
        })
    }

    fn get_connection_string(&self, config: &ConnectionConfig) -> String {
        // Build PostgreSQL connection URL
        // postgresql://[user[:password]@][host][:port]/[dbname]

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
}

impl Default for PostgresProvider {
    fn default() -> Self {
        Self::new()
    }
}
