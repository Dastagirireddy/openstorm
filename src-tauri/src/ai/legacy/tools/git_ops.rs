use super::ToolRegistry;

impl ToolRegistry {
    pub(super) async fn git_status(&self) -> String {
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

    /// Show git diff
    pub(super) async fn git_diff(&self, args: &serde_json::Value) -> String {
        let staged = args["staged"].as_bool().unwrap_or(false);
        let file = args["file"].as_str().unwrap_or("");

        let mut cmd_args = vec!["diff".to_string()];
        if staged {
            cmd_args.push("--cached".to_string());
        }
        if !file.is_empty() {
            cmd_args.push("--".to_string());
            cmd_args.push(file.to_string());
        }

        let output = tokio::process::Command::new("git")
            .args(&cmd_args)
            .current_dir(&self.project_path)
            .output()
            .await;

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                if stdout.is_empty() {
                    if staged {
                        "No staged changes".to_string()
                    } else {
                        "No unstaged changes".to_string()
                    }
                } else {
                    let lines: Vec<&str> = stdout.lines().take(100).collect();
                    let total = stdout.lines().count();
                    let mut result = lines.join("\n");
                    if total > 100 {
                        result.push_str(&format!("\n... ({} total lines, showing first 100)", total));
                    }
                    result
                }
            }
            Err(e) => format!("Git diff failed: {}", e),
        }
    }

    /// Create a git commit
    pub(super) async fn git_commit(&self, args: &serde_json::Value) -> String {
        let message = args["message"].as_str().unwrap_or("");
        let files = args["files"].as_array();

        // Stage files if specified
        if let Some(file_list) = files {
            let file_paths: Vec<&str> = file_list.iter().filter_map(|f| f.as_str()).collect();
            if !file_paths.is_empty() {
                let mut stage_args = vec!["add".to_string()];
                stage_args.extend(file_paths.iter().map(|s| s.to_string()));

                let stage_output = tokio::process::Command::new("git")
                    .args(&stage_args)
                    .current_dir(&self.project_path)
                    .output()
                    .await;

                if let Err(e) = stage_output {
                    return format!("Failed to stage files: {}", e);
                }
            }
        }

        // Create commit
        let output = tokio::process::Command::new("git")
            .args(["commit", "-m", message])
            .current_dir(&self.project_path)
            .output()
            .await;

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let stderr = String::from_utf8_lossy(&out.stderr);

                if out.status.success() {
                    format!("Commit created successfully:\n{}", stdout)
                } else {
                    format!("Commit failed:\n{}", stderr)
                }
            }
            Err(e) => format!("Git commit failed: {}", e),
        }
    }
}
