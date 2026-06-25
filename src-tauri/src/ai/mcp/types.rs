use std::collections::HashMap;
use serde::{Deserialize, Serialize};

use super::super::providers::{FunctionDefinition, ToolDefinition};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerStatus {
    pub name: String,
    pub connected: bool,
    pub tool_count: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct McpCachedTool {
    pub server_name: String,
    pub original_name: String,
    pub definition: ToolDefinition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpCachedToolInfo {
    pub server_name: String,
    pub original_name: String,
    pub namespaced_name: String,
    pub description: String,
}
