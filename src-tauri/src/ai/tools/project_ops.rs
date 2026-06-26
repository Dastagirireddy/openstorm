use std::path::Path;

use super::ToolRegistry;

/// Format file size to human-readable string
pub fn format_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{}B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1}KB", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1}MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.1}GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

impl ToolRegistry {
    /// Print project directory tree
    pub(super) async fn print_tree(&self, args: &serde_json::Value) -> String {
        let path = args["path"].as_str().unwrap_or(".");
        let max_depth = args["max_depth"].as_u64().unwrap_or(2) as usize;
        let show_files = args["show_files"].as_bool().unwrap_or(true);

        let root = Path::new(&self.project_path).join(path);
        let root = if root.exists() { root } else { Path::new(&self.project_path).to_path_buf() };

        let mut output = String::new();
        let dir_name = root.file_name().unwrap_or_default().to_string_lossy();
        output.push_str(&format!("{}/\n", dir_name));

        self.build_tree(&root, "", max_depth, 0, show_files, &mut output);

        // Cap output at 100 lines to prevent token overflow
        let max_lines = 100;
        let lines: Vec<&str> = output.lines().collect();
        if lines.len() > max_lines {
            let truncated: String = lines[..max_lines].join("\n");
            format!("{}\n... ({} of {} lines shown)", truncated, max_lines, lines.len())
        } else {
            output
        }
    }

    /// Recursively build tree string
    fn build_tree(
        &self,
        path: &Path,
        prefix: &str,
        max_depth: usize,
        current_depth: usize,
        show_files: bool,
        output: &mut String,
    ) {
        if current_depth >= max_depth {
            return;
        }

        let entries = match std::fs::read_dir(path) {
            Ok(e) => e,
            Err(_) => return,
        };

        let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
        entries.sort_by(|a, b| {
            // Directories first, then files
            let a_is_dir = a.path().is_dir();
            let b_is_dir = b.path().is_dir();
            if a_is_dir != b_is_dir {
                return if a_is_dir { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater };
            }
            a.file_name().cmp(&b.file_name())
        });

        // Filter out excluded directories
        let exclusions = super::super::ignore::exclusions_for_project(&self.project_path);

        for (i, entry) in entries.iter().enumerate() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.path().is_dir();

            // Skip hidden files/dirs and excluded directories
            if is_dir && super::super::ignore::should_skip_dir(&file_name, &exclusions) {
                continue;
            }

            let is_last = i == entries.len() - 1;
            let connector = if is_last { "└── " } else { "├── " };
            let child_prefix = if is_last { "    " } else { "│   " };

            if is_dir {
                output.push_str(&format!("{}{}{}/\n", prefix, connector, file_name));
                self.build_tree(
                    &entry.path(),
                    &format!("{}{}", prefix, child_prefix),
                    max_depth,
                    current_depth + 1,
                    show_files,
                    output,
                );
            } else if show_files {
                // Get file size
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                let size_str = format_size(size);
                output.push_str(&format!("{}{}{} {}\n", prefix, connector, file_name, size_str));
            }
        }
    }

    /// Get RAG metrics
    pub(super) async fn rag_metrics(&self) -> String {
        let store = match &self.embedding_store {
            Some(store) => store,
            None => return "RAG not available (embedding store not initialized)".to_string(),
        };

        let store = store.lock().await;
        let stats = store.stats();
        let metrics = store.metrics();

        format!(
            "{}\n\n\
             Index Stats:\n\
             - Files indexed: {}\n\
             - Code chunks: {}\n\
             - Unique keywords: {}\n\
             - Avg chunk size: {:.0} keywords",
            metrics.metrics_summary(),
            stats.total_files,
            stats.total_chunks,
            stats.total_keywords,
            stats.avg_chunk_size
        )
    }

    pub(super) async fn todo_write(&self, args: &serde_json::Value) -> String {
        let todos = match args["todos"].as_array() {
            Some(t) => t,
            None => return "Error: todos array is required".to_string(),
        };

        let mut result = Vec::new();
        for todo in todos {
            let id = todo["id"].as_str().unwrap_or("");
            let content = todo["content"].as_str().unwrap_or("");
            let status = todo["status"].as_str().unwrap_or("pending");
            let priority = todo["priority"].as_str().unwrap_or("medium");

            // Only require id and status (content is optional for partial updates)
            if id.is_empty() {
                continue;
            }

            // For status-only updates, show just the status change
            if content.is_empty() {
                result.push(format!("[{}] {} (status only)", status, id));
            } else {
                result.push(format!("[{}] {} ({})", status, content, priority));
            }
        }

        if result.is_empty() {
            "No valid TODO items provided".to_string()
        } else {
            format!("Updated {} TODO items:\n{}", result.len(), result.join("\n"))
        }
    }
}
