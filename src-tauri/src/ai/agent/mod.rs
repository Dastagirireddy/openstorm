mod builder;
mod event;
mod planner;
mod preview;
mod prompt;
mod run;
mod telemetry;
mod todo_interceptor;
mod tool_executor;
mod types;

pub use event::AgentEvent;
pub use types::{
    CostSnapshot, DiffLine, FileModification, PlanStep, PlanStepStatus, TelemetryField,
    TelemetryFieldType, TodoItem, TodoPriority, TodoStatus,
};

use std::sync::Arc;

use crate::ai::context::{ContextManager, ProjectContext};
use crate::ai::cost_tracker::SharedCostTracker;
use crate::ai::embedding_store::EmbeddingStore;
use crate::ai::permissions::PermissionSystem;
use crate::ai::sandbox::Sandbox;
use crate::ai::tools::ToolRegistry;

/// The agent orchestrates the LLM tool-calling loop.
///
/// Manages the lifecycle of a conversation: context building,
/// tool execution, permission checks, and event emission.
pub struct Agent {
    pub provider: Arc<dyn crate::ai::provider::LlmProvider>,
    pub model: String,
    pub tools: ToolRegistry,
    pub project_context: ProjectContext,
    /// Channel to receive approval responses from the frontend.
    pub approval_rx: tokio::sync::Mutex<Option<tokio::sync::mpsc::Receiver<bool>>>,
    /// Channel to send approval requests to the frontend.
    pub approval_tx: tokio::sync::Mutex<Option<tokio::sync::mpsc::Sender<bool>>>,
    /// Current plan steps.
    pub plan_steps: tokio::sync::Mutex<Vec<PlanStep>>,
    /// Context window manager.
    pub context_manager: tokio::sync::Mutex<ContextManager>,
    /// Permission system.
    pub permissions: PermissionSystem,
    /// Sandbox for safe execution.
    pub sandbox: Sandbox,
    /// Embedding store for RAG.
    pub embedding_store: Arc<tokio::sync::Mutex<EmbeddingStore>>,
    /// Cost tracker for LLM API usage.
    pub cost_tracker: SharedCostTracker,
    /// TODO items for tracking progress.
    pub todo_items: tokio::sync::Mutex<Vec<TodoItem>>,
    /// File modifications accumulated during execution.
    pub file_modifications: tokio::sync::Mutex<Vec<FileModification>>,
    /// Session start time (for duration calculation).
    pub session_start: std::time::Instant,
}
