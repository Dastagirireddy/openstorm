use std::sync::Arc;

use tokio::sync::mpsc;

use super::config::AgentConfig;
use crate::ai_v2::messages::{HumanMessage, Message, SystemMessage};
use crate::ai_v2::response_filter::events::AgentEvent;
use crate::ai_v2::tools::tool_trait::ToolResult;

/// LLM Provider trait
#[async_trait::async_trait]
pub trait LLMProvider: Send + Sync {
    /// Chat completion
    async fn chat_completion(
        &self,
        messages: &[Box<dyn Message>],
        config: &AgentConfig,
    ) -> Result<LLMResponse, LLMError>;

    /// Stream chat completion
    async fn chat_completion_stream(
        &self,
        messages: &[Box<dyn Message>],
        config: &AgentConfig,
    ) -> mpsc::Receiver<LLMStreamEvent>;
}

/// LLM response
#[derive(Debug, Clone)]
pub struct LLMResponse {
    pub content: String,
    pub tool_calls: Vec<ToolCallInfo>,
    pub usage: Option<UsageInfo>,
}

/// Tool call from LLM
#[derive(Debug, Clone)]
pub struct ToolCallInfo {
    pub id: String,
    pub name: String,
    pub args: serde_json::Value,
}

/// Usage information
#[derive(Debug, Clone)]
pub struct UsageInfo {
    pub input_tokens: usize,
    pub output_tokens: usize,
    pub total_tokens: usize,
}

/// LLM stream event
#[derive(Debug, Clone)]
pub enum LLMStreamEvent {
    TextDelta { content: String },
    ToolCallStart { id: String, name: String },
    ToolCallDelta { id: String, args_delta: String },
    ToolCallEnd { id: String },
    Done { usage: Option<UsageInfo> },
    Error { message: String },
}

/// LLM errors
#[derive(Debug, thiserror::Error)]
pub enum LLMError {
    #[error("Provider error: {0}")]
    ProviderError(String),

    #[error("Rate limited")]
    RateLimited,

    #[error("Context too long: {0}")]
    ContextTooLong(String),

    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    #[error("Network error: {0}")]
    NetworkError(String),
}

/// Tool service for executing tools
#[async_trait::async_trait]
pub trait ToolService: Send + Sync {
    /// Execute a tool call
    async fn execute(&self, tool_call: &ToolCallInfo) -> Result<ToolResult, String>;

    /// Get tool definitions for LLM
    async fn definitions(&self) -> Vec<serde_json::Value>;
}

/// Agent runtime — the main execution cycle
pub struct AgentRuntime {
    provider: Arc<dyn LLMProvider>,
    tool_service: Arc<dyn ToolService>,
    event_tx: mpsc::Sender<AgentEvent>,
    config: AgentConfig,
}

impl AgentRuntime {
    /// Create a new agent runtime
    pub fn new(
        provider: Arc<dyn LLMProvider>,
        tool_service: Arc<dyn ToolService>,
        event_tx: mpsc::Sender<AgentEvent>,
        config: AgentConfig,
    ) -> Self {
        Self {
            provider,
            tool_service,
            event_tx,
            config,
        }
    }

    /// Run the agent loop
    pub async fn run(
        &self,
        user_message: &str,
    ) -> Result<String, AgentError> {
        let mut messages: Vec<Box<dyn Message>> = Vec::new();

        // 1. Build context
        if let Some(system_prompt) = &self.config.system_prompt {
            messages.push(Box::new(SystemMessage::new("system", system_prompt)));
        }

        // Add tool definitions as system message
        let defs = self.tool_service.definitions().await;
        if !defs.is_empty() {
            let tools_json = serde_json::to_string_pretty(&defs)
                .unwrap_or_default();
            messages.push(Box::new(SystemMessage::new(
                "tools",
                &format!("Available tools:\n{}", tools_json),
            )));
        }

        // Add user message
        messages.push(Box::new(HumanMessage::new("user", user_message)));

        // 2. Loop
        let mut iteration = 0;
        let mut consecutive_text = 0;

        loop {
            iteration += 1;
            if iteration > self.config.max_iterations {
                break;
            }

            // 3. Call LLM
            let response = self
                .provider
                .chat_completion(&messages, &self.config)
                .await
                .map_err(|e| AgentError::LLMError(e.to_string()))?;

            // 4. Stream text deltas
            if !response.content.is_empty() {
                let _ = self
                    .event_tx
                    .send(AgentEvent::TextDelta {
                        content: response.content.clone(),
                    })
                    .await;
            }

            // 5. Check for tool calls
            if response.tool_calls.is_empty() {
                consecutive_text += 1;
                if consecutive_text >= self.config.max_consecutive_text {
                    break; // Force stop
                }
                return Ok(response.content);
            }

            consecutive_text = 0;

            // 6. Execute tools
            for tool_call in &response.tool_calls {
                let _ = self
                    .event_tx
                    .send(AgentEvent::ToolUse {
                        name: tool_call.name.clone(),
                        args: tool_call.args.clone(),
                    })
                    .await;

                let result = self
                    .tool_service
                    .execute(tool_call)
                    .await
                    .map_err(|e| AgentError::ToolError(e))?;

                let _ = self
                    .event_tx
                    .send(AgentEvent::ToolResult {
                        tool_call_id: tool_call.id.clone(),
                        output: result.content.clone(),
                        is_error: !result.success,
                    })
                    .await;

                // Add tool result to messages
                // In a real implementation, we'd add a ToolMessage
            }
        }

        // 7. Extract final response
        Ok("Agent loop completed".to_string())
    }

    /// Get the event sender
    pub fn event_sender(&self) -> &mpsc::Sender<AgentEvent> {
        &self.event_tx
    }

    /// Get the config
    pub fn config(&self) -> &AgentConfig {
        &self.config
    }
}

/// Agent errors
#[derive(Debug, thiserror::Error)]
pub enum AgentError {
    #[error("LLM error: {0}")]
    LLMError(String),

    #[error("Tool error: {0}")]
    ToolError(String),

    #[error("Max iterations exceeded")]
    MaxIterationsExceeded,

    #[error("Cancelled")]
    Cancelled,
}

// ═══════════════════════════════════════════════════════════════
// MOCKS FOR TESTING
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
pub struct MockLLMProvider {
    pub responses: Vec<LLMResponse>,
    pub call_count: std::sync::atomic::AtomicUsize,
}

#[cfg(test)]
impl MockLLMProvider {
    pub fn simple(text: &str) -> Self {
        Self {
            responses: vec![LLMResponse {
                content: text.to_string(),
                tool_calls: vec![],
                usage: None,
            }],
            call_count: std::sync::atomic::AtomicUsize::new(0),
        }
    }

    pub fn with_tool_calls(calls: Vec<ToolCallInfo>) -> Self {
        Self {
            responses: vec![LLMResponse {
                content: String::new(),
                tool_calls: calls,
                usage: None,
            }],
            call_count: std::sync::atomic::AtomicUsize::new(0),
        }
    }
}

#[cfg(test)]
#[async_trait::async_trait]
impl LLMProvider for MockLLMProvider {
    async fn chat_completion(
        &self,
        _messages: &[Box<dyn Message>],
        _config: &AgentConfig,
    ) -> Result<LLMResponse, LLMError> {
        let idx = self.call_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        if idx < self.responses.len() {
            Ok(self.responses[idx].clone())
        } else {
            Ok(LLMResponse {
                content: "Done".to_string(),
                tool_calls: vec![],
                usage: None,
            })
        }
    }

    async fn chat_completion_stream(
        &self,
        _messages: &[Box<dyn Message>],
        _config: &AgentConfig,
    ) -> mpsc::Receiver<LLMStreamEvent> {
        let (tx, rx) = mpsc::channel(10);
        let _ = tx.send(LLMStreamEvent::Done { usage: None }).await;
        rx
    }
}

#[cfg(test)]
pub struct MockToolService;

#[cfg(test)]
#[async_trait::async_trait]
impl ToolService for MockToolService {
    async fn execute(&self, tool_call: &ToolCallInfo) -> Result<ToolResult, String> {
        Ok(ToolResult::success(
            &tool_call.id,
            format!("Executed: {}", tool_call.name),
        ))
    }

    async fn definitions(&self) -> Vec<serde_json::Value> {
        vec![]
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_agent_runtime_new() {
        let provider = Arc::new(MockLLMProvider::simple("hello"));
        let tools = Arc::new(MockToolService);
        let (tx, _rx) = mpsc::channel(10);
        let config = AgentConfig::default();

        let runtime = AgentRuntime::new(provider, tools, tx, config);
        assert_eq!(runtime.config().model, "claude-3-5-sonnet-20241022");
    }

    #[tokio::test]
    async fn test_agent_run_simple() {
        let provider = Arc::new(MockLLMProvider::simple("Hello!"));
        let tools = Arc::new(MockToolService);
        let (tx, _rx) = mpsc::channel(10);
        let config = AgentConfig::default();

        let runtime = AgentRuntime::new(provider, tools, tx, config);
        let result = runtime.run("Hi").await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Hello!");
    }

    #[tokio::test]
    async fn test_agent_run_with_system_prompt() {
        let provider = Arc::new(MockLLMProvider::simple("Response"));
        let tools = Arc::new(MockToolService);
        let (tx, _rx) = mpsc::channel(10);
        let config = AgentConfig::default().with_system_prompt("Be helpful");

        let runtime = AgentRuntime::new(provider, tools, tx, config);
        let result = runtime.run("Test").await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_agent_event_sender() {
        let provider = Arc::new(MockLLMProvider::simple("test"));
        let tools = Arc::new(MockToolService);
        let (tx, _rx) = mpsc::channel(10);
        let config = AgentConfig::default();

        let runtime = AgentRuntime::new(provider, tools, tx, config);
        assert!(runtime.event_sender().send(AgentEvent::TextDelta { content: "test".to_string() }).await.is_ok());
    }
}