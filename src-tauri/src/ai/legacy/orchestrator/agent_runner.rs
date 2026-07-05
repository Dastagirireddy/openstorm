use std::sync::Arc;

use tokio::sync::mpsc;

use crate::ai::legacy::agent::{Agent, AgentEvent};
use crate::ai::legacy::permissions::PermissionProfile;
use crate::ai::legacy::provider::LlmProvider;
use crate::{log_debug, log_info};

use super::types::{AgentHandle, TaskResult};

use super::Orchestrator;

impl Orchestrator {
    pub async fn spawn_and_run_with_params(
        &self,
        task_id: &str,
        project_path: &str,
        provider: Arc<dyn LlmProvider>,
        model: &str,
        event_tx: &mpsc::Sender<AgentEvent>,
        message: String,
        profile: PermissionProfile,
    ) -> Result<TaskResult, String> {
        log_info!("[Orchestrator] Spawning agent for task {}: {}", task_id, message);

        let _ = event_tx
            .send(AgentEvent::Thinking {
                message: format!("Starting sub-agent for: {}", message),
            })
            .await;

        let agent = Arc::new(Agent::with_permissions(
            provider,
            model.to_string(),
            project_path.to_string(),
            profile,
        ));

        let (abort_tx, mut abort_rx) = mpsc::channel::<()>(1);

        {
            let mut active = self.active_agents.lock().await;
            active.insert(
                task_id.to_string(),
                AgentHandle {
                    task_id: task_id.to_string(),
                    abort_tx,
                },
            );
        }

        let mut rx = agent.run(message, Vec::new());

        let mut final_response = String::new();
        let mut tool_calls_made = 0u32;
        let mut success = true;

        loop {
            tokio::select! {
                event = rx.recv() => {
                    match event {
                        Some(event) => {
                            match &event {
                                AgentEvent::Response { content, tool_calls_made: tc, .. } => {
                                    final_response = content.clone();
                                    tool_calls_made = *tc;
                                }
                                AgentEvent::Error { message } => {
                                    final_response = format!("Error: {}", message);
                                    success = false;
                                }
                                AgentEvent::ToolUse { tool_name, .. } => {
                                    log_info!("[SubAgent {}] Using tool: {}", task_id, tool_name);
                                }
                                AgentEvent::ToolResult { tool_name, result } => {
                                    log_debug!("[SubAgent {}] Tool {} result: {} chars", task_id, tool_name, result.len());
                                }
                                _ => {}
                            }
                        }
                        None => break,
                    }
                }
                _ = abort_rx.recv() => {
                    success = false;
                    final_response = "Task aborted".to_string();
                    break;
                }
            }
        }

        {
            let mut active = self.active_agents.lock().await;
            active.remove(task_id);
        }

        let result = TaskResult {
            task_id: task_id.to_string(),
            success,
            output: final_response.clone(),
            tool_calls_made,
        };

        {
            let mut results = self.results.lock().await;
            results.insert(task_id.to_string(), result.clone());
        }

        let result_message = if success {
            format!(
                "**Sub-agent completed:**\n\n{}\n\n*({} tool calls made)*",
                if final_response.len() > 500 {
                    format!("{}...", &final_response[..500])
                } else {
                    final_response
                },
                tool_calls_made
            )
        } else {
            format!("**Sub-agent failed:** {}", final_response)
        };

        let _ = event_tx
            .send(AgentEvent::Response {
                content: result_message,
                tool_calls_made,
                usage: None,
            })
            .await;

        log_info!(
            "[Orchestrator] Task {} completed: success={}, tool_calls={}",
            task_id,
            result.success,
            result.tool_calls_made
        );

        Ok(result)
    }

    pub async fn abort_task(&self, task_id: &str) -> Result<(), String> {
        let active = self.active_agents.lock().await;
        if let Some(handle) = active.get(task_id) {
            let _ = handle.abort_tx.send(()).await;
            Ok(())
        } else {
            Err(format!("No active task with id: {}", task_id))
        }
    }

    pub(super) async fn get_parent_context(&self, parent_id: &str) -> Option<String> {
        let results = self.results.lock().await;
        results.get(parent_id).map(|r| r.output.clone())
    }
}
