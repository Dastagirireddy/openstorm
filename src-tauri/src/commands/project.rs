//! Project operations - Recent projects management
//!
//! Commands for loading, saving, and removing recent projects from persistent storage.

use serde::{Deserialize, Serialize};
use std::fs;
use tauri::command;

/// Recent project entry stored in JSON
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentProjectEntry {
    pub path: String,
    pub name: String,
    pub last_opened: u64,
    #[serde(default)]
    pub project_type: Option<String>,
}

/// Load recent projects from JSON file
#[command]
pub fn load_recent_projects() -> Result<Vec<RecentProjectEntry>, String> {
    let config = crate::config::get_paths();
    let projects_file = config.recent_projects_file();

    // Ensure directory exists
    if let Some(parent) = projects_file.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }

    // If file doesn't exist, return empty list
    if !projects_file.exists() {
        return Ok(Vec::new());
    }

    // Read and parse JSON
    let content = fs::read_to_string(&projects_file)
        .map_err(|e| format!("Failed to read recent projects file: {}", e))?;

    let projects: Vec<RecentProjectEntry> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse recent projects JSON: {}", e))?;

    Ok(projects)
}

/// Add or update a recent project entry
#[command]
pub fn save_recent_project(
    path: String,
    name: String,
    project_type: Option<String>,
) -> Result<(), String> {
    let config = crate::config::get_paths();
    let projects_file = config.recent_projects_file();

    // Ensure directory exists
    if let Some(parent) = projects_file.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }

    // Load existing projects
    let mut projects: Vec<RecentProjectEntry> = if projects_file.exists() {
        let content = fs::read_to_string(&projects_file)
            .map_err(|e| format!("Failed to read recent projects file: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse recent projects JSON: {}", e))?
    } else {
        Vec::new()
    };

    // Check if project already exists
    let existing_index = projects.iter().position(|p| p.path == path);

    let entry = RecentProjectEntry {
        path: path.clone(),
        name,
        last_opened: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
        project_type,
    };

    if let Some(index) = existing_index {
        // Update existing entry
        projects[index] = entry;
        // Move to front
        let project = projects.remove(index);
        projects.insert(0, project);
    } else {
        // Add new entry at front
        projects.insert(0, entry);
    }

    // Limit to 20 recent projects
    if projects.len() > 20 {
        projects.truncate(20);
    }

    // Write back to file
    let json = serde_json::to_string_pretty(&projects)
        .map_err(|e| format!("Failed to serialize recent projects: {}", e))?;

    fs::write(&projects_file, json)
        .map_err(|e| format!("Failed to write recent projects file: {}", e))?;

    Ok(())
}

/// Remove a project from recent list by path
#[command]
pub fn remove_recent_project(path: String) -> Result<(), String> {
    let config = crate::config::get_paths();
    let projects_file = config.recent_projects_file();

    if !projects_file.exists() {
        return Ok(()); // Nothing to remove
    }

    // Load existing projects
    let mut projects: Vec<RecentProjectEntry> = {
        let content = fs::read_to_string(&projects_file)
            .map_err(|e| format!("Failed to read recent projects file: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse recent projects JSON: {}", e))?
    };

    // Remove the project
    let initial_len = projects.len();
    projects.retain(|p| p.path != path);

    // Only write back if something was removed
    if projects.len() < initial_len {
        let json = serde_json::to_string_pretty(&projects)
            .map_err(|e| format!("Failed to serialize recent projects: {}", e))?;

        fs::write(&projects_file, json)
            .map_err(|e| format!("Failed to write recent projects file: {}", e))?;
    }

    Ok(())
}
