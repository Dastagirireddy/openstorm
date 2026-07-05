use tauri::State;

use super::AiState;
use super::super::mcp::{McpManager, McpServerConfig, McpServerStatus};

pub async fn ai_mcp_list_servers(state: State<'_, AiState>) -> Result<Vec<McpServerStatus>, String> {
    let manager = state.mcp_manager.lock().await;
    Ok(manager.list_servers())
}

pub async fn ai_mcp_add_server(
    state: State<'_, AiState>,
    config: McpServerConfig,
) -> Result<McpServerStatus, String> {
    let mut manager = state.mcp_manager.lock().await;
    manager.connect(config.clone()).await?;
    let status = manager.list_servers()
        .into_iter()
        .find(|s| s.name == config.name)
        .unwrap_or(McpServerStatus {
            name: config.name,
            connected: false,
            tool_count: 0,
            error: Some("Server not found after connect".to_string()),
        });
    Ok(status)
}

pub async fn ai_mcp_remove_server(
    state: State<'_, AiState>,
    name: String,
) -> Result<(), String> {
    let mut manager = state.mcp_manager.lock().await;
    manager.remove_server(&name).await
}

#[allow(dead_code)]
pub async fn ai_mcp_test_server(config: McpServerConfig) -> Result<Vec<String>, String> {
    McpManager::test_server(&config).await
}

#[allow(dead_code)]
pub async fn ai_mcp_list_tools(state: State<'_, AiState>) -> Result<Vec<super::super::mcp::McpCachedToolInfo>, String> {
    let manager = state.mcp_manager.lock().await;
    let tools = manager.list_tools();
    Ok(tools.into_iter().map(|t| super::super::mcp::McpCachedToolInfo {
        server_name: t.server_name,
        original_name: t.original_name,
        namespaced_name: t.definition.function.name,
        description: t.definition.function.description,
    }).collect())
}
