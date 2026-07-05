use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::mpsc;

use super::super::messages::AnyMessage;
use super::context::{AgentRole, ExecutionInfo, ToolContext};
use super::tool_trait::{Tool, ToolResult};

/// ToolRuntime — injected into every tool call
///
/// Provides tools with everything they need: state, context, store, stream writer.
/// Follows the LangChain ToolRuntime pattern — no global state access.
pub struct ToolRuntime {
    /// Short-term memory: messages in current conversation
    pub state: Arc<tokio::sync::Mutex<ConversationState>>,

    /// Immutable context: project path, model info, session ID
    pub context: ToolContext,

    /// Long-term memory: persistent across sessions
    pub store: Arc<dyn Store>,

    /// Stream writer: emit real-time updates during execution
    pub stream_tx: mpsc::Sender<StreamEvent>,

    /// Execution info: thread ID, run ID, attempt number
    pub execution: ExecutionInfo,

    /// Tool call ID: for correlating results with calls
    pub tool_call_id: String,
}

impl ToolRuntime {
    /// Create a new tool runtime
    pub fn new(
        context: ToolContext,
        store: Arc<dyn Store>,
        stream_tx: mpsc::Sender<StreamEvent>,
        tool_call_id: impl Into<String>,
    ) -> Self {
        Self {
            state: Arc::new(tokio::sync::Mutex::new(ConversationState::new())),
            context,
            store,
            stream_tx,
            execution: ExecutionInfo::new("default"),
            tool_call_id: tool_call_id.into(),
        }
    }

    /// Get the project path
    pub fn project_path(&self) -> &PathBuf {
        &self.context.project_path
    }

    /// Get the session ID
    pub fn session_id(&self) -> &str {
        &self.context.session_id
    }

    /// Get the agent role
    pub fn agent_role(&self) -> AgentRole {
        self.context.agent_role
    }

    /// Send a stream event (non-blocking)
    pub async fn emit(&self, event: StreamEvent) {
        let _ = self.stream_tx.send(event).await;
    }

    /// Truncate content to max result chars
    pub fn truncate(&self, content: &str) -> String {
        let max = self.context.max_result_chars;
        if content.len() <= max {
            content.to_string()
        } else {
            format!(
                "{}... ({} total chars)",
                &content[..max],
                content.len()
            )
        }
    }
}

/// Conversation state (short-term memory)
#[derive(Debug, Clone)]
pub struct ConversationState {
    /// Messages in current conversation
    pub messages: Vec<AnyMessage>,
    /// Current plan (if any)
    pub current_plan: Option<Plan>,
    /// TODO items
    pub todo_items: Vec<TodoItem>,
    /// Files modified during this conversation
    pub files_modified: Vec<PathBuf>,
    /// Total tool calls made
    pub total_tool_calls: u32,
    /// Total tokens consumed
    pub total_tokens: usize,
}

impl ConversationState {
    /// Create new conversation state
    pub fn new() -> Self {
        Self {
            messages: Vec::new(),
            current_plan: None,
            todo_items: Vec::new(),
            files_modified: Vec::new(),
            total_tool_calls: 0,
            total_tokens: 0,
        }
    }

    /// Add a message to the conversation
    pub fn push_message(&mut self, msg: AnyMessage) {
        self.messages.push(msg);
    }

    /// Get message count
    pub fn message_count(&self) -> usize {
        self.messages.len()
    }

    /// Record a file modification
    pub fn record_file_modification(&mut self, path: PathBuf) {
        if !self.files_modified.contains(&path) {
            self.files_modified.push(path);
        }
    }

    /// Increment tool call counter
    pub fn increment_tool_calls(&mut self) {
        self.total_tool_calls += 1;
    }

    /// Add tokens
    pub fn add_tokens(&mut self, tokens: usize) {
        self.total_tokens += tokens;
    }
}

impl Default for ConversationState {
    fn default() -> Self {
        Self::new()
    }
}

/// Stream events emitted during tool execution
#[derive(Debug, Clone)]
pub enum StreamEvent {
    /// Text delta for streaming
    TextDelta { content: String },
    /// Tool output
    ToolOutput {
        tool_name: String,
        output_type: String,
        data: String,
    },
    /// Progress update
    Progress {
        message: String,
        percent: Option<f32>,
    },
    /// Error occurred
    Error { message: String },
}

/// Store trait for long-term memory
#[async_trait::async_trait]
pub trait Store: Send + Sync {
    /// Get a value from the store
    async fn get(&self, namespace: &str, key: &str) -> Option<serde_json::Value>;

    /// Put a value into the store
    async fn put(
        &self,
        namespace: &str,
        key: &str,
        value: serde_json::Value,
    ) -> Result<(), StoreError>;

    /// Delete a value from the store
    async fn delete(&self, namespace: &str, key: &str) -> Result<(), StoreError>;

    /// List all keys in a namespace
    async fn list(&self, namespace: &str) -> Vec<String>;
}

/// Store errors
#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Other: {0}")]
    Other(String),
}

/// A plan for the agent to follow
#[derive(Debug, Clone)]
pub struct Plan {
    /// Plan steps
    pub steps: Vec<PlanStep>,
    /// Current step index
    pub current_step: usize,
}

impl Plan {
    /// Create a new plan
    pub fn new(steps: Vec<PlanStep>) -> Self {
        Self {
            steps,
            current_step: 0,
        }
    }

    /// Get current step
    pub fn current_step(&self) -> Option<&PlanStep> {
        self.steps.get(self.current_step)
    }

    /// Advance to next step
    pub fn advance(&mut self) -> bool {
        if self.current_step + 1 < self.steps.len() {
            self.current_step += 1;
            true
        } else {
            false
        }
    }

    /// Check if plan is complete
    pub fn is_complete(&self) -> bool {
        self.current_step + 1 >= self.steps.len()
    }
}

/// A single plan step
#[derive(Debug, Clone)]
pub struct PlanStep {
    /// Description of what to do
    pub description: String,
    /// Status
    pub status: PlanStepStatus,
}

/// Status of a plan step
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlanStepStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}

/// A TODO item
#[derive(Debug, Clone)]
pub struct TodoItem {
    /// Task description
    pub description: String,
    /// Whether it's done
    pub done: bool,
    /// Priority
    pub priority: TodoPriority,
}

/// Priority of a TODO item
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TodoPriority {
    Low,
    Medium,
    High,
}

/// Store namespaces
pub struct StoreNamespaces;

impl StoreNamespaces {
    pub const PROJECT_RULES: &'static str = "project_rules";
    pub const TOOL_CACHE: &'static str = "tool_cache";
    pub const SESSION_LESSONS: &'static str = "session_lessons";
    pub const USER_PREFS: &'static str = "user_preferences";
    pub const AGENT_MEMORY: &'static str = "agent_memory";
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_conversation_state_new() {
        let state = ConversationState::new();
        assert_eq!(state.message_count(), 0);
        assert_eq!(state.total_tool_calls, 0);
        assert!(state.files_modified.is_empty());
    }

    #[test]
    fn test_conversation_state_push_message() {
        let mut state = ConversationState::new();
        let msg = AnyMessage::System(super::super::super::messages::SystemMessage::new(
            "s1", "prompt",
        ));
        state.push_message(msg);
        assert_eq!(state.message_count(), 1);
    }

    #[test]
    fn test_conversation_state_record_file() {
        let mut state = ConversationState::new();
        state.record_file_modification(PathBuf::from("src/main.rs"));
        state.record_file_modification(PathBuf::from("src/main.rs")); // duplicate
        state.record_file_modification(PathBuf::from("src/lib.rs"));
        assert_eq!(state.files_modified.len(), 2);
    }

    #[test]
    fn test_conversation_state_counters() {
        let mut state = ConversationState::new();
        state.increment_tool_calls();
        state.increment_tool_calls();
        state.add_tokens(100);
        state.add_tokens(50);
        assert_eq!(state.total_tool_calls, 2);
        assert_eq!(state.total_tokens, 150);
    }

    #[test]
    fn test_plan() {
        let steps = vec![
            PlanStep {
                description: "Step 1".into(),
                status: PlanStepStatus::Pending,
            },
            PlanStep {
                description: "Step 2".into(),
                status: PlanStepStatus::Pending,
            },
        ];
        let mut plan = Plan::new(steps);
        assert!(!plan.is_complete());
        assert_eq!(plan.current_step().unwrap().description, "Step 1");
        assert!(plan.advance());
        assert_eq!(plan.current_step().unwrap().description, "Step 2");
        assert!(!plan.advance());
        assert!(plan.is_complete());
    }

    #[test]
    fn test_store_namespaces() {
        assert_eq!(StoreNamespaces::PROJECT_RULES, "project_rules");
        assert_eq!(StoreNamespaces::TOOL_CACHE, "tool_cache");
    }

    #[test]
    fn test_todo_item() {
        let item = TodoItem {
            description: "Test task".into(),
            done: false,
            priority: TodoPriority::High,
        };
        assert!(!item.done);
        assert_eq!(item.priority, TodoPriority::High);
    }
}
