use std::path::Path;
use tokio::fs;

use super::ToolRegistry;

impl ToolRegistry {
    pub(super) async fn read_file(&self, args: &serde_json::Value) -> String {
        let path = args["path"].as_str().unwrap_or("");
        let max_lines = args["max_lines"].as_u64().unwrap_or(200) as usize;
        let start_line = args["start_line"].as_u64().map(|n| n as usize).unwrap_or(0);
        let full_path = Path::new(&self.project_path).join(path);

        match fs::read_to_string(&full_path).await {
            Ok(content) => {
                let total_lines = content.lines().count();
                let lines: Vec<&str> = content.lines().collect();
                let start = start_line.saturating_sub(1).min(lines.len());
                let end = (start + max_lines).min(lines.len());
                let selected = &lines[start..end];
                let mut result = selected.join("\n");
                let returned_lines = end - start;
                if returned_lines < total_lines {
                    result.push_str(&format!(
                        "\n... (showing lines {}-{}/{} total, {}% of file)",
                        start + 1, end, total_lines,
                        (returned_lines * 100) / total_lines
                    ));
                }
                result
            }
            Err(e) => format!("Error reading file: {}", e),
        }
    }

    pub(super) async fn write_file(&self, args: &serde_json::Value) -> String {
        let path = args["path"].as_str().unwrap_or("");
        let content = args["content"].as_str().unwrap_or("");
        let full_path = Path::new(&self.project_path).join(path);

        // Read old content for diff capture
        let old_content = fs::read_to_string(&full_path).await.unwrap_or_default();

        // Ensure parent directory exists
        if let Some(parent) = full_path.parent() {
            let _ = fs::create_dir_all(parent).await;
        }

        match fs::write(&full_path, content).await {
            Ok(_) => {
                // Capture diff if content changed
                if old_content != content {
                    let modification = Self::compute_diff(path, &old_content, content);
                    let mut pending = self.pending_file_modifications.lock().unwrap();
                    pending.push(modification);
                }
                format!("Successfully wrote to {}", path)
            }
            Err(e) => format!("Error writing file: {}", e),
        }
    }

    /// Edit a file by replacing specific lines
    pub(super) async fn edit_file(&self, args: &serde_json::Value) -> String {
        let path = args["path"].as_str().unwrap_or("");
        let start_line = args["start_line"].as_u64().unwrap_or(1) as usize;
        let end_line = args["end_line"].as_u64().unwrap_or(1) as usize;
        let new_content = args["new_content"].as_str().unwrap_or("");

        let full_path = Path::new(&self.project_path).join(path);

        // Read existing file
        let content = match fs::read_to_string(&full_path).await {
            Ok(c) => c,
            Err(e) => return format!("Error reading file: {}", e),
        };

        let lines: Vec<&str> = content.lines().collect();
        let total_lines = lines.len();

        // Validate line numbers
        if start_line < 1 || start_line > total_lines {
            return format!("Invalid start_line: {} (file has {} lines)", start_line, total_lines);
        }
        if end_line < start_line || end_line > total_lines {
            return format!("Invalid end_line: {} (must be {}-{})", end_line, start_line, total_lines);
        }

        // Build new content
        let mut new_lines: Vec<String> = Vec::new();

        // Lines before the edit
        for i in 0..(start_line - 1) {
            new_lines.push(lines[i].to_string());
        }

        // New content
        for line in new_content.lines() {
            new_lines.push(line.to_string());
        }

        // Lines after the edit
        for i in end_line..total_lines {
            new_lines.push(lines[i].to_string());
        }

        let result = new_lines.join("\n");

        // Write the file
        match fs::write(&full_path, &result).await {
            Ok(_) => {
                // Capture diff if content changed
                if content != result {
                    let modification = Self::compute_diff(path, &content, &result);
                    let mut pending = self.pending_file_modifications.lock().unwrap();
                    pending.push(modification);
                }
                let _replaced = end_line - start_line + 1;
                format!(
                    "Successfully edited {} (replaced lines {}-{} with {} new lines)",
                    path,
                    start_line,
                    end_line,
                    new_content.lines().count()
                )
            }
            Err(e) => format!("Error writing file: {}", e),
        }
    }

    /// Attach a file to the conversation context
    pub(super) async fn attach_file(&self, args: &serde_json::Value) -> String {
        let path = args["path"].as_str().unwrap_or("");
        let max_lines = args["max_lines"].as_u64().unwrap_or(300) as usize;
        let full_path = Path::new(&self.project_path).join(path);

        let file_size = fs::metadata(&full_path).await.map(|m| m.len()).unwrap_or(0);
        
        let ext = full_path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let is_text_file = matches!(
            ext.to_lowercase().as_str(),
            "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "java" | "rb" | "css" | "html" | "json" | "yaml" | "yml" | "toml" | "md" | "sql" | "txt" | "log" | "xml" | "csv" | "sh" | "bash" | "zsh" | "fish" | "ps1" | "bat" | "cmd" | "dockerfile" | "makefile" | "cmake" | "gradle" | "properties" | "ini" | "cfg" | "conf" | "config"
        );

        if is_text_file {
            match fs::read_to_string(&full_path).await {
                Ok(content) => {
                    let total_lines = content.lines().count();
                    let lines: Vec<&str> = content.lines().collect();
                    let end = max_lines.min(lines.len());
                    let truncated_content = lines[..end].join("\n");
                    if end < total_lines {
                        format!(
                            "Attached file: {}\nSize: {} bytes, {} lines (showing {}/{} lines)\n\n{}",
                            path, file_size, total_lines, end, total_lines, truncated_content
                        )
                    } else {
                        format!(
                            "Attached file: {}\nSize: {} bytes, {} lines\n\n{}",
                            path, file_size, total_lines, truncated_content
                        )
                    }
                }
                Err(e) => format!("Error attaching file {}: {}", path, e),
            }
        } else {
            format!(
                "Attached file: {}\nSize: {} bytes\nType: {} (binary file - content not displayed)",
                path,
                file_size,
                ext.to_uppercase()
            )
        }
    }

    /// Attach multiple files to the conversation context
    pub(super) async fn attach_multiple_files(&self, args: &serde_json::Value) -> String {
        let paths = args["paths"].as_array().cloned().unwrap_or_default();
        if paths.is_empty() {
            return "No files specified".to_string();
        }

        let max_lines_per_file = 150; // Tighter limit for multi-file
        let mut results = Vec::new();
        for path in &paths {
            let path_str = path.as_str().unwrap_or("");
            let full_path = Path::new(&self.project_path).join(path_str);

            let file_size = fs::metadata(&full_path).await.map(|m| m.len()).unwrap_or(0);
            let ext = full_path.extension().and_then(|e| e.to_str()).unwrap_or("");
            let is_text_file = matches!(
                ext.to_lowercase().as_str(),
                "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "java" | "rb" | "css" | "html" | "json" | "yaml" | "yml" | "toml" | "md" | "sql" | "txt" | "log" | "xml" | "csv" | "sh" | "bash" | "zsh" | "fish" | "ps1" | "bat" | "cmd" | "dockerfile" | "makefile" | "cmake" | "gradle" | "properties" | "ini" | "cfg" | "conf" | "config"
            );

            if is_text_file {
                match fs::read_to_string(&full_path).await {
                    Ok(content) => {
                        let total_lines = content.lines().count();
                        let lines: Vec<&str> = content.lines().collect();
                        let end = max_lines_per_file.min(lines.len());
                        let truncated = lines[..end].join("\n");
                        if end < total_lines {
                            results.push(format!(
                                "=== {} ({} bytes, {} lines, showing {}/{}) ===\n{}",
                                path_str, file_size, total_lines, end, total_lines, truncated
                            ));
                        } else {
                            results.push(format!(
                                "=== {} ({} bytes, {} lines) ===\n{}",
                                path_str, file_size, total_lines, truncated
                            ));
                        }
                    }
                    Err(e) => {
                        results.push(format!("Error reading {}: {}", path_str, e));
                    }
                }
            } else {
                results.push(format!(
                    "=== {} ({} bytes) ===\nType: {} (binary file - content not displayed)",
                    path_str, file_size, ext.to_uppercase()
                ));
            }
        }

        results.join("\n\n")
    }
}
