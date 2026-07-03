use serde::{Deserialize, Serialize};

/// Agent events flowing through the system
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AgentEvent {
    /// Text delta from streaming
    TextDelta {
        content: String,
    },

    /// Tool call initiated
    ToolUse {
        name: String,
        args: serde_json::Value,
    },

    /// Tool execution result
    ToolResult {
        tool_call_id: String,
        output: String,
        is_error: bool,
    },

    /// Question request to user
    QuestionRequest {
        questions: Vec<QuestionEventData>,
    },

    /// Question answer from user
    QuestionAnswer {
        answers: Vec<QuestionAnswerData>,
    },

    /// Final response
    Response {
        content: String,
        tool_calls_made: u32,
        usage: Option<UsageData>,
    },

    /// Error occurred
    Error {
        message: String,
        code: Option<String>,
    },

    /// Progress update
    Progress {
        message: String,
        percent: Option<f32>,
    },

    /// Cost update
    CostUpdate {
        total_cost: f64,
        session_cost: f64,
    },

    /// Execution summary
    ExecutionSummary {
        total_tool_calls: u32,
        total_tokens: usize,
        total_cost: f64,
        duration_ms: u64,
    },

    /// Plan step update
    PlanUpdate {
        steps: Vec<PlanStepData>,
    },
}

/// Serializable plan step for frontend consumption
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStepData {
    pub step: u32,
    pub description: String,
    pub status: String,
}

/// Question event data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionEventData {
    pub id: String,
    pub text: String,
    pub kind: String,
    pub options: Vec<String>,
    pub default: Option<String>,
}

/// Question answer data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionAnswerData {
    pub id: String,
    pub value: String,
    pub values: Vec<String>,
}

/// Usage data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageData {
    pub input_tokens: usize,
    pub output_tokens: usize,
    pub total_tokens: usize,
    pub estimated_cost: Option<f64>,
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_event_text_delta() {
        let event = AgentEvent::TextDelta {
            content: "Hello".to_string(),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("TextDelta"));
        assert!(json.contains("Hello"));
    }

    #[test]
    fn test_agent_event_tool_use() {
        let event = AgentEvent::ToolUse {
            name: "read_file".to_string(),
            args: serde_json::json!({"path": "/test"}),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("ToolUse"));
        assert!(json.contains("read_file"));
    }

    #[test]
    fn test_agent_event_tool_result() {
        let event = AgentEvent::ToolResult {
            tool_call_id: "call-1".to_string(),
            output: "file contents".to_string(),
            is_error: false,
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("ToolResult"));
        // is_error is still serialized, just check the structure
        assert!(json.contains("call-1"));
    }

    #[test]
    fn test_agent_event_response() {
        let event = AgentEvent::Response {
            content: "Done".to_string(),
            tool_calls_made: 3,
            usage: Some(UsageData {
                input_tokens: 100,
                output_tokens: 50,
                total_tokens: 150,
                estimated_cost: Some(0.001),
            }),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("Response"));
        assert!(json.contains("150"));
    }

    #[test]
    fn test_agent_event_error() {
        let event = AgentEvent::Error {
            message: "Something failed".to_string(),
            code: Some("E001".to_string()),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("Error"));
    }

    #[test]
    fn test_usage_data() {
        let usage = UsageData {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
            estimated_cost: Some(0.001),
        };
        assert_eq!(usage.total_tokens, 150);
        assert!(usage.estimated_cost.is_some());
    }

    #[test]
    fn test_question_event_data() {
        let q = QuestionEventData {
            id: "q1".to_string(),
            text: "What?".to_string(),
            kind: "text".to_string(),
            options: vec![],
            default: None,
        };
        assert_eq!(q.id, "q1");
    }
}