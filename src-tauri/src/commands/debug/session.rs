//! Debug Commands - Session Management
//!
//! Start, stop, and manage debug sessions

use crate::dap::{DapClient, LaunchRequestArgs};
use crate::dap_installer;
use crate::run_config::configuration::RunConfiguration;
use crate::commands::debug::types::{get_pending_breakpoints, clear_pending_breakpoints};
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
    println!("[DAP] Starting debug session for: {} (language: {:?})", config.name, config.language);

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

    println!("[DAP] Using adapter type: {}", adapter_type);

    let adapters = dap_installer::AdapterRegistry::get_all_adapters();
    let adapter_info = adapters.iter().find(|a| a.id == adapter_type);

    if let Some(adapter) = adapter_info {
        let is_installed = installer.is_adapter_installed(adapter);
        println!("[DAP] Adapter '{}' installed: {}", adapter.name, is_installed);
        if !is_installed {
            return Err(format!(
                "{} is not installed. Please install the debug adapter first.",
                adapter.name
            ));
        }
    }

    println!("[DAP] Creating adapter...");
    client.create_adapter(&adapter_type)?;

    if config.language == crate::run_config::configuration::Language::Rust {
        println!("[DAP] Building Rust binary before debug...");
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
                println!("[DAP] Build successful");
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

    println!("[DAP] Starting session with program: {:?}", launch_args.program);
    let result = client.start_session(&launch_args);
    match &result {
        Ok(id) => {
            println!("[DAP] Session started with ID: {}", id);
            flush_pending_breakpoints(&mut client);
            println!("[DAP] Finalizing launch...");
            if let Err(e) = client.finalize_launch() {
                println!("[DAP] Failed to finalize launch: {}", e);
                let _ = app_handle.emit("debug-error", serde_json::json!({
                    "message": format!("Failed to start debugging: {}", e)
                }));
            } else {
                println!("[DAP] Launch finalized successfully");
            }
        },
        Err(e) => {
            println!("[DAP] Session failed: {}", e);
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
        println!("[DAP] No pending breakpoints to flush");
        return;
    }

    println!("[DAP] Flushing {} pending breakpoints", pending.len());

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

    for (path, bps) in breakpoints_by_path {
        println!("[DAP] Setting {} breakpoints for {}", bps.len(), path);
        if let Err(e) = client.set_breakpoints(&path, bps) {
            println!("[DAP] Failed to set breakpoints: {}", e);
        }
    }

    clear_pending_breakpoints();
}

#[tauri::command]
pub async fn debug_action(
    app_handle: tauri::AppHandle,
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    action: super::types::DebugAction,
) -> Result<(), String> {
    println!("[DAP] debug_action called: {:?}", action);
    let mut client = dap_client.lock().await;

    let result = match action {
        super::types::DebugAction::Continue => client.continue_execution(),
        super::types::DebugAction::StepOver => client.step_over(),
        super::types::DebugAction::StepInto => client.step_into(),
        super::types::DebugAction::StepOut => client.step_out(),
        super::types::DebugAction::Pause => client.pause(),
        super::types::DebugAction::Terminate => {
            println!("[DAP] Terminating debug session...");
            let session_before = client.get_session().map(|s| format!("{:?}", s.state));
            println!("[DAP] Session state before terminate: {:?}", session_before);
            let result = client.terminate_session();
            let session_after = client.get_session().map(|s| format!("{:?}", s.state));
            println!("[DAP] Session state after terminate: {:?}", session_after);
            println!("[DAP] Terminate result: {:?}", result.is_ok());

            let _ = app_handle.emit("debug-session-ended", ());

            result
        }
    };

    result
}
