use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use super::agent::AgentEvent;
use super::embedding_store::EmbeddingStore;
use super::mcp::McpManager;
use super::provider::{FunctionDefinition, ToolDefinition};

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

    /// Get all available tool definitions (OpenAI function-calling format)
    pub fn definitions(&self) -> Vec<ToolDefinition> {
        let mut tools = vec![
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "read_file".to_string(),
                    description: "Read the contents of a file at the given path. Returns file content (truncated to 200 lines by default).".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path to the file, relative to the project root"
                            },
                            "max_lines": {
                                "type": "integer",
                                "description": "Maximum lines to return (default: 200)"
                            },
                            "start_line": {
                                "type": "integer",
                                "description": "Start reading from this line (1-indexed)"
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
                    description: "List files and directories at the given path. Returns names, types, and sizes. Limited to 50 entries by default.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Directory path relative to the project root. Use '.' for root."
                            },
                            "max_results": {
                                "type": "integer",
                                "description": "Maximum entries to return (default: 50)"
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
            // NEW TOOLS
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "edit_file".to_string(),
                    description: "Edit a file by replacing specific lines (safer than write_file). Use line numbers.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "File path relative to project root"
                            },
                            "start_line": {
                                "type": "integer",
                                "description": "Start line number (1-indexed)"
                            },
                            "end_line": {
                                "type": "integer",
                                "description": "End line number (1-indexed, inclusive)"
                            },
                            "new_content": {
                                "type": "string",
                                "description": "New content to replace the lines with"
                            }
                        },
                        "required": ["path", "start_line", "end_line", "new_content"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "find_references".to_string(),
                    description: "Find all references to a symbol in the codebase. Uses grep/ripgrep.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "symbol": {
                                "type": "string",
                                "description": "The symbol name to search for"
                            },
                            "file_pattern": {
                                "type": "string",
                                "description": "Optional file extension filter (e.g. '.ts', '.rs')"
                            }
                        },
                        "required": ["symbol"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "get_definition".to_string(),
                    description: "Find the definition of a symbol (function, struct, type, etc.).".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "symbol": {
                                "type": "string",
                                "description": "The symbol name to find"
                            },
                            "kind": {
                                "type": "string",
                                "enum": ["function", "struct", "type", "variable", "module", "trait", "enum"],
                                "description": "Optional: the kind of symbol to search for"
                            }
                        },
                        "required": ["symbol"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "run_tests".to_string(),
                    description: "Run tests for a file or the entire project. Detects test framework automatically.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Optional: file or directory to test (default: all tests)"
                            },
                            "filter": {
                                "type": "string",
                                "description": "Optional: test name filter pattern"
                            }
                        },
                        "required": []
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "get_diagnostics".to_string(),
                    description: "Get LSP diagnostics (errors, warnings) for a file. Requires LSP server.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "File path to check"
                            }
                        },
                        "required": ["path"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "git_diff".to_string(),
                    description: "Show git diff for staged or unstaged changes.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "staged": {
                                "type": "boolean",
                                "description": "Show staged changes (default: unstaged)"
                            },
                            "file": {
                                "type": "string",
                                "description": "Optional: specific file to diff"
                            }
                        },
                        "required": []
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "git_commit".to_string(),
                    description: "Create a git commit with the given message. Stages specified files or all changes.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "message": {
                                "type": "string",
                                "description": "Commit message"
                            },
                            "files": {
                                "type": "array",
                                "items": { "type": "string" },
                                "description": "Optional: files to stage (default: all changes)"
                            }
                        },
                        "required": ["message"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "semantic_search".to_string(),
                    description: "Search code semantically using RAG. Returns relevant code chunks instead of just matches.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Natural language query to search for"
                            },
                            "max_results": {
                                "type": "integer",
                                "description": "Maximum number of results to return (default: 5)"
                            }
                        },
                        "required": ["query"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "print_tree".to_string(),
                    description: "Print the project directory tree structure. Shows files and folders. Default depth: 2, max output: 100 lines.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Optional: subdirectory to show (default: project root)"
                            },
                            "max_depth": {
                                "type": "integer",
                                "description": "Maximum depth to traverse (default: 2)"
                            },
                            "show_files": {
                                "type": "boolean",
                                "description": "Show files (default: true)"
                            }
                        },
                        "required": []
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "rag_metrics".to_string(),
                    description: "Get RAG (semantic search) usage metrics and performance stats.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {},
                        "required": []
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "attach_file".to_string(),
                    description: "Read and attach a file to the conversation context. Returns file content with metadata. Truncated to 300 lines by default.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path to the file to attach, relative to the project root"
                            },
                            "max_lines": {
                                "type": "integer",
                                "description": "Maximum lines to return (default: 300)"
                            }
                        },
                        "required": ["path"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "attach_multiple_files".to_string(),
                    description: "Read and attach multiple files to the conversation context. Returns file contents with metadata.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "paths": {
                                "type": "array",
                                "items": { "type": "string" },
                                "description": "Array of file paths to attach"
                            }
                        },
                        "required": ["paths"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "search_files".to_string(),
                    description: "Search for files by name pattern. Returns matching file paths.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Search query to match file names"
                            },
                            "max_results": {
                                "type": "integer",
                                "description": "Maximum number of results to return (default: 10)"
                            }
                        },
                        "required": ["query"]
                    }),
                },
            },
            // NETWORK TOOLS
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "webfetch".to_string(),
                    description: "Fetch content from a URL. Returns the response body as text. Use for reading docs, API responses, error pages, etc.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "url": {
                                "type": "string",
                                "description": "The URL to fetch"
                            },
                            "max_bytes": {
                                "type": "integer",
                                "description": "Maximum bytes to return (default: 50000). Content beyond this is truncated."
                            }
                        },
                        "required": ["url"]
                    }),
                },
            },
            // SUB-AGENT TOOLS
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "spawn_agent".to_string(),
                    description: "Spawn a sub-agent to handle a complex task. The sub-agent runs independently with its own context. Use for research, exploration, or parallel tasks. Returns the sub-agent's task ID.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "task": {
                                "type": "string",
                                "description": "Description of the task for the sub-agent to perform"
                            },
                            "strategy": {
                                "type": "string",
                                "enum": ["simple", "explore", "refactor"],
                                "description": "Execution strategy: 'simple' for direct tasks, 'explore' for read-only research, 'refactor' for multi-file changes"
                            }
                        },
                        "required": ["task"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "run_subagent".to_string(),
                    description: "Run a sub-agent synchronously and wait for its result. Use for tasks that need to complete before continuing. Returns the sub-agent's output.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "task": {
                                "type": "string",
                                "description": "Description of the task for the sub-agent to perform"
                            },
                            "strategy": {
                                "type": "string",
                                "enum": ["simple", "explore", "refactor"],
                                "description": "Execution strategy: 'simple' for direct tasks, 'explore' for read-only research, 'refactor' for multi-file changes"
                            }
                        },
                        "required": ["task"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "get_subagent_status".to_string(),
                    description: "Get the status and result of a sub-agent task. Use to check if a spawned sub-agent has completed.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "task_id": {
                                "type": "string",
                                "description": "The task ID returned by spawn_agent"
                            }
                        },
                        "required": ["task_id"]
                    }),
                },
            },
            // BACKGROUND PROCESS TOOLS
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "run_background".to_string(),
                    description: "Start a long-running process in the background (servers, watchers, etc.). Returns PID immediately. Use for commands that don't exit quickly.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "command": {
                                "type": "string",
                                "description": "The shell command to run in background"
                            }
                        },
                        "required": ["command"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "read_process_output".to_string(),
                    description: "Read stdout/stderr from a background process. Returns logs and whether the process is still running.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "pid": {
                                "type": "integer",
                                "description": "The PID of the background process"
                            }
                        },
                        "required": ["pid"]
                    }),
                },
            },
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "stop_process".to_string(),
                    description: "Stop a background process by PID.".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "pid": {
                                "type": "integer",
                                "description": "The PID of the process to stop"
                            }
                        },
                        "required": ["pid"]
                    }),
                },
            },
            // TODO TOOL
            ToolDefinition {
                tool_type: "function".to_string(),
                function: FunctionDefinition {
                    name: "todo_write".to_string(),
                    description: "Create or update TODO items for tracking task progress. Call this after outputting a plan, and update status as you complete each step.\n\n\
                        **Partial updates allowed:** You can update just the status without resending content.\n\n\
                        **Examples:**\n\
                        - Create new: `{\"todos\": [{\"id\": \"step_1\", \"content\": \"Start server\", \"status\": \"pending\"}]}`\n\
                        - Update status only: `{\"todos\": [{\"id\": \"step_1\", \"status\": \"in_progress\"}]}`\n\
                        - Mark complete: `{\"todos\": [{\"id\": \"step_1\", \"status\": \"completed\"}]}`".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "todos": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": {
                                            "type": "string",
                                            "description": "Unique identifier for the todo item"
                                        },
                                        "content": {
                                            "type": "string",
                                            "description": "Description of the task (only required when creating new items)"
                                        },
                                        "status": {
                                            "type": "string",
                                            "enum": ["pending", "in_progress", "completed"],
                                            "description": "Current status of the task"
                                        },
                                        "priority": {
                                            "type": "string",
                                            "enum": ["low", "medium", "high"],
                                            "description": "Priority level"
                                        }
                                    },
                                    "required": ["id", "status"]
                                },
                                "description": "Array of TODO items to create or update"
                            }
                        },
                        "required": ["todos"]
                    }),
                },
            },
        ];

        // Append MCP tools from connected servers (synchronous snapshot)
        // MCP tools are accessed via the async mcp_manager at execution time
        // Here we just include their definitions so the LLM knows they exist.
        // The actual tool list is built dynamically in definitions_with_mcp().
        tools
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

    async fn read_file(&self, args: &serde_json::Value) -> String {
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
        let max_results = args["max_results"].as_u64().unwrap_or(50) as usize;
        let full_path = Path::new(&self.project_path).join(path);

        match fs::read_dir(&full_path).await {
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

    async fn search_code(&self, args: &serde_json::Value) -> String {
        let pattern = args["pattern"].as_str().unwrap_or("");
        let file_pattern = args["file_pattern"].as_str().unwrap_or("");

        let exclusions = super::ignore::exclusions_for_project(&self.project_path);
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

    async fn run_command(&self, args: &serde_json::Value) -> String {
        let command = args["command"].as_str().unwrap_or("");

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

    async fn run_background(&self, args: &serde_json::Value) -> String {
        let command = args["command"].as_str().unwrap_or("");
        if command.is_empty() {
            return "Error: command is required".to_string();
        }

        let mut pm = self.process_manager.lock().await;
        match pm.spawn(command, &self.project_path) {
            Ok(pid) => format!("Process started in background with PID: {}", pid),
            Err(e) => format!("Failed to start background process: {}", e),
        }
    }

    async fn read_process_output(&self, args: &serde_json::Value) -> String {
        // Try to parse pid as u64 first, then try string extraction
        let pid = if let Some(p) = args["pid"].as_u64() {
            p as u32
        } else if let Some(s) = args["pid"].as_str() {
            // Try to extract numeric part from string (e.g., "514514?" -> 514514)
            let numeric_part: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
            match numeric_part.parse::<u32>() {
                Ok(p) => p,
                Err(_) => return format!("Error: invalid pid '{}'. Must be a number.", s),
            }
        } else {
            return "Error: pid is required and must be a number".to_string();
        };

        let mut pm = self.process_manager.lock().await;
        match pm.read_output(pid).await {
            Ok((stdout, stderr, is_running)) => {
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
                    result = "(no output yet)".to_string();
                }
                if result.len() > 4000 {
                    result.truncate(4000);
                    result.push_str("\n... (truncated)");
                }
                result.push_str(&format!("\n[Process {} is {}]", pid, if is_running { "running" } else { "stopped" }));
                result
            }
            Err(e) => format!("Error reading process output: {}", e),
        }
    }

    async fn stop_process(&self, args: &serde_json::Value) -> String {
        // Try to parse pid as u64 first, then try string extraction
        let pid = if let Some(p) = args["pid"].as_u64() {
            p as u32
        } else if let Some(s) = args["pid"].as_str() {
            // Try to extract numeric part from string (e.g., "514514?" -> 514514)
            let numeric_part: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
            match numeric_part.parse::<u32>() {
                Ok(p) => p,
                Err(_) => return format!("Error: invalid pid '{}'. Must be a number.", s),
            }
        } else {
            return "Error: pid is required and must be a number".to_string();
        };

        let mut pm = self.process_manager.lock().await;
        match pm.stop(pid).await {
            Ok(msg) => msg,
            Err(e) => format!("Error stopping process: {}", e),
        }
    }

    async fn todo_write(&self, args: &serde_json::Value) -> String {
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

    // ── NEW TOOL IMPLEMENTATIONS ──────────────────────────────

    /// Edit a file by replacing specific lines
    async fn edit_file(&self, args: &serde_json::Value) -> String {
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
                let replaced = end_line - start_line + 1;
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

    /// Find all references to a symbol
    async fn find_references(&self, args: &serde_json::Value) -> String {
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
    async fn get_definition(&self, args: &serde_json::Value) -> String {
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

    /// Run tests for a file or project
    async fn run_tests(&self, args: &serde_json::Value) -> String {
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
    async fn get_diagnostics(&self, args: &serde_json::Value) -> String {
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

    /// Show git diff
    async fn git_diff(&self, args: &serde_json::Value) -> String {
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
    async fn git_commit(&self, args: &serde_json::Value) -> String {
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

    /// Semantic search using RAG
    async fn semantic_search(&self, args: &serde_json::Value) -> String {
        let query = args["query"].as_str().unwrap_or("");
        let max_results = args["max_results"].as_u64().unwrap_or(5) as usize;

        let store = match &self.embedding_store {
            Some(store) => store,
            None => return "Semantic search not available (embedding store not initialized)".to_string(),
        };

        let results = {
            let mut store = store.lock().await;
            let results = store.search(query, max_results);
            // Record the search for metrics
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

            // Show symbol name if available
            if let Some(ref name) = chunk.symbol_name {
                output.push_str(&format!("   Symbol: {}\n", name));
            }

            // Show first few lines of content
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

    /// Print project directory tree
    async fn print_tree(&self, args: &serde_json::Value) -> String {
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
        let exclusions = super::ignore::exclusions_for_project(&self.project_path);

        for (i, entry) in entries.iter().enumerate() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.path().is_dir();

            // Skip hidden files/dirs and excluded directories
            if is_dir && super::ignore::should_skip_dir(&file_name, &exclusions) {
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
    async fn rag_metrics(&self) -> String {
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

    /// Attach a file to the conversation context
    async fn attach_file(&self, args: &serde_json::Value) -> String {
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
    async fn attach_multiple_files(&self, args: &serde_json::Value) -> String {
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

    /// Fetch content from a URL
    async fn webfetch(&self, args: &serde_json::Value) -> String {
        let url = args["url"].as_str().unwrap_or("");
        let max_bytes = args["max_bytes"].as_u64().unwrap_or(50000) as usize;

        if url.is_empty() {
            return "Error: no URL provided".to_string();
        }

        // Validate URL scheme
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return format!("Error: unsupported URL scheme '{}'. Only http:// and https:// are supported.", 
                url.split(':').next().unwrap_or(""));
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build();

        let client = match client {
            Ok(c) => c,
            Err(e) => return format!("Error creating HTTP client: {}", e),
        };

        let response = client.get(url).send().await;

        match response {
            Ok(resp) => {
                let status = resp.status();
                let content_type = resp.headers()
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("unknown")
                    .to_string();

                if !status.is_success() {
                    return format!("HTTP {} {}\nContent-Type: {}", status.as_u16(), status.canonical_reason().unwrap_or("Unknown"), content_type);
                }

                let body = resp.bytes().await;
                match body {
                    Ok(bytes) => {
                        let total_size = bytes.len();
                        let body_str = String::from_utf8_lossy(&bytes);
                        
                        let truncated = if body_str.len() > max_bytes {
                            &body_str[..max_bytes]
                        } else {
                            &body_str
                        };

                        let mut result = format!("URL: {}\nStatus: {} {}\nContent-Type: {}\nSize: {} bytes{}\n\n{}",
                            url,
                            status.as_u16(),
                            status.canonical_reason().unwrap_or(""),
                            content_type,
                            total_size,
                            if total_size > max_bytes { " (truncated)" } else { "" },
                            truncated
                        );

                        if total_size > max_bytes {
                            result.push_str(&format!("\n\n... (truncated at {} of {} bytes)", max_bytes, total_size));
                        }

                        result
                    }
                    Err(e) => format!("Error reading response body: {}", e),
                }
            }
            Err(e) => format!("Error fetching URL: {}", e),
        }
    }

    /// Search for files by name pattern
    async fn search_files(&self, args: &serde_json::Value) -> String {
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

    /// Get only the essential tool definitions (reduced set for better model focus)
    /// Also includes all MCP tools since they are user-configured and important
    pub fn essential_definitions(&self) -> Vec<ToolDefinition> {
        let all = self.definitions();
        let essential = [
            "read_file", "write_file", "edit_file", "search_code",
            "run_command", "get_diagnostics", "webfetch",
            "spawn_agent", "run_subagent", "get_subagent_status",
            "run_background", "read_process_output", "stop_process",
            "todo_write",
        ];
        all.into_iter()
            .filter(|t| {
                essential.contains(&t.function.name.as_str())
                    || t.function.name.starts_with("mcp__")
            })
            .collect()
    }

    /// Get essential tool definitions including MCP tools (async version)
    pub async fn essential_definitions_with_mcp(&self) -> Vec<ToolDefinition> {
        let all = self.definitions_with_mcp().await;
        let essential = [
            "read_file", "write_file", "edit_file", "search_code",
            "run_command", "get_diagnostics", "webfetch",
            "spawn_agent", "run_subagent", "get_subagent_status",
            "run_background", "read_process_output", "stop_process",
            "todo_write",
        ];
        all.into_iter()
            .filter(|t| {
                essential.contains(&t.function.name.as_str())
                    || t.function.name.starts_with("mcp__")
            })
            .collect()
    }

    // ── SUB-AGENT TOOL IMPLEMENTATIONS ──────────────────────────

    /// Spawn a sub-agent to handle a task asynchronously
    async fn spawn_agent(&self, args: &serde_json::Value) -> String {
        let task = args["task"].as_str().unwrap_or("");
        let strategy = args["strategy"].as_str().unwrap_or("simple");

        let orchestrator = match &self.orchestrator {
            Some(o) => o,
            None => return "Sub-agent spawning not available (orchestrator not initialized)".to_string(),
        };

        let task_id = orchestrator.submit_request(task.to_string()).await;

        // Spawn a background task to process this immediately
        let orch = orchestrator.clone();
        tokio::spawn(async move {
            let _ = orch.process_next().await;
        });

        format!(
            "Sub-agent spawned with task ID: {}. The sub-agent is running in the background.",
            task_id
        )
    }

    /// Run a sub-agent synchronously and wait for its result
    async fn run_subagent(&self, args: &serde_json::Value) -> String {
        let task = args["task"].as_str().unwrap_or("");
        let strategy = args["strategy"].as_str().unwrap_or("simple");

        let orchestrator = match &self.orchestrator {
            Some(o) => o,
            None => return "Sub-agent spawning not available (orchestrator not initialized)".to_string(),
        };

        // Submit and process immediately
        let task_id = orchestrator.submit_request(task.to_string()).await;

        match orchestrator.process_next().await {
            Ok(result) => {
                format!(
                    "Sub-agent completed (task: {}):\n{}\n\nTool calls made: {}",
                    result.task_id, result.output, result.tool_calls_made
                )
            }
            Err(e) => format!("Sub-agent failed: {}", e),
        }
    }

    /// Get the status of a sub-agent task
    async fn get_subagent_status(&self, args: &serde_json::Value) -> String {
        let task_id = args["task_id"].as_str().unwrap_or("");

        let orchestrator = match &self.orchestrator {
            Some(o) => o,
            None => return "Sub-agent status not available (orchestrator not initialized)".to_string(),
        };

        match orchestrator.get_result(task_id).await {
            Some(result) => {
                format!(
                    "Task {} completed:\nSuccess: {}\nOutput: {}\nTool calls: {}",
                    result.task_id, result.success, result.output, result.tool_calls_made
                )
            }
            None => {
                let pending = orchestrator.pending_count().await;
                let active = orchestrator.active_count().await;
                format!(
                    "Task {} not yet completed.\nPending tasks: {}\nActive agents: {}",
                    task_id, pending, active
                )
            }
        }
    }

    /// Execute a tool call on an MCP server
    async fn execute_mcp_tool(&self, name: &str, arguments: &str) -> String {
        let mcp_manager = match &self.mcp_manager {
            Some(m) => m,
            None => return format!("MCP not available (manager not initialized). Tool '{}'.", name),
        };

        let manager = mcp_manager.lock().await;
        match manager.call_tool(name, arguments).await {
            Ok(result) => result,
            Err(e) => format!("MCP tool '{}' failed: {}", name, e),
        }
    }
}

/// Format file size to human-readable string
fn format_size(bytes: u64) -> String {
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
