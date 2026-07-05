use super::ToolRegistry;

impl ToolRegistry {
    /// Spawn a sub-agent to handle a task asynchronously
    pub(super) async fn spawn_agent(&self, args: &serde_json::Value) -> String {
        let task = args["task"].as_str().unwrap_or("");
        let _strategy = args["strategy"].as_str().unwrap_or("simple");

        let orchestrator = match &self.orchestrator {
            Some(o) => o,
            None => return "Sub-agent spawning not available (orchestrator not initialized)".to_string(),
        };

        let task_id = orchestrator.submit_request(task.to_string()).await;

        // Spawn a background task to process this immediately
        let orch = orchestrator.clone();
        tokio::spawn(async move {
            let _ = orch.process_next().await;
        });

        format!(
            "Sub-agent spawned with task ID: {}. The sub-agent is running in the background.",
            task_id
        )
    }

    /// Run a sub-agent synchronously and wait for its result
    pub(super) async fn run_subagent(&self, args: &serde_json::Value) -> String {
        let task = args["task"].as_str().unwrap_or("");
        let _strategy = args["strategy"].as_str().unwrap_or("simple");

        let orchestrator = match &self.orchestrator {
            Some(o) => o,
            None => return "Sub-agent spawning not available (orchestrator not initialized)".to_string(),
        };

        // Submit and process immediately
        let _task_id = orchestrator.submit_request(task.to_string()).await;

        match orchestrator.process_next().await {
            Ok(result) => {
                format!(
                    "Sub-agent completed (task: {}):\n{}\n\nTool calls made: {}",
                    result.task_id, result.output, result.tool_calls_made
                )
            }
            Err(e) => format!("Sub-agent failed: {}", e),
        }
    }

    /// Get the status of a sub-agent task
    pub(super) async fn get_subagent_status(&self, args: &serde_json::Value) -> String {
        let task_id = args["task_id"].as_str().unwrap_or("");

        let orchestrator = match &self.orchestrator {
            Some(o) => o,
            None => return "Sub-agent status not available (orchestrator not initialized)".to_string(),
        };

        match orchestrator.get_result(task_id).await {
            Some(result) => {
                format!(
                    "Task {} completed:\nSuccess: {}\nOutput: {}\nTool calls: {}",
                    result.task_id, result.success, result.output, result.tool_calls_made
                )
            }
            None => {
                let pending = orchestrator.pending_count().await;
                let active = orchestrator.active_count().await;
                format!(
                    "Task {} not yet completed.\nPending tasks: {}\nActive agents: {}",
                    task_id, pending, active
                )
            }
        }
    }
}
