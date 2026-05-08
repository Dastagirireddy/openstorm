/// MySQL Provider - handles MySQL/MariaDB connections using sqlx
///
/// Uses sqlx for async, native connection testing.

use crate::database::{Result, ConnectionConfig, DatabaseType};
use super::traits::DatabaseProvider;

pub struct MySqlProvider;

impl MySqlProvider {
    pub fn new() -> Self {
        Self
    }
}

impl DatabaseProvider for MySqlProvider {
    fn db_type(&self) -> DatabaseType {
        DatabaseType::MySQL
    }

    fn test_connection(&self, config: &ConnectionConfig) -> Result<bool> {
        let connection_string = self.get_connection_string(config);

        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| crate::database::DatabaseError::ConnectionError(
                format!("Failed to create runtime: {}", e)
            ))?;

        rt.block_on(async {
            match sqlx::MySqlPool::connect(&connection_string).await {
                Ok(pool) => {
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
        // MySQL connection URL: mysql://[user[:password]@][host][:port]/[dbname]

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
        let dbname = config.database.as_deref().unwrap_or("");

        if dbname.is_empty() {
            format!("mysql://{}{}{}", auth, host, port)
        } else {
            format!("mysql://{}{}{}/{}", auth, host, port, dbname)
        }
    }
}

impl Default for MySqlProvider {
    fn default() -> Self {
        Self::new()
    }
}
