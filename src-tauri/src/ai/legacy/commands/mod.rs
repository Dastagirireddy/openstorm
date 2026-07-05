mod providers;
mod chat;
mod session;
mod tools;
mod mcp;
mod subagent;

use tokio::sync::{mpsc, Mutex};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

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

    pub fn spawn_background_tasks(&self, app_handle: AppHandle) {
        let mcp_manager = self.mcp_manager.clone();
        let handle = app_handle.clone();

        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async move {
                {
                    let mut manager = mcp_manager.lock().await;
                    manager.connect_all().await;
                }

                let mut rx = {
                    let manager = mcp_manager.lock().await;
                    manager.subscribe_status()
                };

                let handle_clone = handle.clone();
                tokio::spawn(async move {
                    while let Ok(event) = rx.recv().await {
                        let _ = handle_clone.emit("mcp-status-change", serde_json::json!({
                            "name": event.name,
                            "state": format!("{:?}", event.state).to_lowercase(),
                            "tool_count": event.tool_count,
                            "error": event.error,
                        }));
                    }
                });

                loop {
                    tokio::time::sleep(Duration::from_secs(60)).await;
                    let mut manager = mcp_manager.lock().await;
                    manager.disconnect_idle().await;
                }
            });
        });
    }

    pub fn mcp_manager(&self) -> Arc<Mutex<McpManager>> {
        self.mcp_manager.clone()
    }

    pub fn process_manager(&self) -> Arc<Mutex<ProcessManager>> {
        self.process_manager.clone()
    }
}
