use std::collections::HashMap;
use std::path::PathBuf;

use super::connection::McpServerConnection;
use super::types::*;

pub struct McpManager {
    connections: HashMap<String, McpServerConnection>,
    configs: Vec<McpServerConfig>,
}

impl McpManager {
    pub fn new() -> Self {
        Self {
            connections: HashMap::new(),
            configs: Vec::new(),
        }
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
        if self.connections.contains_key(&config.name) {
            self.disconnect(&config.name).await.ok();
        }

        let conn = McpServerConnection::connect(&config).await?;
        self.connections.insert(config.name.clone(), conn);

        if let Some(existing) = self.configs.iter_mut().find(|c| c.name == config.name) {
            *existing = config;
        } else {
            self.configs.push(config);
        }

        self.save_configs()?;
        Ok(())
    }

    pub async fn disconnect(&mut self, name: &str) -> Result<(), String> {
        if let Some(conn) = self.connections.remove(name) {
            conn.service
                .cancel()
                .await
                .map_err(|e| format!("Error disconnecting '{}': {}", name, e))?;
        }
        Ok(())
    }

    pub async fn remove_server(&mut self, name: &str) -> Result<(), String> {
        self.disconnect(name).await?;
        self.configs.retain(|c| c.name != name);
        self.save_configs()
    }

    pub fn list_servers(&self) -> Vec<McpServerStatus> {
        self.configs
            .iter()
            .map(|config| {
                let connected = self.connections.contains_key(&config.name);
                let tool_count = self
                    .connections
                    .get(&config.name)
                    .map(|c| c.tools.len())
                    .unwrap_or(0);
                McpServerStatus {
                    name: config.name.clone(),
                    connected,
                    tool_count,
                    error: None,
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

    pub async fn call_tool(&self, full_name: &str, arguments: &str) -> Result<String, String> {
        let parts: Vec<&str> = full_name.splitn(3, "__").collect();
        if parts.len() != 3 || parts[0] != "mcp" {
            return Err(format!("Invalid MCP tool name: {}", full_name));
        }

        let server_name = parts[1];
        let tool_name = parts[2];

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
        let conn = McpServerConnection::connect(config).await?;
        let tool_names: Vec<String> = conn.tools.iter().map(|t| t.name.to_string()).collect();
        conn.service
            .cancel()
            .await
            .map_err(|e| format!("Error closing test connection: {}", e))?;
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
}
