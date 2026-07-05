use std::path::PathBuf;
use std::time::Duration;

use crate::ai::agent::config::AgentConfig;

/// Task status for sub-agent
#[derive(Debug, Clone, PartialEq)]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Aborted,
}

/// Configuration for spawning a sub-agent
#[derive(Debug, Clone)]
pub struct SpawnConfig {
    /// Task description for the sub-agent
    pub task: String,

    /// Role of the sub-agent
    pub role: SubAgentRole,

    /// Parent agent ID
    pub parent_id: String,

    /// Context from parent
    pub parent_context: ParentContext,

    /// Task timeout
    pub timeout: Duration,

    /// Max iterations for the sub-agent
    pub max_iterations: usize,
}

impl SpawnConfig {
    pub fn new(
        task: String,
        role: SubAgentRole,
        parent_id: String,
        parent_context: ParentContext,
    ) -> Self {
        Self {
            task,
            role,
            parent_id,
            parent_context,
            timeout: Duration::from_secs(300),
            max_iterations: 10,
        }
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn with_max_iterations(mut self, max_iterations: usize) -> Self {
        self.max_iterations = max_iterations;
        self
    }
}

/// Sub-agent roles
#[derive(Debug, Clone, PartialEq)]
pub enum SubAgentRole {
    /// General-purpose sub-agent
    General,

    /// Explorer sub-agent (search, read-only)
    Explorer,

    /// Coder sub-agent (can edit files)
    Coder,

    /// Reviewer sub-agent (review changes)
    Reviewer,
}

/// Context passed from parent to sub-agent
#[derive(Debug, Clone)]
pub struct ParentContext {
    /// RAG context (optional)
    pub rag_context: Option<String>,

    /// Project path
    pub project_path: PathBuf,

    /// Key decisions made by parent
    pub key_decisions: Vec<String>,

    /// Files currently being worked on
    pub active_files: Vec<PathBuf>,
}

impl ParentContext {
    pub fn new(project_path: PathBuf) -> Self {
        Self {
            rag_context: None,
            project_path,
            key_decisions: Vec::new(),
            active_files: Vec::new(),
        }
    }

    pub fn with_rag_context(mut self, rag_context: String) -> Self {
        self.rag_context = Some(rag_context);
        self
    }

    pub fn with_key_decisions(mut self, key_decisions: Vec<String>) -> Self {
        self.key_decisions = key_decisions;
        self
    }

    pub fn with_active_files(mut self, active_files: Vec<PathBuf>) -> Self {
        self.active_files = active_files;
        self
    }
}

/// Handle to a spawned sub-agent task
pub struct TaskHandle {
    /// Unique task ID
    pub task_id: String,

    /// Sub-agent ID
    pub agent_id: String,

    /// Current status (can be watched)
    pub status: TaskStatus,
}

/// Result from a sub-agent task
#[derive(Debug, Clone)]
pub struct TaskResult {
    /// Task ID
    pub task_id: String,

    /// Sub-agent ID
    pub agent_id: String,

    /// Whether the task succeeded
    pub success: bool,

    /// Summary of what was done
    pub summary: String,

    /// Files affected by the sub-agent
    pub files_affected: Vec<PathBuf>,

    /// Number of tool calls made
    pub tool_calls_made: u32,

    /// Duration in milliseconds
    pub duration_ms: u64,
}

impl TaskResult {
    pub fn success(
        task_id: String,
        agent_id: String,
        summary: String,
        files_affected: Vec<PathBuf>,
        tool_calls_made: u32,
        duration_ms: u64,
    ) -> Self {
        Self {
            task_id,
            agent_id,
            success: true,
            summary,
            files_affected,
            tool_calls_made,
            duration_ms,
        }
    }

    pub fn failure(task_id: String, agent_id: String, summary: String) -> Self {
        Self {
            task_id,
            agent_id,
            success: false,
            summary,
            files_affected: Vec::new(),
            tool_calls_made: 0,
            duration_ms: 0,
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_status() {
        assert_eq!(TaskStatus::Pending, TaskStatus::Pending);
        assert_eq!(TaskStatus::Running, TaskStatus::Running);
        assert_eq!(TaskStatus::Completed, TaskStatus::Completed);
        assert_eq!(TaskStatus::Failed, TaskStatus::Failed);
        assert_eq!(TaskStatus::Aborted, TaskStatus::Aborted);
    }

    #[test]
    fn test_spawn_config_new() {
        let ctx = ParentContext::new(PathBuf::from("/project"));
        let config = SpawnConfig::new(
            "search TODOs".to_string(),
            SubAgentRole::Explorer,
            "parent-1".to_string(),
            ctx,
        );
        assert_eq!(config.task, "search TODOs");
        assert_eq!(config.role, SubAgentRole::Explorer);
        assert_eq!(config.parent_id, "parent-1");
    }

    #[test]
    fn test_spawn_config_builder() {
        let ctx = ParentContext::new(PathBuf::from("/project"));
        let config = SpawnConfig::new(
            "task".to_string(),
            SubAgentRole::General,
            "parent".to_string(),
            ctx,
        )
        .with_timeout(Duration::from_secs(60))
        .with_max_iterations(5);

        assert_eq!(config.timeout, Duration::from_secs(60));
        assert_eq!(config.max_iterations, 5);
    }

    #[test]
    fn test_parent_context_new() {
        let ctx = ParentContext::new(PathBuf::from("/project"));
        assert_eq!(ctx.project_path, PathBuf::from("/project"));
        assert!(ctx.rag_context.is_none());
        assert!(ctx.key_decisions.is_empty());
        assert!(ctx.active_files.is_empty());
    }

    #[test]
    fn test_parent_context_builder() {
        let ctx = ParentContext::new(PathBuf::from("/project"))
            .with_rag_context("rag context".to_string())
            .with_key_decisions(vec!["decision1".to_string()])
            .with_active_files(vec![PathBuf::from("file1.rs")]);

        assert_eq!(ctx.rag_context, Some("rag context".to_string()));
        assert_eq!(ctx.key_decisions.len(), 1);
        assert_eq!(ctx.active_files.len(), 1);
    }

    #[test]
    fn test_task_result_success() {
        let result = TaskResult::success(
            "task-1".to_string(),
            "agent-1".to_string(),
            "Found 3 TODOs".to_string(),
            vec![PathBuf::from("auth.rs")],
            5,
            1200,
        );
        assert!(result.success);
        assert_eq!(result.summary, "Found 3 TODOs");
        assert_eq!(result.tool_calls_made, 5);
    }

    #[test]
    fn test_task_result_failure() {
        let result = TaskResult::failure(
            "task-1".to_string(),
            "agent-1".to_string(),
            "Timeout".to_string(),
        );
        assert!(!result.success);
        assert!(result.files_affected.is_empty());
    }

    #[test]
    fn test_sub_agent_role() {
        assert_eq!(SubAgentRole::General, SubAgentRole::General);
        assert_eq!(SubAgentRole::Explorer, SubAgentRole::Explorer);
        assert_eq!(SubAgentRole::Coder, SubAgentRole::Coder);
        assert_eq!(SubAgentRole::Reviewer, SubAgentRole::Reviewer);
    }
}