/// Status of a plan step.
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PlanStepStatus {
    Pending,
    InProgress,
    Done,
    Failed,
}

/// A single step in the agent's plan.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PlanStep {
    pub step: u32,
    pub description: String,
    pub status: PlanStepStatus,
}

/// Status of a TODO item.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TodoStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}

/// Priority of a TODO item.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TodoPriority {
    Low,
    Medium,
    High,
}

/// A single TODO item for tracking progress.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TodoItem {
    pub id: String,
    pub content: String,
    pub status: TodoStatus,
    pub priority: TodoPriority,
}

impl TodoItem {
    /// Returns the status as a string slice.
    pub fn status_str(&self) -> &str {
        match self.status {
            TodoStatus::Pending => "pending",
            TodoStatus::InProgress => "in_progress",
            TodoStatus::Completed => "completed",
            TodoStatus::Failed => "failed",
        }
    }

    /// Returns the priority as a string slice.
    pub fn priority_str(&self) -> &str {
        match self.priority {
            TodoPriority::Low => "low",
            TodoPriority::Medium => "medium",
            TodoPriority::High => "high",
        }
    }
}

/// Type of a telemetry field value.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TelemetryFieldType {
    Text,
    Link,
    Success,
    Error,
}

/// A single key-value field in a tool's telemetry box.
#[derive(Debug, Clone, serde::Serialize)]
pub struct TelemetryField {
    pub key: String,
    pub value: String,
    pub field_type: TelemetryFieldType,
}

/// A line in a unified diff.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DiffLine {
    pub line_type: String,
    pub line_num: u32,
    pub content: String,
}

/// A file modification tracked during agent execution.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileModification {
    pub path: String,
    pub diff: Vec<DiffLine>,
    pub lines_added: u32,
    pub lines_removed: u32,
}

/// Snapshot of cost data for execution summary.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CostSnapshot {
    pub total_prompt_tokens: u32,
    pub total_completion_tokens: u32,
    pub total_cost: f64,
}

/// Truncate a string to a safe UTF-8 char boundary.
///
/// Prevents panics from slicing inside multi-byte characters.
///
/// # Arguments
/// * `s` - The string to truncate.
/// * `max_bytes` - Maximum byte length.
pub fn truncate_to_boundary(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = 0;
    for (i, c) in s.char_indices() {
        let char_end = i + c.len_utf8();
        if char_end > max_bytes {
            break;
        }
        end = char_end;
    }
    &s[..end]
}
