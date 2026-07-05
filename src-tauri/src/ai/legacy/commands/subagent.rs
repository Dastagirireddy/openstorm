use tauri::State;

use super::AiState;

#[allow(dead_code)]
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

#[allow(dead_code)]
pub async fn ai_abort_subagent(state: State<'_, AiState>, task_id: String) -> Result<(), String> {
    let orch = state.orchestrator.lock().await;
    match orch.as_ref() {
        Some(orchestrator) => orchestrator.abort_task(&task_id).await,
        None => Err("Orchestrator not initialized".to_string()),
    }
}
