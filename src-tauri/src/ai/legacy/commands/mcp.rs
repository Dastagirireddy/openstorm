use tauri::State;

use super::AiState;
use super::super::mcp::{McpManager, McpServerConfig, McpServerStatus, McpConnectionState};
use super::super::mcp::templates::McpTemplate;

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
            state: super::super::mcp::McpConnectionState::Disconnected,
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

pub async fn ai_mcp_test_server(config: McpServerConfig) -> Result<Vec<String>, String> {
    McpManager::test_server(&config).await
}

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

pub async fn ai_mcp_get_status(state: State<'_, AiState>) -> Result<Vec<McpServerStatus>, String> {
    let manager = state.mcp_manager.lock().await;
    Ok(manager.list_servers())
}

pub async fn ai_mcp_toggle_server(
    state: State<'_, AiState>,
    name: String,
    enabled: bool,
) -> Result<(), String> {
    let mut manager = state.mcp_manager.lock().await;
    manager.toggle_server(&name, enabled).await
}

pub async fn ai_mcp_list_templates() -> Result<Vec<McpTemplate>, String> {
    Ok(McpTemplate::all())
}

pub async fn ai_mcp_install_template(
    state: State<'_, AiState>,
    template_id: String,
) -> Result<McpServerStatus, String> {
    let template = McpTemplate::find(&template_id)
        .ok_or_else(|| format!("Template '{}' not found", template_id))?;

    let mut manager = state.mcp_manager.lock().await;

    if manager.list_servers().iter().any(|s| s.name == template.config.name) {
        return Ok(manager.list_servers()
            .into_iter()
            .find(|s| s.name == template.config.name)
            .unwrap());
    }

    manager.connect(template.config.clone()).await?;

    Ok(manager.list_servers()
        .into_iter()
        .find(|s| s.name == template.config.name)
        .unwrap_or(McpServerStatus {
            name: template.config.name,
            connected: false,
            state: McpConnectionState::Disconnected,
            tool_count: 0,
            error: None,
        }))
}
