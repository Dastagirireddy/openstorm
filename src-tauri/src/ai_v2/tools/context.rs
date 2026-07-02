use std::path::PathBuf;

use super::super::messages::MessageMetadata;

/// Immutable per-invocation context for tool execution
#[derive(Debug, Clone)]
pub struct ToolContext {
    /// Project root path
    pub project_path: PathBuf,
    /// Model name being used
    pub model_name: String,
    /// Session ID
    pub session_id: String,
    /// Agent ID
    pub agent_id: String,
    /// Agent role
    pub agent_role: AgentRole,
    /// Max characters for tool results
    pub max_result_chars: usize,
}

impl ToolContext {
    /// Create a new tool context
    pub fn new(
        project_path: impl Into<PathBuf>,
        model_name: impl Into<String>,
        session_id: impl Into<String>,
        agent_id: impl Into<String>,
    ) -> Self {
        Self {
            project_path: project_path.into(),
            model_name: model_name.into(),
            session_id: session_id.into(),
            agent_id: agent_id.into(),
            agent_role: AgentRole::Implementer,
            max_result_chars: 100_000,
        }
    }

    /// Set agent role
    pub fn with_role(mut self, role: AgentRole) -> Self {
        self.agent_role = role;
        self
    }

    /// Set max result chars
    pub fn with_max_result_chars(mut self, max: usize) -> Self {
        self.max_result_chars = max;
        self
    }

    /// Create metadata from this context
    pub fn metadata(&self) -> MessageMetadata {
        MessageMetadata::with_agent(&self.session_id, &self.agent_id)
    }
}

/// Agent roles determine tool access permissions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum AgentRole {
    /// Full access to all tools
    Implementer,
    /// Read-only access
    Explorer,
    /// Read-only + review tools
    Reviewer,
    /// All tools + spawn agents
    Orchestrator,
    /// Inherited from parent (minus spawn)
    SubAgent,
}

impl AgentRole {
    /// Check if this role can write files
    pub fn can_write(&self) -> bool {
        matches!(self, Self::Implementer | Self::Orchestrator)
    }

    /// Check if this role can execute commands
    pub fn can_execute(&self) -> bool {
        matches!(self, Self::Implementer | Self::Orchestrator | Self::SubAgent)
    }

    /// Check if this role can spawn sub-agents
    pub fn can_spawn(&self) -> bool {
        matches!(self, Self::Orchestrator)
    }
}

/// Execution info for the current tool call
#[derive(Debug, Clone)]
pub struct ExecutionInfo {
    /// Thread ID
    pub thread_id: String,
    /// Run ID
    pub run_id: String,
    /// Attempt number (for retries)
    pub attempt: u32,
}

impl ExecutionInfo {
    /// Create new execution info
    pub fn new(run_id: impl Into<String>) -> Self {
        Self {
            thread_id: uuid::Uuid::new_v4().to_string(),
            run_id: run_id.into(),
            attempt: 1,
        }
    }

    /// Create with specific attempt number
    pub fn with_attempt(mut self, attempt: u32) -> Self {
        self.attempt = attempt;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_context_new() {
        let ctx = ToolContext::new("/project", "gpt-4", "session-1", "agent-1");
        assert_eq!(ctx.project_path, PathBuf::from("/project"));
        assert_eq!(ctx.model_name, "gpt-4");
        assert_eq!(ctx.session_id, "session-1");
        assert_eq!(ctx.agent_id, "agent-1");
    }

    #[test]
    fn test_tool_context_builder() {
        let ctx = ToolContext::new("/project", "gpt-4", "session-1", "agent-1")
            .with_role(AgentRole::Explorer)
            .with_max_result_chars(50_000);
        assert_eq!(ctx.agent_role, AgentRole::Explorer);
        assert_eq!(ctx.max_result_chars, 50_000);
    }

    #[test]
    fn test_agent_role_permissions() {
        assert!(AgentRole::Implementer.can_write());
        assert!(AgentRole::Implementer.can_execute());
        assert!(!AgentRole::Implementer.can_spawn());

        assert!(!AgentRole::Explorer.can_write());
        assert!(!AgentRole::Explorer.can_execute());

        assert!(AgentRole::Orchestrator.can_write());
        assert!(AgentRole::Orchestrator.can_execute());
        assert!(AgentRole::Orchestrator.can_spawn());

        assert!(!AgentRole::SubAgent.can_write());
        assert!(AgentRole::SubAgent.can_execute());
        assert!(!AgentRole::SubAgent.can_spawn());
    }

    #[test]
    fn test_execution_info() {
        let info = ExecutionInfo::new("run-1");
        assert_eq!(info.run_id, "run-1");
        assert_eq!(info.attempt, 1);
    }

    #[test]
    fn test_execution_info_with_attempt() {
        let info = ExecutionInfo::new("run-1").with_attempt(3);
        assert_eq!(info.attempt, 3);
    }
}
