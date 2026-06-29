use tauri::State;

use super::GraphState;
use crate::graph::query::GraphQuery;
use crate::graph::types::GraphNode;

#[tauri::command]
pub fn graph_search(
    state: State<'_, GraphState>,
    query: String,
    max_results: usize,
) -> Result<Vec<GraphNode>, String> {
    let store_guard = state.store.lock().map_err(|e| e.to_string())?;
    let store = store_guard.as_ref().ok_or("Graph store not initialized")?;
    let query_engine = GraphQuery::new(store);
    query_engine
        .search_nodes(&query, max_results)
        .map_err(|e| e.to_string())
}
