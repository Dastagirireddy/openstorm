//! Debug Commands - Session Management
//!
//! Start, stop, and manage debug sessions

use crate::dap::{DapClient, LaunchRequestArgs};
use crate::dap_installer;
use crate::run_config::configuration::RunConfiguration;
use crate::commands::debug::types::{get_pending_breakpoints, clear_pending_breakpoints, push_pending_breakpoint, PendingBreakpoint};
use crate::commands::debug::breakpoint_storage;
use std::path::Path;
use tauri::Emitter;

#[tauri::command]
pub async fn start_debug_session(
    app_handle: tauri::AppHandle,
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    installer: tauri::State<'_, dap_installer::DebugAdapterInstaller>,
    _workspace_root: String,
    config: RunConfiguration,
) -> Result<u32, String> {
    let mut client = dap_client.lock().await;

    let adapter_type = config.debug_adapter
        .as_ref()
        .map(|a| a.adapter_type.clone())
        .or_else(|| {
            let lang_str = match config.language {
                crate::run_config::configuration::Language::Rust => "rust",
                crate::run_config::configuration::Language::JavaScript | crate::run_config::configuration::Language::TypeScript => "javascript",
                crate::run_config::configuration::Language::Python => "python",
                crate::run_config::configuration::Language::Go => "go",
                crate::run_config::configuration::Language::Cpp => "cpp",
                crate::run_config::configuration::Language::Unknown => return None,
            };
            dap_installer::AdapterRegistry::get_adapter_for_language(lang_str)
                .map(|a| a.id.to_string())
        })
        .unwrap_or_else(|| "lldb".to_string());

    let adapters = dap_installer::AdapterRegistry::get_all_adapters();
    let adapter_info = adapters.iter().find(|a| a.id == adapter_type);

    if let Some(adapter) = adapter_info {
        let is_installed = installer.is_adapter_installed(adapter);
        if !is_installed {
            return Err(format!(
                "{} is not installed. Please install the debug adapter first.",
                adapter.name
            ));
        }
    }

    client.create_adapter(&adapter_type)?;

    let project_root = config.cwd.clone().map(|p| p.to_string_lossy().to_string());

    if config.language == crate::run_config::configuration::Language::Rust {
        let build_output = std::process::Command::new("cargo")
            .arg("build")
            .current_dir(config.cwd.as_ref().map(|p| p.as_path()).unwrap_or_else(|| Path::new(".")))
            .output();

        match build_output {
            Ok(output) => {
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    return Err(format!("Build failed: {}", stderr));
                }
            }
            Err(e) => {
                return Err(format!("Failed to run cargo build: {}", e));
            }
        }
    }

    let launch_args = LaunchRequestArgs {
        name: config.name.clone(),
        debug_type: adapter_type,
        request: "launch".to_string(),
        program: config.debug_adapter.as_ref().and_then(|da| da.args.first().cloned())
            .or_else(|| config.args.first().cloned()),
        cwd: config.cwd.map(|p| p.to_string_lossy().to_string()),
        args: Some(config.debug_adapter.as_ref().map(|da| da.args.clone()).unwrap_or_else(|| config.args.clone())),
        env: Some(config.env.clone()),
        stop_on_entry: Some(false),
        external_console: Some(false),
        debug_adapter_path: None,
    };

    let result = client.start_session(&launch_args);
    match &result {
        Ok(id) => {
            if let Some(ref project_root_str) = project_root {
                match breakpoint_storage::load_breakpoints(project_root_str) {
                    Ok(store) => {
                        let mut count = 0;
                        for (source_path, file_breakpoints) in &store {
                            for bp in file_breakpoints {
                                push_pending_breakpoint(PendingBreakpoint {
                                    source_path: source_path.clone(),
                                    line: bp.line,
                                    condition: bp.condition.clone(),
                                    hit_condition: bp.hit_condition.clone(),
                                    log_message: bp.log_message.clone(),
                                });
                                count += 1;
                            }
                        }
                    }
                    Err(_) => {}
                }
            }

            flush_pending_breakpoints(&mut client);
            if let Err(e) = client.finalize_launch() {
                let _ = app_handle.emit("debug-error", serde_json::json!({
                    "message": format!("Failed to start debugging: {}", e)
                }));
            } else {
                let _ = app_handle.emit("debug-session-started", serde_json::json!({
                    "session_id": id
                }));
            }
        },
        Err(e) => {
            let _ = app_handle.emit("debug-error", serde_json::json!({
                "message": format!("Failed to start debugging session: {}", e)
            }));
        }
    }
    result
}

fn flush_pending_breakpoints(client: &mut DapClient) {
    let pending = get_pending_breakpoints();
    if pending.is_empty() {
        return;
    }

    let mut breakpoints_by_path: std::collections::HashMap<String, Vec<crate::dap::SourceBreakpoint>> = std::collections::HashMap::new();
    for bp in pending {
        let abs_path = bp.source_path.strip_prefix("file://").unwrap_or(&bp.source_path).to_string();
        breakpoints_by_path.entry(abs_path).or_insert_with(Vec::new).push(crate::dap::SourceBreakpoint {
            line: bp.line,
            column: None,
            condition: bp.condition,
            hit_condition: bp.hit_condition,
            log_message: bp.log_message,
        });
    }

    for (path, bps) in &breakpoints_by_path {
        if let Err(e) = client.set_breakpoints(path, bps.clone()) {
            eprintln!("[DAP] Failed to set breakpoints: {}", e);
        }
    }

    client.store_breakpoints(breakpoints_by_path);

    clear_pending_breakpoints();
}

#[tauri::command]
pub async fn debug_action(
    app_handle: tauri::AppHandle,
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    action: super::types::DebugAction,
) -> Result<(), String> {
    let mut client = dap_client.lock().await;

    let result = match action {
        super::types::DebugAction::Continue => client.continue_execution(),
        super::types::DebugAction::StepOver => client.step_over(),
        super::types::DebugAction::StepInto => client.step_into(),
        super::types::DebugAction::StepOut => client.step_out(),
        super::types::DebugAction::Pause => client.pause(),
        super::types::DebugAction::Terminate => {
            let result = client.terminate_session();
            let _ = app_handle.emit("debug-session-ended", ());
            result
        }
    };

    result
}
