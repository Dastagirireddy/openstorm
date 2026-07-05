use std::path::Path;

use super::ToolRegistry;

impl ToolRegistry {
    pub(super) async fn list_directory(&self, args: &serde_json::Value) -> String {
        let path = args["path"].as_str().unwrap_or(".");
        let max_results = args["max_results"].as_u64().unwrap_or(50) as usize;
        let full_path = Path::new(&self.project_path).join(path);

        match tokio::fs::read_dir(&full_path).await {
            Ok(mut entries) => {
                let mut result = Vec::new();
                let mut total = 0;
                while let Some(entry) = entries.next_entry().await.unwrap_or(None) {
                    total += 1;
                    if result.len() >= max_results {
                        continue;
                    }
                    let metadata = entry.metadata().await.ok();
                    let file_type = if metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false) {
                        "dir"
                    } else {
                        "file"
                    };
                    let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                    let name = entry.file_name().to_string_lossy().to_string();
                    result.push(format!("{} [{}] {}bytes", name, file_type, size));
                }
                if result.is_empty() {
                    "(empty directory)".to_string()
                } else {
                    let mut output = result.join("\n");
                    if total > max_results {
                        output.push_str(&format!(
                            "\n... (showing {} of {} entries)",
                            max_results, total
                        ));
                    }
                    output
                }
            }
            Err(e) => format!("Error listing directory: {}", e),
        }
    }

    pub(super) async fn search_code(&self, args: &serde_json::Value) -> String {
        let pattern = args["pattern"].as_str().unwrap_or("");
        let file_pattern = args["file_pattern"].as_str().unwrap_or("");

        let exclusions = super::super::ignore::exclusions_for_project(&self.project_path);
        let mut exclude_args: Vec<String> = Vec::new();
        for excl in &exclusions {
            exclude_args.push(format!("--glob"));
            exclude_args.push(format!("!{}/", excl));
        }

        // Use ripgrep if available, fallback to find + grep
        let output = if !file_pattern.is_empty() {
            let mut cmd = tokio::process::Command::new("rg");
            cmd.args(["--no-heading", "-n", pattern, "--glob", &format!("*{}", file_pattern)]);
            cmd.args(&exclude_args);
            cmd.arg(&self.project_path);
            cmd.output().await
        } else {
            let mut cmd = tokio::process::Command::new("rg");
            cmd.args(["--no-heading", "-n", pattern]);
            cmd.args(&exclude_args);
            cmd.arg(&self.project_path);
            cmd.output().await
        };

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let stderr = String::from_utf8_lossy(&out.stderr);
                if stdout.is_empty() && stderr.is_empty() {
                    "No matches found".to_string()
                } else if stdout.is_empty() {
                    stderr.to_string()
                } else {
                    // Limit output to avoid token overflow
                    let lines: Vec<&str> = stdout.lines().take(50).collect();
                    let count = stdout.lines().count();
                    let mut result = lines.join("\n");
                    if count > 50 {
                        result.push_str(&format!("\n... ({} total matches, showing first 50)", count));
                    }
                    result
                }
            }
            Err(_) => {
                // Fallback: use find + grep
                let output = tokio::process::Command::new("grep")
                    .args(["-rn", pattern, "--include", &format!("*{}", file_pattern), &self.project_path])
                    .output()
                    .await;

                match output {
                    Ok(out) => {
                        let stdout = String::from_utf8_lossy(&out.stdout);
                        if stdout.is_empty() {
                            "No matches found (grep fallback)".to_string()
                        } else {
                            let lines: Vec<&str> = stdout.lines().take(50).collect();
                            lines.join("\n")
                        }
                    }
                    Err(e) => format!("Search failed: {}", e),
                }
            }
        }
    }

    /// Find all references to a symbol
    pub(super) async fn find_references(&self, args: &serde_json::Value) -> String {
        let symbol = args["symbol"].as_str().unwrap_or("");
        let file_pattern = args["file_pattern"].as_str().unwrap_or("");

        // Use ripgrep to find references
        let output = if !file_pattern.is_empty() {
            tokio::process::Command::new("rg")
                .args([
                    "--no-heading",
                    "-n",
                    "--word-regexp",
                    symbol,
                    "--glob",
                    &format!("*{}", file_pattern),
                    &self.project_path,
                ])
                .output()
                .await
        } else {
            tokio::process::Command::new("rg")
                .args(["--no-heading", "-n", "--word-regexp", symbol, &self.project_path])
                .output()
                .await
        };

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                if stdout.is_empty() {
                    format!("No references found for '{}'", symbol)
                } else {
                    let lines: Vec<&str> = stdout.lines().take(50).collect();
                    let count = stdout.lines().count();
                    let mut result = format!("References to '{}' ({} matches):\n", symbol, count);
                    result.push_str(&lines.join("\n"));
                    if count > 50 {
                        result.push_str(&format!("\n... (showing first 50 of {} matches)", count));
                    }
                    result
                }
            }
            Err(e) => format!("Search failed: {}", e),
        }
    }

    /// Find the definition of a symbol
    pub(super) async fn get_definition(&self, args: &serde_json::Value) -> String {
        let symbol = args["symbol"].as_str().unwrap_or("");
        let kind = args["kind"].as_str().unwrap_or("");

        // Build search patterns based on kind
        let patterns = match kind {
            "function" => vec![
                format!("fn\\s+{}", regex::escape(symbol)),
                format!("function\\s+{}", regex::escape(symbol)),
                format!("def\\s+{}", regex::escape(symbol)),
            ],
            "struct" => vec![
                format!("struct\\s+{}", regex::escape(symbol)),
                format!("class\\s+{}", regex::escape(symbol)),
            ],
            "type" | "trait" => vec![
                format!("type\\s+{}", regex::escape(symbol)),
                format!("trait\\s+{}", regex::escape(symbol)),
                format!("interface\\s+{}", regex::escape(symbol)),
            ],
            "enum" => vec![
                format!("enum\\s+{}", regex::escape(symbol)),
            ],
            "module" => vec![
                format!("mod\\s+{}", regex::escape(symbol)),
                format!("module\\s+{}", regex::escape(symbol)),
            ],
            _ => vec![
                format!("(fn|struct|type|trait|enum|mod|function|class|interface|def)\\s+{}", regex::escape(symbol)),
            ],
        };

        // Search for each pattern
        for pattern in &patterns {
            let output = tokio::process::Command::new("rg")
                .args([
                    "--no-heading",
                    "-n",
                    "-C", "2",
                    pattern,
                    &self.project_path,
                ])
                .output()
                .await;

            if let Ok(out) = output {
                let stdout = String::from_utf8_lossy(&out.stdout);
                if !stdout.is_empty() {
                    let lines: Vec<&str> = stdout.lines().take(20).collect();
                    return format!("Definition of '{}'{}:\n{}",
                        symbol,
                        if kind.is_empty() { String::new() } else { format!(" ({})", kind) },
                        lines.join("\n")
                    );
                }
            }
        }

        format!("Could not find definition for '{}'", symbol)
    }

    /// Semantic search using RAG - prefers graph-based RAG when available
    pub(super) async fn semantic_search(&self, args: &serde_json::Value) -> String {
        let query = args["query"].as_str().unwrap_or("");
        let max_tokens = args["max_tokens"].as_u64().unwrap_or(2000) as usize;

        // Try graph-based RAG first
        if let Some(ref graph_store) = self.graph_store {
            let store = graph_store.lock().await;

            let rag = crate::graph::rag::GraphRag::new(&store);
            match rag.get_context_for_query(query, max_tokens) {
                Ok(ctx) => {
                    if ctx.matches.is_empty() && ctx.neighbors.is_empty() {
                        return format!("No results found for: {}", query);
                    }
                    return rag.build_llm_prompt(query, &ctx);
                }
                Err(e) => {
                    crate::log_warn!("Graph RAG search failed, falling back to BM25: {}", e);
                }
            }
        }

        // Fall back to BM25-based RAG
        let store = match &self.embedding_store {
            Some(store) => store,
            None => return "Semantic search not available (no RAG store initialized). Build the graph first.".to_string(),
        };

        let max_results = (max_tokens / 100).max(5); // Estimate ~100 tokens per result
        let results = {
            let mut store = store.lock().await;
            let results = store.search(query, max_results);
            store.record_search(query, &results);
            results
        };

        if results.is_empty() {
            return format!("No results found for: {}", query);
        }

        let mut output = format!("Semantic search results for '{}' ({} matches):\n\n", query, results.len());

        for (i, result) in results.iter().enumerate() {
            let chunk = &result.chunk;
            let lines = chunk.content.lines().count();
            output.push_str(&format!(
                "{}. {}:{}-{} ({} lines, score: {:.2})\n",
                i + 1,
                chunk.file_path,
                chunk.start_line,
                chunk.end_line,
                lines,
                result.score
            ));

            if let Some(ref name) = chunk.symbol_name {
                output.push_str(&format!("   Symbol: {}\n", name));
            }

            let preview: String = chunk
                .content
                .lines()
                .take(5)
                .collect::<Vec<_>>()
                .join("\n   ");
            output.push_str(&format!("   {}\n\n", preview));
        }

        output
    }

    /// Search for files by name pattern
    pub(super) async fn search_files(&self, args: &serde_json::Value) -> String {
        let query = args["query"].as_str().unwrap_or("");
        let max_results = args["max_results"].as_u64().unwrap_or(10) as usize;

        let mut results = Vec::new();
        let query_lower = query.to_lowercase();

        self.search_files_recursive(
            &self.project_path,
            "",
            &query_lower,
            &mut results,
            max_results,
        );

        if results.is_empty() {
            if query.is_empty() {
                "No files in project".to_string()
            } else {
                format!("No files found matching '{}'", query)
            }
        } else {
            // Return flat list, one file per line
            results.join("\n")
        }
    }

    fn search_files_recursive(
        &self,
        dir: &str,
        relative_prefix: &str,
        query: &str,
        results: &mut Vec<String>,
        max_results: usize,
    ) {
        if results.len() >= max_results {
            return;
        }

        let path = Path::new(dir);
        if !path.is_dir() {
            return;
        }

        // Skip directories that are too deep
        let depth = path.strip_prefix(&self.project_path).unwrap_or(path).components().count();
        if depth > 8 {
            return;
        }

        if let Ok(entries) = std::fs::read_dir(path) {
            // Sort entries: directories first, then files, alphabetically
            let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
            entries.sort_by(|a, b| {
                let a_is_dir = a.path().is_dir();
                let b_is_dir = b.path().is_dir();
                if a_is_dir != b_is_dir {
                    return if a_is_dir { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater };
                }
                a.file_name().cmp(&b.file_name())
            });

            for entry in entries {
                if results.len() >= max_results {
                    break;
                }

                let file_name = entry.file_name().to_string_lossy().to_string();
                let is_dir = entry.path().is_dir();

                // Skip hidden files and common non-essential dirs
                if file_name.starts_with('.')
                    || (is_dir
                        && ["node_modules", "target", ".openstorm", "dist", "__pycache__",
                            "vendor", ".git", "build", "out", ".next", ".nuxt"]
                            .contains(&file_name.as_str()))
                {
                    continue;
                }

                let relative_path = if relative_prefix.is_empty() {
                    file_name.clone()
                } else {
                    format!("{}/{}", relative_prefix, file_name)
                };

                if is_dir {
                    // Recurse into directories
                    self.search_files_recursive(
                        &entry.path().to_string_lossy(),
                        &relative_path,
                        query,
                        results,
                        max_results,
                    );
                } else if query.is_empty() || self.fuzzy_match(&relative_path, query) {
                    results.push(relative_path);
                }
            }
        }
    }

    /// Fuzzy match: checks if query characters appear in order in the target
    fn fuzzy_match(&self, target: &str, query: &str) -> bool {
        let target_lower = target.to_lowercase();
        let query_lower = query.to_lowercase();
        
        // Exact substring match first
        if target_lower.contains(&query_lower) {
            return true;
        }
        
        // Fuzzy match: all query chars must appear in order
        let mut query_chars = query_lower.chars();
        let mut next_char = query_chars.next();
        
        for target_char in target_lower.chars() {
            if let Some(qc) = next_char {
                if target_char == qc {
                    next_char = query_chars.next();
                }
            }
        }
        
        next_char.is_none()
    }
}
