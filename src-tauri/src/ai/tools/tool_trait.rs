use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;


/// Tool trait — every tool implements this
#[async_trait]
pub trait Tool: Send + Sync {
    /// Tool name (snake_case, no spaces)
    fn name(&self) -> &str;

    /// Description shown to the LLM
    fn description(&self) -> &str;

    /// JSON Schema for input validation
    fn input_schema(&self) -> Value;

    /// Execute the tool with given arguments
    async fn execute(&self, args: Value, runtime: &ToolRuntime) -> ToolResult;

    /// Trust tier classification
    fn trust_tier(&self) -> TrustTier {
        TrustTier::Standard
    }

    /// Can this tool be auto-approved in autonomy mode?
    fn auto_approvable(&self) -> bool {
        false
    }

    /// Return directly to user without another LLM call?
    fn return_direct(&self) -> bool {
        false
    }

    /// Tool category for organization
    fn category(&self) -> ToolCategory {
        ToolCategory::FileSystem
    }

    /// Maximum execution timeout in seconds
    fn timeout_secs(&self) -> u64 {
        30
    }
}

/// Runtime provided to tool execution (simplified — full version in runtime.rs)
pub struct ToolRuntime {
    /// Project path
    pub project_path: std::path::PathBuf,
    /// Session ID
    pub session_id: String,
}

/// Tool execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    /// Text output (sent to LLM)
    pub content: String,
    /// Supplementary data (NOT sent to LLM)
    pub artifact: Option<Value>,
    /// Whether execution succeeded
    pub success: bool,
    /// Token count of the result
    pub token_count: usize,
    /// Execution time in milliseconds
    pub execution_time_ms: u64,
    /// Tool call ID for correlation
    pub tool_call_id: String,
}

impl ToolResult {
    /// Create a successful result
    pub fn success(tool_call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            content: content.into(),
            artifact: None,
            success: true,
            token_count: 0,
            execution_time_ms: 0,
            tool_call_id: tool_call_id.into(),
        }
    }

    /// Create an error result
    pub fn error(tool_call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            content: content.into(),
            artifact: None,
            success: false,
            token_count: 0,
            execution_time_ms: 0,
            tool_call_id: tool_call_id.into(),
        }
    }

    /// Set execution time
    pub fn with_time_ms(mut self, ms: u64) -> Self {
        self.execution_time_ms = ms;
        self
    }

    /// Set token count
    pub fn with_tokens(mut self, tokens: usize) -> Self {
        self.token_count = tokens;
        self
    }

    /// Set artifact data
    pub fn with_artifact(mut self, artifact: Value) -> Self {
        self.artifact = Some(artifact);
        self
    }
}

/// Tool categories for organization
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ToolCategory {
    FileSystem,
    Search,
    Execution,
    Analysis,
    Agent,
    Vcs,
    External,
}

impl ToolCategory {
    /// Get all categories
    pub fn all() -> &'static [ToolCategory] {
        &[
            Self::FileSystem,
            Self::Search,
            Self::Execution,
            Self::Analysis,
            Self::Agent,
            Self::Vcs,
            Self::External,
        ]
    }

    /// Get category name
    pub fn name(&self) -> &'static str {
        match self {
            Self::FileSystem => "file_system",
            Self::Search => "search",
            Self::Execution => "execution",
            Self::Analysis => "analysis",
            Self::Agent => "agent",
            Self::Vcs => "vcs",
            Self::External => "external",
        }
    }
}

/// Trust tier for permission decisions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TrustTier {
    /// Safe — auto-approve in autonomy mode
    Safe,
    /// Standard — may ask depending on settings
    Standard,
    /// Destructive — always ask
    Destructive,
}

impl TrustTier {
    /// Check if this tier requires user approval
    fn requires_approval(&self) -> bool {
        matches!(self, Self::Destructive)
    }
}

/// Permission decision for a tool call
#[derive(Debug, Clone)]
pub enum PermissionDecision {
    /// Allow the tool call
    Allow { reason: String },
    /// Ask user for approval
    Ask {
        reason: String,
        card: super::context::ToolContext, // Placeholder
    },
    /// Deny the tool call
    Deny { reason: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_result_success() {
        let result = ToolResult::success("call-1", "File contents");
        assert!(result.success);
        assert_eq!(result.content, "File contents");
        assert_eq!(result.tool_call_id, "call-1");
    }

    #[test]
    fn test_tool_result_error() {
        let result = ToolResult::error("call-1", "File not found");
        assert!(!result.success);
        assert_eq!(result.content, "File not found");
    }

    #[test]
    fn test_tool_result_builder() {
        let result = ToolResult::success("call-1", "output")
            .with_time_ms(150)
            .with_tokens(42)
            .with_artifact(serde_json::json!({"key": "value"}));
        assert_eq!(result.execution_time_ms, 150);
        assert_eq!(result.token_count, 42);
        assert!(result.artifact.is_some());
    }

    #[test]
    fn test_tool_category() {
        assert_eq!(ToolCategory::FileSystem.name(), "file_system");
        assert_eq!(ToolCategory::Search.name(), "search");
        assert_eq!(ToolCategory::Execution.name(), "execution");
        assert_eq!(ToolCategory::all().len(), 7);
    }

    #[test]
    fn test_trust_tier() {
        assert!(!TrustTier::Safe.requires_approval());
        assert!(!TrustTier::Standard.requires_approval());
        assert!(TrustTier::Destructive.requires_approval());
    }

    #[test]
    fn test_tool_result_serialization() {
        let result = ToolResult::success("call-1", "content");
        let json = serde_json::to_string(&result).unwrap();
        let deserialized: ToolResult = serde_json::from_str(&json).unwrap();
        assert!(deserialized.success);
    }
}
