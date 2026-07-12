use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use tokio::sync::broadcast;

use super::connection::McpServerConnection;
use super::types::*;

const IDLE_TIMEOUT_SECS: u64 = 300;

pub struct McpManager {
    connections: HashMap<String, McpServerConnection>,
    configs: Vec<McpServerConfig>,
    states: HashMap<String, McpConnectionState>,
    errors: HashMap<String, String>,
    last_used: HashMap<String, Instant>,
    status_tx: broadcast::Sender<McpStatusEvent>,
}

impl McpManager {
    pub fn new() -> Self {
        let (status_tx, _) = broadcast::channel(64);
        Self {
            connections: HashMap::new(),
            configs: Vec::new(),
            states: HashMap::new(),
            errors: HashMap::new(),
            last_used: HashMap::new(),
            status_tx,
        }
    }

    pub fn subscribe_status(&self) -> broadcast::Receiver<McpStatusEvent> {
        self.status_tx.subscribe()
    }

    fn emit_status(&self, name: &str) {
        let state = self.states.get(name).copied().unwrap_or(McpConnectionState::Disconnected);
        let tool_count = self.connections.get(name).map(|c| c.tools.len()).unwrap_or(0);
        let error = self.errors.get(name).cloned();
        let _ = self.status_tx.send(McpStatusEvent {
            name: name.to_string(),
            state,
            tool_count,
            error,
        });
    }

    fn set_state(&mut self, name: &str, state: McpConnectionState) {
        self.states.insert(name.to_string(), state);
        self.emit_status(name);
    }

    pub fn load_configs(&mut self) {
        let path = Self::config_file_path();
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(configs) = serde_json::from_str::<Vec<McpServerConfig>>(&content) {
                self.configs = configs;
            }
        }
    }

    pub fn save_configs(&self) -> Result<(), String> {
        let path = Self::config_file_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_string_pretty(&self.configs).map_err(|e| e.to_string())?;
        std::fs::write(&path, json).map_err(|e| e.to_string())
    }

    fn config_file_path() -> PathBuf {
        let proj_dirs = directories::ProjectDirs::from("com", "OpenStorm", "OpenStorm")
            .expect("no valid home directory");
        proj_dirs.config_dir().join("mcp-servers.json")
    }

    pub async fn connect(&mut self, config: McpServerConfig) -> Result<(), String> {
        let name = config.name.clone();

        if self.connections.contains_key(&name) {
            self.disconnect(&name).await.ok();
        }

        self.set_state(&name, McpConnectionState::Connecting);

        match McpServerConnection::connect(&config).await {
            Ok(conn) => {
                self.connections.insert(name.clone(), conn);
                self.errors.remove(&name);
                self.last_used.insert(name.clone(), Instant::now());
                self.set_state(&name, McpConnectionState::Connected);
            }
            Err(e) => {
                self.errors.insert(name.clone(), e.clone());
                self.set_state(&name, McpConnectionState::Error);
                return Err(e);
            }
        }

        if let Some(existing) = self.configs.iter_mut().find(|c| c.name == name) {
            *existing = config;
        } else {
            self.configs.push(config);
        }

        self.save_configs()?;
        Ok(())
    }

    pub async fn disconnect(&mut self, name: &str) -> Result<(), String> {
        if let Some(mut conn) = self.connections.remove(name) {
            // Kill the process tree (including browsers, etc.)
            conn.kill_tree().await;
        }
        self.set_state(name, McpConnectionState::Disconnected);
        Ok(())
    }

    pub async fn remove_server(&mut self, name: &str) -> Result<(), String> {
        self.disconnect(name).await?;
        self.configs.retain(|c| c.name != name);
        self.states.remove(name);
        self.errors.remove(name);
        self.last_used.remove(name);
        self.save_configs()
    }

    pub async fn toggle_server(&mut self, name: &str, enabled: bool) -> Result<(), String> {
        let config_clone = self.configs.iter().find(|c| c.name == name).cloned();

        if let Some(mut config) = config_clone {
            config.enabled = enabled;

            if let Some(existing) = self.configs.iter_mut().find(|c| c.name == name) {
                existing.enabled = enabled;
            }
            self.save_configs()?;

            if !enabled {
                self.disconnect(name).await.ok();
            } else {
                self.connect(config).await.ok();
            }
        }
        Ok(())
    }

    pub fn list_servers(&self) -> Vec<McpServerStatus> {
        self.configs
            .iter()
            .map(|config| {
                let state = self.states.get(&config.name).copied().unwrap_or(McpConnectionState::Disconnected);
                let connected = state == McpConnectionState::Connected;
                let tool_count = self
                    .connections
                    .get(&config.name)
                    .map(|c| c.tools.len())
                    .unwrap_or(0);
                let error = self.errors.get(&config.name).cloned();
                McpServerStatus {
                    name: config.name.clone(),
                    connected,
                    state,
                    tool_count,
                    error,
                }
            })
            .collect()
    }

    pub fn list_tools(&self) -> Vec<McpCachedTool> {
        let mut all_tools = Vec::new();

        for (server_name, conn) in &self.connections {
            for tool in &conn.tools {
                let namespaced_name = format!("mcp__{}__{}", server_name, tool.name);
                let description = tool
                    .description
                    .as_ref()
                    .map(|d| d.to_string())
                    .unwrap_or_else(|| format!("MCP tool from {}", server_name));

                let definition = super::super::providers::ToolDefinition {
                    tool_type: "function".to_string(),
                    function: super::super::providers::FunctionDefinition {
                        name: namespaced_name,
                        description,
                        parameters: {
                            let schema_obj = &tool.input_schema;
                            serde_json::to_value(schema_obj)
                                .unwrap_or(serde_json::json!({"type": "object", "properties": {}}))
                        },
                    },
                };

                all_tools.push(McpCachedTool {
                    server_name: server_name.clone(),
                    original_name: tool.name.to_string(),
                    definition,
                });
            }
        }

        all_tools
    }

    pub async fn call_tool(&mut self, full_name: &str, arguments: &str) -> Result<String, String> {
        let parts: Vec<&str> = full_name.splitn(3, "__").collect();
        if parts.len() != 3 || parts[0] != "mcp" {
            return Err(format!("Invalid MCP tool name: {}", full_name));
        }

        let server_name = parts[1];
        let tool_name = parts[2];

        self.last_used.insert(server_name.to_string(), Instant::now());

        if !self.connections.contains_key(server_name) {
            self.ensure_connected(server_name).await?;
        }

        let conn = self
            .connections
            .get(server_name)
            .ok_or_else(|| format!("MCP server '{}' not connected", server_name))?;

        let args: serde_json::Value =
            serde_json::from_str(arguments).unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

        conn.call_tool(tool_name, args).await
    }

    pub fn is_mcp_tool(&self, name: &str) -> bool {
        name.starts_with("mcp__")
    }

    pub async fn test_server(config: &McpServerConfig) -> Result<Vec<String>, String> {
        let mut conn = McpServerConnection::connect(config).await?;
        let tool_names: Vec<String> = conn.tools.iter().map(|t| t.name.to_string()).collect();
        conn.kill_tree().await;
        Ok(tool_names)
    }

    pub async fn connect_all(&mut self) {
        let configs: Vec<McpServerConfig> = self
            .configs
            .iter()
            .filter(|c| c.enabled)
            .cloned()
            .collect();

        for config in configs {
            if let Err(e) = self.connect(config.clone()).await {
                eprintln!("[MCP] Failed to connect to '{}': {}", config.name, e);
            }
        }
    }

    pub async fn ensure_connected(&mut self, server_name: &str) -> Result<(), String> {
        if self.connections.contains_key(server_name) {
            self.last_used.insert(server_name.to_string(), Instant::now());
            return Ok(());
        }

        let config = self
            .configs
            .iter()
            .find(|c| c.name == server_name)
            .cloned()
            .ok_or_else(|| format!("MCP server '{}' not configured", server_name))?;

        self.connect(config).await
    }

    pub fn shutdown_idle(&mut self) -> Vec<String> {
        let now = Instant::now();
        let timeout = Duration::from_secs(IDLE_TIMEOUT_SECS);
        let mut to_shutdown = Vec::new();

        for (name, last) in &self.last_used {
            if now.duration_since(*last) > timeout {
                if self.connections.contains_key(name) {
                    to_shutdown.push(name.clone());
                }
            }
        }

        to_shutdown
    }

    pub async fn disconnect_idle(&mut self) {
        let to_shutdown = self.shutdown_idle();
        for name in to_shutdown {
            eprintln!("[MCP] Shutting down idle server '{}'", name);
            if let Err(e) = self.disconnect(&name).await {
                eprintln!("[MCP] Error disconnecting idle server '{}': {}", name, e);
            }
        }
    }
}
