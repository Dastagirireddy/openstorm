use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{mpsc, Mutex};

use super::agent::{Agent, AgentEvent};
use super::mcp::{McpManager, McpServerConfig, McpServerStatus};
use super::orchestrator::Orchestrator;
use super::{LlmProvider, LmStudioProvider, Message, ModelInfo, OllamaProvider, ProviderInfo};
use crate::config::AiProviderConfig;

/// Active agent session state
pub struct AiState {
    /// Currently active agent (if any)
    active_agent: Mutex<Option<Arc<Agent>>>,
    /// Channel to send abort signals
    abort_tx: Mutex<Option<mpsc::Sender<()>>>,
    /// Channel to send tool approval responses
    approval_tx: Mutex<Option<mpsc::Sender<bool>>>,
    /// Orchestrator for sub-agent management
    orchestrator: Mutex<Option<Arc<Orchestrator>>>,
    /// MCP manager for external tool servers
    mcp_manager: Arc<Mutex<McpManager>>,
}

impl AiState {
    pub fn new() -> Self {
        let mut mcp_manager = McpManager::new();
        mcp_manager.load_configs();
        Self {
            active_agent: Mutex::new(None),
            abort_tx: Mutex::new(None),
            approval_tx: Mutex::new(None),
            orchestrator: Mutex::new(None),
            mcp_manager: Arc::new(Mutex::new(mcp_manager)),
        }
    }

    pub fn mcp_manager(&self) -> Arc<Mutex<McpManager>> {
        self.mcp_manager.clone()
    }
}

// ── Provider config ──────────────────────────────────────────

#[tauri::command]
pub async fn ai_get_config() -> Result<AiProviderConfig, String> {
    Ok(AiProviderConfig::load())
}

#[tauri::command]
pub async fn ai_set_config(config: AiProviderConfig) -> Result<(), String> {
    config.save()
}

// ── Provider discovery ─────────────────────────────────────────

#[tauri::command]
pub async fn ai_list_providers() -> Result<Vec<ProviderInfo>, String> {
    Ok(vec![
        ProviderInfo {
            id: "ollama".to_string(),
            name: "Ollama".to_string(),
            is_free: true,
            requires_api_key: false,
        },
        ProviderInfo {
            id: "lmstudio".to_string(),
            name: "LM Studio".to_string(),
            is_free: true,
            requires_api_key: false,
        },
    ])
}

#[tauri::command]
pub async fn ai_list_models(provider_id: String) -> Result<Vec<ModelInfo>, String> {
    match provider_id.as_str() {
        "ollama" => {
            let provider = OllamaProvider::new(None);
            provider
                .list_models()
                .await
                .map_err(|e| e.to_string())
        }
        "lmstudio" => {
            let config = AiProviderConfig::load();
            let base_url = if config.base_url.is_empty() {
                None
            } else {
                Some(config.base_url.clone())
            };
            let provider = LmStudioProvider::new(base_url);
            provider
                .list_models()
                .await
                .map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown provider: {}", provider_id)),
    }
}

#[tauri::command]
pub async fn ai_check_connection(provider_id: String) -> Result<bool, String> {
    match provider_id.as_str() {
        "ollama" => {
            let provider = OllamaProvider::new(None);
            provider
                .check_connection()
                .await
                .map_err(|e| e.to_string())
        }
        "lmstudio" => {
            let config = AiProviderConfig::load();
            let base_url = if config.base_url.is_empty() {
                None
            } else {
                Some(config.base_url.clone())
            };
            let provider = LmStudioProvider::new(base_url);
            provider
                .check_connection()
                .await
                .map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown provider: {}", provider_id)),
    }
}

// ── Chat ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    state: State<'_, AiState>,
    provider_id: String,
    model: String,
    message: String,
    project_path: String,
    history: Vec<serde_json::Value>,
) -> Result<String, String> {
    let config = AiProviderConfig::load();

    // Build provider
    let provider: Arc<dyn LlmProvider> = match provider_id.as_str() {
        "ollama" => {
            let base_url = if config.base_url.is_empty() {
                None
            } else {
                Some(config.base_url.clone())
            };
            Arc::new(OllamaProvider::new(base_url))
        }
        "lmstudio" => {
            let base_url = if config.base_url.is_empty() {
                None
            } else {
                Some(config.base_url.clone())
            };
            Arc::new(LmStudioProvider::new(base_url))
        }
        _ => return Err(format!("Unknown provider: {}", provider_id)),
    };

    // Check connection
    provider
        .check_connection()
        .await
        .map_err(|e| format!("Provider not reachable: {}", e))?;

    // Convert history
    let messages: Vec<Message> = history
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect();

    // Create event channel for orchestrator
    let (orch_event_tx, mut orch_event_rx) = mpsc::channel::<AgentEvent>(64);

    // Initialize orchestrator if not already present
    let orchestrator = {
        let mut orch = state.orchestrator.lock().await;
        if orch.is_none() {
            let new_orch = Arc::new(Orchestrator::new(
                provider.clone(),
                model.clone(),
                project_path.clone(),
                orch_event_tx.clone(),
            ));
            *orch = Some(new_orch);
        }
        orch.as_ref().unwrap().clone()
    };

    // Create agent with orchestrator and MCP support
    let mcp_manager = state.mcp_manager();
    let agent = Arc::new(Agent::with_mcp(
        provider,
        model,
        project_path,
        super::permissions::PermissionProfile::Smart,
        orchestrator,
        mcp_manager,
    ));

    // Store active agent
    {
        let mut active = state.active_agent.lock().await;
        *active = Some(agent.clone());
    }

    // Store approval sender from agent
    {
        let approval_sender = agent.get_approval_sender().await;
        let mut tx = state.approval_tx.lock().await;
        *tx = approval_sender;
    }

    // Create abort channel
    let (abort_tx, mut abort_rx) = mpsc::channel::<()>(1);
    {
        let mut tx = state.abort_tx.lock().await;
        *tx = Some(abort_tx);
    }

    // Run agent
    let mut rx = agent.run(message, messages);

    let mut final_response = String::new();
    let mut _aborted = false;

    let mut agent_finished = false;

    loop {
        tokio::select! {
            event = rx.recv(), if !agent_finished => {
                match event {
                    Some(event) => {
                        // Emit event to frontend
                        let _ = app.emit("ai-agent-event", &event);

                        match &event {
                            AgentEvent::Response { content, .. } => {
                                final_response = content.clone();
                            }
                            AgentEvent::Error { message } => {
                                final_response = format!("Error: {}", message);
                            }
                            _ => {}
                        }
                    }
                    None => {
                        agent_finished = true;
                    }
                }
            }
            orch_event = orch_event_rx.recv() => {
                // Forward orchestrator events to frontend
                if let Some(event) = orch_event {
                    let _ = app.emit("ai-agent-event", &event);
                } else {
                    // Orchestrator channel closed
                    if agent_finished {
                        break;
                    }
                }
            }
            _ = abort_rx.recv(), if !agent_finished => {
                // Abort requested
                _aborted = true;
                // Notify frontend that agent was aborted
                let _ = app.emit("ai-agent-event", &AgentEvent::Error {
                    message: "Aborted by user".to_string(),
                });
                break;
            }
        }
    }

    // Clear active agent
    {
        let mut active = state.active_agent.lock().await;
        *active = None;
    }
    {
        let mut tx = state.abort_tx.lock().await;
        *tx = None;
    }
    {
        let mut tx = state.approval_tx.lock().await;
        *tx = None;
    }

    Ok(final_response)
}

#[tauri::command]
pub async fn ai_abort(state: State<'_, AiState>) -> Result<(), String> {
    let tx = state.abort_tx.lock().await;
    if let Some(sender) = tx.as_ref() {
        let _ = sender.send(()).await;
        Ok(())
    } else {
        Err("No active request to abort".to_string())
    }
}

/// Reset all AI agent state. Called on frontend reload to ensure a clean session.
#[tauri::command]
pub async fn ai_reset(state: State<'_, AiState>) -> Result<(), String> {
    // Send abort signal to any running agent (ignore errors if none)
    {
        let tx = state.abort_tx.lock().await;
        if let Some(sender) = tx.as_ref() {
            let _ = sender.send(()).await;
        }
    }
    // Clear all state
    {
        let mut active = state.active_agent.lock().await;
        *active = None;
    }
    {
        let mut tx = state.abort_tx.lock().await;
        *tx = None;
    }
    {
        let mut tx = state.approval_tx.lock().await;
        *tx = None;
    }
    {
        let mut orch = state.orchestrator.lock().await;
        *orch = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn ai_approve_tool(state: State<'_, AiState>, approved: bool) -> Result<(), String> {
    let tx = state.approval_tx.lock().await;
    if let Some(sender) = tx.as_ref() {
        let _ = sender.send(approved).await;
        Ok(())
    } else {
        Err("No pending tool approval".to_string())
    }
}

// ── Sub-agent management ─────────────────────────────────────────

#[tauri::command]
pub async fn ai_get_orchestrator_status(state: State<'_, AiState>) -> Result<serde_json::Value, String> {
    let orch = state.orchestrator.lock().await;
    match orch.as_ref() {
        Some(orchestrator) => {
            let pending = orchestrator.pending_count().await;
            let active = orchestrator.active_count().await;
            Ok(serde_json::json!({
                "initialized": true,
                "pending_tasks": pending,
                "active_agents": active,
            }))
        }
        None => Ok(serde_json::json!({
            "initialized": false,
            "pending_tasks": 0,
            "active_agents": 0,
        })),
    }
}

#[tauri::command]
pub async fn ai_abort_subagent(state: State<'_, AiState>, task_id: String) -> Result<(), String> {
    let orch = state.orchestrator.lock().await;
    match orch.as_ref() {
        Some(orchestrator) => orchestrator.abort_task(&task_id).await,
        None => Err("Orchestrator not initialized".to_string()),
    }
}

#[tauri::command]
pub async fn ai_search_files(project_path: String, query: String, max_results: Option<usize>) -> Result<String, String> {
    use super::tools::ToolRegistry;
    use super::sandbox::Sandbox;

    let sandbox = Sandbox::new();
    let tools = ToolRegistry::with_sandbox(project_path, sandbox);
    
    let args = serde_json::json!({
        "query": query,
        "max_results": max_results.unwrap_or(10),
    });
    
    Ok(tools.execute("search_files", &args.to_string()).await)
}

#[tauri::command]
pub async fn ai_read_file(project_path: String, path: String, max_lines: Option<usize>) -> Result<String, String> {
    use super::tools::ToolRegistry;
    use super::sandbox::Sandbox;

    let sandbox = Sandbox::new();
    let tools = ToolRegistry::with_sandbox(project_path, sandbox);
    
    let args = serde_json::json!({
        "path": path,
    });
    
    let content = tools.execute("read_file", &args.to_string()).await;
    
    // Apply line limit (default: 500 lines max for attachments)
    let max = max_lines.unwrap_or(500);
    let lines: Vec<&str> = content.lines().collect();
    if lines.len() > max {
        Ok(format!("{}...\n[Truncated: {} of {} lines]", lines[..max].join("\n"), max, lines.len()))
    } else {
        Ok(content)
    }
}

// ── MCP (Model Context Protocol) ──────────────────────────────────

#[tauri::command]
pub async fn ai_mcp_list_servers(state: State<'_, AiState>) -> Result<Vec<McpServerStatus>, String> {
    let manager = state.mcp_manager.lock().await;
    Ok(manager.list_servers())
}

#[tauri::command]
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

#[tauri::command]
pub async fn ai_mcp_remove_server(
    state: State<'_, AiState>,
    name: String,
) -> Result<(), String> {
    let mut manager = state.mcp_manager.lock().await;
    manager.remove_server(&name).await
}

#[tauri::command]
pub async fn ai_mcp_test_server(config: McpServerConfig) -> Result<Vec<String>, String> {
    McpManager::test_server(&config).await
}

#[tauri::command]
pub async fn ai_mcp_list_tools(state: State<'_, AiState>) -> Result<Vec<super::mcp::McpCachedToolInfo>, String> {
    let manager = state.mcp_manager.lock().await;
    let tools = manager.list_tools();
    Ok(tools.into_iter().map(|t| super::mcp::McpCachedToolInfo {
        server_name: t.server_name,
        original_name: t.original_name,
        namespaced_name: t.definition.function.name,
        description: t.definition.function.description,
    }).collect())
}
