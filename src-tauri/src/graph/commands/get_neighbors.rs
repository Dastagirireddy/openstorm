use tauri::State;

use super::GraphState;
use crate::graph::query::GraphQuery;
use crate::graph::types::GraphNode;

#[tauri::command]
pub fn graph_get_neighbors(
    state: State<'_, GraphState>,
    node_id: String,
    depth: u32,
) -> Result<Vec<GraphNode>, String> {
    let store_guard = state.store.lock().map_err(|e| e.to_string())?;
    let store = store_guard.as_ref().ok_or("Graph store not initialized")?;
    let query = GraphQuery::new(store);
    query.get_neighbors(&node_id, depth).map_err(|e| e.to_string())
}
