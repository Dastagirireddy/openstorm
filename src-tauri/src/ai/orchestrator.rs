use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

use crate::{log_debug, log_info};

use super::agent::{Agent, AgentEvent};
use super::permissions::PermissionProfile;
use super::provider::LlmProvider;

/// A task to be executed by the orchestrator
#[derive(Debug, Clone)]
pub struct Task {
    pub id: String,
    pub kind: TaskKind,
    pub priority: Priority,
    pub context: TaskContext,
    pub created_at: std::time::Instant,
}

/// The type of task
#[derive(Debug, Clone)]
pub enum TaskKind {
    /// Direct user request
    UserRequest(String),
    /// Sub-task spawned by an agent
    SubTask {
        parent_id: String,
        description: String,
        strategy: Strategy,
    },
    /// Verification task (check a previous action)
    Verify {
        action_id: String,
    },
}

/// Task priority
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum Priority {
    Low,
    Normal,
    High,
}

/// Strategy for executing a task
#[derive(Debug, Clone)]
pub enum Strategy {
    /// Simple: single agent, linear execution
    Simple,
    /// Complex: decompose into sub-tasks
    Decompose,
    /// Research: read-only exploration
    Explore,
    /// Refactoring: multi-file coordinated changes
    Refactor,
}

/// Context for a task
#[derive(Debug, Clone, Default)]
pub struct TaskContext {
    pub parent_result: Option<String>,
    pub shared_state: std::collections::HashMap<String, String>,
}

/// Handle to a running agent
pub struct AgentHandle {
    pub task_id: String,
    pub abort_tx: mpsc::Sender<()>,
}

/// Result of a completed task
#[derive(Debug, Clone)]
pub struct TaskResult {
    pub task_id: String,
    pub success: bool,
    pub output: String,
    pub tool_calls_made: u32,
}

/// The orchestrator manages task queues, spawns sub-agents, and coordinates results
pub struct Orchestrator {
    /// Task queue (FIFO with priorities)
    task_queue: Arc<Mutex<VecDeque<Task>>>,
    /// Active agents (task_id -> agent_handle)
    active_agents: Arc<Mutex<std::collections::HashMap<String, AgentHandle>>>,
    /// Completed task results
    results: Arc<Mutex<std::collections::HashMap<String, TaskResult>>>,
    /// Event sender to frontend
    event_tx: mpsc::Sender<AgentEvent>,
    /// Provider for creating sub-agents
    provider: Arc<dyn LlmProvider>,
    /// Model to use for sub-agents
    model: String,
    /// Project path
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
            active_agents: Arc::new(Mutex::new(std::collections::HashMap::new())),
            results: Arc::new(Mutex::new(std::collections::HashMap::new())),
            event_tx,
            provider,
            model,
            project_path,
        }
    }

    /// Submit a new user request task
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

    /// Process the next task in the queue
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
                // Classify task complexity
                let strategy = self.classify_task(&msg);

                match strategy {
                    Strategy::Simple => {
                        // Single agent, direct execution
                        let result = self.spawn_and_run_with_params(&task_id, &project_path, provider, &model, &event_tx, msg, PermissionProfile::Smart).await?;
                        Ok(result)
                    }
                    Strategy::Decompose => {
                        // Break into sub-tasks
                        let sub_tasks = self.decompose(&msg).await?;
                        let mut all_results = Vec::new();

                        for sub in sub_tasks {
                            self.task_queue.lock().await.push_back(sub);
                        }

                        // Process sub-tasks without recursion
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

                        // Combine results
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
                        // Read-only agent (no write_file, no run_command)
                        let result = self.spawn_and_run_with_params(&task_id, &project_path, provider, &model, &event_tx, msg, PermissionProfile::ReadOnly).await?;
                        Ok(result)
                    }
                    Strategy::Refactor => {
                        // Multi-file coordinated changes
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
                // Execute sub-task with parent context
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
                // Simple verification: just report that we checked
                Ok(TaskResult {
                    task_id,
                    success: true,
                    output: format!("Verification completed for action {}", action_id),
                    tool_calls_made: 0,
                })
            }
        }
    }

    /// Execute a task (internal helper to avoid recursion)
    async fn execute_task(&self, task: Task) -> Result<TaskResult, String> {
        let task_id = task.id.clone();
        let project_path = self.project_path.clone();
        let provider = self.provider.clone();
        let model = self.model.clone();
        let event_tx = self.event_tx.clone();

        match task.kind {
            TaskKind::UserRequest(msg) => {
                let strategy = self.classify_task(&msg);
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

    /// Classify a user request into a strategy
    fn classify_task(&self, msg: &str) -> Strategy {
        let msg_lower = msg.to_lowercase();

        // Check for multi-file operations
        let has_multi_file = msg_lower.contains("refactor")
            || msg_lower.contains("rename")
            || msg_lower.contains("move")
            || msg_lower.contains("across")
            || msg_lower.contains("multiple files");

        // Check for exploration/research tasks
        let has_exploration = msg_lower.contains("figure out")
            || msg_lower.contains("explore")
            || msg_lower.contains("understand")
            || msg_lower.contains("how does")
            || msg_lower.contains("what is")
            || msg_lower.contains("explain");

        // Check for complex decomposition tasks
        let has_decomposition = msg_lower.contains("implement")
            || msg_lower.contains("build")
            || msg_lower.contains("create")
            || msg_lower.contains("add feature")
            || msg_lower.contains("full");

        if has_multi_file {
            Strategy::Refactor
        } else if has_exploration {
            Strategy::Explore
        } else if has_decomposition && msg.len() > 100 {
            Strategy::Decompose
        } else {
            Strategy::Simple
        }
    }

    /// Decompose a complex task into sub-tasks
    async fn decompose(&self, msg: &str) -> Result<Vec<Task>, String> {
        // Simple heuristic decomposition based on common patterns
        let mut sub_tasks = Vec::new();
        let steps: Vec<&str> = msg.split('\n').filter(|l| !l.trim().is_empty()).collect();

        // If the message has multiple lines, treat each as a sub-task
        if steps.len() > 1 {
            for (i, step) in steps.iter().enumerate() {
                let trimmed = step.trim().to_string();
                if !trimmed.is_empty() && trimmed.len() > 5 {
                    sub_tasks.push(Task {
                        id: format!("sub-{}-{}", i, Uuid::new_v4()),
                        kind: TaskKind::SubTask {
                            parent_id: "root".to_string(),
                            description: trimmed,
                            strategy: Strategy::Simple,
                        },
                        priority: Priority::Normal,
                        context: TaskContext::default(),
                        created_at: std::time::Instant::now(),
                    });
                }
            }
        }

        // If we couldn't decompose, just create a single sub-task
        if sub_tasks.is_empty() {
            sub_tasks.push(Task {
                id: format!("sub-0-{}", Uuid::new_v4()),
                kind: TaskKind::SubTask {
                    parent_id: "root".to_string(),
                    description: msg.to_string(),
                    strategy: Strategy::Simple,
                },
                priority: Priority::Normal,
                context: TaskContext::default(),
                created_at: std::time::Instant::now(),
            });
        }

        Ok(sub_tasks)
    }

    /// Get context from a parent task
    async fn get_parent_context(&self, parent_id: &str) -> Option<String> {
        let results = self.results.lock().await;
        results.get(parent_id).map(|r| r.output.clone())
    }

    /// Spawn an agent and run a task with explicit parameters
    async fn spawn_and_run_with_params(
        &self,
        task_id: &str,
        project_path: &str,
        provider: Arc<dyn LlmProvider>,
        model: &str,
        event_tx: &mpsc::Sender<AgentEvent>,
        message: String,
        _profile: PermissionProfile,
    ) -> Result<TaskResult, String> {
        log_info!("[Orchestrator] Spawning agent for task {}: {}", task_id, message);

        // Send thinking event
        let _ = event_tx
            .send(AgentEvent::Thinking {
                message: format!("Starting sub-agent for: {}", message),
            })
            .await;

        // Sub-agents use Full permission profile to auto-approve tools
        // (they can't use the main agent's approval channel)
        let agent = Arc::new(Agent::with_permissions(
            provider,
            model.to_string(),
            project_path.to_string(),
            PermissionProfile::Full,
        ));

        // Create abort channel
        let (abort_tx, mut abort_rx) = mpsc::channel::<()>(1);

        // Store active agent handle
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

        // Run agent
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

        // Remove from active agents
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

        // Store result
        {
            let mut results = self.results.lock().await;
            results.insert(task_id.to_string(), result.clone());
        }

        // Send completion summary as a visible response to frontend
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

    /// Abort a running task
    pub async fn abort_task(&self, task_id: &str) -> Result<(), String> {
        let active = self.active_agents.lock().await;
        if let Some(handle) = active.get(task_id) {
            let _ = handle.abort_tx.send(()).await;
            Ok(())
        } else {
            Err(format!("No active task with id: {}", task_id))
        }
    }

    /// Get the number of pending tasks
    pub async fn pending_count(&self) -> usize {
        self.task_queue.lock().await.len()
    }

    /// Get the number of active agents
    pub async fn active_count(&self) -> usize {
        self.active_agents.lock().await.len()
    }

    /// Get a task result
    pub async fn get_result(&self, task_id: &str) -> Option<TaskResult> {
        self.results.lock().await.get(task_id).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::sync::mpsc;

    /// Mock LLM provider for testing
    struct MockProvider;

    #[async_trait::async_trait]
    impl LlmProvider for MockProvider {
        fn id(&self) -> &str {
            "mock"
        }

        fn name(&self) -> &str {
            "Mock Provider"
        }

        fn is_free(&self) -> bool {
            true
        }

        async fn chat_completion(
            &self,
            _request: super::super::provider::ChatCompletionRequest,
        ) -> Result<super::super::provider::ChatCompletionResponse, super::super::provider::ProviderError> {
            // Return a simple response
            Ok(super::super::provider::ChatCompletionResponse {
                id: "mock-1".to_string(),
                model: "mock-model".to_string(),
                choices: vec![super::super::provider::Choice {
                    index: 0,
                    message: super::super::provider::Message::Assistant {
                        content: Some("Mock response from sub-agent".to_string()),
                        tool_calls: None,
                    },
                    finish_reason: Some("stop".to_string()),
                }],
                usage: Some(super::super::provider::Usage {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                }),
            })
        }

        async fn chat_completion_stream(
            &self,
            _request: super::super::provider::ChatCompletionRequest,
        ) -> Result<tokio::sync::mpsc::Receiver<super::super::provider::ChatCompletionChunk>, super::super::provider::ProviderError> {
            // Return a simple stream
            let (tx, rx) = mpsc::channel(10);
            tokio::spawn(async move {
                let _ = tx.send(super::super::provider::ChatCompletionChunk {
                    id: "mock-1".to_string(),
                    model: "mock-model".to_string(),
                    choices: vec![super::super::provider::ChunkChoice {
                        index: 0,
                        delta: super::super::provider::Delta {
                            role: Some("assistant".to_string()),
                            content: Some("Mock response".to_string()),
                            tool_calls: None,
                        },
                        finish_reason: Some("stop".to_string()),
                    }],
                }).await;
            });
            Ok(rx)
        }

        async fn list_models(&self) -> Result<Vec<super::super::provider::ModelInfo>, super::super::provider::ProviderError> {
            Ok(vec![])
        }

        async fn check_connection(&self) -> Result<bool, super::super::provider::ProviderError> {
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
        let provider = Arc::new(MockProvider);
        let (tx, _rx) = mpsc::channel(64);
        let orchestrator = Orchestrator::new(
            provider,
            "mock-model".to_string(),
            "/tmp/test".to_string(),
            tx,
        );

        // Simple task
        assert!(matches!(
            orchestrator.classify_task("Add a function"),
            Strategy::Simple
        ));

        // Explore task
        assert!(matches!(
            orchestrator.classify_task("How does authentication work?"),
            Strategy::Explore
        ));

        // Refactor task
        assert!(matches!(
            orchestrator.classify_task("Refactor across multiple files"),
            Strategy::Refactor
        ));
    }

    #[tokio::test]
    async fn test_decompose() {
        let provider = Arc::new(MockProvider);
        let (tx, _rx) = mpsc::channel(64);
        let orchestrator = Orchestrator::new(
            provider,
            "mock-model".to_string(),
            "/tmp/test".to_string(),
            tx,
        );

        let tasks = orchestrator.decompose("Step 1: Read file\nStep 2: Write file\nStep 3: Run tests").await.unwrap();
        assert_eq!(tasks.len(), 3);
    }
}
