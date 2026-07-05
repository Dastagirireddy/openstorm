use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::AsyncBufReadExt;
use tokio::io::BufReader;

use super::ToolRegistry;

impl ToolRegistry {
    /// Validate that a command does not escape the project directory via `cd`.
    /// Returns the resolved working directory or an error message.
    pub(super) fn validate_working_dir(&self, command: &str) -> Result<PathBuf, String> {
        let project_root = Path::new(&self.project_path)
            .canonicalize()
            .map_err(|e| format!("Cannot resolve project root: {}", e))?;

        // Simple heuristic: check for `cd <path>` patterns
        // This handles: cd /path, cd ~/path, cd ../path, cd ./path, cd path
        for part in command.split_whitespace() {
            if part == "cd" {
                continue;
            }
            // If previous part was cd, check this path
        }

        // More robust: parse shell-like cd commands
        let words: Vec<&str> = command.split_whitespace().collect();
        let mut i = 0;
        while i < words.len() {
            if words[i] == "cd" && i + 1 < words.len() {
                let target = words[i + 1];
                // Skip flags like -P, -L
                if target.starts_with('-') {
                    i += 1;
                    continue;
                }
                let resolved = if target.starts_with('~') {
                    // Expand ~ to home directory
                    if let Some(home) = std::env::var("HOME").ok() {
                        PathBuf::from(home).join(&target[1..])
                    } else {
                        PathBuf::from(target)
                    }
                } else if target.starts_with('/') {
                    PathBuf::from(target)
                } else if target.starts_with("..") {
                    // Relative to current dir (which is project_path)
                    project_root.parent().unwrap_or(&project_root).join(target)
                } else {
                    project_root.join(target)
                };

                // Canonicalize if possible
                let canonical = resolved.canonicalize().unwrap_or(resolved);

                // Check if within project root
                if !canonical.starts_with(&project_root) {
                    return Err(format!(
                        "Sandbox violation: 'cd {}' resolves to {}, which is outside the project directory {}",
                        target,
                        canonical.display(),
                        project_root.display()
                    ));
                }
                i += 2;
            } else {
                i += 1;
            }
        }

        Ok(project_root)
    }

    pub(super) async fn run_command(&self, args: &serde_json::Value) -> String {
        let command = args["command"].as_str().unwrap_or("");

        // Validate that command doesn't escape project directory
        if let Err(e) = self.validate_working_dir(command) {
            return e;
        }

        let mut child = match tokio::process::Command::new("sh")
            .args(["-c", command])
            .current_dir(&self.project_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(child) => child,
            Err(e) => return format!("Failed to execute command: {}", e),
        };

        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();

        let mut stdout_lines = BufReader::new(stdout).lines();
        let mut stderr_lines = BufReader::new(stderr).lines();

        let mut stdout_buf = String::new();
        let mut stderr_buf = String::new();

        // Read stdout and stderr concurrently, streaming each line to the frontend
        loop {
            tokio::select! {
                line = stdout_lines.next_line() => {
                    match line {
                        Ok(Some(line)) => {
                            // Handle carriage returns for progress tracking
                            let output_type = if line.contains('\r') { "progress" } else { "stdout" };
                            self.emit_tool_output("run_command", output_type, &line).await;
                            stdout_buf.push_str(&line);
                            stdout_buf.push('\n');
                        }
                        Ok(None) => break, // EOF
                        Err(e) => {
                            self.emit_tool_output("run_command", "stderr", &format!("stdout read error: {}", e)).await;
                            break;
                        }
                    }
                }
                line = stderr_lines.next_line() => {
                    match line {
                        Ok(Some(line)) => {
                            let output_type = if line.contains('\r') { "progress" } else { "stderr" };
                            self.emit_tool_output("run_command", output_type, &line).await;
                            stderr_buf.push_str(&line);
                            stderr_buf.push('\n');
                        }
                        Ok(None) => break, // EOF
                        Err(e) => {
                            self.emit_tool_output("run_command", "stderr", &format!("stderr read error: {}", e)).await;
                            break;
                        }
                    }
                    }
            }
        }

        // Wait for process to complete
        let _ = child.wait().await;

        // Build final result
        let mut result = String::new();
        if !stdout_buf.is_empty() {
            result.push_str(&stdout_buf);
        }
        if !stderr_buf.is_empty() {
            if !result.is_empty() {
                result.push_str("\n--- stderr ---\n");
            }
            result.push_str(&stderr_buf);
        }
        if result.is_empty() {
            "(command produced no output)".to_string()
        } else {
            // Truncate long output for the AI context
            if result.len() > 4000 {
                result.truncate(4000);
                result.push_str("\n... (truncated)");
            }
            result
        }
    }

    /// Run tests for a file or project
    pub(super) async fn run_tests(&self, args: &serde_json::Value) -> String {
        let path = args["path"].as_str().unwrap_or(".");
        let filter = args["filter"].as_str().unwrap_or("");

        // Detect test framework from project files
        let has_cargo = Path::new(&self.project_path).join("Cargo.toml").exists();
        let has_package_json = Path::new(&self.project_path).join("package.json").exists();
        let has_pytest = Path::new(&self.project_path).join("pytest.ini").exists()
            || Path::new(&self.project_path).join("pyproject.toml").exists();

        let (cmd, args_vec) = if has_cargo {
            if path == "." {
                if filter.is_empty() {
                    ("cargo".to_string(), vec!["test".to_string()])
                } else {
                    ("cargo".to_string(), vec!["test".to_string(), filter.to_string()])
                }
            } else {
                if filter.is_empty() {
                    ("cargo".to_string(), vec!["test".to_string(), "--manifest-path".to_string(), format!("{}/Cargo.toml", path)])
                } else {
                    ("cargo".to_string(), vec!["test".to_string(), "--manifest-path".to_string(), format!("{}/Cargo.toml", path), filter.to_string()])
                }
            }
        } else if has_package_json {
            if filter.is_empty() {
                ("npm".to_string(), vec!["test".to_string()])
            } else {
                ("npm".to_string(), vec!["test".to_string(), "--".to_string(), filter.to_string()])
            }
        } else if has_pytest {
            if filter.is_empty() {
                ("python".to_string(), vec!["-m".to_string(), "pytest".to_string(), path.to_string()])
            } else {
                ("python".to_string(), vec!["-m".to_string(), "pytest".to_string(), path.to_string(), "-k".to_string(), filter.to_string()])
            }
        } else {
            return "No test framework detected (Cargo.toml, package.json, or pyproject.toml not found)".to_string();
        };

        let output = tokio::process::Command::new(&cmd)
            .args(&args_vec)
            .current_dir(&self.project_path)
            .output()
            .await;

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let stderr = String::from_utf8_lossy(&out.stderr);
                let success = out.status.success();

                let mut result = String::new();
                if success {
                    result.push_str("Tests passed!\n");
                } else {
                    result.push_str("Tests failed!\n");
                }

                // Include relevant output
                if !stdout.is_empty() {
                    let lines: Vec<&str> = stdout.lines().take(50).collect();
                    result.push_str(&lines.join("\n"));
                }
                if !stderr.is_empty() && !success {
                    let lines: Vec<&str> = stderr.lines().take(20).collect();
                    result.push_str("\n--- stderr ---\n");
                    result.push_str(&lines.join("\n"));
                }

                result
            }
            Err(e) => format!("Failed to run tests: {}", e),
        }
    }

    /// Get LSP diagnostics for a file
    pub(super) async fn get_diagnostics(&self, args: &serde_json::Value) -> String {
        let path = args["path"].as_str().unwrap_or("");

        // This is a placeholder - real implementation would use the LSP client
        // For now, we'll try to use language-specific linters
        let ext = Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        let output = match ext {
            "rs" => {
                tokio::process::Command::new("cargo")
                    .args(["check", "--message-format=json"])
                    .current_dir(&self.project_path)
                    .output()
                    .await
            }
            "ts" | "tsx" => {
                tokio::process::Command::new("npx")
                    .args(["tsc", "--noEmit", "--pretty", path])
                    .current_dir(&self.project_path)
                    .output()
                    .await
            }
            "js" | "jsx" => {
                tokio::process::Command::new("npx")
                    .args(["eslint", "--format=json", path])
                    .current_dir(&self.project_path)
                    .output()
                    .await
            }
            "py" => {
                tokio::process::Command::new("python")
                    .args(["-m", "py_compile", path])
                    .current_dir(&self.project_path)
                    .output()
                    .await
            }
            _ => {
                return format!("Diagnostics not supported for .{} files", ext);
            }
        };

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let stderr = String::from_utf8_lossy(&out.stderr);

                if out.status.success() {
                    format!("No diagnostics found for {}", path)
                } else {
                    // Try to parse JSON output (cargo check)
                    if ext == "rs" && !stdout.is_empty() {
                        let mut errors = Vec::new();
                        for line in stdout.lines() {
                            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(line) {
                                if let Some(reason) = msg.get("reason").and_then(|r| r.as_str()) {
                                    if reason == "compiler-message" {
                                        if let Some(message) = msg.get("message") {
                                            let text = message.get("message").and_then(|m| m.as_str()).unwrap_or("unknown");
                                            let span = message.get("spans").and_then(|s| s.as_array()).and_then(|a| a.first());
                                            if let Some(span) = span {
                                                let file = span.get("file_name").and_then(|f| f.as_str()).unwrap_or("unknown");
                                                let line = span.get("line_start").and_then(|l| l.as_u64()).unwrap_or(0);
                                                errors.push(format!("{}:{}: {}", file, line, text));
                                            } else {
                                                errors.push(text.to_string());
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if errors.is_empty() {
                            stderr.to_string()
                        } else {
                            format!("Diagnostics for {}:\n{}", path, errors.join("\n"))
                        }
                    } else {
                        stderr.to_string()
                    }
                }
            }
            Err(e) => format!("Failed to get diagnostics: {}", e),
        }
    }
}
