use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::fmt;

// ── Message types ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "role")]
pub enum Message {
    #[serde(rename = "system")]
    System { content: String },
    #[serde(rename = "user")]
    User { content: String },
    #[serde(rename = "assistant")]
    Assistant {
        content: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_calls: Option<Vec<ToolCall>>,
    },
    #[serde(rename = "tool")]
    Tool {
        tool_call_id: String,
        content: String,
    },
}

// ── Tool calling types ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: FunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: FunctionDefinition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

// ── Chat completion request/response ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ToolDefinition>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionResponse {
    pub id: String,
    pub model: String,
    pub choices: Vec<Choice>,
    pub usage: Option<Usage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Choice {
    pub index: u32,
    pub message: Message,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

// ── Streaming types ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionChunk {
    pub id: String,
    pub model: String,
    pub choices: Vec<ChunkChoice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Usage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkChoice {
    pub index: u32,
    pub delta: Delta,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Delta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCallDelta>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallDelta {
    pub index: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub call_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function: Option<FunctionCallDelta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCallDelta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<String>,
}

// ── Model info ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub context_window: u32,
    pub max_output: u32,
    pub supports_tools: bool,
    pub supports_vision: bool,
    pub is_free: bool,
}

// ── Provider trait ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub is_free: bool,
    pub requires_api_key: bool,
}

/// LLM Provider trait — implement this to add new providers.
///
/// Follows OpenStorm's pattern: providers expose a list of models,
/// accept chat completion requests, and optionally support streaming.
#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// Provider identifier (e.g. "ollama", "nvidia", "openai")
    fn id(&self) -> &str;

    /// Human-readable name
    fn name(&self) -> &str;

    /// Whether this provider offers free models
    fn is_free(&self) -> bool;

    /// Check if the provider is reachable
    async fn check_connection(&self) -> Result<bool, ProviderError>;

    /// List available models from this provider
    async fn list_models(&self) -> Result<Vec<ModelInfo>, ProviderError>;

    /// Send a chat completion request (non-streaming)
    async fn chat_completion(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<ChatCompletionResponse, ProviderError>;

    /// Send a chat completion request (streaming)
    /// Returns a receiver that yields chunks
    async fn chat_completion_stream(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<tokio::sync::mpsc::Receiver<ChatCompletionChunk>, ProviderError>;
}

// ── Provider error ─────────────────────────────────────────────

#[derive(Debug)]
pub enum ProviderError {
    ConnectionFailed(String),
    NotFound(String),
    AuthenticationRequired(String),
    RateLimited(String),
    InvalidRequest(String),
    ServerError(String),
    StreamingError(String),
    Unknown(String),
}

impl fmt::Display for ProviderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ConnectionFailed(msg) => write!(f, "Connection failed: {}", msg),
            Self::NotFound(msg) => write!(f, "Not found: {}", msg),
            Self::AuthenticationRequired(msg) => write!(f, "Auth required: {}", msg),
            Self::RateLimited(msg) => write!(f, "Rate limited: {}", msg),
            Self::InvalidRequest(msg) => write!(f, "Invalid request: {}", msg),
            Self::ServerError(msg) => write!(f, "Server error: {}", msg),
            Self::StreamingError(msg) => write!(f, "Streaming error: {}", msg),
            Self::Unknown(msg) => write!(f, "Unknown error: {}", msg),
        }
    }
}

impl ProviderError {
    /// Returns a user-friendly error message suitable for display in the UI.
    pub fn user_friendly(&self) -> String {
        match self {
            Self::ConnectionFailed(msg) => {
                if msg.contains("connection refused") || msg.contains("ECONNREFUSED") {
                    "Could not connect to the AI provider. Is the server running?".to_string()
                } else if msg.contains("timeout") {
                    "Connection timed out. The server might be busy.".to_string()
                } else {
                    format!("Connection error: {}", msg)
                }
            }
            Self::NotFound(msg) => {
                if msg.contains("model") {
                    "The requested model was not found. Try a different model.".to_string()
                } else {
                    format!("Not found: {}", msg)
                }
            }
            Self::AuthenticationRequired(_) => {
                "Authentication required. Please check your API key.".to_string()
            }
            Self::RateLimited(_) => {
                "Too many requests. Please wait a moment and try again.".to_string()
            }
            Self::InvalidRequest(msg) => {
                if msg.contains("context length") || msg.contains("too long") {
                    "The message is too long for the model's context window.".to_string()
                } else {
                    "Invalid request. The model might not support this operation.".to_string()
                }
            }
            Self::ServerError(msg) => {
                if msg.contains("400") {
                    "The server rejected the request. The model might be overloaded.".to_string()
                } else if msg.contains("500") || msg.contains("502") || msg.contains("503") {
                    "The server encountered an error. Please try again later.".to_string()
                } else if msg.contains("Ollama") {
                    "Ollama error. Please check if Ollama is running correctly.".to_string()
                } else {
                    "A server error occurred. Please try again.".to_string()
                }
            }
            Self::StreamingError(_) => {
                "Connection interrupted. Please try again.".to_string()
            }
            Self::Unknown(msg) => {
                if msg.is_empty() {
                    "An unexpected error occurred.".to_string()
                } else {
                    format!("Error: {}", msg)
                }
            }
        }
    }
}

impl std::error::Error for ProviderError {}

impl From<reqwest::Error> for ProviderError {
    fn from(e: reqwest::Error) -> Self {
        Self::ConnectionFailed(e.to_string())
    }
}

impl From<serde_json::Error> for ProviderError {
    fn from(e: serde_json::Error) -> Self {
        Self::InvalidRequest(e.to_string())
    }
}
