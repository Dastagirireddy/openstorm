//! Directory operation commands

use super::file::FileInfo;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub score: f64,
}

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileInfo>, String> {
    use std::fs;

    let entries = fs::read_dir(&path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files: Vec<FileInfo> = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            let file_name = entry.file_name().to_string_lossy().to_string();
            let file_path = entry.path().to_string_lossy().to_string();

            // Filter out hidden files and folders (starting with '.')
            if file_name.starts_with('.') {
                return None;
            }

            #[cfg(unix)]
            let is_executable = !metadata.is_dir() && {
                let mode = metadata.permissions().mode();
                (mode & 0o111) != 0
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
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                    .duration_since(std::time::SystemTime::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
                is_executable,
                children: None,
            })
        })
        .collect();

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
pub fn search_files(root_path: String, query: String) -> Result<Vec<SearchResult>, String> {
    let mut results = Vec::new();
    search_files_recursive(&root_path, &query, &mut results);
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    Ok(results)
}

fn search_files_recursive(path: &str, query: &str, results: &mut Vec<SearchResult>) {
    use std::fs;

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let entry_path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            if file_name.starts_with('.') {
                continue;
            }
            if entry_path.is_dir() {
                match file_name.as_str() {
                    "node_modules" | "target" | ".git" | "vendor" | "dist" => continue,
                    _ => {}
                }
            }

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

    if text_lower.starts_with(&pattern_lower) {
        return 1.0;
    }

    if text_lower.contains(&pattern_lower) {
        return 0.8;
    }

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

    let match_ratio = matched as f64 / pattern.len() as f64;
    let gap_penalty = (total_gaps as f64) / (text.len() as f64 * 2.0);
    (match_ratio - gap_penalty).max(0.1)
}
