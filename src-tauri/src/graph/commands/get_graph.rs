use tauri::State;

use super::GraphState;
use crate::graph::types::GraphData;

#[tauri::command]
pub fn graph_get_all(state: State<'_, GraphState>) -> Result<GraphData, String> {
    let store_guard = state.store.lock().map_err(|e| e.to_string())?;
    let store = store_guard.as_ref().ok_or("Graph store not initialized")?;
    store.get_full_graph().map_err(|e| e.to_string())
}
