use std::collections::HashMap;
use serde::{Deserialize, Serialize};

use super::super::providers::ToolDefinition;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpConfigField {
    pub key: String,
    pub label: String,
    #[serde(default)]
    pub default: String,
    #[serde(default = "default_true")]
    pub required: bool,
    #[serde(default)]
    pub secret: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum McpConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

impl Default for McpConnectionState {
    fn default() -> Self {
        Self::Disconnected
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerStatus {
    pub name: String,
    pub connected: bool,
    pub state: McpConnectionState,
    pub tool_count: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpStatusEvent {
    pub name: String,
    pub state: McpConnectionState,
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
