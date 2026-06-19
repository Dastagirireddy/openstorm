use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{mpsc, Mutex};

use super::agent::{Agent, AgentEvent};
use super::lmstudio::LmStudioProvider;
use super::ollama::OllamaProvider;
use super::provider::{LlmProvider, Message, ModelInfo, ProviderInfo};
use crate::config::AiProviderConfig;

/// Active agent session state
pub struct AiState {
    /// Currently active agent (if any)
    active_agent: Mutex<Option<Arc<Agent>>>,
    /// Channel to send abort signals
    abort_tx: Mutex<Option<mpsc::Sender<()>>>,
    /// Channel to send tool approval responses
    approval_tx: Mutex<Option<mpsc::Sender<bool>>>,
}

impl AiState {
    pub fn new() -> Self {
        Self {
            active_agent: Mutex::new(None),
            abort_tx: Mutex::new(None),
            approval_tx: Mutex::new(None),
        }
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

    // Create agent
    let agent = Arc::new(Agent::new(provider, model, project_path));

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

    loop {
        tokio::select! {
            event = rx.recv() => {
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
                    None => break, // Channel closed, agent finished
                }
            }
            _ = abort_rx.recv() => {
                // Abort requested
                _aborted = true;
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
