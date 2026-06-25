use super::super::{FunctionDefinition, ToolDefinition};

/// Get all available tool definitions (OpenAI function-calling format)
pub fn builtin_definitions() -> Vec<ToolDefinition> {
    let tools = vec![
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

/// Filter tool definitions to only the essential set
pub fn essential_definitions(all: &[ToolDefinition]) -> Vec<ToolDefinition> {
    let essential = [
        "read_file", "write_file", "edit_file", "search_code",
        "run_command", "get_diagnostics", "webfetch",
        "spawn_agent", "run_subagent", "get_subagent_status",
        "run_background", "read_process_output", "stop_process",
        "todo_write",
    ];
    all.iter()
        .cloned()
        .filter(|t| {
            essential.contains(&t.function.name.as_str())
                || t.function.name.starts_with("mcp__")
        })
        .collect()
}
