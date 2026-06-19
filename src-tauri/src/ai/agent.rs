use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};

use super::context::ContextManager;
use super::cost_tracker::{CostTracker, SharedCostTracker, create_shared_cost_tracker};
use super::embedding_store::EmbeddingStore;
use super::permissions::{PermissionProfile, PermissionResult, PermissionSystem};
use super::project_context::ProjectContext;
use super::provider::*;
use super::sandbox::Sandbox;
use super::tools::ToolRegistry;

/// Status of a plan step
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(tag = "status")]
pub enum PlanStepStatus {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "in_progress")]
    InProgress,
    #[serde(rename = "done")]
    Done,
    #[serde(rename = "failed")]
    Failed,
}

/// A single step in the agent's plan
#[derive(Debug, Clone, serde::Serialize)]
pub struct PlanStep {
    pub step: u32,
    pub description: String,
    pub status: PlanStepStatus,
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
    max_iterations: u32,
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
            max_iterations: 15, // Increased from 10
            project_context,
            approval_rx: Mutex::new(Some(approval_rx)),
            approval_tx: Mutex::new(Some(approval_tx)),
            plan_steps: Mutex::new(Vec::new()),
            context_manager: Mutex::new(ContextManager::new(8192)),
            permissions,
            sandbox,
            embedding_store,
            cost_tracker,
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
            max_iterations: 15,
            project_context,
            approval_rx: Mutex::new(Some(approval_rx)),
            approval_tx: Mutex::new(Some(approval_tx)),
            plan_steps: Mutex::new(Vec::new()),
            context_manager: Mutex::new(ContextManager::new(8192)),
            permissions,
            sandbox,
            embedding_store,
            cost_tracker,
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
        // Initialize context manager with system prompt
        let system_prompt = self.build_system_prompt();
        let mut ctx = ContextManager::new(8192);
        ctx.set_system_prompt(system_prompt);

        // Add history to context
        ctx.extend(history);

        // Add user message
        ctx.push(Message::User {
            content: user_message,
        });

        let tool_defs = self.tools.definitions();
        let mut total_tool_calls = 0u32;
        let mut consecutive_failures = 0u32;
        const MAX_CONSECUTIVE_FAILURES: u32 = 3;

        for iteration in 0..self.max_iterations {
            // Send context status update
            let stats = ctx.stats();
            let _ = tx
                .send(AgentEvent::Thinking {
                    message: if iteration == 0 {
                        format!("Thinking... ({})", stats)
                    } else {
                        format!("Continuing (iteration {}, {})...", iteration + 1, stats)
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
                max_tokens: Some(4096),
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

            // Use streaming for better UX
            let mut stream = match self.provider.chat_completion_stream(request).await {
                Ok(s) => s,
                Err(_) => {
                    // Fall back to non-streaming if streaming fails
                    let response = self.provider.chat_completion(fallback_request).await?;
                    self.handle_response(response, &mut ctx, &mut total_tool_calls, &mut consecutive_failures, tx).await?;
                    continue;
                }
            };

            // Collect streaming response
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
                if chunk.choices.first().and_then(|c| c.finish_reason.as_ref()).is_some() {
                    // Usage might be in the final chunk for some providers
                }
            }

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
            let has_plan = if !tool_calls.is_empty() && !full_content.is_empty() {
                let new_steps = self.parse_plan(&full_content);
                if !new_steps.is_empty() {
                    let mut steps = self.plan_steps.lock().await;
                    *steps = new_steps.clone();
                    let _ = tx.send(AgentEvent::PlanUpdate { steps: new_steps }).await;
                    true
                } else {
                    false
                }
            } else {
                false
            };

            // Handle tool calls
            if !tool_calls.is_empty() {
                // Add assistant message to context
                ctx.push(Message::Assistant {
                    content: Some(full_content),
                    tool_calls: Some(tool_calls.clone()),
                });

                // Execute each tool call
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

                    // Update plan step status to in_progress
                    {
                        let mut steps = self.plan_steps.lock().await;
                        if let Some(step) = steps.iter_mut().find(|s| s.status == PlanStepStatus::Pending) {
                            step.status = PlanStepStatus::InProgress;
                            let _ = tx.send(AgentEvent::PlanUpdate { steps: steps.clone() }).await;
                        }
                    }

                    let _ = tx
                        .send(AgentEvent::ToolResult {
                            tool_name: call.function.name.clone(),
                            result: result.clone(),
                        })
                        .await;

                    // Update plan step status to done
                    {
                        let mut steps = self.plan_steps.lock().await;
                        if let Some(step) = steps.iter_mut().find(|s| s.status == PlanStepStatus::InProgress) {
                            step.status = PlanStepStatus::Done;
                            let _ = tx.send(AgentEvent::PlanUpdate { steps: steps.clone() }).await;
                        }
                    }

                    // Add tool result to context
                    ctx.push(Message::Tool {
                        tool_call_id: call.id.clone(),
                        content: result,
                    });
                }
            } else {
                // No tool calls - final response
                let _ = tx
                    .send(AgentEvent::Response {
                        content: if has_plan { String::new() } else { full_content },
                        tool_calls_made: total_tool_calls,
                        usage,
                    })
                    .await;
                return Ok(());
            }
        }

        // Exceeded max iterations
        let _ = tx
            .send(AgentEvent::Response {
                content: format!(
                    "Reached maximum iterations ({}). Stopping.",
                    self.max_iterations
                ),
                tool_calls_made: total_tool_calls,
                usage: None,
            })
            .await;

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
                        // No tool calls - this is the final response
                        let _ = tx
                            .send(AgentEvent::Response {
                                content: content.clone().unwrap_or_default(),
                                tool_calls_made: *total_tool_calls,
                                usage,
                            })
                            .await;
                        return Ok(());
                    }

                    // Add assistant message to context
                    ctx.push(choice.message.clone());

                    // Execute each tool call
                    for call in calls {
                        *total_tool_calls += 1;

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
                    // No tool calls - final response
                    let _ = tx
                        .send(AgentEvent::Response {
                            content: content.clone().unwrap_or_default(),
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

    fn build_system_prompt(&self) -> String {
        let project_section = self.project_context.to_prompt_section();
        let permissions_section = self.permissions.to_prompt_section();

        format!(
            r#"You are an AI coding assistant embedded in the OpenStorm IDE.
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
- Run shell commands
- Execute tests (auto-detects framework)
- Check LSP diagnostics (errors/warnings)
- View and create git commits

## Decision Framework

1. **Understand first**: Before making changes, read relevant files and understand the context
2. **Plan before acting**: For complex tasks, output a numbered plan
3. **Minimize changes**: Make the smallest change that solves the problem
4. **Verify your work**: After making changes, check for errors
5. **Explain your reasoning**: Tell the user what you're doing and why

## Planning

- For complex tasks, output a numbered plan before executing tools
- Use this format: "Plan:\n1. First step\n2. Second step\n..."
- Keep plans to 3-7 steps
- Each step should be a clear, actionable task
- Execute one step at a time using tools

## Error Handling

- If a tool fails, try a different approach
- If you're unsure, ask the user
- If a change might break things, warn the user first
- Never silently fail

## Safety

- Don't modify files outside the project directory
- Don't run destructive commands without confirmation
- Don't expose secrets or credentials
- Don't commit without user approval"#
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
