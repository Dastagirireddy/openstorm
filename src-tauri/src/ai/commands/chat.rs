use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc;

use super::AiState;
use super::super::agent::{Agent, AgentEvent};
use super::super::orchestrator::Orchestrator;
use super::super::providers::{LlmProvider, Message, ProviderRegistry};
use super::super::permissions::PermissionProfile;
use crate::config::AiProviderConfig;
use crate::graph::commands::GraphState;

#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    state: State<'_, AiState>,
    provider_id: String,
    model: String,
    message: String,
    project_path: String,
    history: Vec<serde_json::Value>,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<String, String> {
    // Log project path for debugging
    if project_path.is_empty() {
        eprintln!("[ai_chat] WARNING: project_path is empty!");
    } else {
        eprintln!("[ai_chat] project_path: {}", project_path);
    }

    let mut config = AiProviderConfig::load();
    // Override provider_id from the request
    config.provider = provider_id;
    // Use provided key, or resolve from per-provider store
    config.api_key = api_key.filter(|k| !k.is_empty())
        .unwrap_or_else(|| config.api_key_for(&config.provider));
    if let Some(url) = base_url {
        config.base_url = url;
    }

    let provider: Arc<dyn LlmProvider> = ProviderRegistry::create(&config)
        .map_err(|e| format!("Failed to create provider: {}", e))?;

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
    let process_manager = state.process_manager();

    // Create agent
    let mut agent = Agent::with_mcp_and_process_manager(
        provider,
        model,
        project_path.clone(),
        PermissionProfile::Smart,
        orchestrator,
        mcp_manager,
        process_manager,
    );

    // Try to attach graph store for graph-based RAG
    // Open a separate connection to the graph database for the agent
    let store_path = format!("{}/.openstorm/graph.db", project_path);
    if let Ok(graph_store) = crate::graph::store::GraphStore::open(&store_path) {
        let shared_store = Arc::new(tokio::sync::Mutex::new(graph_store));
        agent.set_graph_store(shared_store);
        eprintln!("[ai_chat] Graph RAG enabled for project: {}", project_path);
    } else {
        eprintln!("[ai_chat] Graph store not found, falling back to BM25 RAG");
    }

    let agent = Arc::new(agent);

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
