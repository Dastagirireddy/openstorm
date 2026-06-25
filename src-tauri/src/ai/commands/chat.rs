use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;

use super::AiState;
use super::super::agent::{Agent, AgentEvent};
use super::super::orchestrator::Orchestrator;
use super::super::providers::{LlmProvider, Message};
use super::super::permissions::PermissionProfile;
use crate::config::AiProviderConfig;

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

    let provider: Arc<dyn LlmProvider> = match provider_id.as_str() {
        "ollama" => {
            let base_url = if config.base_url.is_empty() {
                None
            } else {
                Some(config.base_url.clone())
            };
            Arc::new(super::super::providers::OllamaProvider::new(base_url))
        }
        "lmstudio" => {
            let base_url = if config.base_url.is_empty() {
                None
            } else {
                Some(config.base_url.clone())
            };
            Arc::new(super::super::providers::LmStudioProvider::new(base_url))
        }
        _ => return Err(format!("Unknown provider: {}", provider_id)),
    };

    provider
        .check_connection()
        .await
        .map_err(|e| format!("Provider not reachable: {}", e))?;

    let messages: Vec<Message> = history
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect();

    let (orch_event_tx, mut orch_event_rx) = mpsc::channel::<AgentEvent>(64);

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

    let mcp_manager = state.mcp_manager();
    let agent = Arc::new(Agent::with_mcp(
        provider,
        model,
        project_path,
        PermissionProfile::Smart,
        orchestrator,
        mcp_manager,
    ));

    {
        let mut active = state.active_agent.lock().await;
        *active = Some(agent.clone());
    }
    {
        let approval_sender = agent.get_approval_sender().await;
        let mut tx = state.approval_tx.lock().await;
        *tx = approval_sender;
    }

    let (abort_tx, mut abort_rx) = mpsc::channel::<()>(1);
    {
        let mut tx = state.abort_tx.lock().await;
        *tx = Some(abort_tx);
    }

    let mut rx = agent.run(message, messages);
    let mut final_response = String::new();
    let mut _aborted = false;
    let mut agent_finished = false;

    loop {
        tokio::select! {
            event = rx.recv(), if !agent_finished => {
                match event {
                    Some(event) => {
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
                    None => { agent_finished = true; }
                }
            }
            orch_event = orch_event_rx.recv() => {
                if let Some(event) = orch_event {
                    let _ = app.emit("ai-agent-event", &event);
                } else if agent_finished {
                    break;
                }
            }
            _ = abort_rx.recv(), if !agent_finished => {
                _aborted = true;
                let _ = app.emit("ai-agent-event", &AgentEvent::Error {
                    message: "Aborted by user".to_string(),
                });
                break;
            }
        }
    }

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
