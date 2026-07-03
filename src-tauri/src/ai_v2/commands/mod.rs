pub mod state;

use std::sync::Arc;
use tauri::{command, AppHandle, Emitter, State};
use tokio::sync::mpsc;

use super::agent::AgentRuntime;
use super::messages::content::UsageMetadata;
use super::response_filter::events::{AgentEvent, PlanStepData};
use super::tools::tool_trait::ToolResult;
use super::tools::question_types::{QuestionAnswer, QuestionItem};
use state::AiV2State;

/// Chat request from frontend
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ChatRequest {
    pub message: String,
    pub history: Vec<serde_json::Value>,
    pub project_path: String,
    pub model: String,
    pub session_id: Option<String>,
}

/// Chat response to frontend
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChatResponse {
    pub content: String,
    pub tool_calls_made: u32,
    pub usage: Option<UsageMetadata>,
    pub success: bool,
}

/// Tool approval request
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ToolApprovalRequest {
    pub tool_call_id: String,
    pub approved: bool,
}

/// Spawn agent request
#[derive(Debug, Clone, serde::Deserialize)]
pub struct SpawnAgentRequest {
    pub task: String,
    pub role: String,
    pub parent_id: Option<String>,
}

/// Sub-agent status response
#[derive(Debug, Clone, serde::Serialize)]
pub struct SubAgentStatusResponse {
    pub task_id: String,
    pub status: String,
    pub summary: Option<String>,
}

/// Question response request
#[derive(Debug, Clone, serde::Deserialize)]
pub struct QuestionResponseRequest {
    pub answers: Vec<QuestionAnswer>,
}

// ═══════════════════════════════════════════════════════════════
// TAURI COMMANDS
// ═══════════════════════════════════════════════════════════════

/// Send a chat message to the AI agent
#[command]
pub async fn ai_v2_chat(
    app: AppHandle,
    state: State<'_, AiV2State>,
    request: ChatRequest,
) -> Result<ChatResponse, String> {
    let runtime: Arc<AgentRuntime> = {
        let rt = state.runtime.lock().await;
        rt.as_ref()
            .ok_or_else(|| "No agent runtime initialized".to_string())?
            .clone()
    };

    // Reset plan for new conversation
    runtime.set_plan_steps(Vec::new()).await;

    // Run the agent
    let mut rx = {
        let (tx, rx) = mpsc::channel(64);
        // For now, run in a spawned task since we need the runtime to be shared
        let runtime_clone = runtime.clone();
        let message = request.message.clone();
        tokio::spawn(async move {
            let result = runtime_clone.run(&message).await;
            match result {
                Ok(response) => {
                    let _ = tx.send(AgentEvent::Response {
                        content: response,
                        tool_calls_made: 0,
                        usage: None,
                    }).await;
                }
                Err(e) => {
                    let _ = tx.send(AgentEvent::Error {
                        message: e.to_string(),
                        code: None,
                    }).await;
                }
            }
        });
        rx
    };

    let mut final_response = String::new();
    while let Some(event) = rx.recv().await {
        let _ = app.emit("ai-v2:agent-event", &event);
        match &event {
            AgentEvent::Response { content, .. } => {
                final_response = content.clone();
            }
            AgentEvent::Error { message, .. } => {
                final_response = format!("Error: {}", message);
            }
            AgentEvent::PlanUpdate { steps } => {
                let _ = app.emit("ai-v2:plan-update", steps);
            }
            _ => {}
        }
    }

    Ok(ChatResponse {
        content: final_response,
        tool_calls_made: 0,
        usage: None,
        success: true,
    })
}

/// Approve or deny a tool execution
#[command]
pub async fn ai_v2_approve_tool(request: ToolApprovalRequest) -> Result<(), String> {
    // Placeholder: In real impl, this would send approval to permission service
    Ok(())
}

/// Abort the current agent execution
#[command]
pub async fn ai_v2_abort() -> Result<(), String> {
    // Placeholder: In real impl, this would cancel the running agent
    Ok(())
}

/// Spawn a sub-agent
#[command]
pub async fn ai_v2_spawn_agent(request: SpawnAgentRequest) -> Result<String, String> {
    // Placeholder: In real impl, this would use AgentSpawner
    Ok(format!("spawned-{}", uuid::Uuid::new_v4()))
}

/// Get sub-agent status
#[command]
pub async fn ai_v2_get_subagent_status(task_id: String) -> Result<SubAgentStatusResponse, String> {
    // Placeholder: In real impl, this would query the spawner
    Ok(SubAgentStatusResponse {
        task_id,
        status: "completed".to_string(),
        summary: None,
    })
}

/// Respond to a question from the AI
#[command]
pub async fn ai_v2_question_response(request: QuestionResponseRequest) -> Result<(), String> {
    // Placeholder: In real impl, this would send answers to QuestionTool
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_request_deserialize() {
        let json = r#"{
            "message": "hello",
            "history": [],
            "project_path": "/project",
            "model": "gpt-4",
            "session_id": null
        }"#;
        let req: ChatRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.message, "hello");
        assert_eq!(req.model, "gpt-4");
    }

    #[test]
    fn test_chat_response_serialize() {
        let resp = ChatResponse {
            content: "Hello!".to_string(),
            tool_calls_made: 0,
            usage: None,
            success: true,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("Hello!"));
    }

    #[test]
    fn test_tool_approval_request_deserialize() {
        let json = r#"{"tool_call_id": "tc-1", "approved": true}"#;
        let req: ToolApprovalRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.tool_call_id, "tc-1");
        assert!(req.approved);
    }

    #[test]
    fn test_spawn_agent_request_deserialize() {
        let json = r#"{"task": "search TODOs", "role": "explorer", "parent_id": null}"#;
        let req: SpawnAgentRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.task, "search TODOs");
        assert_eq!(req.role, "explorer");
    }

    #[test]
    fn test_sub_agent_status_serialize() {
        let resp = SubAgentStatusResponse {
            task_id: "t-1".to_string(),
            status: "running".to_string(),
            summary: None,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("running"));
    }

    #[tokio::test]
    async fn test_ai_chat_command() {
        let request = ChatRequest {
            message: "hello".to_string(),
            history: vec![],
            project_path: "/project".to_string(),
            model: "gpt-4".to_string(),
            session_id: None,
        };
        let resp = ai_v2_chat(request).await.unwrap();
        assert!(resp.success);
        assert!(resp.content.contains("Echo"));
    }

    #[tokio::test]
    async fn test_ai_approve_tool_command() {
        let req = ToolApprovalRequest {
            tool_call_id: "tc-1".to_string(),
            approved: true,
        };
        let result = ai_v2_approve_tool(req).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_ai_abort_command() {
        let result = ai_v2_abort().await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_ai_spawn_agent_command() {
        let req = SpawnAgentRequest {
            task: "search".to_string(),
            role: "explorer".to_string(),
            parent_id: None,
        };
        let resp = ai_v2_spawn_agent(req).await.unwrap();
        assert!(resp.starts_with("spawned-"));
    }

    #[tokio::test]
    async fn test_ai_get_subagent_status_command() {
        let resp = ai_v2_get_subagent_status("t-1".to_string()).await.unwrap();
        assert_eq!(resp.task_id, "t-1");
    }

    #[tokio::test]
    async fn test_ai_question_response_command() {
        let req = QuestionResponseRequest {
            answers: vec![],
        };
        let result = ai_v2_question_response(req).await;
        assert!(result.is_ok());
    }
}