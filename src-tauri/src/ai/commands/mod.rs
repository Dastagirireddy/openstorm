pub mod state;

use tauri::{command, AppHandle, State};

use super::messages::content::UsageMetadata;
use super::tools::question_types::QuestionAnswer;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/// Chat request from frontend
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ChatRequest {
    pub message: String,
    pub history: Vec<serde_json::Value>,
    pub project_path: String,
    pub model: String,
    pub session_id: Option<String>,
}

/// Chat response to frontend
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChatResponse {
    pub content: String,
    pub tool_calls_made: u32,
    pub usage: Option<UsageMetadata>,
    pub success: bool,
}

/// Tool approval request
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ToolApprovalRequest {
    pub tool_call_id: String,
    pub approved: bool,
}

/// Spawn agent request
#[derive(Debug, Clone, serde::Deserialize)]
pub struct SpawnAgentRequest {
    pub task: String,
    pub role: String,
    pub parent_id: Option<String>,
}

/// Sub-agent status response
#[derive(Debug, Clone, serde::Serialize)]
pub struct SubAgentStatusResponse {
    pub task_id: String,
    pub status: String,
    pub summary: Option<String>,
}

/// Question response request
#[derive(Debug, Clone, serde::Deserialize)]
pub struct QuestionResponseRequest {
    pub answers: Vec<QuestionAnswer>,
}

// ═══════════════════════════════════════════════════════════════
// AI COMMANDS
// ═══════════════════════════════════════════════════════════════

/// Get AI provider configuration
#[command]
pub async fn ai_get_config() -> Result<crate::config::AiProviderConfig, String> {
    super::legacy::commands::ai_get_config().await
}

/// Set AI provider configuration
#[command]
pub async fn ai_set_config(config: crate::config::AiProviderConfig) -> Result<(), String> {
    super::legacy::commands::ai_set_config(config).await
}

/// List available models for a provider
#[command]
pub async fn ai_list_models(
    provider_id: String,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<Vec<super::legacy::providers::traits::ModelInfo>, String> {
    super::legacy::commands::ai_list_models(provider_id, api_key, base_url).await
}

/// Send a chat message to the AI agent
#[command]
pub async fn ai_chat(
    app: AppHandle,
    state: State<'_, super::legacy::commands::AiState>,
    provider_id: String,
    model: String,
    message: String,
    project_path: String,
    history: Vec<serde_json::Value>,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<String, String> {
    super::legacy::commands::ai_chat(
        app, state, provider_id, model, message, project_path, history, api_key, base_url,
    ).await
}

/// Abort the current agent execution
#[command]
pub async fn ai_abort(
    state: State<'_, super::legacy::commands::AiState>,
) -> Result<(), String> {
    super::legacy::commands::ai_abort(state).await
}

/// Reset all AI agent state
#[command]
pub async fn ai_reset(
    state: State<'_, super::legacy::commands::AiState>,
) -> Result<(), String> {
    super::legacy::commands::ai_reset(state).await
}

/// Approve or deny a tool execution
#[command]
pub async fn ai_approve_tool(
    state: State<'_, super::legacy::commands::AiState>,
    approved: bool,
) -> Result<(), String> {
    super::legacy::commands::ai_approve_tool(state, approved).await
}

/// Add an MCP server
#[command]
pub async fn ai_mcp_add_server(
    state: State<'_, super::legacy::commands::AiState>,
    config: super::legacy::mcp::McpServerConfig,
) -> Result<super::legacy::mcp::McpServerStatus, String> {
    super::legacy::commands::ai_mcp_add_server(state, config).await
}

/// Remove an MCP server
#[command]
pub async fn ai_mcp_remove_server(
    state: State<'_, super::legacy::commands::AiState>,
    name: String,
) -> Result<(), String> {
    super::legacy::commands::ai_mcp_remove_server(state, name).await
}

/// List MCP servers
#[command]
pub async fn ai_mcp_list_servers(
    state: State<'_, super::legacy::commands::AiState>,
) -> Result<Vec<super::legacy::mcp::McpServerStatus>, String> {
    super::legacy::commands::ai_mcp_list_servers(state).await
}

/// List available tools from all connected MCP servers
#[command]
pub async fn ai_mcp_list_tools(
    state: State<'_, super::legacy::commands::AiState>,
) -> Result<Vec<super::legacy::mcp::McpCachedToolInfo>, String> {
    super::legacy::commands::ai_mcp_list_tools(state).await
}

/// Test connection to an MCP server
#[command]
pub async fn ai_mcp_test_server(
    config: super::legacy::mcp::McpServerConfig,
) -> Result<Vec<String>, String> {
    super::legacy::commands::ai_mcp_test_server(config).await
}

/// Spawn a sub-agent
#[command]
pub async fn ai_spawn_agent(_request: SpawnAgentRequest) -> Result<String, String> {
    Ok(format!("spawned-{}", uuid::Uuid::new_v4()))
}

/// Get sub-agent status
#[command]
pub async fn ai_get_subagent_status(task_id: String) -> Result<SubAgentStatusResponse, String> {
    Ok(SubAgentStatusResponse {
        task_id,
        status: "completed".to_string(),
        summary: None,
    })
}

/// Respond to a question from the AI
#[command]
pub async fn ai_question_response(_request: QuestionResponseRequest) -> Result<(), String> {
    Ok(())
}

/// Search files in the project (for @ mention file suggestions)
#[command]
pub async fn ai_search_files(
    project_path: String,
    query: String,
    max_results: Option<usize>,
) -> Result<String, String> {
    super::legacy::commands::ai_search_files(project_path, query, max_results).await
}

/// Read a file's content (for @ mention file attachments)
#[command]
pub async fn ai_read_file(
    project_path: String,
    path: String,
    max_lines: Option<usize>,
) -> Result<String, String> {
    super::legacy::commands::ai_read_file(project_path, path, max_lines).await
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_request_deserialize() {
        let json = r#"{
            "message": "hello",
            "history": [],
            "project_path": "/project",
            "model": "gpt-4",
            "session_id": null
        }"#;
        let req: ChatRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.message, "hello");
        assert_eq!(req.model, "gpt-4");
    }

    #[test]
    fn test_chat_response_serialize() {
        let resp = ChatResponse {
            content: "Hello!".to_string(),
            tool_calls_made: 0,
            usage: None,
            success: true,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("Hello!"));
    }

    #[test]
    fn test_tool_approval_request_deserialize() {
        let json = r#"{"tool_call_id": "tc-1", "approved": true}"#;
        let req: ToolApprovalRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.tool_call_id, "tc-1");
        assert!(req.approved);
    }
}
