#[tauri::command]
pub async fn ai_search_files(project_path: String, query: String, max_results: Option<usize>) -> Result<String, String> {
    use super::super::tools::ToolRegistry;
    use super::super::sandbox::Sandbox;

    let sandbox = Sandbox::new();
    let tools = ToolRegistry::with_sandbox(project_path, sandbox);

    let args = serde_json::json!({
        "query": query,
        "max_results": max_results.unwrap_or(10),
    });

    Ok(tools.execute("search_files", &args.to_string()).await)
}

#[tauri::command]
pub async fn ai_read_file(project_path: String, path: String, max_lines: Option<usize>) -> Result<String, String> {
    use super::super::tools::ToolRegistry;
    use super::super::sandbox::Sandbox;

    let sandbox = Sandbox::new();
    let tools = ToolRegistry::with_sandbox(project_path, sandbox);

    let args = serde_json::json!({
        "path": path,
    });

    let content = tools.execute("read_file", &args.to_string()).await;

    let max = max_lines.unwrap_or(500);
    let lines: Vec<&str> = content.lines().collect();
    if lines.len() > max {
        Ok(format!("{}...\n[Truncated: {} of {} lines]", lines[..max].join("\n"), max, lines.len()))
    } else {
        Ok(content)
    }
}
