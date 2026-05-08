/// MongoDB Provider - handles MongoDB connections using mongodb driver
///
/// Uses the official MongoDB Rust driver for connection testing.

use crate::database::{Result, ConnectionConfig, DatabaseType};
use super::traits::DatabaseProvider;

pub struct MongoDbProvider;

impl MongoDbProvider {
    pub fn new() -> Self {
        Self
    }
}

impl DatabaseProvider for MongoDbProvider {
    fn db_type(&self) -> DatabaseType {
        DatabaseType::MongoDB
    }

    fn test_connection(&self, config: &ConnectionConfig) -> Result<bool> {
        let connection_string = self.get_connection_string(config);

        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| crate::database::DatabaseError::ConnectionError(
                format!("Failed to create runtime: {}", e)
            ))?;

        rt.block_on(async {
            use mongodb::{Client, options::ClientOptions};

            // Parse connection string
            let client_options = ClientOptions::parse(&connection_string).await
                .map_err(|e| crate::database::DatabaseError::ConnectionError(
                    format!("Failed to parse connection string: {}", e)
                ))?;

            // Connect to MongoDB
            let client = Client::with_options(client_options)
                .map_err(|e| crate::database::DatabaseError::ConnectionError(
                    format!("Failed to create client: {}", e)
                ))?;

            // Ping the server
            match client.database("admin").run_command(mongodb::bson::doc! { "ping": 1 }).await {
                Ok(_) => Ok(true),
                Err(e) => Err(crate::database::DatabaseError::ConnectionError(
                    format!("Ping failed: {}", e)
                ))
            }
        })
    }

    fn get_connection_string(&self, config: &ConnectionConfig) -> String {
        // MongoDB connection URI: mongodb://[user:password@]host[:port]/[dbname]
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
        let port = if config.port > 0 { format!(":{}", config.port) } else { String::from(":27017") };
        let dbname = config.database.as_deref().unwrap_or("");

        if dbname.is_empty() {
            format!("mongodb://{}{}{}", auth, host, port)
        } else {
            format!("mongodb://{}{}{}/{}", auth, host, port, dbname)
        }
    }
}

impl Default for MongoDbProvider {
    fn default() -> Self {
        Self::new()
    }
}
