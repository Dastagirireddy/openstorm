//! Run configuration and process management commands

use crate::process::{ProcessId, ProcessInfo, ProcessManager};
use crate::run_config::{RunConfiguration, ConfigurationStorage, RunConfigurationDetector};

#[tauri::command]
pub fn detect_run_configurations(workspace_root: String) -> Vec<RunConfiguration> {
    let detector = RunConfigurationDetector::new(std::path::PathBuf::from(&workspace_root));
    detector.detect()
}

#[tauri::command]
pub async fn run_configuration(
    process_manager: tauri::State<'_, ProcessManager>,
    _workspace_root: String,
    config: RunConfiguration,
) -> Result<ProcessId, String> {
    process_manager.spawn(&config).await
}

#[tauri::command]
pub async fn terminate_process(
    process_manager: tauri::State<'_, ProcessManager>,
    process_id: ProcessId,
) -> Result<(), String> {
    process_manager.terminate(process_id).await
}

#[tauri::command]
pub async fn list_running_processes(
    process_manager: tauri::State<'_, ProcessManager>,
) -> Result<Vec<ProcessInfo>, String> {
    Ok(process_manager.list_processes().await)
}

#[tauri::command]
pub fn save_run_configuration(
    workspace_root: String,
    config: RunConfiguration,
) -> Result<(), String> {
    let storage = ConfigurationStorage::new(std::path::PathBuf::from(workspace_root));
    storage.save_configuration(&config)
}

#[tauri::command]
pub fn load_run_configurations(workspace_root: String) -> Vec<RunConfiguration> {
    let storage = ConfigurationStorage::new(std::path::PathBuf::from(workspace_root));
    storage.load_configurations()
}

#[tauri::command]
pub fn delete_run_configuration(
    workspace_root: String,
    config_id: String,
) -> Result<(), String> {
    let storage = ConfigurationStorage::new(std::path::PathBuf::from(workspace_root));
    storage.delete_configuration(&config_id)
}
