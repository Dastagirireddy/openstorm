use tauri::State;

use super::AiState;

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
    // Kill all background processes first
    {
        let mut pm = state.process_manager.lock().await;
        pm.kill_all().await;
    }
    {
        let tx = state.abort_tx.lock().await;
        if let Some(sender) = tx.as_ref() {
            let _ = sender.send(()).await;
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
