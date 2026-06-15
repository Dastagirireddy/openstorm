//! Debug Commands
//!
//! This module handles debug session operations:
//! - `session` - Start/stop debug sessions, debug actions
//! - `inspection` - Stack traces, variables, scopes, evaluation
//! - `breakpoints` - Add, remove, manage breakpoints
//! - `breakpoint_storage` - Persistent breakpoint storage
//! - `types` - Shared types and pending breakpoint storage

pub mod types;
pub mod session;
pub mod inspection;
pub mod breakpoints;
pub mod breakpoint_storage;

pub use types::{DebugAction, AddBreakpointRequest, BreakpointInfo, SetBreakpointsForFileRequest};
pub use session::*;
pub use inspection::*;
pub use breakpoints::*;

use breakpoint_storage::load_breakpoints;

/// Load persisted breakpoints for a project
#[tauri::command]
pub fn load_project_breakpoints(project_root: String) -> Result<Vec<BreakpointInfo>, String> {
    let store = load_breakpoints(&project_root)?;

    let mut all_breakpoints = Vec::new();
    for (source_path, file_breakpoints) in store {
        for bp in file_breakpoints {
            all_breakpoints.push(BreakpointInfo {
                id: bp.id,
                source_path: source_path.clone(),
                line: bp.line,
                enabled: bp.enabled,
                verified: false,
                condition: bp.condition,
                hit_condition: bp.hit_condition,
                log_message: bp.log_message,
            });
        }
    }

    Ok(all_breakpoints)
}

/// Save a breakpoint to persistent storage
#[tauri::command]
pub fn save_breakpoint_to_storage(
    project_root: String,
    source_path: String,
    breakpoint: BreakpointInfo,
) -> Result<(), String> {
    breakpoint_storage::add_persisted_breakpoint(&project_root, &source_path, &breakpoint)
}

/// Remove a breakpoint from persistent storage
#[tauri::command]
pub fn remove_breakpoint_from_storage(
    project_root: String,
    source_path: String,
    line: u32,
) -> Result<(), String> {
    breakpoint_storage::remove_persisted_breakpoint(&project_root, &source_path, line)
}

/// Remove all breakpoints for a file from persistent storage
#[tauri::command]
pub fn remove_all_breakpoints_from_storage(
    project_root: String,
    source_path: String,
) -> Result<(), String> {
    breakpoint_storage::remove_all_breakpoints_for_file(&project_root, &source_path)
}
