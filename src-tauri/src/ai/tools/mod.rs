mod definitions;
mod file_ops;
mod search_ops;
mod command_ops;
mod git_ops;
mod process_ops;
mod project_ops;
mod subagent_ops;
mod network_ops;
mod mcp_ops;

use std::process::Stdio;
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use super::agent::AgentEvent;
use super::agent::DiffLine;
use super::agent::FileModification;
use super::embedding_store::EmbeddingStore;
use super::mcp::McpManager;
use super::ToolDefinition;

/// Manages background processes spawned by the agent
pub struct ProcessManager {
    processes: std::collections::HashMap<u32, ManagedProcess>,
}

struct ManagedProcess {
    child: Child,
    command: String,
    stdout_log: Vec<String>,
    stderr_log: Vec<String>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            processes: std::collections::HashMap::new(),
        }
    }

    pub fn spawn(&mut self, command: &str, cwd: &str) -> Result<u32, String> {
        let child = Command::new("sh")
            .args(["-c", command])
            .current_dir(cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start process: {}", e))?;

        let pid = child.id().unwrap_or(0);
        self.processes.insert(pid, ManagedProcess {
            child,
            command: command.to_string(),
            stdout_log: Vec::new(),
            stderr_log: Vec::new(),
        });
        Ok(pid)
    }

    pub async fn read_output(&mut self, pid: u32) -> Result<(String, String, bool), String> {
        let proc = self.processes.get_mut(&pid).ok_or_else(|| format!("Process {} not found", pid))?;

        // Read available stdout with timeout (non-blocking)
        if let Some(ref mut stdout) = proc.child.stdout {
            let mut buf = [0u8; 4096];
            loop {
                match tokio::time::timeout(
                    std::time::Duration::from_millis(100),
                    tokio::io::AsyncReadExt::read(stdout, &mut buf)
                ).await {
                    Ok(Ok(0)) => break, // EOF
                    Ok(Ok(n)) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]);
                        for line in chunk.lines() {
                            proc.stdout_log.push(line.to_string());
                        }
                    }
                    _ => break, // timeout or error
                }
            }
        }

        // Read available stderr with timeout (non-blocking)
        if let Some(ref mut stderr) = proc.child.stderr {
            let mut buf = [0u8; 4096];
            loop {
                match tokio::time::timeout(
                    std::time::Duration::from_millis(100),
                    tokio::io::AsyncReadExt::read(stderr, &mut buf)
                ).await {
                    Ok(Ok(0)) => break, // EOF
                    Ok(Ok(n)) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]);
                        for line in chunk.lines() {
                            proc.stderr_log.push(line.to_string());
                        }
                    }
                    _ => break, // timeout or error
                }
            }
        }

        let is_running = proc.child.try_wait().ok().flatten().is_none();
        let stdout = proc.stdout_log.join("\n");
        let stderr = proc.stderr_log.join("\n");
        Ok((stdout, stderr, is_running))
    }

    pub async fn stop(&mut self, pid: u32) -> Result<String, String> {
        let mut proc = self.processes.remove(&pid).ok_or_else(|| format!("Process {} not found", pid))?;
        proc.child.kill().await.map_err(|e| format!("Failed to kill process: {}", e))?;
        Ok(format!("Process {} ({}) stopped", pid, proc.command))
    }

    /// Kill all running processes
    pub async fn kill_all(&mut self) {
        for (pid, mut proc) in self.processes.drain() {
            let _ = proc.child.kill().await;
            eprintln!("[AI] Killed background process {}", pid);
        }
    }

    pub fn list(&mut self) -> Vec<(u32, String, bool)> {
        self.processes.iter_mut().map(|(pid, p)| {
            let is_running = p.child.try_wait().ok().flatten().is_none();
            (*pid, p.command.clone(), is_running)
        }).collect()
    }
}

/// Registry of tools available to the AI agent
pub struct ToolRegistry {
    pub project_path: String,
    /// Sandbox for safe execution (optional)
    pub sandbox: Option<super::sandbox::Sandbox>,
    /// Embedding store for RAG search (optional)
    pub embedding_store: Option<Arc<Mutex<EmbeddingStore>>>,
    /// Orchestrator for sub-agent spawning (optional)
    pub orchestrator: Option<Arc<super::orchestrator::Orchestrator>>,
    /// MCP manager for external tool servers (optional)
    pub mcp_manager: Option<Arc<Mutex<McpManager>>>,
    /// Process manager for background processes
    pub process_manager: Arc<Mutex<ProcessManager>>,
    /// Event sender for streaming tool output to the frontend
    pub event_tx: Arc<Mutex<Option<tokio::sync::mpsc::Sender<AgentEvent>>>>,
    /// Pending file modifications captured during tool execution (for v2 summary)
    pub(crate) pending_file_modifications: std::sync::Mutex<Vec<FileModification>>,
}

impl ToolRegistry {
    pub fn new(project_path: String) -> Self {
        Self {
            project_path,
            sandbox: None,
            embedding_store: None,
            orchestrator: None,
            mcp_manager: None,
            process_manager: Arc::new(Mutex::new(ProcessManager::new())),
            event_tx: Arc::new(Mutex::new(None)),
            pending_file_modifications: std::sync::Mutex::new(Vec::new()),
        }
    }

    /// Create a new tool registry with sandbox
    pub fn with_sandbox(project_path: String, sandbox: super::sandbox::Sandbox) -> Self {
        Self {
            project_path,
            sandbox: Some(sandbox),
            embedding_store: None,
            orchestrator: None,
            mcp_manager: None,
            process_manager: Arc::new(Mutex::new(ProcessManager::new())),
            event_tx: Arc::new(Mutex::new(None)),
            pending_file_modifications: std::sync::Mutex::new(Vec::new()),
        }
    }

    /// Create a new tool registry with embedding store for RAG
    pub fn with_embedding_store(
        project_path: String,
        sandbox: super::sandbox::Sandbox,
        embedding_store: Arc<Mutex<EmbeddingStore>>,
    ) -> Self {
        Self {
            project_path,
            sandbox: Some(sandbox),
            embedding_store: Some(embedding_store),
            orchestrator: None,
            mcp_manager: None,
            process_manager: Arc::new(Mutex::new(ProcessManager::new())),
            event_tx: Arc::new(Mutex::new(None)),
            pending_file_modifications: std::sync::Mutex::new(Vec::new()),
        }
    }

    /// Create a new tool registry with orchestrator for sub-agents
    pub fn with_orchestrator(
        project_path: String,
        sandbox: super::sandbox::Sandbox,
        embedding_store: Arc<Mutex<EmbeddingStore>>,
        orchestrator: Arc<super::orchestrator::Orchestrator>,
    ) -> Self {
        Self {
            project_path,
            sandbox: Some(sandbox),
            embedding_store: Some(embedding_store),
            orchestrator: Some(orchestrator),
            mcp_manager: None,
            process_manager: Arc::new(Mutex::new(ProcessManager::new())),
            event_tx: Arc::new(Mutex::new(None)),
            pending_file_modifications: std::sync::Mutex::new(Vec::new()),
        }
    }

    /// Create a new tool registry with MCP manager for external tools
    pub fn with_mcp(
        project_path: String,
        sandbox: super::sandbox::Sandbox,
        embedding_store: Arc<Mutex<EmbeddingStore>>,
        orchestrator: Arc<super::orchestrator::Orchestrator>,
        mcp_manager: Arc<Mutex<McpManager>>,
    ) -> Self {
        Self {
            project_path,
            sandbox: Some(sandbox),
            embedding_store: Some(embedding_store),
            orchestrator: Some(orchestrator),
            mcp_manager: Some(mcp_manager),
            process_manager: Arc::new(Mutex::new(ProcessManager::new())),
            event_tx: Arc::new(Mutex::new(None)),
            pending_file_modifications: std::sync::Mutex::new(Vec::new()),
        }
    }

    /// Create a tool registry with a shared process manager (for session persistence)
    pub fn with_process_manager(
        project_path: String,
        sandbox: super::sandbox::Sandbox,
        embedding_store: Arc<Mutex<EmbeddingStore>>,
        orchestrator: Arc<super::orchestrator::Orchestrator>,
        mcp_manager: Arc<Mutex<McpManager>>,
        process_manager: Arc<Mutex<ProcessManager>>,
    ) -> Self {
        Self {
            project_path,
            sandbox: Some(sandbox),
            embedding_store: Some(embedding_store),
            orchestrator: Some(orchestrator),
            mcp_manager: Some(mcp_manager),
            process_manager,
            event_tx: Arc::new(Mutex::new(None)),
            pending_file_modifications: std::sync::Mutex::new(Vec::new()),
        }
    }

    /// Set the event sender for streaming tool output to the frontend
    pub async fn set_event_sender(&self, sender: tokio::sync::mpsc::Sender<AgentEvent>) {
        let mut tx = self.event_tx.lock().await;
        *tx = Some(sender);
    }

    /// Helper to emit a tool output event if a sender is available
    pub async fn emit_tool_output(&self, tool_name: &str, output_type: &str, data: &str) {
        let tx = self.event_tx.lock().await;
        if let Some(sender) = tx.as_ref() {
            let _ = sender.send(AgentEvent::ToolOutput {
                tool_name: tool_name.to_string(),
                output_type: output_type.to_string(),
                data: data.to_string(),
            }).await;
        }
    }

    /// Take all pending file modifications (drains the list)
    pub fn take_file_modifications(&self) -> Vec<FileModification> {
        let mut pending = self.pending_file_modifications.lock().unwrap();
        std::mem::take(&mut *pending)
    }

    /// Compute a simple line-by-line diff between old and new content
    fn compute_diff(path: &str, old_content: &str, new_content: &str) -> FileModification {
        let old_lines: Vec<&str> = old_content.lines().collect();
        let new_lines: Vec<&str> = new_content.lines().collect();
        let mut diff_lines = Vec::new();
        let mut lines_added = 0u32;
        let mut lines_removed = 0u32;

        let max_lines = old_lines.len().max(new_lines.len());
        let mut old_idx = 0;
        let mut new_idx = 0;

        for _ in 0..max_lines + 5 {
            let old_line = old_lines.get(old_idx).copied();
            let new_line = new_lines.get(new_idx).copied();

            match (old_line, new_line) {
                (Some(o), Some(n)) if o == n => {
                    diff_lines.push(DiffLine {
                        line_type: "context".to_string(),
                        line_num: (new_idx + 1) as u32,
                        content: o.to_string(),
                    });
                    old_idx += 1;
                    new_idx += 1;
                }
                (Some(o), _) => {
                    diff_lines.push(DiffLine {
                        line_type: "delete".to_string(),
                        line_num: (old_idx + 1) as u32,
                        content: o.to_string(),
                    });
                    lines_removed += 1;
                    old_idx += 1;
                }
                (None, Some(n)) => {
                    diff_lines.push(DiffLine {
                        line_type: "add".to_string(),
                        line_num: (new_idx + 1) as u32,
                        content: n.to_string(),
                    });
                    lines_added += 1;
                    new_idx += 1;
                }
                (None, None) => break,
            }

            if old_idx >= old_lines.len() && new_idx >= new_lines.len() {
                break;
            }
        }

        FileModification {
            path: path.to_string(),
            diff: diff_lines,
            lines_added,
            lines_removed,
        }
    }

    /// Get all available tool definitions (OpenAI function-calling format)
    pub fn definitions(&self) -> Vec<ToolDefinition> {
        definitions::builtin_definitions()
    }

    /// Get all tool definitions including MCP tools from connected servers.
    /// This is async because MCP tool discovery requires locking the manager.
    pub async fn definitions_with_mcp(&self) -> Vec<ToolDefinition> {
        let mut tools = self.definitions();

        if let Some(ref mcp_manager) = self.mcp_manager {
            let manager = mcp_manager.lock().await;
            let mcp_tools = manager.list_tools();
            for mcp_tool in mcp_tools {
                tools.push(mcp_tool.definition);
            }
        }

        tools
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
            "edit_file" => self.edit_file(&args).await,
            "list_directory" => self.list_directory(&args).await,
            "search_code" => self.search_code(&args).await,
            "find_references" => self.find_references(&args).await,
            "get_definition" => self.get_definition(&args).await,
            "run_command" => self.run_command(&args).await,
            "run_tests" => self.run_tests(&args).await,
            "get_diagnostics" => self.get_diagnostics(&args).await,
            "git_status" => self.git_status().await,
            "git_diff" => self.git_diff(&args).await,
            "git_commit" => self.git_commit(&args).await,
            "semantic_search" => self.semantic_search(&args).await,
            "print_tree" => self.print_tree(&args).await,
            "rag_metrics" => self.rag_metrics().await,
            "attach_file" => self.attach_file(&args).await,
            "attach_multiple_files" => self.attach_multiple_files(&args).await,
            "search_files" => self.search_files(&args).await,
            "webfetch" => self.webfetch(&args).await,
            "spawn_agent" => self.spawn_agent(&args).await,
            "run_subagent" => self.run_subagent(&args).await,
            "get_subagent_status" => self.get_subagent_status(&args).await,
            "run_background" => self.run_background(&args).await,
            "read_process_output" => self.read_process_output(&args).await,
            "stop_process" => self.stop_process(&args).await,
            "todo_write" => self.todo_write(&args).await,
            name if name.starts_with("mcp__") => self.execute_mcp_tool(name, arguments).await,
            _ => {
                let available = vec![
                    "read_file", "write_file", "edit_file", "list_directory",
                    "search_code", "find_references", "get_definition",
                    "run_command", "run_tests", "get_diagnostics",
                    "git_status", "git_diff", "git_commit", "semantic_search",
                    "print_tree", "rag_metrics", "attach_file", "attach_multiple_files",
                    "search_files", "webfetch", "spawn_agent", "run_subagent",
                    "get_subagent_status", "run_background", "read_process_output",
                    "stop_process",
                ];
                format!(
                    "Unknown tool '{}'. Available tools: {}. Use one of these tools instead.",
                    name,
                    available.join(", ")
                )
            }
        }
    }

    /// Get only the essential tool definitions (reduced set for better model focus)
    /// Also includes all MCP tools since they are user-configured and important
    pub fn essential_definitions(&self) -> Vec<ToolDefinition> {
        let all = self.definitions();
        definitions::essential_definitions(&all)
    }

    /// Get essential tool definitions including MCP tools (async version)
    pub async fn essential_definitions_with_mcp(&self) -> Vec<ToolDefinition> {
        let all = self.definitions_with_mcp().await;
        definitions::essential_definitions(&all)
    }
}
