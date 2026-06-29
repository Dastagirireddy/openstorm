use serde::Serialize;
use tauri::State;

use super::GraphState;
use crate::graph::query::GraphQuery;

#[derive(Serialize)]
pub struct FileLocation {
    pub file_path: String,
    pub line: u32,
}

#[tauri::command]
pub fn graph_navigate_to(
    state: State<'_, GraphState>,
    node_id: String,
) -> Result<FileLocation, String> {
    let store_guard = state.store.lock().map_err(|e| e.to_string())?;
    let store = store_guard.as_ref().ok_or("Graph store not initialized")?;
    let query = GraphQuery::new(store);

    let nodes = query
        .search_nodes(&node_id, 1)
        .map_err(|e| e.to_string())?;

    let node = nodes.first().ok_or("Node not found")?;

    Ok(FileLocation {
        file_path: node.file_path.clone(),
        line: node.start_line,
    })
}
