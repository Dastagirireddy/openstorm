use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use tokio::sync::mpsc;

use super::event::AgentEvent;
use super::planner;
use super::tool_executor;
use super::todo_interceptor;
use super::types::{TodoItem, TodoStatus};
use super::Agent;
use crate::ai::context::ContextManager;
use crate::ai::permissions::PermissionResult;
use crate::ai::provider::*;
use crate::ai::session_log::AiSessionLog;

/// Maximum time to wait for streaming response from LLM (per iteration).
const STREAM_TIMEOUT_SECS: u64 = 120;

/// Maximum consecutive text-only responses before force-stopping.
const MAX_CONSECUTIVE_TEXT_ONLY: u32 = 3;

impl Agent {
    /// Run the agent loop for a user message.
    ///
    /// Spawns an async task and returns a receiver that yields
    /// `AgentEvent`s as they occur.
    ///
    /// # Arguments
    /// * `user_message` - The user's input text.
    /// * `history` - Prior conversation messages.
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

    /// Index the project directory for RAG.
    pub async fn index_project(&self) -> Result<usize, std::io::Error> {
        let mut store = self.embedding_store.lock().await;
        store.index_directory(&self.tools.project_path).await
    }

    /// Get the embedding store for external access.
    pub fn embedding_store(&self) -> Arc<tokio::sync::Mutex<crate::ai::embedding_store::EmbeddingStore>> {
        self.embedding_store.clone()
    }

    /// Get the cost tracker for external access.
    pub fn cost_tracker(&self) -> crate::ai::cost_tracker::SharedCostTracker {
        self.cost_tracker.clone()
    }

    /// Get a sender that the frontend can use to approve/deny tool execution.
    pub async fn get_approval_sender(&self) -> Option<mpsc::Sender<bool>> {
        self.approval_tx.lock().await.clone()
    }

    /// Record a file modification for the execution summary.
    pub async fn record_file_modification(&self, modification: super::types::FileModification) {
        let mut mods = self.file_modifications.lock().await;
        mods.push(modification);
    }

    /// Get accumulated file modifications.
    pub async fn get_file_modifications(&self) -> Vec<super::types::FileModification> {
        self.file_modifications.lock().await.clone()
    }

    /// Core agent loop — processes the user message through iterative
    /// LLM calls and tool execution.
    async fn run_inner(
        &self,
        user_message: String,
        history: Vec<Message>,
        tx: &mpsc::Sender<AgentEvent>,
    ) -> Result<(), ProviderError> {
        self.tools.set_event_sender(tx.clone()).await;

        let mut session_log =
            AiSessionLog::start(&user_message, &self.model, &self.tools.project_path);

        // Phase 1: Index project for RAG
        self.index_rag_if_needed(&mut session_log).await;

        // Initialize context
        let system_prompt = super::prompt::build_system_prompt(self);
        let mut ctx = ContextManager::new(8192);
        ctx.set_system_prompt(system_prompt);
        ctx.extend(history);
        ctx.push(Message::User {
            content: user_message.clone(),
        });

        // Phase 1: Auto-context injection via RAG
        self.inject_rag_context(&user_message, &mut ctx, &mut session_log)
            .await;

        let tool_defs = self.tools.essential_definitions_with_mcp().await;
        let mut total_tool_calls = 0u32;
        let mut consecutive_failures = 0u32;
        let mut has_plan = false;
        let mut last_completed_step: Option<u32> = None;
        let mut iteration = 0u32;
        let mut todo_stale_iterations: HashMap<String, u32> = HashMap::new();
        let mut consecutive_text_only = 0u32;

        // Inject initial progress context
        let progress = planner::build_progress_context(&has_plan, &last_completed_step);
        ctx.push(Message::System { content: progress });

        loop {
            iteration += 1;

            // Update progress context for subsequent iterations
            if iteration > 1 {
                let new_progress = planner::build_progress_context(&has_plan, &last_completed_step);
                ctx.update_progress_context(new_progress);
            }

            // Send context status
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

            // Build request
            let messages = ctx.build_messages();
            let request = ChatCompletionRequest {
                model: self.model.clone(),
                messages,
                tools: Some(tool_defs.clone()),
                stream: Some(true),
                temperature: Some(0.7),
                max_tokens: Some(2048),
            };
            let fallback_request = ChatCompletionRequest {
                model: request.model.clone(),
                messages: request.messages.clone(),
                tools: request.tools.clone(),
                stream: Some(false),
                temperature: request.temperature,
                max_tokens: request.max_tokens,
            };

            session_log.log_llm_request(iteration, &request, &tool_defs);

            // Try streaming
            let request_start = std::time::Instant::now();
            let mut stream = match self.provider.chat_completion_stream(request).await {
                Ok(s) => s,
                Err(_) => {
                    let response = self.provider.chat_completion(fallback_request).await?;
                    self.handle_response(
                        response,
                        &mut ctx,
                        &mut total_tool_calls,
                        &mut consecutive_failures,
                        tx,
                    )
                    .await?;
                    continue;
                }
            };

            // Collect streaming response
            let stream_result = tokio::time::timeout(
                std::time::Duration::from_secs(STREAM_TIMEOUT_SECS),
                collect_stream(&mut stream, tx),
            )
            .await;

            let (full_content, tool_calls, usage) = match stream_result {
                Ok(result) => result,
                Err(_) => {
                    session_log.log_flow(&format!(
                        "Stream timed out after {}s, falling back to non-streaming",
                        STREAM_TIMEOUT_SECS
                    ));
                    let response = self.provider.chat_completion(fallback_request).await?;
                    self.handle_response(
                        response,
                        &mut ctx,
                        &mut total_tool_calls,
                        &mut consecutive_failures,
                        tx,
                    )
                    .await?;
                    continue;
                }
            };

            let request_duration = request_start.elapsed().as_millis() as u64;
            session_log.log_llm_response(
                iteration,
                &full_content,
                "",
                &tool_calls,
                &usage,
                request_duration,
            );

            // Record cost
            if let Some(ref usage) = usage {
                let cost = {
                    let mut tracker = self.cost_tracker.lock().await;
                    tracker.record(&self.model, usage)
                };
                let _ = tx
                    .send(AgentEvent::CostUpdate {
                        model: self.model.clone(),
                        prompt_tokens: usage.prompt_tokens,
                        completion_tokens: usage.completion_tokens,
                        cost,
                    })
                    .await;
            }

            // Parse plan from text
            let plan_created_this_turn = if !full_content.is_empty() {
                let new_steps = planner::parse_plan(&full_content);
                if !new_steps.is_empty() {
                    let mut steps = self.plan_steps.lock().await;
                    let actually_created = steps.is_empty();
                    if actually_created {
                        *steps = new_steps.clone();
                        let todos: Vec<TodoItem> = new_steps
                            .iter()
                            .map(|s| TodoItem {
                                id: format!("step_{}", s.step),
                                content: s.description.clone(),
                                status: match s.status {
                                    super::types::PlanStepStatus::Pending => TodoStatus::Pending,
                                    super::types::PlanStepStatus::InProgress => {
                                        TodoStatus::InProgress
                                    }
                                    super::types::PlanStepStatus::Done => TodoStatus::Completed,
                                    super::types::PlanStepStatus::Failed => TodoStatus::Failed,
                                },
                                priority: super::types::TodoPriority::Medium,
                            })
                            .collect();
                        let mut todo_store = self.todo_items.lock().await;
                        *todo_store = todos.clone();
                        session_log.log_todo_update(&todos);
                        let _ = tx.send(AgentEvent::TodoUpdate { todos }).await;
                    }
                    actually_created
                } else {
                    false
                }
            } else {
                false
            };

            if plan_created_this_turn {
                has_plan = true;
            }

            // Handle tool calls
            if !tool_calls.is_empty() {
                consecutive_text_only = 0;
                ctx.push(Message::Assistant {
                    content: Some(full_content),
                    tool_calls: Some(tool_calls.clone()),
                });

                let mut executed_this_turn: HashSet<(String, String)> = HashSet::new();
                for call in &tool_calls {
                    total_tool_calls += 1;

                    if consecutive_failures >= tool_executor::MAX_CONSECUTIVE_FAILURES {
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
                        let _ = tx
                            .send(AgentEvent::Response {
                                content: "Stopping due to too many consecutive tool failures. Please try a different approach.".to_string(),
                                tool_calls_made: total_tool_calls,
                                usage,
                            })
                            .await;
                        let summary = self.build_execution_summary("failed", total_tool_calls).await;
                        let _ = tx.send(summary).await;
                        return Ok(());
                    }

                    let skipped = tool_executor::execute_tool_call(
                        self,
                        call,
                        &mut ctx,
                        tx,
                        &mut session_log,
                        &mut executed_this_turn,
                        &mut consecutive_failures,
                        &mut has_plan,
                        &mut last_completed_step,
                        &mut todo_stale_iterations,
                        iteration,
                    )
                    .await;
                    if skipped {
                        continue;
                    }
                }

                // TODO staleness check
                self.check_stale_todos(
                    &mut todo_stale_iterations,
                    iteration,
                    &mut ctx,
                    &mut session_log,
                    tx,
                )
                .await;
            } else {
                // No tool calls — check for todo_write text
                if !full_content.is_empty()
                    && todo_interceptor::try_intercept_todo_write_text(self, &full_content).await
                {
                    {
                        let todos = self.todo_items.lock().await.clone();
                        let _ = tx.send(AgentEvent::TodoUpdate { todos }).await;
                    }
                    ctx.push(Message::Assistant {
                        content: Some(full_content.clone()),
                        tool_calls: None,
                    });
                    consecutive_failures = 0;
                    consecutive_text_only = 0;
                    continue;
                }

                if plan_created_this_turn {
                    ctx.push(Message::Assistant {
                        content: Some(full_content.clone()),
                        tool_calls: None,
                    });
                    consecutive_text_only += 1;
                    continue;
                }

                // Force-stop guard
                consecutive_text_only += 1;
                if consecutive_text_only >= MAX_CONSECUTIVE_TEXT_ONLY {
                    self.force_stop_pending_todos(tx).await;
                    let _ = tx
                        .send(AgentEvent::Response {
                            content: full_content,
                            tool_calls_made: total_tool_calls,
                            usage: usage.clone(),
                        })
                        .await;
                    let summary = self.build_execution_summary("completed", total_tool_calls).await;
                    let _ = tx.send(summary).await;
                    let total_tokens = usage.as_ref().map_or(0, |u| u.total_tokens as u64);
                    session_log.end(iteration, total_tool_calls, total_tokens);
                    return Ok(());
                }

                // Re-prompt if plan exists but empty response
                if has_plan && full_content.is_empty() {
                    session_log.log_flow(
                        "Model returned empty response after plan creation, re-prompting to execute",
                    );
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
                let summary = self.build_execution_summary("completed", total_tool_calls).await;
                let _ = tx.send(summary).await;
                let total_tokens = usage.as_ref().map_or(0, |u| u.total_tokens as u64);
                session_log.end(iteration, total_tool_calls, total_tokens);
                return Ok(());
            }
        }
    }

    /// Handle a non-streaming response (fallback when streaming fails).
    async fn handle_response(
        &self,
        response: ChatCompletionResponse,
        ctx: &mut ContextManager,
        total_tool_calls: &mut u32,
        consecutive_failures: &mut u32,
        tx: &mpsc::Sender<AgentEvent>,
    ) -> Result<(), ProviderError> {
        let usage = response.usage.clone();

        if let Some(ref usage) = usage {
            let cost = {
                let mut tracker = self.cost_tracker.lock().await;
                tracker.record(&self.model, usage)
            };
            let _ = tx
                .send(AgentEvent::CostUpdate {
                    model: self.model.clone(),
                    prompt_tokens: usage.prompt_tokens,
                    completion_tokens: usage.completion_tokens,
                    cost,
                })
                .await;
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
                if let Some(text) = content {
                    if !text.is_empty() {
                        let _ = tx
                            .send(AgentEvent::TextDelta {
                                content: text.to_string(),
                            })
                            .await;
                    }
                }

                if let Some(calls) = tool_calls {
                    if calls.is_empty() {
                        return self
                            .handle_text_only_response(
                                content, ctx, total_tool_calls, consecutive_failures, usage, tx,
                            )
                            .await;
                    }
                    self.handle_tool_calls_response(
                        calls,
                        content,
                        ctx,
                        total_tool_calls,
                        consecutive_failures,
                        usage,
                        tx,
                    )
                    .await?;
                } else {
                    return self
                        .handle_text_only_response(
                            content, ctx, total_tool_calls, consecutive_failures, usage, tx,
                        )
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
                let summary = self.build_execution_summary("failed", *total_tool_calls).await;
                let _ = tx.send(summary).await;
            }
        }

        Ok(())
    }

    /// Handle text-only response (no tool calls).
    async fn handle_text_only_response(
        &self,
        content: &Option<String>,
        ctx: &mut ContextManager,
        total_tool_calls: &mut u32,
        consecutive_failures: &mut u32,
        usage: Option<Usage>,
        tx: &mpsc::Sender<AgentEvent>,
    ) -> Result<(), ProviderError> {
        let content_text = content.clone().unwrap_or_default();

        if !content_text.is_empty()
            && todo_interceptor::try_intercept_todo_write_text(self, &content_text).await
        {
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
        Ok(())
    }

    /// Handle response that contains tool calls.
    async fn handle_tool_calls_response(
        &self,
        calls: &[ToolCall],
        content: &Option<String>,
        ctx: &mut ContextManager,
        total_tool_calls: &mut u32,
        consecutive_failures: &mut u32,
        usage: Option<Usage>,
        tx: &mpsc::Sender<AgentEvent>,
    ) -> Result<(), ProviderError> {
        ctx.push(Message::Assistant {
            content: content.clone(),
            tool_calls: Some(calls.to_vec()),
        });

        let mut executed_this_turn: HashSet<(String, String)> = HashSet::new();
        for call in calls {
            *total_tool_calls += 1;

            let dedup_key = (call.function.name.clone(), call.function.arguments.clone());
            if !executed_this_turn.insert(dedup_key.clone()) {
                let result =
                    "Skipped: duplicate tool call with identical arguments in this turn.".to_string();
                let _ = tx
                    .send(AgentEvent::ToolResult {
                        tool_name: dedup_key.0,
                        result: result.clone(),
                    })
                    .await;
                ctx.push(Message::Tool {
                    tool_call_id: call.id.clone(),
                    content: result,
                });
                continue;
            }

            let perm_result = self
                .permissions
                .check(&call.function.name, &call.function.arguments);
            match &perm_result {
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
                PermissionResult::ApprovalRequired { .. } => {
                    let preview = crate::ai::agent::preview::generate_tool_preview(self, &call.function.name, &call.function.arguments);
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
                PermissionResult::Allowed => {}
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

            {
                let todos = self.todo_items.lock().await.clone();
                if !todos.is_empty() {
                    let _ = tx.send(AgentEvent::TodoUpdate { todos }).await;
                }
            }

            let telemetry_fields = super::telemetry::build_telemetry_fields(
                &call.function.name,
                &result,
                &call.function.arguments,
            );
            let _ = tx
                .send(AgentEvent::ToolTelemetry {
                    tool_name: call.function.name.clone(),
                    fields: telemetry_fields,
                })
                .await;

            let file_mods = self.tools.take_file_modifications();
            for modification in file_mods {
                self.record_file_modification(modification).await;
            }

            ctx.push(Message::Tool {
                tool_call_id: call.id.clone(),
                content: result,
            });
        }

        Ok(())
    }

    /// Auto-complete stale TODOs that have been pending for 2+ iterations.
    async fn check_stale_todos(
        &self,
        todo_stale_iterations: &mut HashMap<String, u32>,
        iteration: u32,
        ctx: &mut ContextManager,
        session_log: &mut AiSessionLog,
        tx: &mpsc::Sender<AgentEvent>,
    ) {
        let mut todos = self.todo_items.lock().await;
        let mut stale_ids: Vec<String> = Vec::new();
        for todo in todos.iter_mut() {
            if todo.status == TodoStatus::Pending {
                let count = todo_stale_iterations.entry(todo.id.clone()).or_insert(0);
                *count += 1;
                if *count >= 2 {
                    stale_ids.push(todo.id.clone());
                    todo.status = TodoStatus::Completed;
                }
            }
        }
        if !stale_ids.is_empty() {
            let ids_str = stale_ids.join(", ");
            session_log.log_flow(&format!(
                "Auto-completed stale TODOs after {} iterations: {}",
                iteration, ids_str
            ));
            let todos_clone = todos.clone();
            drop(todos);
            let _ = tx.send(AgentEvent::TodoUpdate { todos: todos_clone }).await;
            ctx.push(Message::System {
                content: format!(
                    "NOTE: Your TODOs ({}) were auto-marked as completed because their tools \
                     already succeeded in previous iterations. You forgot to call todo_write \
                     to mark them done. Now provide a final text response summarizing what \
                     was accomplished. Do NOT re-run any tools.",
                    ids_str
                ),
            });
            return;
        }
        for todo in todos.iter() {
            if todo.status != TodoStatus::Pending {
                todo_stale_iterations.remove(&todo.id);
            }
        }
    }

    /// Force-complete all pending TODOs and send final response.
    async fn force_stop_pending_todos(&self, tx: &mpsc::Sender<AgentEvent>) {
        let mut todos = self.todo_items.lock().await;
        let mut changed = false;
        for todo in todos.iter_mut() {
            if todo.status == TodoStatus::Pending || todo.status == TodoStatus::InProgress {
                todo.status = TodoStatus::Completed;
                changed = true;
            }
        }
        if changed {
            let todos_clone = todos.clone();
            drop(todos);
            let _ = tx.send(AgentEvent::TodoUpdate { todos: todos_clone }).await;
        }
    }

    /// Build execution summary for the v2 panel.
    pub async fn build_execution_summary(
        &self,
        status: &str,
        total_tool_calls: u32,
    ) -> AgentEvent {
        let duration_ms = self.session_start.elapsed().as_millis() as u64;
        let files_modified = self.get_file_modifications().await;
        let cost_summary = {
            let tracker = self.cost_tracker.lock().await;
            let (prompt, completion) = tracker.total_tokens();
            super::types::CostSnapshot {
                total_prompt_tokens: prompt as u32,
                total_completion_tokens: completion as u32,
                total_cost: tracker.total_cost(),
            }
        };

        AgentEvent::ExecutionSummary {
            status: status.to_string(),
            files_modified,
            total_tool_calls,
            duration_ms,
            cost_summary,
        }
    }

    /// Index the RAG store if it's empty.
    async fn index_rag_if_needed(&self, session_log: &mut AiSessionLog) {
        let store = self.embedding_store.lock().await;
        if store.is_empty() {
            drop(store);
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

    /// Inject RAG-relevant code context into the conversation.
    async fn inject_rag_context(
        &self,
        user_message: &str,
        ctx: &mut ContextManager,
        session_log: &mut AiSessionLog,
    ) {
        let store = self.embedding_store.lock().await;
        if store.is_empty() {
            return;
        }
        let results = store.search(user_message, 12);
        if results.is_empty() {
            session_log.log_flow(&format!(
                "No relevant RAG chunks found for: \"{}\"",
                super::types::truncate_to_boundary(user_message, 60)
            ));
            return;
        }

        let mut context_block = String::from(
            "## Relevant Code Context (auto-retrieved by RAG)\n\
             These code sections are relevant to the user's request. \
             Use them as reference — do NOT re-read these files with read_file.\n\n",
        );
        let mut chunk_details = Vec::new();
        for result in results.iter() {
            let chunk = &result.chunk;
            let preview: String = chunk.content.lines().take(15).collect::<Vec<_>>().join("\n");
            let truncated = if chunk.content.lines().count() > 15 {
                format!(
                    "{}\n// ... ({} more lines)",
                    preview,
                    chunk.content.lines().count() - 15
                )
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
        session_log.log_rag_inject(results.len(), rag_tokens, user_message, &chunk_details);
        ctx.push(Message::System {
            content: context_block,
        });
    }
}

/// Collect a streaming response into full content, tool calls, and usage.
async fn collect_stream(
    stream: &mut tokio::sync::mpsc::Receiver<ChatCompletionChunk>,
    tx: &mpsc::Sender<AgentEvent>,
) -> (String, Vec<ToolCall>, Option<Usage>) {
    let mut full_content = String::new();
    let mut tool_calls: Vec<ToolCall> = Vec::new();
    let mut usage: Option<Usage> = None;

    while let Some(chunk) = stream.recv().await {
        if let Some(text) = &chunk.choices.first().and_then(|c| c.delta.content.as_ref()) {
            full_content.push_str(text);
            let _ = tx
                .send(AgentEvent::TextDelta {
                    content: text.to_string(),
                })
                .await;
        }

        if let Some(delta) = chunk
            .choices
            .first()
            .and_then(|c| c.delta.tool_calls.as_ref())
        {
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
                if let Some(args) = &tc_delta
                    .function
                    .as_ref()
                    .and_then(|f| f.arguments.as_ref())
                {
                    tool_calls[idx].function.arguments.push_str(args);
                }
            }
        }

        if let Some(u) = &chunk.usage {
            usage = Some(u.clone());
        }
    }

    (full_content, tool_calls, usage)
}
