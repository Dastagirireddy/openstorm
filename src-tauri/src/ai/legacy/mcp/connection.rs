use rmcp::model::{CallToolRequestParams, Tool};
use rmcp::service::RunningService;
use rmcp::ServiceExt;
use tokio::process::Command;

use super::types::McpServerConfig;

pub struct McpServerConnection {
    #[allow(dead_code)]
    config: McpServerConfig,
    pub service: RunningService<rmcp::RoleClient, ()>,
    pub tools: Vec<Tool>,
}

impl McpServerConnection {
    pub async fn connect(config: &McpServerConfig) -> Result<Self, String> {
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

    pub async fn call_tool(&self, tool_name: &str, arguments: serde_json::Value) -> Result<String, String> {
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
