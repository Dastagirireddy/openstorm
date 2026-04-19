use crate::run_config::RunConfiguration;
use crate::process::output::OutputEvent;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{broadcast, RwLock};

pub type ProcessId = u32;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub id: ProcessId,
    pub config_name: String,
    pub command: String,
    pub started_at: u64,
    pub working_directory: Option<PathBuf>,
}

impl ProcessInfo {
    pub fn from_config(id: ProcessId, config: &RunConfiguration, started_at: u64, working_directory: Option<PathBuf>) -> Self {
        Self {
            id,
            config_name: config.name.clone(),
            command: format!("{} {}", config.command, config.args.join(" ")),
            started_at,
            working_directory,
        }
    }
}

use std::sync::atomic::{AtomicU32, Ordering};

use std::sync::Mutex;

pub struct ProcessManager {
    processes: Arc<RwLock<HashMap<ProcessId, Child>>>,
    process_info: Arc<RwLock<HashMap<ProcessId, ProcessInfo>>>,
    app_handle: Mutex<Option<AppHandle>>,
    output_tx: broadcast::Sender<OutputEvent>,
    next_id: AtomicU32,
}

impl ProcessManager {
    pub fn new() -> Self {
        let (tx, _rx) = broadcast::channel(1000);
        Self {
            processes: Arc::new(RwLock::new(HashMap::new())),
            process_info: Arc::new(RwLock::new(HashMap::new())),
            app_handle: Mutex::new(None),
            output_tx: tx,
            next_id: AtomicU32::new(1),
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        *self.app_handle.lock().unwrap() = Some(handle);
    }

    pub fn get_output_receiver(&self) -> broadcast::Receiver<OutputEvent> {
        self.output_tx.subscribe()
    }

    fn get_next_id(&self) -> ProcessId {
        self.next_id.fetch_add(1, Ordering::SeqCst)
    }

    pub async fn spawn(&self, config: &RunConfiguration) -> Result<ProcessId, String> {
        let process_id = self.get_next_id();

        let mut cmd = Command::new(&config.command);
        cmd.args(&config.args);

        if let Some(cwd) = &config.cwd {
            cmd.current_dir(cwd);
        }

        for (key, value) in &config.env {
            cmd.env(key, value);
        }

        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn()
            .map_err(|e| format!("Failed to spawn process: {}", e))?;

        let process_id_for_stdout = process_id;
        let process_id_for_stderr = process_id;
        let output_tx = self.output_tx.clone();
        let cwd = config.cwd.clone();

        // Stream stdout
        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            let tx = output_tx.clone();
            tauri::async_runtime::spawn(async move {
                while let Ok(Some(line)) = lines.next_line().await {
                    let event = OutputEvent::stdout(process_id_for_stdout, line);
                    let _ = tx.send(event);
                }
            });
        }

        // Stream stderr
        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            tauri::async_runtime::spawn(async move {
                while let Ok(Some(line)) = lines.next_line().await {
                    let event = OutputEvent::stderr(process_id_for_stderr, line);
                    let _ = output_tx.send(event);
                }
            });
        }

        // Store process
        {
            let mut processes = self.processes.write().await;
            processes.insert(process_id, child);
        }

        // Store process info
        {
            let mut process_info = self.process_info.write().await;
            let started_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            process_info.insert(process_id, ProcessInfo::from_config(
                process_id,
                config,
                started_at,
                cwd,
            ));
        }

        // Emit event to frontend
        if let Some(app) = self.app_handle.lock().unwrap().as_ref() {
            let _ = app.emit("process-started", serde_json::json!({
                "process_id": process_id,
                "config_name": config.name,
            }));
        }

        Ok(process_id)
    }

    pub async fn terminate(&self, process_id: ProcessId) -> Result<(), String> {
        let mut processes = self.processes.write().await;

        if let Some(mut child) = processes.remove(&process_id) {
            #[cfg(unix)]
            {
                use nix::sys::signal::{kill, Signal};
                use nix::unistd::Pid;
                let _ = kill(Pid::from_raw(process_id as i32), Signal::SIGTERM);
            }

            let _ = child.kill().await;
            let _ = child.wait().await;

            let mut process_info = self.process_info.write().await;
            process_info.remove(&process_id);

            if let Some(app) = self.app_handle.lock().unwrap().as_ref() {
                let _ = app.emit("process-terminated", serde_json::json!({
                    "process_id": process_id,
                }));
            }

            Ok(())
        } else {
            Err(format!("Process {} not found", process_id))
        }
    }

    pub async fn terminate_all(&self) -> Result<(), String> {
        let process_ids: Vec<ProcessId> = {
            let processes = self.processes.read().await;
            processes.keys().copied().collect()
        };

        for id in process_ids {
            let _ = self.terminate(id).await;
        }

        Ok(())
    }

    pub async fn is_running(&self, process_id: ProcessId) -> bool {
        let processes = self.processes.read().await;
        processes.contains_key(&process_id)
    }

    pub async fn get_process_info(&self, process_id: ProcessId) -> Option<ProcessInfo> {
        let process_info = self.process_info.read().await;
        process_info.get(&process_id).cloned()
    }

    pub async fn list_processes(&self) -> Vec<ProcessInfo> {
        let process_info = self.process_info.read().await;
        process_info.values().cloned().collect()
    }

    pub async fn send_input(&self, process_id: ProcessId, input: &str) -> Result<(), String> {
        let mut processes = self.processes.write().await;

        if let Some(child) = processes.get_mut(&process_id) {
            if let Some(stdin) = &mut child.stdin {
                use tokio::io::AsyncWriteExt;
                stdin.write_all(input.as_bytes()).await
                    .map_err(|e| format!("Failed to write to stdin: {}", e))?;
                Ok(())
            } else {
                Err("Process has no stdin".to_string())
            }
        } else {
            Err(format!("Process {} not found", process_id))
        }
    }
}

impl Default for ProcessManager {
    fn default() -> Self {
        Self::new()
    }
}
