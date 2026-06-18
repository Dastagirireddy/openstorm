use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};

use super::provider::*;
use super::tools::ToolRegistry;

/// Events emitted during agent execution
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type")]
pub enum AgentEvent {
    /// Agent is thinking / calling a tool
    #[serde(rename = "thinking")]
    Thinking { message: String },

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

    /// Streaming text token
    #[serde(rename = "text_delta")]
    TextDelta { content: String },

    /// Final assistant response
    #[serde(rename = "response")]
    Response {
        content: String,
        tool_calls_made: u32,
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
}

impl Agent {
    pub fn new(provider: Arc<dyn LlmProvider>, model: String, project_path: String) -> Self {
        Self {
            provider,
            model,
            tools: ToolRegistry::new(project_path),
            max_iterations: 10, // Safety limit
        }
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

            let choice = response
                .choices
                .first()
                .ok_or_else(|| ProviderError::ServerError("No choices in response".to_string()))?;

            match &choice.message {
                Message::Assistant {
                    content,
                    tool_calls,
                } => {
                    // Send text content if present
                    if let Some(text) = content {
                        if !text.is_empty() {
                            let _ = tx.send(AgentEvent::TextDelta { content: text.clone() }).await;
                        }
                    }

                    // Handle tool calls
                    if let Some(calls) = tool_calls {
                        if calls.is_empty() {
                            // No tool calls - this is the final response
                            let _ = tx
                                .send(AgentEvent::Response {
                                    content: content.clone().unwrap_or_default(),
                                    tool_calls_made: total_tool_calls,
                                })
                                .await;
                            return Ok(());
                        }

                        // Add assistant message to history
                        messages.push(choice.message.clone());

                        // Execute each tool call
                        for call in calls {
                            total_tool_calls += 1;

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

                            let _ = tx
                                .send(AgentEvent::ToolResult {
                                    tool_name: call.function.name.clone(),
                                    result: result.clone(),
                                })
                                .await;

                            // Add tool result to messages
                            messages.push(Message::Tool {
                                tool_call_id: call.id.clone(),
                                content: result,
                            });
                        }
                    } else {
                        // No tool calls - final response
                        let _ = tx
                            .send(AgentEvent::Response {
                                content: content.clone().unwrap_or_default(),
                                tool_calls_made: total_tool_calls,
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
            })
            .await;

        Ok(())
    }

    fn build_system_prompt(&self) -> String {
        format!(
            r#"You are an AI coding assistant embedded in the OpenStorm IDE.
You have access to tools that let you read, write, and search files in the user's project.

Rules:
- Use tools to explore the codebase before answering questions about it
- When writing files, make sure the code is correct and follows the project's conventions
- Be concise in your responses
- If you need to see more of a file, use read_file to read it
- Always explain what you're doing when using tools

Available tools:
- read_file: Read a file's contents
- write_file: Write content to a file (creates/overwrites)
- list_directory: List files in a directory
- search_code: Search for patterns in code
- run_command: Execute a shell command
- git_status: Get current git status"#
        )
    }
}
