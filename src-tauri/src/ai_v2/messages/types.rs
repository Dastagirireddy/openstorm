use serde::{Deserialize, Serialize};

use super::content::{ContentBlock, ToolCall, UsageMetadata};
use super::metadata::MessageMetadata;

/// Message trait — all messages implement this
pub trait Message: Send + Sync {
    /// Message role (system, human, ai, tool, agent)
    fn role(&self) -> &str;
    /// Message content blocks
    fn content(&self) -> &[ContentBlock];
    /// Message metadata
    fn metadata(&self) -> &MessageMetadata;
    /// Unique message ID
    fn id(&self) -> &str;
    /// Get plain text representation
    fn plain_text(&self) -> String {
        self.content()
            .iter()
            .map(|b| b.to_plain_text())
            .collect::<Vec<_>>()
            .join("")
    }
}

/// System message — instructions for the model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMessage {
    pub id: String,
    /// The system prompt content
    pub content: String,
    pub metadata: MessageMetadata,
}

impl SystemMessage {
    /// Create a new system message
    pub fn new(session_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            content: content.into(),
            metadata: MessageMetadata::new(session_id),
        }
    }
}

impl Message for SystemMessage {
    fn role(&self) -> &str {
        "system"
    }

    fn content(&self) -> &[ContentBlock] {
        &[] // System messages store content as plain string
    }

    fn metadata(&self) -> &MessageMetadata {
        &self.metadata
    }

    fn id(&self) -> &str {
        &self.id
    }

    fn plain_text(&self) -> String {
        self.content.clone()
    }
}

/// Human message — user input
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HumanMessage {
    pub id: String,
    /// Content blocks (text, images, files)
    pub content: Vec<ContentBlock>,
    /// Optional user identifier
    pub name: Option<String>,
    pub metadata: MessageMetadata,
}

impl HumanMessage {
    /// Create a new human message with text content
    pub fn new(session_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            content: vec![ContentBlock::text(content)],
            name: None,
            metadata: MessageMetadata::new(session_id),
        }
    }

    /// Create a human message with multiple content blocks
    pub fn with_blocks(session_id: impl Into<String>, blocks: Vec<ContentBlock>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            content: blocks,
            name: None,
            metadata: MessageMetadata::new(session_id),
        }
    }

    /// Set the user name
    pub fn with_name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }
}

impl Message for HumanMessage {
    fn role(&self) -> &str {
        "human"
    }

    fn content(&self) -> &[ContentBlock] {
        &self.content
    }

    fn metadata(&self) -> &MessageMetadata {
        &self.metadata
    }

    fn id(&self) -> &str {
        &self.id
    }
}

/// AI message — model output (may include tool calls)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIMessage {
    pub id: String,
    /// Content blocks (text + reasoning)
    pub content: Vec<ContentBlock>,
    /// Tools the model wants to call
    pub tool_calls: Vec<ToolCall>,
    /// Token usage
    pub usage: Option<UsageMetadata>,
    /// Response metadata from the provider
    pub response_metadata: ResponseMetadata,
    pub metadata: MessageMetadata,
}

/// Response metadata from the LLM provider
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResponseMetadata {
    pub model: Option<String>,
    pub finish_reason: Option<String>,
    pub provider_id: Option<String>,
}

impl AIMessage {
    /// Create a new AI message
    pub fn new(session_id: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            content: Vec::new(),
            tool_calls: Vec::new(),
            usage: None,
            response_metadata: ResponseMetadata::default(),
            metadata: MessageMetadata::new(session_id),
        }
    }

    /// Create with text content
    pub fn with_text(session_id: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            content: vec![ContentBlock::text(text)],
            tool_calls: Vec::new(),
            usage: None,
            response_metadata: ResponseMetadata::default(),
            metadata: MessageMetadata::new(session_id),
        }
    }

    /// Add a tool call
    pub fn with_tool_call(mut self, tool_call: ToolCall) -> Self {
        self.tool_calls.push(tool_call);
        self
    }

    /// Set usage
    pub fn with_usage(mut self, usage: UsageMetadata) -> Self {
        self.usage = Some(usage);
        self
    }

    /// Check if this message has tool calls
    pub fn has_tool_calls(&self) -> bool {
        !self.tool_calls.is_empty()
    }
}

impl Message for AIMessage {
    fn role(&self) -> &str {
        "ai"
    }

    fn content(&self) -> &[ContentBlock] {
        &self.content
    }

    fn metadata(&self) -> &MessageMetadata {
        &self.metadata
    }

    fn id(&self) -> &str {
        &self.id
    }
}

/// Tool message — result of a tool execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolMessage {
    pub id: String,
    /// Tool output text
    pub content: String,
    /// Matches AIMessage.tool_calls[].id
    pub tool_call_id: String,
    /// Tool name
    pub tool_name: String,
    /// Data not sent to LLM (supplementary)
    pub artifact: Option<serde_json::Value>,
    /// Whether this result is an error
    pub is_error: bool,
    pub metadata: MessageMetadata,
}

impl ToolMessage {
    /// Create a successful tool result
    pub fn success(
        session_id: impl Into<String>,
        tool_call_id: impl Into<String>,
        tool_name: impl Into<String>,
        content: impl Into<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            content: content.into(),
            tool_call_id: tool_call_id.into(),
            tool_name: tool_name.into(),
            artifact: None,
            is_error: false,
            metadata: MessageMetadata::new(session_id),
        }
    }

    /// Create an error tool result
    pub fn error(
        session_id: impl Into<String>,
        tool_call_id: impl Into<String>,
        tool_name: impl Into<String>,
        content: impl Into<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            content: content.into(),
            tool_call_id: tool_call_id.into(),
            tool_name: tool_name.into(),
            artifact: None,
            is_error: true,
            metadata: MessageMetadata::new(session_id),
        }
    }

    /// Set artifact data
    pub fn with_artifact(mut self, artifact: serde_json::Value) -> Self {
        self.artifact = Some(artifact);
        self
    }
}

impl Message for ToolMessage {
    fn role(&self) -> &str {
        "tool"
    }

    fn content(&self) -> &[ContentBlock] {
        &[] // Tool messages store content as plain string
    }

    fn metadata(&self) -> &MessageMetadata {
        &self.metadata
    }

    fn id(&self) -> &str {
        &self.id
    }

    fn plain_text(&self) -> String {
        self.content.clone()
    }
}

/// Agent message — inter-agent communication
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessage {
    pub id: String,
    /// Source agent ID
    pub from_agent: String,
    /// Target agent ID
    pub to_agent: String,
    /// Message content
    pub content: Vec<ContentBlock>,
    /// Type of agent message
    pub message_type: AgentMessageType,
    pub metadata: MessageMetadata,
}

/// Types of agent-to-agent messages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentMessageType {
    /// Task delegation
    TaskDelegation,
    /// Task result
    TaskResult,
    /// Status update
    StatusUpdate,
    /// Request for information
    InfoRequest,
    /// Response to info request
    InfoResponse,
}

impl AgentMessage {
    /// Create a new agent message
    pub fn new(
        session_id: impl Into<String>,
        from_agent: impl Into<String>,
        to_agent: impl Into<String>,
        message_type: AgentMessageType,
        content: Vec<ContentBlock>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            from_agent: from_agent.into(),
            to_agent: to_agent.into(),
            content,
            message_type,
            metadata: MessageMetadata::new(session_id),
        }
    }
}

impl Message for AgentMessage {
    fn role(&self) -> &str {
        "agent"
    }

    fn content(&self) -> &[ContentBlock] {
        &self.content
    }

    fn metadata(&self) -> &MessageMetadata {
        &self.metadata
    }

    fn id(&self) -> &str {
        &self.id
    }
}

/// Any message in the system
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "role")]
pub enum AnyMessage {
    #[serde(rename = "system")]
    System(SystemMessage),
    #[serde(rename = "human")]
    Human(HumanMessage),
    #[serde(rename = "ai")]
    Ai(AIMessage),
    #[serde(rename = "tool")]
    Tool(ToolMessage),
    #[serde(rename = "agent")]
    Agent(AgentMessage),
}

impl AnyMessage {
    /// Get the role of this message
    pub fn role(&self) -> &str {
        match self {
            Self::System(m) => m.role(),
            Self::Human(m) => m.role(),
            Self::Ai(m) => m.role(),
            Self::Tool(m) => m.role(),
            Self::Agent(m) => m.role(),
        }
    }

    /// Get the message ID
    pub fn id(&self) -> &str {
        match self {
            Self::System(m) => m.id(),
            Self::Human(m) => m.id(),
            Self::Ai(m) => m.id(),
            Self::Tool(m) => m.id(),
            Self::Agent(m) => m.id(),
        }
    }

    /// Get plain text representation
    pub fn plain_text(&self) -> String {
        match self {
            Self::System(m) => m.plain_text(),
            Self::Human(m) => m.plain_text(),
            Self::Ai(m) => m.plain_text(),
            Self::Tool(m) => m.plain_text(),
            Self::Agent(m) => m.plain_text(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_message() {
        let msg = SystemMessage::new("session-1", "You are a helpful assistant.");
        assert_eq!(msg.role(), "system");
        assert_eq!(msg.plain_text(), "You are a helpful assistant.");
        assert!(!msg.id.is_empty());
    }

    #[test]
    fn test_human_message() {
        let msg = HumanMessage::new("session-1", "Hello!");
        assert_eq!(msg.role(), "human");
        assert_eq!(msg.plain_text(), "Hello!");
        assert!(msg.name.is_none());
    }

    #[test]
    fn test_human_message_with_name() {
        let msg = HumanMessage::new("session-1", "Hello!").with_name("User");
        assert_eq!(msg.name.as_deref(), Some("User"));
    }

    #[test]
    fn test_human_message_with_blocks() {
        let blocks = vec![
            ContentBlock::text("Check this:"),
            ContentBlock::file_ref("src/main.rs"),
        ];
        let msg = HumanMessage::with_blocks("session-1", blocks);
        assert_eq!(msg.content().len(), 2);
    }

    #[test]
    fn test_ai_message() {
        let msg = AIMessage::with_text("session-1", "I'll help you with that.");
        assert_eq!(msg.role(), "ai");
        assert!(!msg.has_tool_calls());
    }

    #[test]
    fn test_ai_message_with_tool_call() {
        let tc = ToolCall::new("call-1", "read_file", serde_json::json!({"path": "test.rs"}));
        let msg = AIMessage::with_text("session-1", "Let me read the file.")
            .with_tool_call(tc);
        assert!(msg.has_tool_calls());
        assert_eq!(msg.tool_calls.len(), 1);
        assert_eq!(msg.tool_calls[0].name, "read_file");
    }

    #[test]
    fn test_tool_message_success() {
        let msg = ToolMessage::success("session-1", "call-1", "read_file", "file contents");
        assert_eq!(msg.role(), "tool");
        assert!(!msg.is_error);
        assert_eq!(msg.tool_call_id, "call-1");
    }

    #[test]
    fn test_tool_message_error() {
        let msg = ToolMessage::error("session-1", "call-1", "read_file", "File not found");
        assert!(msg.is_error);
    }

    #[test]
    fn test_tool_message_with_artifact() {
        let msg = ToolMessage::success("session-1", "call-1", "read_file", "content")
            .with_artifact(serde_json::json!({"lines": 42}));
        assert!(msg.artifact.is_some());
    }

    #[test]
    fn test_agent_message() {
        let msg = AgentMessage::new(
            "session-1",
            "orchestrator",
            "explorer",
            AgentMessageType::TaskDelegation,
            vec![ContentBlock::text("Search for TODOs")],
        );
        assert_eq!(msg.role(), "agent");
        assert_eq!(msg.from_agent, "orchestrator");
        assert_eq!(msg.to_agent, "explorer");
    }

    #[test]
    fn test_any_message() {
        let sys = SystemMessage::new("session-1", "System prompt");
        let any = AnyMessage::System(sys);
        assert_eq!(any.role(), "system");
        assert_eq!(any.plain_text(), "System prompt");
    }

    #[test]
    fn test_any_message_serialization() {
        let msg = HumanMessage::new("session-1", "Hello");
        let any = AnyMessage::Human(msg);
        let json = serde_json::to_string(&any).unwrap();
        let deserialized: AnyMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.role(), "human");
    }
}
