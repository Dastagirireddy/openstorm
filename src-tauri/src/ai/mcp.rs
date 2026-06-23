use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use rmcp::model::{CallToolRequestParams, Tool};
use rmcp::service::RunningService;
use rmcp::ServiceExt;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio::sync::Mutex;

use super::provider::{FunctionDefinition, ToolDefinition};

/// Configuration for a single MCP server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    /// Unique name for this server (e.g. "playwright", "github")
    pub name: String,
    /// Command to launch the server (e.g. "npx")
    pub command: String,
    /// Arguments for the command (e.g. ["-y", "@playwright/mcp@latest"])
    pub args: Vec<String>,
    /// Optional environment variables
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Whether this server is enabled
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

/// Status of an MCP server connection (serializable for frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerStatus {
    pub name: String,
    pub connected: bool,
    pub tool_count: usize,
    pub error: Option<String>,
}

/// A cached tool definition from an MCP server
#[derive(Debug, Clone)]
pub struct McpCachedTool {
    pub server_name: String,
    pub original_name: String,
    pub definition: ToolDefinition,
}

/// Tool info for frontend display (serializable)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpCachedToolInfo {
    pub server_name: String,
    pub original_name: String,
    pub namespaced_name: String,
    pub description: String,
}

/// Active connection to an MCP server
struct McpServerConnection {
    #[allow(dead_code)]
    config: McpServerConfig,
    service: RunningService<rmcp::RoleClient, ()>,
    tools: Vec<Tool>,
}

impl McpServerConnection {
    async fn connect(config: &McpServerConfig) -> Result<Self, String> {
        let mut cmd = Command::new(&config.command);
        for arg in &config.args {
            cmd.arg(arg);
        }
        for (key, value) in &config.env {
            cmd.env(key, value);
        }

        let service = ()
            .serve(rmcp::transport::TokioChildProcess::new(cmd)
                .map_err(|e| format!("Failed to spawn MCP server '{}': {}", config.name, e))?)
            .await
            .map_err(|e| format!("MCP handshake failed for '{}': {}", config.name, e))?;

        let tools = service
            .list_all_tools()
            .await
            .map_err(|e| format!("Failed to list tools from '{}': {}", config.name, e))?;

        Ok(Self {
            config: config.clone(),
            service,
            tools,
        })
    }

    async fn call_tool(&self, tool_name: &str, arguments: serde_json::Value) -> Result<String, String> {
        let args_map = match arguments {
            serde_json::Value::Object(m) => Some(m),
            _ => None,
        };

        let params = CallToolRequestParams {
            meta: None,
            name: tool_name.to_string().into(),
            arguments: args_map,
            task: None,
        };

        let result = self.service
            .call_tool(params)
            .await
            .map_err(|e| format!("MCP tool call failed: {}", e))?;

        // Extract text content from result
        let mut output = Vec::new();
        for content in &result.content {
            if let Some(text_content) = content.as_text() {
                output.push(text_content.text.clone());
            } else {
                output.push("[Non-text content]".to_string());
            }
        }

        if result.is_error.unwrap_or(false) {
            Err(output.join("\n"))
        } else {
            Ok(output.join("\n"))
        }
    }
}

/// Manages connections to multiple MCP servers
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

    /// Load server configs from disk
    pub fn load_configs(&mut self) {
        let path = Self::config_file_path();
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(configs) = serde_json::from_str::<Vec<McpServerConfig>>(&content) {
                self.configs = configs;
            }
        }
    }

    /// Save server configs to disk
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

    /// Connect to a server by config
    pub async fn connect(&mut self, config: McpServerConfig) -> Result<(), String> {
        // Disconnect existing if any
        if self.connections.contains_key(&config.name) {
            self.disconnect(&config.name).await.ok();
        }

        let conn = McpServerConnection::connect(&config).await?;
        self.connections.insert(config.name.clone(), conn);

        // Update or add config
        if let Some(existing) = self.configs.iter_mut().find(|c| c.name == config.name) {
            *existing = config;
        } else {
            self.configs.push(config);
        }

        self.save_configs()?;
        Ok(())
    }

    /// Disconnect from a server
    pub async fn disconnect(&mut self, name: &str) -> Result<(), String> {
        if let Some(conn) = self.connections.remove(name) {
            conn.service
                .cancel()
                .await
                .map_err(|e| format!("Error disconnecting '{}': {}", name, e))?;
        }
        Ok(())
    }

    /// Remove a server config entirely
    pub async fn remove_server(&mut self, name: &str) -> Result<(), String> {
        self.disconnect(name).await?;
        self.configs.retain(|c| c.name != name);
        self.save_configs()
    }

    /// Get status of all configured servers
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

    /// Get all MCP tool definitions (merged from all connected servers)
    /// Returns tools in OpenAI function-calling format with namespaced names
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

                let definition = ToolDefinition {
                    tool_type: "function".to_string(),
                    function: FunctionDefinition {
                        name: namespaced_name,
                        description,
                        parameters: {
                            // MCP input_schema is already a JsonObject (serde_json::Map)
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

    /// Execute a namespaced MCP tool call
    /// Tool name format: "mcp__{server_name}__{tool_name}"
    pub async fn call_tool(&self, full_name: &str, arguments: &str) -> Result<String, String> {
        // Parse namespaced tool name
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

    /// Check if a tool name is an MCP tool
    pub fn is_mcp_tool(&self, name: &str) -> bool {
        name.starts_with("mcp__")
    }

    /// Test a server connection (connect, list tools, disconnect)
    pub async fn test_server(config: &McpServerConfig) -> Result<Vec<String>, String> {
        let conn = McpServerConnection::connect(config).await?;
        let tool_names: Vec<String> = conn.tools.iter().map(|t| t.name.to_string()).collect();
        conn.service
            .cancel()
            .await
            .map_err(|e| format!("Error closing test connection: {}", e))?;
        Ok(tool_names)
    }

    /// Connect to all enabled servers
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
