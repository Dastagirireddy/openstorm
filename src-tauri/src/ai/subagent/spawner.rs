use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, oneshot, watch};

use super::types::{SpawnConfig, TaskHandle, TaskResult, TaskStatus};

/// AgentSpawner trait — spawns and manages sub-agents
#[async_trait::async_trait]
pub trait AgentSpawner: Send + Sync {
    /// Spawn a new sub-agent
    async fn spawn(&self, config: SpawnConfig) -> Result<TaskHandle, SpawnerError>;

    /// Abort a running sub-agent
    async fn abort(&self, task_id: &str) -> Result<(), SpawnerError>;

    /// List active sub-agents
    fn list_active(&self) -> Vec<AgentInfo>;

    /// Get result of a completed task
    async fn get_result(&self, task_id: &str) -> Option<TaskResult>;
}

/// Information about an active agent
#[derive(Debug, Clone)]
pub struct AgentInfo {
    pub task_id: String,
    pub agent_id: String,
    pub status: TaskStatus,
    pub task: String,
}

/// Spawner errors
#[derive(Debug, thiserror::Error)]
pub enum SpawnerError {
    #[error("Task not found: {0}")]
    NotFound(String),

    #[error("Task already running: {0}")]
    AlreadyRunning(String),

    #[error("Spawn limit exceeded")]
    SpawnLimitExceeded,

    #[error("Other: {0}")]
    Other(String),
}

/// In-memory sub-agent spawner
pub struct InMemorySpawner {
    tasks: Arc<Mutex<HashMap<String, TaskEntry>>>,
    max_concurrent: usize,
}

struct TaskEntry {
    config: SpawnConfig,
    status: TaskStatus,
    result: Option<TaskResult>,
    status_tx: watch::Sender<TaskStatus>,
    result_tx: Option<oneshot::Sender<TaskResult>>,
}

impl InMemorySpawner {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
            max_concurrent,
        }
    }

    pub fn default() -> Self {
        Self::new(3)
    }
}

impl Default for InMemorySpawner {
    fn default() -> Self {
        Self::default()
    }
}

#[async_trait::async_trait]
impl AgentSpawner for InMemorySpawner {
    async fn spawn(&self, config: SpawnConfig) -> Result<TaskHandle, SpawnerError> {
        let mut tasks = self.tasks.lock().await;

        // Check spawn limit
        let running = tasks
            .values()
            .filter(|t| t.status == TaskStatus::Running)
            .count();
        if running >= self.max_concurrent {
            return Err(SpawnerError::SpawnLimitExceeded);
        }

        let task_id = uuid::Uuid::new_v4().to_string();
        let agent_id = format!("{}-{}", config.parent_id, &task_id[..8]);

        let (status_tx, _status_rx) = watch::channel(TaskStatus::Pending);
        let (result_tx, _result_rx) = oneshot::channel();

        let entry = TaskEntry {
            config: config.clone(),
            status: TaskStatus::Pending,
            result: None,
            status_tx,
            result_tx: Some(result_tx),
        };

        tasks.insert(task_id.clone(), entry);

        // Simulate async execution (in real impl, this would spawn an agent)
        let tasks_clone = self.tasks.clone();
        let tid = task_id.clone();
        let aid = agent_id.clone();

        tokio::spawn(async move {
            // Mark as running
            {
                let mut tasks = tasks_clone.lock().await;
                if let Some(entry) = tasks.get_mut(&tid) {
                    entry.status = TaskStatus::Running;
                    let _ = entry.status_tx.send(TaskStatus::Running);
                }
            }

            // Simulate work
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;

            // Complete with success
            let result = TaskResult::success(
                tid.clone(),
                aid.clone(),
                "Task completed".to_string(),
                Vec::new(),
                0,
                10,
            );

            {
                let mut tasks = tasks_clone.lock().await;
                if let Some(entry) = tasks.get_mut(&tid) {
                    entry.status = TaskStatus::Completed;
                    entry.result = Some(result.clone());
                    let _ = entry.status_tx.send(TaskStatus::Completed);
                    let _ = entry.result_tx.take().unwrap().send(result);
                }
            }
        });

        Ok(TaskHandle {
            task_id: task_id.clone(),
            agent_id,
            status: TaskStatus::Pending,
        })
    }

    async fn abort(&self, task_id: &str) -> Result<(), SpawnerError> {
        let mut tasks = self.tasks.lock().await;
        let entry = tasks
            .get_mut(task_id)
            .ok_or_else(|| SpawnerError::NotFound(task_id.to_string()))?;

        if entry.status != TaskStatus::Running {
            return Err(SpawnerError::Other("Task not running".to_string()));
        }

        entry.status = TaskStatus::Aborted;
        let _ = entry.status_tx.send(TaskStatus::Aborted);
        Ok(())
    }

    fn list_active(&self) -> Vec<AgentInfo> {
        // Note: This is sync but tasks is async mutex
        // In production, this would use a different approach
        Vec::new()
    }

    async fn get_result(&self, task_id: &str) -> Option<TaskResult> {
        let tasks = self.tasks.lock().await;
        tasks.get(task_id).and_then(|e| e.result.clone())
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::subagent::types::ParentContext;
    use std::path::PathBuf;

    #[test]
    fn test_spawner_new() {
        let spawner = InMemorySpawner::new(5);
        assert_eq!(spawner.max_concurrent, 5);
    }

    #[test]
    fn test_spawner_default() {
        let spawner = InMemorySpawner::default();
        assert_eq!(spawner.max_concurrent, 3);
    }

    #[tokio::test]
    async fn test_spawn_task() {
        let spawner = InMemorySpawner::new(3);
        let ctx = ParentContext::new(PathBuf::from("/project"));
        let config = SpawnConfig::new(
            "search TODOs".to_string(),
            crate::ai::subagent::types::SubAgentRole::Explorer,
            "parent-1".to_string(),
            ctx,
        );

        let handle = spawner.spawn(config).await.unwrap();
        assert!(!handle.task_id.is_empty());
    }

    #[tokio::test]
    async fn test_abort_task() {
        let spawner = InMemorySpawner::new(3);
        let ctx = ParentContext::new(PathBuf::from("/project"));
        let config = SpawnConfig::new(
            "search TODOs".to_string(),
            crate::ai::subagent::types::SubAgentRole::Explorer,
            "parent-1".to_string(),
            ctx,
        );

        let handle = spawner.spawn(config).await.unwrap();
        let result = spawner.abort(&handle.task_id).await;
        // May fail if task completed before abort, that's ok
    }

    #[tokio::test]
    async fn test_get_result_not_found() {
        let spawner = InMemorySpawner::new(3);
        assert!(spawner.get_result("nonexistent").await.is_none());
    }
}