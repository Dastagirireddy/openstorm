use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};

use super::context::ContextManager;
use super::cost_tracker::{SharedCostTracker, create_shared_cost_tracker};
use super::embedding_store::EmbeddingStore;
use super::permissions::{PermissionProfile, PermissionResult, PermissionSystem};
use super::project_context::ProjectContext;
use super::provider::*;
use super::sandbox::Sandbox;
use super::session_log::AiSessionLog;
use super::tools::ToolRegistry;

/// Maximum characters for a single tool result before truncation
const MAX_TOOL_RESULT_CHARS: usize = 3000;

/// Maximum time to wait for streaming response from LLM (per iteration)
const STREAM_TIMEOUT_SECS: u64 = 120;

/// Truncate a string to a safe UTF-8 char boundary (won't panic on multi-byte chars)
fn truncate_to_boundary(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    // Find the last complete char that fits within max_bytes
    let mut end = 0;
    for (i, c) in s.char_indices() {
        let char_end = i + c.len_utf8();
        if char_end > max_bytes {
            break;
        }
        end = char_end;
    }
    &s[..end]
}

/// Status of a plan step
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PlanStepStatus {
    Pending,
    InProgress,
    Done,
    Failed,
}

/// A single step in the agent's plan
#[derive(Debug, Clone, serde::Serialize)]
pub struct PlanStep {
    pub step: u32,
    pub description: String,
    pub status: PlanStepStatus,
}

/// Status of a TODO item
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TodoStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}

/// Priority of a TODO item
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TodoPriority {
    Low,
    Medium,
    High,
}

/// A single TODO item for tracking progress
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TodoItem {
    pub id: String,
    pub content: String,
    pub status: TodoStatus,
    pub priority: TodoPriority,
}

impl TodoItem {
    pub fn status_str(&self) -> &str {
        match self.status {
            TodoStatus::Pending => "pending",
            TodoStatus::InProgress => "in_progress",
            TodoStatus::Completed => "completed",
            TodoStatus::Failed => "failed",
        }
    }

    pub fn priority_str(&self) -> &str {
        match self.priority {
            TodoPriority::Low => "low",
            TodoPriority::Medium => "medium",
            TodoPriority::High => "high",
        }
    }
}

/// Events emitted during agent execution
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type")]
pub enum AgentEvent {
    /// Agent is thinking / calling a tool
    #[serde(rename = "thinking")]
    Thinking { message: String },

    /// Plan steps updated
    #[serde(rename = "plan_update")]
    PlanUpdate { steps: Vec<PlanStep> },

    /// TODO items updated
    #[serde(rename = "todo_update")]
    TodoUpdate { todos: Vec<TodoItem> },

    /// A tool is being executed
    #[serde(rename = "tool_use")]
    ToolUse {
        tool_name: String,
        arguments: String,
    },

    /// Tool execution result
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_name: String,
        result: String,
    },

    /// Tool requires user approval before execution
    #[serde(rename = "tool_approval_required")]
    ToolApprovalRequired {
        tool_name: String,
        arguments: String,
        /// Preview for write_file (diff), or the command for run_command
        preview: String,
    },

    /// Streaming text token
    #[serde(rename = "text_delta")]
    TextDelta { content: String },

    /// Final assistant response
    #[serde(rename = "response")]
    Response {
        content: String,
        tool_calls_made: u32,
        usage: Option<super::provider::Usage>,
    },

    /// Error occurred
    #[serde(rename = "error")]
    Error { message: String },

    /// Context window status update
    #[serde(rename = "context_status")]
    ContextStatus {
        tokens_used: usize,
        tokens_max: usize,
        utilization: f64,
    },

    /// Cost tracking update
    #[serde(rename = "cost_update")]
    CostUpdate {
        model: String,
        prompt_tokens: u32,
        completion_tokens: u32,
        cost: f64,
    },
}

/// The agent orchestrates the LLM tool-calling loop
pub struct Agent {
    provider: Arc<dyn LlmProvider>,
    model: String,
    tools: ToolRegistry,
    project_context: ProjectContext,
    /// Channel to receive approval responses from the frontend
    approval_rx: Mutex<Option<mpsc::Receiver<bool>>>,
    /// Channel to send approval requests to the frontend
    approval_tx: Mutex<Option<mpsc::Sender<bool>>>,
    /// Current plan steps
    plan_steps: Mutex<Vec<PlanStep>>,
    /// Context window manager
    context_manager: Mutex<ContextManager>,
    /// Permission system
    permissions: PermissionSystem,
    /// Sandbox for safe execution
    sandbox: Sandbox,
    /// Embedding store for RAG
    embedding_store: Arc<Mutex<EmbeddingStore>>,
    /// Cost tracker for LLM API usage
    cost_tracker: SharedCostTracker,
    /// TODO items for tracking progress
    todo_items: Mutex<Vec<TodoItem>>,
}

impl Agent {
    pub fn new(provider: Arc<dyn LlmProvider>, model: String, project_path: String) -> Self {
        let project_context = ProjectContext::detect(&project_path);
        let (approval_tx, approval_rx) = mpsc::channel(1);
        let sandbox = Sandbox::new();
        let permissions = PermissionSystem::new(PermissionProfile::Smart);
        let embedding_store = Arc::new(Mutex::new(EmbeddingStore::new()));
        let tools = ToolRegistry::with_embedding_store(
            project_path.clone(),
            sandbox.clone(),
            embedding_store.clone(),
        );
        let cost_tracker = create_shared_cost_tracker();

        Self {
            provider,
            model,
            tools,
            project_context,
            approval_rx: Mutex::new(Some(approval_rx)),
            approval_tx: Mutex::new(Some(approval_tx)),
            plan_steps: Mutex::new(Vec::new()),
            context_manager: Mutex::new(ContextManager::new(8192)),
            permissions,
            sandbox,
            embedding_store,
            cost_tracker,
            todo_items: Mutex::new(Vec::new()),
        }
    }

    /// Create an agent with custom permission profile
    pub fn with_permissions(
        provider: Arc<dyn LlmProvider>,
        model: String,
        project_path: String,
        profile: PermissionProfile,
    ) -> Self {
        let project_context = ProjectContext::detect(&project_path);
        let (approval_tx, approval_rx) = mpsc::channel(1);
        let sandbox = Sandbox::new();
        let permissions = PermissionSystem::new(profile);
        let embedding_store = Arc::new(Mutex::new(EmbeddingStore::new()));
        let tools = ToolRegistry::with_embedding_store(
            project_path.clone(),
            sandbox.clone(),
            embedding_store.clone(),
        );
        let cost_tracker = create_shared_cost_tracker();

        Self {
            provider,
            model,
            tools,
            project_context,
            approval_rx: Mutex::new(Some(approval_rx)),
            approval_tx: Mutex::new(Some(approval_tx)),
            plan_steps: Mutex::new(Vec::new()),
            context_manager: Mutex::new(ContextManager::new(8192)),
            permissions,
            sandbox,
            embedding_store,
            cost_tracker,
            todo_items: Mutex::new(Vec::new()),
        }
    }

    /// Create an agent with orchestrator for sub-agent support
    pub fn with_orchestrator(
        provider: Arc<dyn LlmProvider>,
        model: String,
        project_path: String,
        profile: PermissionProfile,
        orchestrator: Arc<super::orchestrator::Orchestrator>,
    ) -> Self {
        let project_context = ProjectContext::detect(&project_path);
        let (approval_tx, approval_rx) = mpsc::channel(1);
        let sandbox = Sandbox::new();
        let permissions = PermissionSystem::new(profile);
        let embedding_store = Arc::new(Mutex::new(EmbeddingStore::new()));
        let tools = ToolRegistry::with_orchestrator(
            project_path.clone(),
            sandbox.clone(),
            embedding_store.clone(),
            orchestrator,
        );
        let cost_tracker = create_shared_cost_tracker();

        Self {
            provider,
            model,
            tools,
            project_context,
            approval_rx: Mutex::new(Some(approval_rx)),
            approval_tx: Mutex::new(Some(approval_tx)),
            plan_steps: Mutex::new(Vec::new()),
            context_manager: Mutex::new(ContextManager::new(8192)),
            permissions,
            sandbox,
            embedding_store,
            cost_tracker,
            todo_items: Mutex::new(Vec::new()),
        }
    }

    /// Create an agent with orchestrator and MCP support
    pub fn with_mcp(
        provider: Arc<dyn LlmProvider>,
        model: String,
        project_path: String,
        profile: PermissionProfile,
        orchestrator: Arc<super::orchestrator::Orchestrator>,
        mcp_manager: Arc<tokio::sync::Mutex<super::mcp::McpManager>>,
    ) -> Self {
        let project_context = ProjectContext::detect(&project_path);
        let (approval_tx, approval_rx) = mpsc::channel(1);
        let sandbox = Sandbox::new();
        let permissions = PermissionSystem::new(profile);
        let embedding_store = Arc::new(Mutex::new(EmbeddingStore::new()));
        let tools = ToolRegistry::with_mcp(
            project_path.clone(),
            sandbox.clone(),
            embedding_store.clone(),
            orchestrator,
            mcp_manager,
        );
        let cost_tracker = create_shared_cost_tracker();

        Self {
            provider,
            model,
            tools,
            project_context,
            approval_rx: Mutex::new(Some(approval_rx)),
            approval_tx: Mutex::new(Some(approval_tx)),
            plan_steps: Mutex::new(Vec::new()),
            context_manager: Mutex::new(ContextManager::new(8192)),
            permissions,
            sandbox,
            embedding_store,
            cost_tracker,
            todo_items: Mutex::new(Vec::new()),
        }
    }

    /// Index the project directory for RAG
    pub async fn index_project(&self) -> Result<usize, std::io::Error> {
        let mut store = self.embedding_store.lock().await;
        store.index_directory(&self.tools.project_path).await
    }

    /// Get the embedding store for external access
    pub fn embedding_store(&self) -> Arc<Mutex<EmbeddingStore>> {
        self.embedding_store.clone()
    }

    /// Get the cost tracker for external access
    pub fn cost_tracker(&self) -> SharedCostTracker {
        self.cost_tracker.clone()
    }

    /// Get a sender that the frontend can use to approve/deny tool execution
    pub async fn get_approval_sender(&self) -> Option<mpsc::Sender<bool>> {
        self.approval_tx.lock().await.clone()
    }

    /// Run the agent loop for a user message
    ///
    /// Returns a receiver that yields AgentEvents as they occur.
    pub fn run(
        self: Arc<Self>,
        user_message: String,
        history: Vec<Message>,
    ) -> mpsc::Receiver<AgentEvent> {
        let (tx, rx) = mpsc::channel(256);

        tokio::spawn(async move {
            if let Err(e) = self.run_inner(user_message, history, &tx).await {
                let _ = tx
                    .send(AgentEvent::Error {
                        message: e.user_friendly(),
                    })
                    .await;
            }
        });

        rx
    }

    async fn run_inner(
        &self,
        user_message: String,
        history: Vec<Message>,
        tx: &mpsc::Sender<AgentEvent>,
    ) -> Result<(), ProviderError> {
        // Create session log
        let mut session_log = AiSessionLog::start(&user_message, &self.model, &self.tools.project_path);

        // ── Phase 1: Index project for RAG ──────────────────────
        {
            let store = self.embedding_store.lock().await;
            if store.is_empty() {
                drop(store); // Release lock before indexing
                session_log.log_flow("Indexing project for auto-context injection...");
                let start = std::time::Instant::now();
                match self.index_project().await {
                    Ok(chunks) => {
                        let elapsed = start.elapsed();
                        let store = self.embedding_store.lock().await;
                        let stats = store.stats();
                        session_log.log_rag_index(
                            chunks,
                            stats.total_files,
                            elapsed.as_secs_f64() * 1000.0,
                            stats.total_keywords,
                        );
                    }
                    Err(e) => {
                        session_log.log_error(&format!("RAG indexing failed: {}", e));
                    }
                }
            } else {
                session_log.log_flow("RAG store already indexed, skipping");
            }
        }

        // Initialize context manager with system prompt
        let system_prompt = self.build_system_prompt();
        let mut ctx = ContextManager::new(8192);
        ctx.set_system_prompt(system_prompt);

        // Add history to context
        ctx.extend(history);

        // Add user message
        ctx.push(Message::User {
            content: user_message.clone(),
        });

        // ── Phase 1: Auto-context injection via RAG ────────────
        {
            let store = self.embedding_store.lock().await;
            if !store.is_empty() {
                let results = store.search(&user_message, 12);
                if !results.is_empty() {
                    let mut context_block = String::from(
                        "## Relevant Code Context (auto-retrieved by RAG)\n\
                         These code sections are relevant to the user's request. \
                         Use them as reference — do NOT re-read these files with read_file.\n\n"
                    );
                    let mut chunk_details = Vec::new();
                    for result in results.iter() {
                        let chunk = &result.chunk;
                        let preview: String = chunk.content.lines().take(15).collect::<Vec<_>>().join("\n");
                        let truncated = if chunk.content.lines().count() > 15 {
                            format!("{}\n// ... ({} more lines)", preview, chunk.content.lines().count() - 15)
                        } else {
                            preview
                        };
                        context_block.push_str(&format!(
                            "### {}:{}-{} ({}, score: {:.1})\n```{}\n{}\n```\n\n",
                            chunk.file_path,
                            chunk.start_line,
                            chunk.end_line,
                            chunk.chunk_type.chunk_type_to_str(),
                            result.score,
                            chunk.file_path.rsplit('.').next().unwrap_or(""),
                            truncated,
                        ));
                        chunk_details.push((
                            chunk.file_path.clone(),
                            chunk.start_line,
                            chunk.end_line,
                            result.score,
                            chunk.content.len(),
                        ));
                    }
                    let rag_tokens = (context_block.len() / 4) as u64;
                    session_log.log_rag_inject(
                        results.len(),
                        rag_tokens,
                        &user_message,
                        &chunk_details,
                    );
                    // Inject as a system message right after the system prompt
                    ctx.push(Message::System { content: context_block });
                } else {
                    session_log.log_flow(&format!(
                        "No relevant RAG chunks found for: \"{}\"",
                        truncate_to_boundary(&user_message, 60)
                    ));
                }
            }
        }

        let tool_defs = self.tools.essential_definitions_with_mcp().await;
        let mut total_tool_calls = 0u32;
        let mut consecutive_failures = 0u32;
        const MAX_CONSECUTIVE_FAILURES: u32 = 3;

        // Track whether a plan has been established for this request
        let mut has_plan = false;
        let mut last_completed_step: Option<u32> = None;

        // Inject initial progress context (will be updated each iteration)
        // This tells the LLM whether planning is done, preventing re-planning
        let progress_context = self.build_progress_context(&has_plan, &last_completed_step);
        ctx.push(Message::System { content: progress_context });

        let mut iteration = 0u32;
        loop {
            iteration += 1;

            // Update progress context for subsequent iterations
            // This replaces the old progress message with updated state
            if iteration > 1 {
                let new_progress = self.build_progress_context(&has_plan, &last_completed_step);
                // Remove the old progress context and add updated one
                // The progress context is always the last system message we injected
                ctx.update_progress_context(new_progress);
            }

            // Send context status update
            let stats = ctx.stats();
            let _ = tx
                .send(AgentEvent::Thinking {
                    message: if iteration == 1 {
                        format!("Thinking... ({})", stats)
                    } else {
                        format!("Continuing (iteration {}, {})...", iteration, stats)
                    },
                })
                .await;

            // Build messages from context manager
            let messages = ctx.build_messages();

            let request = ChatCompletionRequest {
                model: self.model.clone(),
                messages,
                tools: Some(tool_defs.clone()),
                stream: Some(true),  // Enable streaming
                temperature: Some(0.7),
                max_tokens: Some(2048),
            };

            // Clone request for fallback in case streaming fails
            let fallback_request = ChatCompletionRequest {
                model: request.model.clone(),
                messages: request.messages.clone(),
                tools: request.tools.clone(),
                stream: Some(false),
                temperature: request.temperature,
                max_tokens: request.max_tokens,
            };

            // Log LLM request
            session_log.log_llm_request(iteration, &request, &tool_defs);

            // Use streaming for better UX
            let request_start = std::time::Instant::now();
            let mut stream = match self.provider.chat_completion_stream(request).await {
                Ok(s) => s,
                Err(_) => {
                    // Fall back to non-streaming if streaming fails
                    let response = self.provider.chat_completion(fallback_request).await?;
                    self.handle_response(response, &mut ctx, &mut total_tool_calls, &mut consecutive_failures, tx).await?;
                    continue;
                }
            };

            // Collect streaming response with timeout
            let stream_result = tokio::time::timeout(
                std::time::Duration::from_secs(STREAM_TIMEOUT_SECS),
                async {
                    let mut full_content = String::new();
                    let mut tool_calls: Vec<ToolCall> = Vec::new();
                    let mut usage: Option<Usage> = None;

                    while let Some(chunk) = stream.recv().await {
                        // Send text deltas to frontend for real-time display
                        if let Some(text) = &chunk.choices.first().and_then(|c| c.delta.content.as_ref()) {
                            full_content.push_str(text);
                            let _ = tx.send(AgentEvent::TextDelta { content: text.to_string() }).await;
                        }

                        // Collect tool calls
                        if let Some(delta) = chunk.choices.first().and_then(|c| c.delta.tool_calls.as_ref()) {
                            for tc_delta in delta {
                                let idx = tc_delta.index as usize;
                                while tool_calls.len() <= idx {
                                    tool_calls.push(ToolCall {
                                        id: String::new(),
                                        call_type: "function".to_string(),
                                        function: FunctionCall {
                                            name: String::new(),
                                            arguments: String::new(),
                                        },
                                    });
                                }
                                if let Some(id) = &tc_delta.id {
                                    tool_calls[idx].id = id.clone();
                                }
                                if let Some(name) = &tc_delta.function.as_ref().and_then(|f| f.name.as_ref()) {
                                    tool_calls[idx].function.name.push_str(name);
                                }
                                if let Some(args) = &tc_delta.function.as_ref().and_then(|f| f.arguments.as_ref()) {
                                    tool_calls[idx].function.arguments.push_str(args);
                                }
                            }
                        }

                        // Capture usage from final chunk
                        if let Some(u) = &chunk.usage {
                            usage = Some(u.clone());
                        }
                    }

                    (full_content, tool_calls, usage)
                }
            ).await;

            let (full_content, tool_calls, usage) = match stream_result {
                Ok(result) => result,
                Err(_) => {
                    session_log.log_flow(&format!(
                        "Stream timed out after {}s, falling back to non-streaming",
                        STREAM_TIMEOUT_SECS
                    ));
                    let response = self.provider.chat_completion(fallback_request).await?;
                    self.handle_response(response, &mut ctx, &mut total_tool_calls, &mut consecutive_failures, tx).await?;
                    continue;
                }
            };

            // Log LLM response
            let request_duration = request_start.elapsed().as_millis() as u64;
            let thinking = ""; // Thinking is captured in content for streaming
            session_log.log_llm_response(
                iteration,
                &full_content,
                thinking,
                &tool_calls,
                &usage,
                request_duration,
            );

            // Record cost if usage is available
            if let Some(ref usage) = usage {
                let cost = {
                    let mut tracker = self.cost_tracker.lock().await;
                    tracker.record(&self.model, usage)
                };
                let _ = tx.send(AgentEvent::CostUpdate {
                    model: self.model.clone(),
                    prompt_tokens: usage.prompt_tokens,
                    completion_tokens: usage.completion_tokens,
                    cost,
                }).await;
            }

            // Build the complete message
            // Check if plan was created in this response
            let plan_created_this_turn = if !full_content.is_empty() {
                let new_steps = self.parse_plan(&full_content);
                if !new_steps.is_empty() {
                    let mut steps = self.plan_steps.lock().await;
                    // Only set initial plan if no plan exists yet (don't reset progress)
                    if steps.is_empty() {
                        *steps = new_steps.clone();
                        
                        // Create TODO items from plan steps
                        let todos: Vec<TodoItem> = new_steps.iter().map(|s| {
                            TodoItem {
                                id: format!("step_{}", s.step),
                                content: s.description.clone(),
                                status: match s.status {
                                    PlanStepStatus::Pending => TodoStatus::Pending,
                                    PlanStepStatus::InProgress => TodoStatus::InProgress,
                                    PlanStepStatus::Done => TodoStatus::Completed,
                                    PlanStepStatus::Failed => TodoStatus::Failed,
                                },
                                priority: TodoPriority::Medium,
                            }
                        }).collect();
                        
                        let mut todo_store = self.todo_items.lock().await;
                        *todo_store = todos.clone();
                        session_log.log_todo_update(&todos);
                        let _ = tx.send(AgentEvent::TodoUpdate { todos }).await;
                    }
                    true
                } else {
                    false
                }
            } else {
                false
            };

            // Update the outer has_plan variable for next iteration's progress context
            if plan_created_this_turn {
                has_plan = true;
            }

            // Track completed steps by checking todo_write calls
            // This will be updated when todo_write is intercepted below

            // Handle tool calls
            if !tool_calls.is_empty() {
                // Add assistant message to context
                ctx.push(Message::Assistant {
                    content: Some(full_content),
                    tool_calls: Some(tool_calls.clone()),
                });

                // Execute each tool call
                let mut executed_this_turn: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();
                for call in &tool_calls {
                    total_tool_calls += 1;

                    // Check if we've had too many consecutive failures
                    if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                        let result = format!(
                            "Too many consecutive tool failures ({}). Stopping to prevent infinite loop. Please try a different approach.",
                            consecutive_failures
                        );
                        let _ = tx
                            .send(AgentEvent::ToolResult {
                                tool_name: call.function.name.clone(),
                                result: result.clone(),
                            })
                            .await;
                        ctx.push(Message::Tool {
                            tool_call_id: call.id.clone(),
                            content: result,
                        });
                        // Send final response and stop
                        let _ = tx
                            .send(AgentEvent::Response {
                                content: "Stopping due to too many consecutive tool failures. Please try a different approach.".to_string(),
                                tool_calls_made: total_tool_calls,
                                usage,
                            })
                            .await;
                        return Ok(());
                    }

                    // Check permissions using the permission system
                    let perm_result = self.permissions.check(
                        &call.function.name,
                        &call.function.arguments,
                    );

                    let needs_approval = match &perm_result {
                        PermissionResult::ApprovalRequired { .. } => true,
                        PermissionResult::Denied { reason } => {
                            // Tool is denied - send error and track failure
                            consecutive_failures += 1;
                            let result = format!(
                                "Tool '{}' denied: {}. Use a different tool or approach.",
                                call.function.name, reason
                            );
                            let _ = tx
                                .send(AgentEvent::ToolResult {
                                    tool_name: call.function.name.clone(),
                                    result: result.clone(),
                                })
                                .await;
                            ctx.push(Message::Tool {
                                tool_call_id: call.id.clone(),
                                content: result,
                            });
                            continue;
                        }
                        PermissionResult::Allowed => false,
                    };

                    if needs_approval {
                        // Generate preview
                        let preview = self.generate_tool_preview(&call.function.name, &call.function.arguments);

                        // Send approval request
                        let _ = tx
                            .send(AgentEvent::ToolApprovalRequired {
                                tool_name: call.function.name.clone(),
                                arguments: call.function.arguments.clone(),
                                preview,
                            })
                            .await;

                        // Wait for approval (60s timeout)
                        let approved = {
                            let mut rx = self.approval_rx.lock().await;
                            if let Some(ref mut receiver) = *rx {
                                tokio::select! {
                                    response = receiver.recv() => response.unwrap_or(false),
                                    _ = tokio::time::sleep(std::time::Duration::from_secs(60)) => false,
                                }
                            } else {
                                false
                            }
                        };

                        if !approved {
                            consecutive_failures += 1;
                            let result = "Tool execution denied by user.".to_string();
                            let _ = tx
                                .send(AgentEvent::ToolResult {
                                    tool_name: call.function.name.clone(),
                                    result: result.clone(),
                                })
                                .await;
                            ctx.push(Message::Tool {
                                tool_call_id: call.id.clone(),
                                content: result,
                            });
                            continue;
                        }
                    }

                    // Pre-check: catch empty args for tools that require them
                    let args_empty = call.function.arguments.trim().is_empty() || call.function.arguments == "{}" || call.function.arguments == "null";
                    if args_empty {
                        let needs_args = matches!(
                            call.function.name.as_str(),
                            "run_command" | "read_file" | "write_file" | "edit_file" | "search_code" | "list_directory"
                        );
                        if needs_args {
                            session_log.log_flow(&format!(
                                "Tool '{}' called with empty args - forcing self-correction",
                                call.function.name
                            ));
                            let result = format!(
                                "ERROR: You called {} without providing any arguments. \
                                 This tool requires specific arguments to work. \
                                 Please provide the required arguments and try again.",
                                call.function.name
                            );
                            let _ = tx.send(AgentEvent::ToolResult {
                                tool_name: call.function.name.clone(),
                                result: result.clone(),
                            }).await;
                            ctx.push(Message::Tool {
                                tool_call_id: call.id.clone(),
                                content: result,
                            });
                            // Don't increment failures - this is a self-correction
                            continue;
                        }
                    }

                    // Skip duplicate tool calls (same name + same args) within one iteration
                    let dedup_key = (call.function.name.clone(), call.function.arguments.clone());
                    if !executed_this_turn.insert(dedup_key.clone()) {
                        session_log.log_flow(&format!(
                            "Skipping duplicate tool call: {} with args {}",
                            dedup_key.0, dedup_key.1
                        ));
                        let result = "Skipped: duplicate tool call with identical arguments in this turn.".to_string();
                        let _ = tx.send(AgentEvent::ToolResult {
                            tool_name: dedup_key.0,
                            result: result.clone(),
                        }).await;
                        ctx.push(Message::Tool {
                            tool_call_id: call.id.clone(),
                            content: result,
                        });
                        continue;
                    }

                    // Log tool execution start
                    session_log.log_tool_start(&call.function.name, &call.function.arguments);

                    let _ = tx
                        .send(AgentEvent::ToolUse {
                            tool_name: call.function.name.clone(),
                            arguments: call.function.arguments.clone(),
                        })
                        .await;

                    let tool_start = std::time::Instant::now();
                    let result = self
                        .tools
                        .execute(&call.function.name, &call.function.arguments)
                        .await;
                    let tool_duration = tool_start.elapsed().as_millis() as u64;

                    // Intercept todo_write to update agent state
                    if call.function.name == "todo_write" {
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&call.function.arguments) {
                            if let Some(todos_arg) = parsed.get("todos").and_then(|v| v.as_array()) {
                                // Detect plan creation: ANY todo_write that includes content
                                // (status-only updates don't have content, so content = new item)
                                let has_new_content = todos_arg.iter().any(|t| {
                                    !t["content"].as_str().unwrap_or("").is_empty()
                                });

                                if has_new_content && !has_plan {
                                    has_plan = true;
                                    session_log.log_flow("Plan detected via todo_write with content");
                                }

                                let mut todos = self.todo_items.lock().await;
                                for todo_args in todos_arg {
                                    let id = todo_args["id"].as_str().unwrap_or("");
                                    let content = todo_args["content"].as_str().unwrap_or("");
                                    let status_str = todo_args["status"].as_str().unwrap_or("pending");
                                    let priority_str = todo_args["priority"].as_str().unwrap_or("medium");

                                    if id.is_empty() { continue; }

                                    let status = match status_str {
                                        "completed" | "done" => TodoStatus::Completed,
                                        "in_progress" | "in-progress" => TodoStatus::InProgress,
                                        "failed" => TodoStatus::Failed,
                                        _ => TodoStatus::Pending,
                                    };
                                    let priority = match priority_str {
                                        "high" => TodoPriority::High,
                                        "low" => TodoPriority::Low,
                                        _ => TodoPriority::Medium,
                                    };

                                    if let Some(existing) = todos.iter_mut().find(|t| t.id == id) {
                                        existing.status = status.clone();
                                        existing.priority = priority;
                                        if !content.is_empty() {
                                            existing.content = content.to_string();
                                        }
                                    } else {
                                        todos.push(TodoItem {
                                            id: id.to_string(),
                                            content: content.to_string(),
                                            status: status.clone(),
                                            priority,
                                        });
                                    }

                                    // Track completed steps for progress context
                                    if status == TodoStatus::Completed {
                                        // Extract step number from id like "step_1"
                                        if let Some(step_num) = id.strip_prefix("step_").and_then(|s| s.parse::<u32>().ok()) {
                                            last_completed_step = Some(step_num);
                                        }
                                    }
                                }
                                // Also populate plan_steps if empty so status tracking works
                                {
                                    let mut steps = self.plan_steps.lock().await;
                                    if steps.is_empty() {
                                        *steps = todos.iter().enumerate().map(|(i, t)| PlanStep {
                                            step: (i + 1) as u32,
                                            description: t.content.clone(),
                                            status: match t.status {
                                                TodoStatus::Pending => PlanStepStatus::Pending,
                                                TodoStatus::InProgress => PlanStepStatus::InProgress,
                                                TodoStatus::Completed => PlanStepStatus::Done,
                                                TodoStatus::Failed => PlanStepStatus::Failed,
                                            },
                                        }).collect();
                                    }
                                }
                                let _ = tx.send(AgentEvent::TodoUpdate { todos: todos.clone() }).await;
                            }
                        }
                    }

                    // Track if this was a failure
                    if result.starts_with("Unknown tool:")
                        || result.starts_with("Error")
                        || result.contains("not found")
                        || result.contains("failed")
                    {
                        consecutive_failures += 1;
                    } else {
                        consecutive_failures = 0; // Reset on success
                    }

                    // Log tool execution end
                    session_log.log_tool_end(&call.function.name, &result, tool_duration);

                    // Send full result to frontend for display
                    let _ = tx
                        .send(AgentEvent::ToolResult {
                            tool_name: call.function.name.clone(),
                            result: result.clone(),
                        })
                        .await;

                    // Only update plan step status for todo_write calls
                    // (the model signals step progression via todo_write, not every tool call)
                    if call.function.name == "todo_write" {
                        // The todo_write tool already updated todo_items/plan_steps
                        // Just send the update to frontend
                        let todos = self.todo_items.lock().await.clone();
                        session_log.log_todo_update(&todos);
                        let _ = tx.send(AgentEvent::TodoUpdate { todos }).await;
                    }

                    // ── Universal truncation: cap tool result for context ──
                    let context_result = if result.len() > MAX_TOOL_RESULT_CHARS {
                        // Find safe char boundary (don't slice inside multi-byte UTF-8)
                        let safe_end = result
                            .char_indices()
                            .map(|(i, _)| i)
                            .take_while(|&i| i <= MAX_TOOL_RESULT_CHARS)
                            .last()
                            .unwrap_or(0);
                        let truncated = result[..safe_end].to_string();
                        session_log.log_flow(&format!(
                            "Truncated {} output: {} -> {} chars",
                            call.function.name,
                            result.len(),
                            safe_end
                        ));
                        format!("{}\n... (truncated, {} total chars)", truncated, result.len())
                    } else {
                        result
                    };

                    // Add truncated tool result to context
                    ctx.push(Message::Tool {
                        tool_call_id: call.id.clone(),
                        content: context_result,
                    });
                }
            } else {
                // Check if the model output todo_write as text instead of a tool call
                if !full_content.is_empty() && self.try_intercept_todo_write_text(&full_content).await {
                    // Model output todo_write JSON as text — processed it, continue the loop
                    // Send TodoUpdate to frontend
                    {
                        let todos = self.todo_items.lock().await.clone();
                        let _ = tx.send(AgentEvent::TodoUpdate { todos }).await;
                    }
                    // Preserve the model's original plan content so it remembers what it decided to do
                    ctx.push(Message::Assistant {
                        content: Some(full_content.clone()),
                        tool_calls: None,
                    });
                    consecutive_failures = 0;
                    continue;
                }

                // No tool calls - final response
                // If a plan was just created, don't send it as final response - continue loop
                if plan_created_this_turn {
                    // Plan was created in text, add it to context and continue
                    ctx.push(Message::Assistant {
                        content: Some(full_content.clone()),
                        tool_calls: None,
                    });
                    continue;
                }

                // If a plan exists but model returned empty response, re-prompt it to execute
                if has_plan && full_content.is_empty() {
                    session_log.log_flow("Model returned empty response after plan creation, re-prompting to execute");
                    ctx.push(Message::System {
                        content: "You have a plan with TODO items. Execute the first pending step now. Mark it as 'in_progress' with todo_write, then run the required tool.".to_string(),
                    });
                    continue;
                }

                let _ = tx
                    .send(AgentEvent::Response {
                        content: full_content,
                        tool_calls_made: total_tool_calls,
                        usage: usage.clone(),
                    })
                    .await;

                // End session log
                let total_tokens = usage.as_ref().map_or(0, |u| u.total_tokens as u64);
                session_log.end(iteration, total_tool_calls, total_tokens);

                return Ok(());
            }
        }

        Ok(())
    }

    /// Handle a non-streaming response (fallback when streaming fails)
    async fn handle_response(
        &self,
        response: ChatCompletionResponse,
        ctx: &mut ContextManager,
        total_tool_calls: &mut u32,
        consecutive_failures: &mut u32,
        tx: &mpsc::Sender<AgentEvent>,
    ) -> Result<(), ProviderError> {
        let usage = response.usage.clone();

        // Record cost if usage is available
        if let Some(ref usage) = usage {
            let cost = {
                let mut tracker = self.cost_tracker.lock().await;
                tracker.record(&self.model, usage)
            };
            let _ = tx.send(AgentEvent::CostUpdate {
                model: self.model.clone(),
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens,
                cost,
            }).await;
        }

        let choice = response
            .choices
            .first()
            .ok_or_else(|| ProviderError::ServerError("No choices in response".to_string()))?;

        match &choice.message {
            Message::Assistant {
                content,
                tool_calls,
            } => {
                // Send TextDelta for the response content
                if let Some(text) = content {
                    if !text.is_empty() {
                    let _ = tx.send(AgentEvent::TextDelta { content: text.to_string() }).await;
                    }
                }

                // Handle tool calls
                if let Some(calls) = tool_calls {
                    if calls.is_empty() {
                        // No tool calls — check if model output todo_write as text
                        let content_text = content.clone().unwrap_or_default();
                        if !content_text.is_empty() && self.try_intercept_todo_write_text(&content_text).await {
                            {
                                let todos = self.todo_items.lock().await.clone();
                                let _ = tx.send(AgentEvent::TodoUpdate { todos }).await;
                            }
                            ctx.push(Message::Assistant {
                                content: Some(content_text.clone()),
                                tool_calls: None,
                            });
                            *consecutive_failures = 0;
                            return Ok(());
                        }
                        // Final response
                        // If a plan exists but model returned empty response, re-prompt
                        let has_plan = !self.todo_items.lock().await.is_empty();
                        if has_plan && content_text.is_empty() {
                            ctx.push(Message::System {
                                content: "You have a plan with TODO items. Execute the first pending step now. Mark it as 'in_progress' with todo_write, then run the required tool.".to_string(),
                            });
                            return Ok(());
                        }
                        let _ = tx
                            .send(AgentEvent::Response {
                                content: content_text,
                                tool_calls_made: *total_tool_calls,
                                usage,
                            })
                            .await;
                        return Ok(());
                    }

                    // Add assistant message to context
                    ctx.push(choice.message.clone());

                    // Execute each tool call
                    let mut executed_this_turn: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();
                    for call in calls {
                        *total_tool_calls += 1;

                        // Skip duplicate tool calls within one iteration
                        let dedup_key = (call.function.name.clone(), call.function.arguments.clone());
                        if !executed_this_turn.insert(dedup_key.clone()) {
                            let result = "Skipped: duplicate tool call with identical arguments in this turn.".to_string();
                            let _ = tx.send(AgentEvent::ToolResult {
                                tool_name: dedup_key.0,
                                result: result.clone(),
                            }).await;
                            ctx.push(Message::Tool {
                                tool_call_id: call.id.clone(),
                                content: result,
                            });
                            continue;
                        }

                        // Check permissions
                        let perm_result = self.permissions.check(
                            &call.function.name,
                            &call.function.arguments,
                        );

                        let needs_approval = match &perm_result {
                            PermissionResult::ApprovalRequired { .. } => true,
                            PermissionResult::Denied { reason } => {
                                *consecutive_failures += 1;
                                let result = format!(
                                    "Tool '{}' denied: {}. Use a different tool or approach.",
                                    call.function.name, reason
                                );
                                let _ = tx
                                    .send(AgentEvent::ToolResult {
                                        tool_name: call.function.name.clone(),
                                        result: result.clone(),
                                    })
                                    .await;
                                ctx.push(Message::Tool {
                                    tool_call_id: call.id.clone(),
                                    content: result,
                                });
                                continue;
                            }
                            PermissionResult::Allowed => false,
                        };

                        if needs_approval {
                            let preview = self.generate_tool_preview(&call.function.name, &call.function.arguments);
                            let _ = tx
                                .send(AgentEvent::ToolApprovalRequired {
                                    tool_name: call.function.name.clone(),
                                    arguments: call.function.arguments.clone(),
                                    preview,
                                })
                                .await;

                            let approved = {
                                let mut rx = self.approval_rx.lock().await;
                                if let Some(ref mut receiver) = *rx {
                                    tokio::select! {
                                        response = receiver.recv() => response.unwrap_or(false),
                                        _ = tokio::time::sleep(std::time::Duration::from_secs(60)) => false,
                                    }
                                } else {
                                    false
                                }
                            };

                            if !approved {
                                *consecutive_failures += 1;
                                let result = "Tool execution denied by user.".to_string();
                                let _ = tx
                                    .send(AgentEvent::ToolResult {
                                        tool_name: call.function.name.clone(),
                                        result: result.clone(),
                                    })
                                    .await;
                                ctx.push(Message::Tool {
                                    tool_call_id: call.id.clone(),
                                    content: result,
                                });
                                continue;
                            }
                        }

                        let _ = tx
                            .send(AgentEvent::ToolUse {
                                tool_name: call.function.name.clone(),
                                arguments: call.function.arguments.clone(),
                            })
                            .await;

                        let result = self
                            .tools
                            .execute(&call.function.name, &call.function.arguments)
                            .await;

                        if result.starts_with("Unknown tool:")
                            || result.starts_with("Error")
                            || result.contains("not found")
                            || result.contains("failed")
                        {
                            *consecutive_failures += 1;
                        } else {
                            *consecutive_failures = 0;
                        }

                        let _ = tx
                            .send(AgentEvent::ToolResult {
                                tool_name: call.function.name.clone(),
                                result: result.clone(),
                            })
                            .await;

                        ctx.push(Message::Tool {
                            tool_call_id: call.id.clone(),
                            content: result,
                        });
                    }
                } else {
                    // No tool_calls field at all — check for todo_write text
                    let content_text = content.clone().unwrap_or_default();
                    if !content_text.is_empty() && self.try_intercept_todo_write_text(&content_text).await {
                        {
                            let todos = self.todo_items.lock().await.clone();
                            let _ = tx.send(AgentEvent::TodoUpdate { todos }).await;
                        }
                        ctx.push(Message::Assistant {
                            content: Some(content_text),
                            tool_calls: None,
                        });
                        *consecutive_failures = 0;
                        return Ok(());
                    }
                    // Final response
                    let _ = tx
                        .send(AgentEvent::Response {
                            content: content_text,
                            tool_calls_made: *total_tool_calls,
                            usage,
                        })
                        .await;
                }
            }
            _ => {
                let _ = tx
                    .send(AgentEvent::Response {
                        content: "Unexpected response from model".to_string(),
                        tool_calls_made: *total_tool_calls,
                        usage,
                    })
                    .await;
            }
        }

        Ok(())
    }

    /// Build progress context message that tells LLM whether planning is done
    /// This prevents re-planning by explicitly stating the current state
    fn build_progress_context(&self, has_plan: &bool, last_completed_step: &Option<u32>) -> String {
        if *has_plan {
            let step_info = match last_completed_step {
                Some(step) => format!("Step {} is done.", step),
                None => "No step completed yet.".to_string(),
            };
            format!(
                "## Progress Status\n\
                 A plan has already been created for this request. {} \
                 Do NOT create another plan. Instead:\n\
                 - Update the TODO item for the next step to 'in_progress' using `todo_write`\n\
                 - Execute that step\n\
                 - When done, mark it as 'completed' and move to the next step\n\
                 - When all steps are done, provide a final summary to the user",
                step_info
            )
        } else {
            "## Progress Status\n\
             No plan exists yet. Create a plan and TODO items first, then execute step by step."
                .to_string()
        }
    }

    fn build_system_prompt(&self) -> String {
        let project_section = self.project_context.to_prompt_section();
        let permissions_section = self.permissions.to_prompt_section();

        format!(
            r##"You are an AI coding assistant embedded in the OpenStorm IDE.
You have access to tools that let you read, write, and search files in the user's project.

{project_section}

{permissions_section}

## Capabilities

You can:
- Read and analyze code files
- Write new files or overwrite existing ones
- Edit specific lines in files (safer than full writes)
- Search codebases with regex patterns
- Find all references to symbols
- Find definitions of functions, structs, types
- Run shell commands (for quick, short-lived commands)
- **Run background processes** (for servers, watchers, long-running tasks)
- **Read logs from background processes**
- **Stop background processes**
- Execute tests (auto-detects framework)
- Check LSP diagnostics (errors/warnings)
- View and create git commits
- **Spawn sub-agents** for parallel work (use spawn_agent or run_subagent)

## Background Processes (CRITICAL)

**DECISION RULE — follow this BEFORE every command:**
1. Will the command exit within 5 seconds? → Use `run_command`
2. Will the command run forever or take a long time? → Use `run_background`

**Commands that MUST use `run_background` (never `run_command`):**
- `go run .` / `go run main.go`
- `npm run dev` / `npm start`
- `python -m http.server`
- `cargo run`
- Any server, watcher, or long-running process

**Why?** `run_command` blocks until the process exits. Servers never exit, so the agent hangs forever.

**Flow for servers (MUST follow this exact sequence):**
1. `todo_write({{todos: [{{"id": "step_1", "status": "in_progress"}}]}})` ← Mark step as in_progress
2. `run_background("go run .")` → returns PID immediately
3. `read_process_output(pid)` → check if server started — **DO NOT SKIP THIS STEP**
4. `todo_write({{todos: [{{"id": "step_1", "status": "completed"}}]}})` ← Mark completed AFTER verification
5. Report to user: "Server started on port 8081. PID: 12345"

**PORT CONFLICT HANDLING — follow this when starting servers:**
If `read_process_output` shows "address already in use" or "port already in use":
1. `run_command("lsof -i :PORT -sTCP:LISTEN -P -n")` → find PID using the port
2. `run_command("kill -9 PID")` → kill the old process
3. `run_background("go run .")` → re-run the server
4. `read_process_output(new_pid)` → verify it started

**Example flow:**
```
User: "Run the app and share logs"
Plan:
1. Start application in background
2. Check if it started successfully
3. If port conflict, kill old process and re-run
4. Share logs

→ run_background("go run .") → PID 12345
→ read_process_output(12345) → "address already in use"
→ run_command("lsof -i :8081 -sTCP:LISTEN -P -n") → PID 11140
→ run_command("kill -9 11140")
→ run_background("go run .") → PID 12400
→ read_process_output(12400) → "Server starting on :8081"
→ "Application is running on port 8081. Logs: ..."
```

## Sub-Agents

You have access to sub-agent tools for parallel execution:
- `spawn_agent`: Spawn a sub-agent to work on a task asynchronously. Returns a task ID.
- `run_subagent`: Run a sub-agent synchronously and wait for its result.
- `get_subagent_status`: Check if a spawned sub-agent has completed.

**When to use sub-agents (ONLY these cases):**
- User EXPLICITLY says "spawn agents" or "use sub-agents" or "parallel"
- User provides a numbered list of separate tasks to run in parallel
- NEVER use sub-agents for single commands or simple tasks - handle them directly

**Example (ONLY use when user explicitly requests parallel agents):**
User: "Spawn 3 sub-agents to: 1) Search for TODOs, 2) Find unused imports, 3) Check for secrets"
You: Call spawn_agent three times with each task, then report the task IDs.

**For simple tasks like "run cargo test" or "create a file", handle directly with run_command, write_file, etc.**

## Self-Evaluation (IMPORTANT)

After EVERY tool call, ask yourself these three questions:

1. **Have I answered the user's question?** — If YES, respond with text immediately.
2. **Is there anything else the user might need?** — If NO, respond with text.
3. **Am I stuck or uncertain?** — If YES, STOP and ask the user for clarification.

Never call a tool just to "be thorough" or "double-check." Only call a tool when you need specific information you don't already have.

## When to Stop

Stop calling tools and respond with text when:
- You have completed what the user asked
- You have enough information to answer the question
- You are unsure how to proceed (ask the user)
- A tool call failed and you need user guidance

Your response should:
- Confirm what you did (for task requests)
- Answer the question (for explanation requests)
- Explain what went wrong (if tools failed)
- Ask for clarification (if the request is unclear)

## RAG Auto-Context

Relevant code is automatically injected into your context BEFORE each turn.
When you see "Relevant Code Context" in the messages, use it directly.
- **NEVER call `read_file` if the file content is already shown in "Relevant Code Context"** — it wastes tokens and time
- **NEVER call `search_code` if the answer is in the auto-context** — search only when auto-context is empty or insufficient
- Do NOT call any tools for explanation questions — just answer from the auto-context
- Only call tools for WRITE tasks (write_file, edit_file) or if the auto-context is empty

## When to Use Tools vs Just Answer

Classify the user's request FIRST:

**EXPLANATION questions** (no tools needed):
- "How does X work?" / "What does X do?" / "Explain X"
→ Answer directly from RAG context. Do NOT call any tools.

**CODE WRITING tasks** (write directly, don't re-read):
- "Add function X" / "Create file Y" / "Implement Z"
→ Use the RAG context to understand structure, then call write_file/edit_file directly.

**COMPLEX tasks** (may need exploration):
- "Refactor X across multiple files" / "Fix bug in X"
→ Read ONE file if needed for context, then execute. Do NOT read the same file multiple times.

**RUNNING commands** (choose the right tool):
- Quick command (exits in <5s): `run_command`
- Server/long-running: `run_background` → `read_process_output`

## Decision Framework

1. **Check RAG context first**: The auto-context already has relevant code — use it
2. **Check Progress Status**: If a plan exists, continue execution. If not, create a plan first.
3. **Write code directly**: Use write_file/edit_file with the code from RAG context
4. **Verify once**: After writing, run get_diagnostics or cargo check ONCE
5. **Explain your changes**: Tell the user what you did and why

## Planning (CONDITIONAL)

**Check the "Progress Status" context message first:**
- If it says "No plan exists yet" → Create a plan and TODO items
- If it says "A plan has already been created" → Do NOT create a new plan. Instead, update existing TODOs and continue execution.

**When creating a plan (first time only):**
Before executing ANY tools, output a numbered plan. This is mandatory for multi-step requests.

**When to plan (any request with 2+ steps):**
- "Run the app" → plan: 1. Start in background 2. Check if started 3. Handle port conflict if needed 4. Share logs
- "Add a function" → plan: 1. Read file 2. Write code 3. Verify
- "Fix the bug" → plan: 1. Read error 2. Find cause 3. Fix 4. Test

**SERVER WORKFLOWS — always include these steps in your plan:**
1. Start server in background (`run_background`)
2. Check if it started successfully (`read_process_output`)
3. If port conflict → find PID, kill, re-run
4. Share logs with user

**Format:**
```
Plan:
1. First step
2. Second step
3. Third step
```

Then execute step by step. Update the user after each step.

**Exception:** Only skip planning for single-action requests like "read file X" or "what is on line 10?"

## After Outputting a Plan

After outputting your numbered plan, use the `todo_write` tool to create a TODO item for each plan step. This updates the user's task list in real-time. IMPORTANT: Use the `todo_write` tool as an actual tool call, do NOT output it as text.

Correct: Make a tool_call to `todo_write` with JSON arguments like {{"todos": [{{"id": "step_1", "content": "...", "status": "pending", "priority": "medium"}}]}}
Wrong: Writing "todo_write: id=..." as plain text in your response

## Updating TODO Status (CRITICAL)

As you complete each step, you MUST update the TODO status using `todo_write`:
1. Before starting a step: Set status to `"in_progress"`
2. **Execute the tool call for that step** (e.g., `run_background`, `read_process_output`)
3. **ONLY AFTER the tool succeeds**: Set status to `"completed"`
4. Move to the next step

**CRITICAL: Do NOT mark a step as completed before executing its tool call!**
**CRITICAL: Do NOT skip steps! You MUST execute each step in order before marking it completed.**

Example flow:
- `todo_write({{todos: [{{"id": "step_1", "status": "in_progress"}}]}})` → `run_background("go run .")` → **wait for result** → `read_process_output(pid)` → **then** `todo_write({{todos: [{{"id": "step_1", "status": "completed"}}]}})`

**WRONG — skipping verification:**
1. `run_background("go run .")` ← Started server
2. `todo_write({{todos: [{{"id": "step_1", "status": "completed"}}]}})` ← WRONG! Did NOT verify server started!

**WRONG — marking completed before executing:**
1. `todo_write({{todos: [{{"id": "step_1", "status": "completed"}}]}})` ← Marked completed before executing!
2. `run_background("go run .")` ← Now executing, but already marked done

**RIGHT:**
1. `todo_write({{todos: [{{"id": "step_1", "status": "in_progress"}}]}})` ← Mark in progress
2. `run_background("go run .")` ← Execute the tool
3. `read_process_output(pid)` ← Verify result
4. `todo_write({{todos: [{{"id": "step_1", "status": "completed"}}]}})` ← Mark completed AFTER verification

## Error Handling

- If a tool fails, try a different approach
- If you're unsure, ask the user
- If a change might break things, warn the user first
- Never silently fail

## Safety

- Don't modify files outside the project directory
- Don't run destructive commands without confirmation
- Don't expose secrets or credentials
- Don't commit without user approval"##
        )
    }

    /// Generate a preview for tools that require approval
    ///
    /// Returns JSON with structured diff data for the frontend to render
    fn generate_tool_preview(&self, tool_name: &str, arguments: &str) -> String {
        let args: serde_json::Value = serde_json::from_str(arguments).unwrap_or_default();

        match tool_name {
            "write_file" => {
                let path = args["path"].as_str().unwrap_or("unknown");
                let content = args["content"].as_str().unwrap_or("");

                // Try to read existing file for diff
                let full_path = std::path::Path::new(&self.tools.project_path).join(path);
                let existing = std::fs::read_to_string(&full_path).unwrap_or_default();
                let old_lines: Vec<&str> = existing.lines().collect();
                let new_lines: Vec<&str> = content.lines().collect();

                // Detect language from file extension
                let language = match path.rsplit('.').next() {
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
                };

                // Simple diff: find changed lines
                let mut hunks: Vec<serde_json::Value> = Vec::new();
                let max_old = old_lines.len();
                let max_new = new_lines.len();
                let max_lines = max_old.max(max_new);

                // Find differences (simple line-by-line comparison)
                let mut old_idx = 0;
                let mut new_idx = 0;
                let mut context_before = 2;
                let mut context_after = 3;
                let mut last_was_change = false;

                for i in 0..max_lines + 5 {
                    let old_line = old_lines.get(old_idx).map(|s| s.to_string());
                    let new_line = new_lines.get(new_idx).map(|s| s.to_string());

                    match (&old_line, &new_line) {
                        (Some(o), Some(n)) if o == n => {
                            // Context line
                            hunks.push(serde_json::json!({
                                "type": "context",
                                "old_line": old_idx + 1,
                                "new_line": new_idx + 1,
                                "content": o,
                            }));
                            old_idx += 1;
                            new_idx += 1;
                            last_was_change = false;
                        }
                        _ => {
                            // Show removed line
                            if let Some(o) = &old_line {
                                hunks.push(serde_json::json!({
                                    "type": "removed",
                                    "old_line": old_idx + 1,
                                    "new_line": null,
                                    "content": o,
                                }));
                                old_idx += 1;
                            }
                            // Show added line
                            if let Some(n) = &new_line {
                                hunks.push(serde_json::json!({
                                    "type": "added",
                                    "old_line": null,
                                    "new_line": new_idx + 1,
                                    "content": n,
                                }));
                                new_idx += 1;
                            }
                            last_was_change = true;
                        }
                    }

                    // Stop if we've processed all lines
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
            "run_command" => {
                let command = args["command"].as_str().unwrap_or("unknown");
                serde_json::json!({
                    "type": "command",
                    "command": command,
                }).to_string()
            }
            "edit_file" => {
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
                }).to_string()
            }
            _ => arguments.to_string(),
        }
    }

    /// Try to detect and process todo_write JSON output as text.
    /// Some models output the todo_write arguments as plain text instead of a tool call.
    /// Returns true if todos were successfully intercepted.
    async fn try_intercept_todo_write_text(&self, text: &str) -> bool {
        let trimmed = text.trim();
        
        // Try to find a JSON object containing "todos" anywhere in the text
        // The model often outputs plan text + todo_write JSON as plain text
        if let Some(json_str) = self.extract_todos_json(trimmed) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str) {
                if let Some(todos_arg) = parsed.get("todos").and_then(|v| v.as_array()) {
                let mut new_todos = Vec::new();
                for (idx, todo_args) in todos_arg.iter().enumerate() {
                    let id = todo_args["id"].as_str().unwrap_or("");
                    let content = todo_args["content"].as_str().unwrap_or("");
                    let priority_str = todo_args["priority"].as_str().unwrap_or("medium");

                    if id.is_empty() || content.is_empty() { continue; }

                    // Force all new todos to start as Pending or InProgress (first item)
                    // The model often sends status: "completed" which is wrong
                    let status = if idx == 0 {
                        TodoStatus::InProgress  // First task starts in progress
                    } else {
                        TodoStatus::Pending     // All others start pending
                    };
                    let priority = match priority_str {
                        "high" => TodoPriority::High,
                        "low" => TodoPriority::Low,
                        _ => TodoPriority::Medium,
                    };

                    new_todos.push(TodoItem {
                        id: id.to_string(),
                        content: content.to_string(),
                        status,
                        priority,
                    });
                }

                if !new_todos.is_empty() {
                    // Update todo store
                    {
                        let mut todo_store = self.todo_items.lock().await;
                        *todo_store = new_todos.clone();
                    }
                    // Update plan steps to match
                    {
                        let mut steps = self.plan_steps.lock().await;
                        if steps.is_empty() {
                            *steps = new_todos.iter().enumerate().map(|(i, t)| PlanStep {
                                step: (i + 1) as u32,
                                description: t.content.clone(),
                                status: match t.status {
                                    TodoStatus::Pending => PlanStepStatus::Pending,
                                    TodoStatus::InProgress => PlanStepStatus::InProgress,
                                    TodoStatus::Completed => PlanStepStatus::Done,
                                    TodoStatus::Failed => PlanStepStatus::Failed,
                                },
                            }).collect();
                        }
                    }
                    return true;
                }
                }
            }
        }
        false
    }

    /// Extract JSON containing "todos" from text that may include plan text before/after
    fn extract_todos_json(&self, text: &str) -> Option<String> {
        // Look for a JSON object that contains "todos"
        // Find the first '{' and try to find a matching '}' that contains "todos"
        if let Some(start) = text.find('{') {
            // Try to find the end of the JSON object by counting braces
            let mut depth = 0;
            let mut in_string = false;
            let mut escape_next = false;
            
            for (i, c) in text[start..].char_indices() {
                if escape_next {
                    escape_next = false;
                    continue;
                }
                if c == '\\' && in_string {
                    escape_next = true;
                    continue;
                }
                if c == '"' {
                    in_string = !in_string;
                    continue;
                }
                if in_string {
                    continue;
                }
                match c {
                    '{' => depth += 1,
                    '}' => {
                        depth -= 1;
                        if depth == 0 {
                            let json_str = &text[start..=start + i];
                            // Verify it contains "todos"
                            if json_str.contains("\"todos\"") {
                                return Some(json_str.to_string());
                            }
                            // If no "todos", continue looking
                        }
                    }
                    _ => {}
                }
            }
        }
        None
    }

    /// Parse a plan from the LLM's text response
    ///
    /// Looks for numbered list items like:
    /// 1. Step description
    /// 2. Another step
    fn parse_plan(&self, text: &str) -> Vec<PlanStep> {
        let mut steps = Vec::new();
        for line in text.lines() {
            let trimmed = line.trim();
            // Match patterns like "1. Step" or "1) Step" or "Step 1:"
            if let Some(rest) = trimmed
                .strip_prefix(|c: char| c.is_ascii_digit())
                .and_then(|s| s.strip_prefix('.').or_else(|| s.strip_prefix(')')).or_else(|| s.strip_prefix(':')))
            {
                let desc = rest.trim();
                if !desc.is_empty() && desc.len() > 5 {
                    let step_num = steps.len() as u32 + 1;
                    steps.push(PlanStep {
                        step: step_num,
                        description: desc.to_string(),
                        status: PlanStepStatus::Pending,
                    });
                }
            }
        }
        steps
    }
}
