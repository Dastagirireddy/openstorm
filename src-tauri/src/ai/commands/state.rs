use std::sync::Arc;
use tokio::sync::Mutex;

use crate::ai::agent::AgentRuntime;

/// Shared state for ai_v2 commands
pub struct AiV2State {
    pub runtime: Mutex<Option<Arc<AgentRuntime>>>,
}

impl AiV2State {
    pub fn new() -> Self {
        Self {
            runtime: Mutex::new(None),
        }
    }
}
