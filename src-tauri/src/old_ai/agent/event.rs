use super::types::FileModification;
use super::types::TelemetryField;
use crate::ai::provider::Usage;

/// Events emitted during agent execution.
///
/// Each variant represents a distinct UI update or lifecycle event
/// that the frontend can react to.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type")]
pub enum AgentEvent {
    /// Agent is thinking or calling a tool.
    #[serde(rename = "thinking")]
    Thinking { message: String },

    /// Plan steps updated.
    #[serde(rename = "plan_update")]
    PlanUpdate { steps: Vec<super::types::PlanStep> },

    /// TODO items updated.
    #[serde(rename = "todo_update")]
    TodoUpdate { todos: Vec<super::types::TodoItem> },

    /// A tool is being executed.
    #[serde(rename = "tool_use")]
    ToolUse {
        tool_name: String,
        arguments: String,
    },

    /// Tool execution result.
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_name: String,
        result: String,
    },

    /// Tool requires user approval before execution.
    #[serde(rename = "tool_approval_required")]
    ToolApprovalRequired {
        tool_name: String,
        arguments: String,
        preview: String,
    },

    /// Streaming text token.
    #[serde(rename = "text_delta")]
    TextDelta { content: String },

    /// Final assistant response.
    #[serde(rename = "response")]
    Response {
        content: String,
        tool_calls_made: u32,
        usage: Option<Usage>,
    },

    /// Error occurred.
    #[serde(rename = "error")]
    Error { message: String },

    /// Context window status update.
    #[serde(rename = "context_status")]
    ContextStatus {
        tokens_used: usize,
        tokens_max: usize,
        utilization: f64,
    },

    /// Cost tracking update.
    #[serde(rename = "cost_update")]
    CostUpdate {
        model: String,
        prompt_tokens: u32,
        completion_tokens: u32,
        cost: f64,
    },

    /// Streaming tool output (partial, during execution).
    #[serde(rename = "tool_output")]
    ToolOutput {
        tool_name: String,
        output_type: String,
        data: String,
    },

    /// Tool needs interactive input (e.g., sudo password).
    #[serde(rename = "tool_input_required")]
    ToolInputRequired {
        tool_name: String,
        prompt: String,
    },

    /// Structured telemetry data from a tool execution.
    #[serde(rename = "tool_telemetry")]
    ToolTelemetry {
        tool_name: String,
        fields: Vec<TelemetryField>,
    },

    /// Execution summary emitted at the end of the agent loop.
    #[serde(rename = "execution_summary")]
    ExecutionSummary {
        status: String,
        files_modified: Vec<FileModification>,
        total_tool_calls: u32,
        duration_ms: u64,
        cost_summary: super::types::CostSnapshot,
    },
}
