use crate::run_config::RunConfiguration;
use crate::process::output::OutputEvent;
use crate::{log_info, log_error};
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
use tokio::sync::Notify;

pub struct ProcessManager {
    processes: Arc<RwLock<HashMap<ProcessId, Child>>>,
    process_info: Arc<RwLock<HashMap<ProcessId, ProcessInfo>>>,
    process_notifiers: Arc<RwLock<HashMap<ProcessId, Arc<Notify>>>>,
    reader_handles: Arc<RwLock<HashMap<ProcessId, Vec<tauri::async_runtime::JoinHandle<()>>>>>,
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
            process_notifiers: Arc::new(RwLock::new(HashMap::new())),
            reader_handles: Arc::new(RwLock::new(HashMap::new())),
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
        log_info!("[ProcessManager] spawn: process_id={}, command={}, args={:?}", process_id, config.command, config.args);

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

        log_info!("[ProcessManager] spawn: child spawned, os_pid={:?}", child.id());

        let process_id_for_stdout = process_id;
        let process_id_for_stderr = process_id;
        let output_tx = self.output_tx.clone();
        let cwd = config.cwd.clone();

        // Track reader tasks to wait for completion
        let mut reader_handles = Vec::new();

        // Stream stdout - read all lines until EOF
        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            let tx = output_tx.clone();
            let handle = tauri::async_runtime::spawn(async move {
                while let Ok(Some(line)) = lines.next_line().await {
                    let event = OutputEvent::stdout(process_id_for_stdout, line);
                    let _ = tx.send(event);
                }
            });
            reader_handles.push(handle);
        }

        // Stream stderr - read all lines until EOF
        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            let handle = tauri::async_runtime::spawn(async move {
                while let Ok(Some(line)) = lines.next_line().await {
                    let event = OutputEvent::stderr(process_id_for_stderr, line);
                    let _ = output_tx.send(event);
                }
            });
            reader_handles.push(handle);
        }

        // Store process
        let notify = Arc::new(Notify::new());
        {
            let mut processes = self.processes.write().await;
            processes.insert(process_id, child);
            let mut notifiers = self.process_notifiers.write().await;
            notifiers.insert(process_id, notify.clone());
            let mut readers = self.reader_handles.write().await;
            readers.insert(process_id, reader_handles);
        }

        // Wait for process to complete and emit terminated event
        let processes_clone = self.processes.clone();
        let process_info_clone = self.process_info.clone();
        let notifiers_clone = self.process_notifiers.clone();
        let reader_handles_clone = self.reader_handles.clone();
        let app_handle = self.app_handle.lock().unwrap().clone();
        let process_id_for_wait = process_id;
        tauri::async_runtime::spawn(async move {
            log_info!("[ProcessManager] background task: started for process_id={}", process_id_for_wait);
            // Wait for the process to be terminated (by terminate() or natural exit)
            notify.notified().await;
            log_info!("[ProcessManager] background task: notified for process_id={}", process_id_for_wait);

            // Wait for all reader tasks to finish (ensures all output is captured)
            if let Some(handles) = reader_handles_clone.write().await.remove(&process_id_for_wait) {
                for handle in handles {
                    let _ = handle.await;
                }
            }

            // Clean up
            {
                let mut notifiers = notifiers_clone.write().await;
                notifiers.remove(&process_id_for_wait);
            }
            {
                let mut info = process_info_clone.write().await;
                info.remove(&process_id_for_wait);
            }
            log_info!("[ProcessManager] background task: cleaned up process_id={}", process_id_for_wait);

            // Emit terminated event
            if let Some(app) = app_handle {
                let _ = app.emit("process-terminated", serde_json::json!({
                    "process_id": process_id_for_wait,
                }));
            }
        });

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
        log_info!("[ProcessManager] terminate: called for process_id={}", process_id);

        let mut processes = self.processes.write().await;
        log_info!("[ProcessManager] terminate: processes map has {} entries: {:?}", processes.len(), processes.keys().collect::<Vec<_>>());

        if let Some(mut child) = processes.remove(&process_id) {
            log_info!("[ProcessManager] terminate: found child, os_pid={:?}", child.id());

            #[cfg(unix)]
            {
                use nix::sys::signal::{kill, Signal};
                use nix::unistd::Pid;
                if let Some(os_pid) = child.id() {
                    log_info!("[ProcessManager] terminate: sending SIGTERM to os_pid={}", os_pid);
                    let _ = kill(Pid::from_raw(os_pid as i32), Signal::SIGTERM);
                }
            }

            log_info!("[ProcessManager] terminate: calling child.kill()");
            let _ = child.kill().await;
            log_info!("[ProcessManager] terminate: calling child.wait()");
            let _ = child.wait().await;
            log_info!("[ProcessManager] terminate: process terminated");

            // Abort reader tasks to stop capturing output immediately
            if let Some(handles) = self.reader_handles.write().await.remove(&process_id) {
                for handle in handles {
                    handle.abort();
                }
            }

            // Notify the background task that the process has been terminated
            let notifiers = self.process_notifiers.read().await;
            if let Some(notify) = notifiers.get(&process_id) {
                log_info!("[ProcessManager] terminate: notifying background task");
                notify.notify_one();
            }

            Ok(())
        } else {
            log_error!("[ProcessManager] terminate: process {} NOT FOUND in processes map", process_id);
            Err(format!("Process {} not found", process_id))
        }
    }

    pub async fn list_processes(&self) -> Vec<ProcessInfo> {
        let process_info = self.process_info.read().await;
        process_info.values().cloned().collect()
    }
}

impl Default for ProcessManager {
    fn default() -> Self {
        Self::new()
    }
}
