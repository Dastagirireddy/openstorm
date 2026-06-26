use super::Agent;

/// Generate a preview for tools that require approval.
///
/// Returns JSON with structured diff data for the frontend to render.
/// Supports `write_file`, `edit_file`, and `run_command` tools.
///
/// # Arguments
/// * `agent` - Reference to the agent (for project path).
/// * `tool_name` - Name of the tool.
/// * `arguments` - JSON string of the tool's arguments.
pub fn generate_tool_preview(agent: &Agent, tool_name: &str, arguments: &str) -> String {
    let args: serde_json::Value = serde_json::from_str(arguments).unwrap_or_default();

    match tool_name {
        "write_file" => build_write_file_preview(agent, &args),
        "run_command" => build_run_command_preview(&args),
        "edit_file" => build_edit_file_preview(&args),
        _ => arguments.to_string(),
    }
}

/// Build a diff preview for `write_file` tool.
fn build_write_file_preview(agent: &Agent, args: &serde_json::Value) -> String {
    let path = args["path"].as_str().unwrap_or("unknown");
    let content = args["content"].as_str().unwrap_or("");

    let full_path = std::path::Path::new(&agent.tools.project_path).join(path);
    let existing = std::fs::read_to_string(&full_path).unwrap_or_default();
    let old_lines: Vec<&str> = existing.lines().collect();
    let new_lines: Vec<&str> = content.lines().collect();

    let language = detect_language(path);
    let hunks = compute_diff_hunks(&old_lines, &new_lines);

    let preview = serde_json::json!({
        "type": "diff",
        "file_path": path,
        "language": language,
        "old_lines": old_lines.len(),
        "new_lines": new_lines.len(),
        "hunks": hunks,
    });

    preview.to_string()
}

/// Build a preview for `run_command` tool.
fn build_run_command_preview(args: &serde_json::Value) -> String {
    let command = args["command"].as_str().unwrap_or("unknown");
    serde_json::json!({
        "type": "command",
        "command": command,
    })
    .to_string()
}

/// Build a preview for `edit_file` tool.
fn build_edit_file_preview(args: &serde_json::Value) -> String {
    let path = args["path"].as_str().unwrap_or("unknown");
    let start_line = args["start_line"].as_u64().unwrap_or(0);
    let end_line = args["end_line"].as_u64().unwrap_or(0);
    let new_content = args["new_content"].as_str().unwrap_or("");

    serde_json::json!({
        "type": "edit",
        "file_path": path,
        "start_line": start_line,
        "end_line": end_line,
        "new_lines": new_content.lines().count(),
    })
    .to_string()
}

/// Detect language from file extension.
fn detect_language(path: &str) -> &'static str {
    match path.rsplit('.').next() {
        Some("rs") => "rust",
        Some("ts") | Some("tsx") => "typescript",
        Some("js") | Some("jsx") => "javascript",
        Some("py") => "python",
        Some("go") => "go",
        Some("java") => "java",
        Some("rb") => "ruby",
        Some("css") => "css",
        Some("html") | Some("htm") => "html",
        Some("json") => "json",
        Some("yaml") | Some("yml") => "yaml",
        Some("toml") => "toml",
        Some("md") => "markdown",
        Some("sh") | Some("bash") => "bash",
        _ => "text",
    }
}

/// Compute line-by-line diff hunks between old and new content.
fn compute_diff_hunks(
    old_lines: &[&str],
    new_lines: &[&str],
) -> Vec<serde_json::Value> {
    let mut hunks: Vec<serde_json::Value> = Vec::new();
    let max_old = old_lines.len();
    let max_new = new_lines.len();
    let max_lines = max_old.max(max_new);

    let mut old_idx = 0;
    let mut new_idx = 0;

    for _ in 0..max_lines + 5 {
        let old_line = old_lines.get(old_idx).map(|s| s.to_string());
        let new_line = new_lines.get(new_idx).map(|s| s.to_string());

        match (&old_line, &new_line) {
            (Some(o), Some(n)) if o == n => {
                hunks.push(serde_json::json!({
                    "type": "context",
                    "old_line": old_idx + 1,
                    "new_line": new_idx + 1,
                    "content": o,
                }));
                old_idx += 1;
                new_idx += 1;
            }
            _ => {
                if let Some(o) = &old_line {
                    hunks.push(serde_json::json!({
                        "type": "removed",
                        "old_line": old_idx + 1,
                        "new_line": null,
                        "content": o,
                    }));
                    old_idx += 1;
                }
                if let Some(n) = &new_line {
                    hunks.push(serde_json::json!({
                        "type": "added",
                        "old_line": null,
                        "new_line": new_idx + 1,
                        "content": n,
                    }));
                    new_idx += 1;
                }
            }
        }

        if old_idx >= max_old && new_idx >= max_new {
            break;
        }
    }

    // Limit to 50 lines to avoid huge previews
    if hunks.len() > 50 {
        let total = hunks.len();
        hunks.truncate(25);
        hunks.push(serde_json::json!({
            "type": "context",
            "old_line": null,
            "new_line": null,
            "content": format!("... ({} more lines) ...", total - 25),
        }));
    }

    hunks
}
