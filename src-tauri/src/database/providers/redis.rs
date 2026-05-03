/// Redis Provider - handles Redis connections using redis-rs
///
/// Uses the redis crate for connection testing.

use crate::database::{Result, ConnectionConfig, DatabaseType};
use super::traits::DatabaseProvider;

pub struct RedisProvider;

impl RedisProvider {
    pub fn new() -> Self {
        Self
    }
}

impl DatabaseProvider for RedisProvider {
    fn db_type(&self) -> DatabaseType {
        DatabaseType::Redis
    }

    fn test_connection(&self, config: &ConnectionConfig) -> Result<bool> {
        let connection_string = self.get_connection_string(config);

        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| crate::database::DatabaseError::ConnectionError(
                format!("Failed to create runtime: {}", e)
            ))?;

        rt.block_on(async {
            // Use redis crate for connection test
            let client = redis::Client::open(connection_string.as_str())
                .map_err(|e| crate::database::DatabaseError::ConnectionError(
                    format!("Failed to create client: {}", e)
                ))?;

            let mut conn = client.get_async_connection().await
                .map_err(|e| crate::database::DatabaseError::ConnectionError(
                    format!("Failed to connect: {}", e)
                ))?;

            // PING the server
            let _: String = redis::cmd("PING").query_async(&mut conn).await
                .map_err(|e| crate::database::DatabaseError::ConnectionError(
                    format!("PING failed: {}", e)
                ))?;

            Ok(true)
        })
    }

    fn get_connection_string(&self, config: &ConnectionConfig) -> String {
        // Redis connection URL: redis://[user:password@]host[:port]
        let auth = if let Some(password) = &config.password {
            if !password.is_empty() {
                if !config.username.is_empty() {
                    format!("{}:{}@", config.username, password)
                } else {
                    format!(":{}@", password)
                }
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        let host = if config.host.is_empty() { "localhost" } else { &config.host };
        let port = if config.port > 0 { format!(":{}", config.port) } else { String::from(":6379") };

        format!("redis://{}{}{}", auth, host, port)
    }
}

impl Default for RedisProvider {
    fn default() -> Self {
        Self::new()
    }
}
