use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};

use super::project_context::ProjectContext;
use super::provider::*;
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
}

impl Agent {
    pub fn new(provider: Arc<dyn LlmProvider>, model: String, project_path: String) -> Self {
        let project_context = ProjectContext::detect(&project_path);
        let (approval_tx, approval_rx) = mpsc::channel(1);
        Self {
            provider,
            model,
            tools: ToolRegistry::new(project_path),
            max_iterations: 10, // Safety limit
            project_context,
            approval_rx: Mutex::new(Some(approval_rx)),
            approval_tx: Mutex::new(Some(approval_tx)),
            plan_steps: Mutex::new(Vec::new()),
        }
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
        let system_prompt = self.build_system_prompt();
        let mut messages = vec![Message::System {
            content: system_prompt,
        }];
        messages.extend(history);
        messages.push(Message::User {
            content: user_message,
        });

        let tool_defs = self.tools.definitions();
        let mut total_tool_calls = 0u32;

        for iteration in 0..self.max_iterations {
            let _ = tx
                .send(AgentEvent::Thinking {
                    message: if iteration == 0 {
                        "Thinking...".to_string()
                    } else {
                        format!("Continuing (iteration {})...", iteration + 1)
                    },
                })
                .await;

            let request = ChatCompletionRequest {
                model: self.model.clone(),
                messages: messages.clone(),
                tools: Some(tool_defs.clone()),
                stream: Some(false),
                temperature: Some(0.7),
                max_tokens: Some(4096),
            };

            let response = self.provider.chat_completion(request).await?;
            let usage = response.usage.clone();

            let choice = response
                .choices
                .first()
                .ok_or_else(|| ProviderError::ServerError("No choices in response".to_string()))?;

            match &choice.message {
                Message::Assistant {
                    content,
                    tool_calls,
                } => {
                    // Only parse and show plan if there are actual tool calls
                    let has_plan = if let Some(calls) = tool_calls {
                        if !calls.is_empty() {
                            // There are tool calls - parse plan if present
                            if let Some(text) = content {
                                if !text.is_empty() {
                                    let new_steps = self.parse_plan(text);
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
                                }
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    } else {
                        false
                    };

                    // Send TextDelta for the response content (unless it's just a plan)
                    if let Some(text) = content {
                        if !text.is_empty() && !has_plan {
                            let _ = tx.send(AgentEvent::TextDelta { content: text.clone() }).await;
                        }
                    }

                    // Handle tool calls
                    if let Some(calls) = tool_calls {
                        if calls.is_empty() {
                            // No tool calls - this is the final response
                            // If there's a plan, send empty content to avoid duplicate display
                            let _ = tx
                                .send(AgentEvent::Response {
                                    content: if has_plan { String::new() } else { content.clone().unwrap_or_default() },
                                    tool_calls_made: total_tool_calls,
                                    usage: usage.clone(),
                                })
                                .await;
                            return Ok(());
                        }

                        // Add assistant message to history
                        messages.push(choice.message.clone());

                        // Execute each tool call
                        for call in calls {
                            total_tool_calls += 1;

                            // Check if this tool requires approval
                            let needs_approval = matches!(
                                call.function.name.as_str(),
                                "write_file" | "run_command"
                            );

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
                                    let result = "Tool execution denied by user.".to_string();
                                    let _ = tx
                                        .send(AgentEvent::ToolResult {
                                            tool_name: call.function.name.clone(),
                                            result: result.clone(),
                                        })
                                        .await;
                                    messages.push(Message::Tool {
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

                            // Add tool result to messages
                            messages.push(Message::Tool {
                                tool_call_id: call.id.clone(),
                                content: result,
                            });
                        }
                    } else {
                        // No tool calls - final response
                        // If there's a plan, send empty content to avoid duplicate display
                        let _ = tx
                            .send(AgentEvent::Response {
                                content: if has_plan { String::new() } else { content.clone().unwrap_or_default() },
                                tool_calls_made: total_tool_calls,
                                usage: usage.clone(),
                            })
                            .await;
                        return Ok(());
                    }
                }
                _ => {
                    // Unexpected message type
                    let _ = tx
                        .send(AgentEvent::Response {
                            content: "Unexpected response from model".to_string(),
                            tool_calls_made: total_tool_calls,
                            usage: usage.clone(),
                        })
                        .await;
                    return Ok(());
                }
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

    fn build_system_prompt(&self) -> String {
        let project_section = self.project_context.to_prompt_section();

        format!(
            r#"You are an AI coding assistant embedded in the OpenStorm IDE.
You have access to tools that let you read, write, and search files in the user's project.

{project_section}

Rules:
- Use tools to explore the codebase before answering questions about it
- When writing files, make sure the code is correct and follows the project's conventions
- Be concise in your responses
- If you need to see more of a file, use read_file to read it
- Always explain what you're doing when using tools
- Follow the language and framework conventions detected in the project context

Planning:
- For complex tasks, output a numbered plan before executing tools
- Use this format: "Plan:\n1. First step\n2. Second step\n..."
- Keep plans to 3-7 steps
- Each step should be a clear, actionable task
- Execute one step at a time using tools

Available tools:
- read_file: Read a file's contents
- write_file: Write content to a file (creates/overwrites)
- list_directory: List files in a directory
- search_code: Search for patterns in code
- run_command: Execute a shell command
            - git_status: Get current git status"#
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
