use std::collections::HashSet;

use tokio::sync::mpsc;

use super::event::AgentEvent;
use super::types::{TodoItem, TodoPriority, TodoStatus};
use super::Agent;
use crate::ai::permissions::PermissionResult;
use crate::ai::provider::Message;

/// Maximum characters for a single tool result before truncation.
const MAX_TOOL_RESULT_CHARS: usize = 3000;

/// Maximum consecutive tool failures before stopping.
pub const MAX_CONSECUTIVE_FAILURES: u32 = 3;

/// Execute a single tool call with permission checks, dedup, and guards.
///
/// Handles the full lifecycle of one tool invocation:
/// 1. Permission check (deny / allow / approval required)
/// 2. Approval flow (if needed)
/// 3. Empty-args guard
/// 4. Duplicate detection
/// 5. Actual execution
/// 6. Result truncation
/// 7. Telemetry + todo sync
///
/// # Arguments
/// * `agent` - The agent instance.
/// * `call` - The tool call to execute.
/// * `ctx` - The context manager for message history.
/// * `tx` - Channel to emit events to the frontend.
/// * `session_log` - Session logger for diagnostics.
/// * `executed_this_turn` - Dedup set for this iteration.
/// * `consecutive_failures` - Mutable failure counter.
/// * `has_plan` - Whether a plan exists.
/// * `last_completed_step` - Tracks completed step numbers.
/// * `todo_stale_iterations` - Staleness tracker for auto-complete.
/// * `iteration` - Current loop iteration number.
pub async fn execute_tool_call(
    agent: &Agent,
    call: &crate::ai::provider::ToolCall,
    ctx: &mut crate::ai::context::ContextManager,
    tx: &mpsc::Sender<AgentEvent>,
    session_log: &mut crate::ai::context::AiSessionLog,
    executed_this_turn: &mut HashSet<(String, String)>,
    consecutive_failures: &mut u32,
    has_plan: &mut bool,
    last_completed_step: &mut Option<u32>,
    _todo_stale_iterations: &mut std::collections::HashMap<String, u32>,
    _iteration: u32,
) -> bool {
    // Check permission
    let perm_result = agent.permissions.check(&call.function.name, &call.function.arguments);
    match &perm_result {
        PermissionResult::Denied { reason } => {
            *consecutive_failures += 1;
            let result = format!(
                "Tool '{}' DENIED: {}. You did NOT execute this tool and did NOT read any files. Do NOT claim you inspected files or ran commands. Use a different tool or ask the user.",
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
            return true; // continue
        }
        PermissionResult::ApprovalRequired { .. } => {
            if !handle_approval_flow(agent, call, tx).await {
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
                return true; // continue
            }
        }
        PermissionResult::Allowed => {}
    }

    // Empty args guard
    let args_empty = call.function.arguments.trim().is_empty()
        || call.function.arguments == "{}"
        || call.function.arguments == "null";
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
            return true; // continue
        }
    }

    // Dedup check
    let dedup_key = (call.function.name.clone(), call.function.arguments.clone());
    if !executed_this_turn.insert(dedup_key.clone()) {
        session_log.log_flow(&format!(
            "Skipping duplicate tool call: {} with args {}",
            dedup_key.0, dedup_key.1
        ));
        let result = "Skipped: duplicate tool call with identical arguments in this turn.".to_string();
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
        return true; // continue
    }

    // Execute
    session_log.log_tool_start(&call.function.name, &call.function.arguments);
    let _ = tx
        .send(AgentEvent::ToolUse {
            tool_name: call.function.name.clone(),
            arguments: call.function.arguments.clone(),
        })
        .await;

    let tool_start = std::time::Instant::now();
    let result = agent
        .tools
        .execute(&call.function.name, &call.function.arguments)
        .await;
    let tool_duration = tool_start.elapsed().as_millis() as u64;

    // Intercept todo_write
    if call.function.name == "todo_write" {
        intercept_todo_write(agent, call, has_plan, last_completed_step, session_log, tx).await;
    }

    // Track failures
    if result.starts_with("Unknown tool:")
        || result.starts_with("Error")
        || result.contains("not found")
        || result.contains("failed")
    {
        *consecutive_failures += 1;
    } else {
        *consecutive_failures = 0;
    }

    session_log.log_tool_end(&call.function.name, &result, tool_duration);

    // Emit events
    let _ = tx
        .send(AgentEvent::ToolResult {
            tool_name: call.function.name.clone(),
            result: result.clone(),
        })
        .await;

    // Sync todos
    {
        let todos = agent.todo_items.lock().await.clone();
        if !todos.is_empty() {
            let _ = tx.send(AgentEvent::TodoUpdate { todos }).await;
        }
    }

    // Telemetry
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

    // Collect file modifications
    let file_mods = agent.tools.take_file_modifications();
    for modification in file_mods {
        agent.record_file_modification(modification).await;
    }

    // Truncate for context
    let context_result = if result.len() > MAX_TOOL_RESULT_CHARS {
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

    ctx.push(Message::Tool {
        tool_call_id: call.id.clone(),
        content: context_result,
    });

    false // don't continue — normal flow
}

/// Handle the approval flow for a tool that requires user confirmation.
///
/// Returns `true` if approved, `false` if denied or timed out.
async fn handle_approval_flow(
    agent: &Agent,
    call: &crate::ai::provider::ToolCall,
    tx: &mpsc::Sender<AgentEvent>,
) -> bool {
    let preview = crate::ai::agent::preview::generate_tool_preview(agent, &call.function.name, &call.function.arguments);

    let _ = tx
        .send(AgentEvent::ToolApprovalRequired {
            tool_name: call.function.name.clone(),
            arguments: call.function.arguments.clone(),
            preview,
        })
        .await;

    let mut rx = agent.approval_rx.lock().await;
    if let Some(ref mut receiver) = *rx {
        tokio::select! {
            response = receiver.recv() => response.unwrap_or(false),
            _ = tokio::time::sleep(std::time::Duration::from_secs(60)) => false,
        }
    } else {
        false
    }
}

/// Intercept `todo_write` tool calls to update agent state.
async fn intercept_todo_write(
    agent: &Agent,
    call: &crate::ai::provider::ToolCall,
    has_plan: &mut bool,
    last_completed_step: &mut Option<u32>,
    session_log: &mut crate::ai::context::AiSessionLog,
    tx: &mpsc::Sender<AgentEvent>,
) {
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&call.function.arguments) {
        if let Some(todos_arg) = parsed.get("todos").and_then(|v| v.as_array()) {
            let has_new_content = todos_arg
                .iter()
                .any(|t| !t["content"].as_str().unwrap_or("").is_empty());

            if has_new_content && !*has_plan {
                *has_plan = true;
                session_log.log_flow("Plan detected via todo_write with content");
            }

            let mut todos = agent.todo_items.lock().await;
            for todo_args in todos_arg {
                let id = todo_args["id"].as_str().unwrap_or("");
                let content = todo_args["content"].as_str().unwrap_or("");
                let status_str = todo_args["status"].as_str().unwrap_or("pending");
                let priority_str = todo_args["priority"].as_str().unwrap_or("medium");

                if id.is_empty() {
                    continue;
                }

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

                if status == TodoStatus::Completed {
                    if let Some(step_num) = id
                        .strip_prefix("step_")
                        .and_then(|s| s.parse::<u32>().ok())
                    {
                        *last_completed_step = Some(step_num);
                    }
                }
            }

            // Sync plan_steps if empty
            {
                let mut steps = agent.plan_steps.lock().await;
                if steps.is_empty() {
                    *steps = todos
                        .iter()
                        .enumerate()
                        .map(|(i, t)| super::types::PlanStep {
                            step: (i + 1) as u32,
                            description: t.content.clone(),
                            status: match t.status {
                                TodoStatus::Pending => super::types::PlanStepStatus::Pending,
                                TodoStatus::InProgress => super::types::PlanStepStatus::InProgress,
                                TodoStatus::Completed => super::types::PlanStepStatus::Done,
                                TodoStatus::Failed => super::types::PlanStepStatus::Failed,
                            },
                        })
                        .collect();
                }
            }
        }
    }

    // Send updated todos
    let todos = agent.todo_items.lock().await.clone();
    session_log.log_todo_update(&todos);
    let _ = tx.send(AgentEvent::TodoUpdate { todos }).await;
}
