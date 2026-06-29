use serde::Serialize;
use tauri::State;

use super::GraphState;

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

    let mut stmt = store
        .conn()
        .prepare(
            "SELECT file_path, start_line FROM nodes WHERE id = ?1 LIMIT 1",
        )
        .map_err(|e| e.to_string())?;

    let row = stmt
        .query_row(rusqlite::params![node_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?))
        })
        .map_err(|_| "Node not found".to_string())?;

    Ok(FileLocation {
        file_path: row.0,
        line: row.1,
    })
}
