use super::ToolRegistry;

impl ToolRegistry {
    /// Execute a tool call on an MCP server
    pub(super) async fn execute_mcp_tool(&self, name: &str, arguments: &str) -> String {
        let mcp_manager = match &self.mcp_manager {
            Some(m) => m,
            None => return format!("MCP not available (manager not initialized). Tool '{}'.", name),
        };

        let mut manager = mcp_manager.lock().await;
        match manager.call_tool(name, arguments).await {
            Ok(result) => result,
            Err(e) => format!("MCP tool '{}' failed: {}", name, e),
        }
    }
}
