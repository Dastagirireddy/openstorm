mod providers;
mod chat;
mod session;
mod tools;
mod mcp;
mod subagent;

use tokio::sync::{mpsc, Mutex};
use std::sync::Arc;

use super::agent::Agent;
use super::mcp::McpManager;
use super::orchestrator::Orchestrator;
use super::tools::ProcessManager;

pub use providers::*;
pub use chat::*;
pub use session::*;
pub use tools::*;
pub use mcp::*;
pub use subagent::*;

/// Active agent session state shared across all AI commands.
pub struct AiState {
    active_agent: Mutex<Option<Arc<Agent>>>,
    abort_tx: Mutex<Option<mpsc::Sender<()>>>,
    approval_tx: Mutex<Option<mpsc::Sender<bool>>>,
    orchestrator: Mutex<Option<Arc<Orchestrator>>>,
    mcp_manager: Arc<Mutex<McpManager>>,
    process_manager: Arc<Mutex<ProcessManager>>,
}

impl AiState {
    pub fn new() -> Self {
        let mut mcp_manager = McpManager::new();
        mcp_manager.load_configs();
        Self {
            active_agent: Mutex::new(None),
            abort_tx: Mutex::new(None),
            approval_tx: Mutex::new(None),
            orchestrator: Mutex::new(None),
            mcp_manager: Arc::new(Mutex::new(mcp_manager)),
            process_manager: Arc::new(Mutex::new(ProcessManager::new())),
        }
    }

    pub fn mcp_manager(&self) -> Arc<Mutex<McpManager>> {
        self.mcp_manager.clone()
    }

    pub fn process_manager(&self) -> Arc<Mutex<ProcessManager>> {
        self.process_manager.clone()
    }
}
