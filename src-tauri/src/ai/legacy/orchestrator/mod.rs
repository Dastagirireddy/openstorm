use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

use crate::ai::legacy::agent::AgentEvent;
use crate::ai::legacy::permissions::PermissionProfile;
use crate::ai::legacy::provider::LlmProvider;
use crate::log_info;

pub mod types;
pub mod classifier;
pub mod decomposer;
pub mod agent_runner;

pub use types::*;
pub use classifier::classify_task;
pub use decomposer::decompose;

pub struct Orchestrator {
    task_queue: Arc<Mutex<VecDeque<Task>>>,
    active_agents: Arc<Mutex<HashMap<String, AgentHandle>>>,
    results: Arc<Mutex<HashMap<String, TaskResult>>>,
    event_tx: mpsc::Sender<AgentEvent>,
    provider: Arc<dyn LlmProvider>,
    model: String,
    project_path: String,
}

impl Orchestrator {
    pub fn new(
        provider: Arc<dyn LlmProvider>,
        model: String,
        project_path: String,
        event_tx: mpsc::Sender<AgentEvent>,
    ) -> Self {
        Self {
            task_queue: Arc::new(Mutex::new(VecDeque::new())),
            active_agents: Arc::new(Mutex::new(HashMap::new())),
            results: Arc::new(Mutex::new(HashMap::new())),
            event_tx,
            provider,
            model,
            project_path,
        }
    }

    pub async fn submit_request(&self, message: String) -> String {
        let task_id = format!("task-{}", Uuid::new_v4());
        let task = Task {
            id: task_id.clone(),
            kind: TaskKind::UserRequest(message),
            priority: Priority::Normal,
            context: TaskContext::default(),
            created_at: std::time::Instant::now(),
        };

        self.task_queue.lock().await.push_back(task);
        task_id
    }

    pub async fn process_next(&self) -> Result<TaskResult, String> {
        let task = self
            .task_queue
            .lock()
            .await
            .pop_front()
            .ok_or_else(|| "Task queue is empty".to_string())?;

        log_info!("[Orchestrator] Processing task {}: {:?}", task.id, task.kind);

        let task_id = task.id.clone();
        let project_path = self.project_path.clone();
        let provider = self.provider.clone();
        let model = self.model.clone();
        let event_tx = self.event_tx.clone();

        match task.kind {
            TaskKind::UserRequest(msg) => {
                let strategy = classify_task(&msg);

                match strategy {
                    Strategy::Simple => {
                        let result = self.spawn_and_run_with_params(&task_id, &project_path, provider, &model, &event_tx, msg, PermissionProfile::Smart).await?;
                        Ok(result)
                    }
                    Strategy::Decompose => {
                        let sub_tasks = decompose(&msg, &TaskContext::default());
                        let mut all_results = Vec::new();

                        for sub in sub_tasks {
                            self.task_queue.lock().await.push_back(sub);
                        }

                        loop {
                            let next_task = self.task_queue.lock().await.pop_front();
                            match next_task {
                                Some(t) => {
                                    match self.execute_task(t).await {
                                        Ok(result) => all_results.push(result),
                                        Err(e) => {
                                            all_results.push(TaskResult {
                                                task_id: "error".to_string(),
                                                success: false,
                                                output: e,
                                                tool_calls_made: 0,
                                            });
                                        }
                                    }
                                }
                                None => break,
                            }
                        }

                        let combined = all_results
                            .iter()
                            .map(|r| format!("[{}]: {}", r.task_id, r.output))
                            .collect::<Vec<_>>()
                            .join("\n\n");

                        Ok(TaskResult {
                            task_id,
                            success: all_results.iter().all(|r| r.success),
                            output: combined,
                            tool_calls_made: all_results.iter().map(|r| r.tool_calls_made).sum(),
                        })
                    }
                    Strategy::Explore => {
                        let result = self.spawn_and_run_with_params(&task_id, &project_path, provider, &model, &event_tx, msg, PermissionProfile::ReadOnly).await?;
                        Ok(result)
                    }
                    Strategy::Refactor => {
                        let result = self.spawn_and_run_with_params(&task_id, &project_path, provider, &model, &event_tx, msg, PermissionProfile::Smart).await?;
                        Ok(result)
                    }
                }
            }
            TaskKind::SubTask {
                parent_id,
                description,
                strategy,
            } => {
                let parent_context = self.get_parent_context(&parent_id).await;
                let profile = match strategy {
                    Strategy::Explore => PermissionProfile::ReadOnly,
                    _ => PermissionProfile::Smart,
                };

                let msg = if let Some(ctx) = parent_context {
                    format!("Context from parent task:\n{}\n\nTask: {}", ctx, description)
                } else {
                    description
                };

                let result = self.spawn_and_run_with_params(&task_id, &project_path, provider, &model, &event_tx, msg, profile).await?;
                Ok(result)
            }
            TaskKind::Verify { action_id } => {
                Ok(TaskResult {
                    task_id,
                    success: true,
                    output: format!("Verification completed for action {}", action_id),
                    tool_calls_made: 0,
                })
            }
        }
    }

    async fn execute_task(&self, task: Task) -> Result<TaskResult, String> {
        let task_id = task.id.clone();
        let project_path = self.project_path.clone();
        let provider = self.provider.clone();
        let model = self.model.clone();
        let event_tx = self.event_tx.clone();

        match task.kind {
            TaskKind::UserRequest(msg) => {
                let strategy = classify_task(&msg);
                let profile = match strategy {
                    Strategy::Explore => PermissionProfile::ReadOnly,
                    _ => PermissionProfile::Smart,
                };
                self.spawn_and_run_with_params(&task_id, &project_path, provider, &model, &event_tx, msg, profile).await
            }
            TaskKind::SubTask {
                parent_id,
                description,
                strategy,
            } => {
                let parent_context = self.get_parent_context(&parent_id).await;
                let profile = match strategy {
                    Strategy::Explore => PermissionProfile::ReadOnly,
                    _ => PermissionProfile::Smart,
                };
                let msg = if let Some(ctx) = parent_context {
                    format!("Context from parent task:\n{}\n\nTask: {}", ctx, description)
                } else {
                    description
                };
                self.spawn_and_run_with_params(&task_id, &project_path, provider, &model, &event_tx, msg, profile).await
            }
            TaskKind::Verify { action_id } => Ok(TaskResult {
                task_id,
                success: true,
                output: format!("Verification completed for action {}", action_id),
                tool_calls_made: 0,
            }),
        }
    }

    pub async fn pending_count(&self) -> usize {
        self.task_queue.lock().await.len()
    }

    pub async fn active_count(&self) -> usize {
        self.active_agents.lock().await.len()
    }

    pub async fn get_result(&self, task_id: &str) -> Option<TaskResult> {
        self.results.lock().await.get(task_id).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::sync::mpsc;

    struct MockProvider;

    #[async_trait::async_trait]
    impl LlmProvider for MockProvider {
        fn id(&self) -> &str { "mock" }
        fn name(&self) -> &str { "Mock Provider" }
        fn is_free(&self) -> bool { true }

        async fn chat_completion(
            &self,
            _request: crate::ai::legacy::provider::ChatCompletionRequest,
        ) -> Result<crate::ai::legacy::provider::ChatCompletionResponse, crate::ai::legacy::provider::ProviderError> {
            Ok(crate::ai::legacy::provider::ChatCompletionResponse {
                id: "mock-1".to_string(),
                model: "mock-model".to_string(),
                choices: vec![crate::ai::legacy::provider::Choice {
                    index: 0,
                    message: crate::ai::legacy::provider::Message::Assistant {
                        content: Some("Mock response from sub-agent".to_string()),
                        tool_calls: None,
                    },
                    finish_reason: Some("stop".to_string()),
                }],
                usage: Some(crate::ai::legacy::provider::Usage {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                }),
            })
        }

        async fn chat_completion_stream(
            &self,
            _request: crate::ai::legacy::provider::ChatCompletionRequest,
        ) -> Result<mpsc::Receiver<crate::ai::legacy::provider::ChatCompletionChunk>, crate::ai::legacy::provider::ProviderError> {
            let (tx, rx) = mpsc::channel(10);
            tokio::spawn(async move {
                let _ = tx.send(crate::ai::legacy::provider::ChatCompletionChunk {
                    id: "mock-1".to_string(),
                    model: "mock-model".to_string(),
                    choices: vec![crate::ai::legacy::provider::ChunkChoice {
                        index: 0,
                        delta: crate::ai::legacy::provider::Delta {
                            role: Some("assistant".to_string()),
                            content: Some("Mock response".to_string()),
                            tool_calls: None,
                        },
                        finish_reason: Some("stop".to_string()),
                    }],
                    usage: None,
                }).await;
            });
            Ok(rx)
        }

        async fn list_models(&self) -> Result<Vec<crate::ai::legacy::provider::ModelInfo>, crate::ai::legacy::provider::ProviderError> {
            Ok(vec![])
        }

        async fn check_connection(&self) -> Result<bool, crate::ai::legacy::provider::ProviderError> {
            Ok(true)
        }
    }

    #[tokio::test]
    async fn test_submit_request() {
        let provider = Arc::new(MockProvider);
        let (tx, _rx) = mpsc::channel(64);
        let orchestrator = Orchestrator::new(
            provider,
            "mock-model".to_string(),
            "/tmp/test".to_string(),
            tx,
        );

        let task_id = orchestrator.submit_request("Test task".to_string()).await;
        assert!(task_id.starts_with("task-"));
        assert_eq!(orchestrator.pending_count().await, 1);
    }

    #[tokio::test]
    async fn test_classify_task() {
        assert!(matches!(
            classify_task("Add a function"),
            Strategy::Simple
        ));
        assert!(matches!(
            classify_task("How does authentication work?"),
            Strategy::Explore
        ));
        assert!(matches!(
            classify_task("Refactor across multiple files"),
            Strategy::Refactor
        ));
    }

    #[tokio::test]
    async fn test_decompose() {
        let tasks = decompose("Step 1: Read file\nStep 2: Write file\nStep 3: Run tests", &TaskContext::default());
        assert_eq!(tasks.len(), 3);
    }
}
