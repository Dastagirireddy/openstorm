//! Session persistence module for saving/restoring project state.
//!
//! Sessions are stored in the global config directory as JSON files.
//! Each project gets its own session file based on a hash of the project path.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;

/// A single tab in the session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionTab {
    pub id: String,
    pub name: String,
    pub path: String,
    pub modified: bool,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default, alias = "tabType")]
    pub tab_type: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default, alias = "lastUsed")]
    pub last_used: Option<u64>,
}

/// Panel visibility state
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PanelState {
    #[serde(default, alias = "git_panel_visible")]
    pub git_panel_visible: bool,
    #[serde(default, alias = "commit_panel_visible")]
    pub commit_panel_visible: bool,
    #[serde(default, alias = "active_status_bar_panel")]
    pub active_status_bar_panel: Option<String>,
    #[serde(default, alias = "sidebarWidth")]
    pub sidebar_width: Option<u32>,
    #[serde(default, alias = "terminalHeight")]
    pub terminal_height: Option<u32>,
}

/// Project session state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSession {
    pub project_path: String,
    #[serde(default)]
    pub tabs: Vec<SessionTab>,
    #[serde(default)]
    pub active_tab_id: Option<String>,
    #[serde(default)]
    pub panels: PanelState,
    #[serde(default)]
    pub saved_at: u64,
}

/// Generate a safe filename from a project path
fn project_path_to_filename(path: &str) -> String {
    // Replace path separators and special chars with underscores
    let sanitized = path
        .replace('/', "_")
        .replace('\\', "_")
        .replace(':', "_")
        .replace(' ', "_");
    // Truncate if too long (keep reasonable length for filesystem)
    if sanitized.len() > 200 {
        format!("{}...", &sanitized[..200])
    } else {
        sanitized
    }
}

/// Get the session file path for a project
fn get_session_file_path(project_path: &str) -> Result<std::path::PathBuf, String> {
    let config = crate::config::get_paths();
    let sessions_dir = config.global_config_dir.join("sessions");

    // Ensure sessions directory exists
    fs::create_dir_all(&sessions_dir)
        .map_err(|e| format!("Failed to create sessions directory: {}", e))?;

    let filename = project_path_to_filename(project_path);
    Ok(sessions_dir.join(format!("{}.json", filename)))
}

/// Save a project session
#[command]
pub fn save_session(
    project_path: String,
    tabs: Vec<SessionTab>,
    active_tab_id: Option<String>,
    panels: PanelState,
) -> Result<(), String> {
    let session_file = get_session_file_path(&project_path)?;

    let session = ProjectSession {
        project_path,
        tabs,
        active_tab_id,
        panels,
        saved_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
    };

    let json = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;

    fs::write(&session_file, json)
        .map_err(|e| format!("Failed to write session file: {}", e))?;

    Ok(())
}

/// Load a project session
#[command]
pub fn load_session(project_path: String) -> Result<Option<ProjectSession>, String> {
    let session_file = get_session_file_path(&project_path)?;

    if !session_file.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&session_file)
        .map_err(|e| format!("Failed to read session file: {}", e))?;

    let session: ProjectSession = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse session JSON: {}", e))?;

    Ok(Some(session))
}

/// Delete a project session
#[command]
pub fn delete_session(project_path: String) -> Result<(), String> {
    let session_file = get_session_file_path(&project_path)?;

    if session_file.exists() {
        fs::remove_file(&session_file)
            .map_err(|e| format!("Failed to delete session file: {}", e))?;
    }

    Ok(())
}

/// List all saved sessions
#[command]
pub fn list_sessions() -> Result<Vec<ProjectSession>, String> {
    let config = crate::config::get_paths();
    let sessions_dir = config.global_config_dir.join("sessions");

    if !sessions_dir.exists() {
        return Ok(Vec::new());
    }

    let mut sessions = Vec::new();

    let entries = fs::read_dir(&sessions_dir)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(session) = serde_json::from_str::<ProjectSession>(&content) {
                    sessions.push(session);
                }
            }
        }
    }

    // Sort by saved_at descending (most recent first)
    sessions.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));

    Ok(sessions)
}
