use std::path::Path;
use tokio::fs;

use super::provider::{FunctionDefinition, ToolDefinition};

/// Registry of tools available to the AI agent
pub struct ToolRegistry {
    pub project_path: String,
}

impl ToolRegistry {
    pub fn new(project_path: String) -> Self {
        Self { project_path }
    }

    /// Get all available tool definitions (OpenAI function-calling format)
    pub fn definitions(&self) -> Vec<ToolDefinition> {
        vec![
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "read_file".to_string(),
                    description: "Read the contents of a file at the given path. Returns the full file content as a string.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path to the file, relative to the project root"
                            }
                        },
                        "required": ["path"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "write_file".to_string(),
                    description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path to the file, relative to the project root"
                            },
                            "content": {
                                "type": "string",
                                "description": "The content to write to the file"
                            }
                        },
                        "required": ["path", "content"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "list_directory".to_string(),
                    description: "List files and directories at the given path. Returns names, types, and sizes.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Directory path relative to the project root. Use '.' for root."
                            }
                        },
                        "required": ["path"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "search_code".to_string(),
                    description: "Search for a pattern in code files within the project. Returns matching file paths and line numbers.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "pattern": {
                                "type": "string",
                                "description": "Search pattern (supports regex)"
                            },
                            "file_pattern": {
                                "type": "string",
                                "description": "Optional file extension filter (e.g. '.ts', '.rs')"
                            }
                        },
                        "required": ["pattern"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "run_command".to_string(),
                    description: "Run a shell command in the project directory. Returns stdout and stderr.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "command": {
                                "type": "string",
                                "description": "The shell command to execute"
                            }
                        },
                        "required": ["command"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "git_status".to_string(),
                    description: "Get the current git status of the repository (branch, staged/unstaged files, etc.).".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {},
                        "required": []
                    }),
                },
            },
        ]
    }

    /// Execute a tool call and return the result
    pub async fn execute(&self, name: &str, arguments: &str) -> String {
        let args: serde_json::Value = match serde_json::from_str(arguments) {
            Ok(v) => v,
            Err(e) => return format!("Error parsing arguments: {}", e),
        };

        match name {
            "read_file" => self.read_file(&args).await,
            "write_file" => self.write_file(&args).await,
            "list_directory" => self.list_directory(&args).await,
            "search_code" => self.search_code(&args).await,
            "run_command" => self.run_command(&args).await,
            "git_status" => self.git_status().await,
            _ => format!("Unknown tool: {}", name),
        }
    }

    async fn read_file(&self, args: &serde_json::Value) -> String {
        let path = args["path"].as_str().unwrap_or("");
        let full_path = Path::new(&self.project_path).join(path);

        match fs::read_to_string(&full_path).await {
            Ok(content) => content,
            Err(e) => format!("Error reading file: {}", e),
        }
    }

    async fn write_file(&self, args: &serde_json::Value) -> String {
        let path = args["path"].as_str().unwrap_or("");
        let content = args["content"].as_str().unwrap_or("");
        let full_path = Path::new(&self.project_path).join(path);

        // Ensure parent directory exists
        if let Some(parent) = full_path.parent() {
            let _ = fs::create_dir_all(parent).await;
        }

        match fs::write(&full_path, content).await {
            Ok(_) => format!("Successfully wrote to {}", path),
            Err(e) => format!("Error writing file: {}", e),
        }
    }

    async fn list_directory(&self, args: &serde_json::Value) -> String {
        let path = args["path"].as_str().unwrap_or(".");
        let full_path = Path::new(&self.project_path).join(path);

        match fs::read_dir(&full_path).await {
            Ok(mut entries) => {
                let mut result = Vec::new();
                while let Some(entry) = entries.next_entry().await.unwrap_or(None) {
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
                    result.join("\n")
                }
            }
            Err(e) => format!("Error listing directory: {}", e),
        }
    }

    async fn search_code(&self, args: &serde_json::Value) -> String {
        let pattern = args["pattern"].as_str().unwrap_or("");
        let file_pattern = args["file_pattern"].as_str().unwrap_or("");

        // Use ripgrep if available, fallback to find + grep
        let output = if !file_pattern.is_empty() {
            tokio::process::Command::new("rg")
                .args(["--no-heading", "-n", pattern, "--glob", &format!("*{}", file_pattern), &self.project_path])
                .output()
                .await
        } else {
            tokio::process::Command::new("rg")
                .args(["--no-heading", "-n", pattern, &self.project_path])
                .output()
                .await
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

    async fn run_command(&self, args: &serde_json::Value) -> String {
        let command = args["command"].as_str().unwrap_or("");

        let output = tokio::process::Command::new("sh")
            .args(["-c", command])
            .current_dir(&self.project_path)
            .output()
            .await;

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let stderr = String::from_utf8_lossy(&out.stderr);
                let mut result = String::new();
                if !stdout.is_empty() {
                    result.push_str(&stdout);
                }
                if !stderr.is_empty() {
                    if !result.is_empty() {
                        result.push_str("\n--- stderr ---\n");
                    }
                    result.push_str(&stderr);
                }
                if result.is_empty() {
                    "(command produced no output)".to_string()
                } else {
                    // Truncate long output
                    if result.len() > 4000 {
                        result.truncate(4000);
                        result.push_str("\n... (truncated)");
                    }
                    result
                }
            }
            Err(e) => format!("Failed to execute command: {}", e),
        }
    }

    async fn git_status(&self) -> String {
        let output = tokio::process::Command::new("git")
            .args(["status", "--short"])
            .current_dir(&self.project_path)
            .output()
            .await;

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let branch_output = tokio::process::Command::new("git")
                    .args(["branch", "--show-current"])
                    .current_dir(&self.project_path)
                    .output()
                    .await;

                let branch = branch_output
                    .ok()
                    .and_then(|o| String::from_utf8(o.stdout).ok())
                    .map(|s| s.trim().to_string())
                    .unwrap_or_else(|| "unknown".to_string());

                if stdout.is_empty() {
                    format!("On branch {}\nWorking tree clean", branch)
                } else {
                    format!("On branch {}\n{}", branch, stdout)
                }
            }
            Err(e) => format!("Git not available: {}", e),
        }
    }
}
