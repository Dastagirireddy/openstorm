use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub kind: TaskKind,
    pub priority: Priority,
    pub context: TaskContext,
    #[serde(skip, default = "std::time::Instant::now")]
    pub created_at: std::time::Instant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskKind {
    UserRequest(String),
    SubTask {
        parent_id: String,
        description: String,
        strategy: Strategy,
    },
    Verify {
        action_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Priority {
    Low,
    Normal,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Strategy {
    Simple,
    Decompose,
    Explore,
    Refactor,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TaskContext {
    pub parent_result: Option<String>,
    pub shared_state: std::collections::HashMap<String, String>,
}

pub struct AgentHandle {
    pub task_id: String,
    pub abort_tx: mpsc::Sender<()>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub task_id: String,
    pub success: bool,
    pub output: String,
    pub tool_calls_made: u32,
}
