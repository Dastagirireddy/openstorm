use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
    pub is_executable: bool,
    pub children: Option<Vec<FileInfo>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub score: f64,
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileInfo>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files: Vec<FileInfo> = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            let file_name = entry.file_name().to_string_lossy().to_string();
            let file_path = entry.path().to_string_lossy().to_string();

            // Check if file is executable (Unix only)
            #[cfg(unix)]
            let is_executable = !metadata.is_dir() && {
                let mode = metadata.permissions().mode();
                (mode & 0o111) != 0  // Check if any execute bit is set
            };

            #[cfg(not(unix))]
            let is_executable = false;

            Some(FileInfo {
                name: file_name,
                path: file_path,
                is_dir: metadata.is_dir(),
                size: metadata.len(),
                modified: metadata
                    .modified()
                    .unwrap_or(SystemTime::UNIX_EPOCH)
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
                is_executable,
                children: None,
            })
        })
        .collect();

    // Sort: directories first, then files, alphabetically
    files.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
    });

    Ok(files)
}

#[tauri::command]
pub fn create_file(path: String, is_dir: bool) -> Result<(), String> {
    if is_dir {
        fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory: {}", e))
    } else {
        if let Some(parent) = PathBuf::from(&path).parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
        fs::write(&path, "").map_err(|e| format!("Failed to create file: {}", e))
    }
}

#[tauri::command]
pub fn delete_file(path: String, is_dir: bool) -> Result<(), String> {
    if is_dir {
        fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete directory: {}", e))
    } else {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {}", e))
    }
}

#[tauri::command]
pub fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename file: {}", e))
}

#[tauri::command]
pub fn get_file_info(path: String) -> Result<FileInfo, String> {
    let metadata = fs::metadata(&path).map_err(|e| format!("Failed to get file info: {}", e))?;
    let file_name = PathBuf::from(&path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    // Check if file is executable (Unix only)
    #[cfg(unix)]
    let is_executable = !metadata.is_dir() && {
        let mode = metadata.permissions().mode();
        (mode & 0o111) != 0  // Check if any execute bit is set
    };

    #[cfg(not(unix))]
    let is_executable = false;

    Ok(FileInfo {
        name: file_name,
        path,
        is_dir: metadata.is_dir(),
        size: metadata.len(),
        modified: metadata
            .modified()
            .unwrap_or(SystemTime::UNIX_EPOCH)
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        is_executable,
        children: None,
    })
}

#[tauri::command]
pub fn search_files(root_path: String, query: String) -> Result<Vec<SearchResult>, String> {
    let mut results = Vec::new();
    search_files_recursive(&root_path, &query, &mut results);
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    Ok(results)
}

fn search_files_recursive(path: &str, query: &str, results: &mut Vec<SearchResult>) {
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let entry_path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden files and common ignore directories
            if file_name.starts_with('.') {
                continue;
            }
            if entry_path.is_dir() {
                match file_name.as_str() {
                    "node_modules" | "target" | ".git" | "vendor" | "dist" => continue,
                    _ => {}
                }
            }

            // Simple fuzzy matching score
            let score = fuzzy_match_score(&file_name, &query);
            if score > 0.0 {
                results.push(SearchResult {
                    path: entry_path.to_string_lossy().to_string(),
                    name: file_name,
                    score,
                });
            }

            if entry_path.is_dir() {
                search_files_recursive(&entry_path.to_string_lossy().to_string(), query, results);
            }
        }
    }
}

fn fuzzy_match_score(text: &str, pattern: &str) -> f64 {
    let text_lower = text.to_lowercase();
    let pattern_lower = pattern.to_lowercase();

    // Exact prefix match gets highest score
    if text_lower.starts_with(&pattern_lower) {
        return 1.0;
    }

    // Contains match
    if text_lower.contains(&pattern_lower) {
        return 0.8;
    }

    // Fuzzy character match
    let mut text_chars = text_lower.chars();
    let mut matched = 0;
    let mut total_gaps = 0;
    let mut last_pos = 0;

    for pattern_char in pattern_lower.chars() {
        let mut found = false;
        for (i, text_char) in text_chars.by_ref().enumerate() {
            if text_char == pattern_char {
                matched += 1;
                total_gaps += i - last_pos;
                last_pos = i + 1;
                found = true;
                break;
            }
        }
        if !found {
            return 0.0;
        }
    }

    // Score based on match ratio and gap penalty
    let match_ratio = matched as f64 / pattern.len() as f64;
    let gap_penalty = (total_gaps as f64) / (text.len() as f64 * 2.0);
    (match_ratio - gap_penalty).max(0.1)
}
