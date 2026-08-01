/// ClickHouse Provider - handles ClickHouse connections using the HTTP interface
///
/// Uses the clickhouse crate for async connection testing via HTTP (port 8123).

use crate::database::{Result, ConnectionConfig, DatabaseType};
use super::traits::DatabaseProvider;

pub struct ClickHouseProvider;

impl ClickHouseProvider {
    pub fn new() -> Self {
        Self
    }
}

impl DatabaseProvider for ClickHouseProvider {
    fn db_type(&self) -> DatabaseType {
        DatabaseType::ClickHouse
    }

    fn test_connection(&self, config: &ConnectionConfig) -> Result<bool> {
        eprintln!("[ClickHouse] test_connection called");
        eprintln!("[ClickHouse] Config: host={}, port={}, username={}, database={:?}",
            config.host, config.port, config.username, config.database);

        let url = Self::build_url(config);
        eprintln!("[ClickHouse] Built URL: {}", url);

        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| {
                eprintln!("[ClickHouse] Failed to create runtime: {}", e);
                crate::database::DatabaseError::ConnectionError(
                    format!("Failed to create runtime: {}", e)
                )
            })?;

        rt.block_on(async {
            let mut client = clickhouse::Client::default()
                .with_url(&url);

            if !config.username.is_empty() {
                eprintln!("[ClickHouse] Setting username: {}", config.username);
                client = client.with_user(&config.username);
            }
            if let Some(password) = &config.password {
                if !password.is_empty() {
                    eprintln!("[ClickHouse] Setting password: [present]");
                    client = client.with_password(password);
                }
            }
            if let Some(database) = &config.database {
                eprintln!("[ClickHouse] Setting database: {}", database);
                client = client.with_database(database);
            }

            eprintln!("[ClickHouse] Executing test query: SELECT 1");
            match client.query("SELECT 1").fetch_one::<u8>().await {
                Ok(val) => {
                    eprintln!("[ClickHouse] Test query succeeded, result: {}", val);
                    Ok(true)
                },
                Err(e) => {
                    eprintln!("[ClickHouse] Test query failed: {}", e);
                    eprintln!("[ClickHouse] Error debug: {:?}", e);
                    Err(crate::database::DatabaseError::ConnectionError(
                        format!("ClickHouse connection failed: {}", e)
                    ))
                }
            }
        })
    }

    fn get_connection_string(&self, config: &ConnectionConfig) -> String {
        Self::build_url(config)
    }
}

impl ClickHouseProvider {
    fn build_url(config: &ConnectionConfig) -> String {
        let host = if config.host.is_empty() { "localhost" } else { &config.host };
        let port = if config.port > 0 { config.port } else { 8123 };
        format!("http://{}:{}", host, port)
    }
}

impl Default for ClickHouseProvider {
    fn default() -> Self {
        Self::new()
    }
}
