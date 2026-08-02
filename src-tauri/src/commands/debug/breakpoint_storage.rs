//! Debug Commands - Breakpoint Persistence
//!
//! Save and load breakpoints to/from `.openstorm/breakpoints.json`

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use super::types::BreakpointInfo;

const CONFIG_DIR: &str = ".openstorm";
const BREAKPOINTS_FILE: &str = "breakpoints.json";

/// Serializable breakpoint data for persistence
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedBreakpoint {
    pub id: u32,
    pub line: u32,
    pub enabled: bool,
    pub condition: Option<String>,
    pub hit_condition: Option<String>,
    pub log_message: Option<String>,
}

/// Map of source_path -> list of breakpoints
pub type BreakpointStore = HashMap<String, Vec<PersistedBreakpoint>>;

/// Get the breakpoints file path for a project
fn breakpoints_file(project_root: &str) -> PathBuf {
    let path = PathBuf::from(project_root);
    path.join(CONFIG_DIR).join(BREAKPOINTS_FILE)
}

/// Load all persisted breakpoints for a project
pub fn load_breakpoints(project_root: &str) -> Result<BreakpointStore, String> {
    let file = breakpoints_file(project_root);

    if !file.exists() {
        return Ok(HashMap::new());
    }

    let content = fs::read_to_string(&file)
        .map_err(|e| format!("Failed to read breakpoints file: {}", e))?;

    let store: BreakpointStore = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse breakpoints JSON: {}", e))?;

    Ok(store)
}

/// Save all breakpoints for a project
pub fn save_breakpoints(project_root: &str, store: &BreakpointStore) -> Result<(), String> {
    let file = breakpoints_file(project_root);

    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize breakpoints: {}", e))?;

    fs::write(&file, &content)
        .map_err(|e| format!("Failed to write breakpoints file: {}", e))?;

    Ok(())
}

/// Add a single breakpoint to the persisted store
pub fn add_persisted_breakpoint(
    project_root: &str,
    source_path: &str,
    breakpoint: &BreakpointInfo,
) -> Result<(), String> {
    let mut store = load_breakpoints(project_root)?;

    let file_breakpoints = store.entry(source_path.to_string()).or_insert_with(Vec::new);

    let exists = file_breakpoints.iter().any(|bp| bp.line == breakpoint.line);
    if exists {
        return Ok(());
    }

    file_breakpoints.push(PersistedBreakpoint {
        id: breakpoint.id,
        line: breakpoint.line,
        enabled: breakpoint.enabled,
        condition: breakpoint.condition.clone(),
        hit_condition: breakpoint.hit_condition.clone(),
        log_message: breakpoint.log_message.clone(),
    });

    save_breakpoints(project_root, &store)
}

/// Remove a breakpoint from the persisted store
pub fn remove_persisted_breakpoint(
    project_root: &str,
    source_path: &str,
    line: u32,
) -> Result<(), String> {
    let mut store = load_breakpoints(project_root)?;

    if let Some(file_breakpoints) = store.get_mut(source_path) {
        file_breakpoints.retain(|bp| bp.line != line);
        if file_breakpoints.is_empty() {
            store.remove(source_path);
        }
    }

    save_breakpoints(project_root, &store)
}

/// Remove all breakpoints for a file from the persisted store
pub fn remove_all_breakpoints_for_file(
    project_root: &str,
    source_path: &str,
) -> Result<(), String> {
    let mut store = load_breakpoints(project_root)?;
    store.remove(source_path);
    save_breakpoints(project_root, &store)
}

/// Update a breakpoint's enabled state in the persisted store
pub fn toggle_breakpoint(
    project_root: &str,
    source_path: &str,
    line: u32,
    enabled: bool,
) -> Result<(), String> {
    let mut store = load_breakpoints(project_root)?;

    if let Some(file_breakpoints) = store.get_mut(source_path) {
        if let Some(bp) = file_breakpoints.iter_mut().find(|bp| bp.line == line) {
            bp.enabled = enabled;
        }
    }

    save_breakpoints(project_root, &store)
}
