#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod dap;
pub mod dap_installer;
mod file_watcher;
mod lsp;
mod lsp_installer;
mod process;
mod run_config;
mod terminal;
mod templates;

use tauri::{Manager, RunEvent, Emitter};
use tokio::sync::Mutex;

/// Poll DAP events and emit them to the frontend
fn spawn_dap_event_poller(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        // Create a runtime for this thread
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                // Get the DAP client from app state
                let dap_client = app_handle.state::<Mutex<dap::DapClient>>();

                let mut client = match dap_client.try_lock() {
                    Ok(c) => c,
                    Err(_) => continue,
                };

                let events = client.poll_events();
                for event in events {
                    // Log all events for debugging
                    if event.event == "output" {
                        let category = event.body.as_ref().and_then(|b| b.get("category")).and_then(|c| c.as_str()).unwrap_or("unknown");
                        if category != "telemetry" {
                            println!("[DAP] OUTPUT event body ({}): {}", category, serde_json::to_string_pretty(&event.body).unwrap_or_default());
                        }
                    }

                    let event_name = match event.event.as_str() {
                        "initialized" => "debug-initialized",
                        "stopped" => {
                            println!("[DAP] STOPPED event received! Reason: {:?}", event.body.as_ref().and_then(|b| b.get("reason")));
                            // Auto-refresh watch expressions when stopped
                            let watches = client.get_watch_expressions();
                            if !watches.is_empty() {
                                let mut evaluations = Vec::new();
                                for watch in &watches {
                                    let result = client.evaluate(&watch.expression, None);
                                    evaluations.push(result);
                                }
                                client.refresh_watch_expressions(evaluations);
                                let refreshed_watches: Vec<commands::WatchExpressionResult> =
                                    client.get_watch_expressions().into_iter().map(|w| w.into()).collect();
                                let _ = app_handle.emit("watches-refreshed", refreshed_watches);
                            }
                            "debug-stopped"
                        },
                        "continued" => "debug-continued",
                        "terminated" => "debug-terminated",
                        "output" => "debug-output",
                        _ => &event.event,
                    };

                    let emit_body = event.body.clone().unwrap_or(serde_json::json!({}));

                    let emit_result = app_handle.emit(
                        event_name,
                        emit_body,
                    );
                    if let Err(e) = emit_result {
                        println!("[DAP] Failed to emit event {}: {}", event.event, e);
                    } else {
                        println!("[DAP] Emitted event to frontend: {}", event_name);
                    }
                }

                // Note: Session state changes are already emitted via DAP events from poll_events()
                // No need to check session.state here as it would cause duplicate event emissions
            }
        });
    });
}

/// Listen for process output events and emit them to the frontend
fn spawn_process_output_listener(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async move {
            // Get process manager and subscribe to output events
            let process_manager = app_handle.state::<process::ProcessManager>();
            let mut rx = process_manager.get_output_receiver();

            while let Ok(event) = rx.recv().await {
                let output_type = match event.output_type {
                    process::output::OutputType::Stdout => "stdout",
                    process::output::OutputType::Stderr => "stderr",
                    process::output::OutputType::Stdin => "stdin",
                    process::output::OutputType::Error => "error",
                    process::output::OutputType::Info => "info",
                };

                let emit_result = app_handle.emit("process-output", serde_json::json!({
                    "process_id": event.process_id,
                    "output_type": output_type,
                    "data": event.data,
                    "timestamp": event.timestamp,
                }));

                if let Err(e) = emit_result {
                    println!("[Process] Failed to emit output event: {}", e);
                }
            }
        });
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(terminal::PtyManager::new())
        .manage(file_watcher::FileWatcher::new())
        .manage(process::ProcessManager::new())
        .manage(Mutex::new(dap::DapClient::new()))
        .manage(dap_installer::DebugAdapterInstaller::new())
        .setup(|app| {
            let handle = app.handle().clone();
            println!("OpenStorm IDE starting up...");

            // Set app handle for terminal manager
            let pty_manager = app.state::<terminal::PtyManager>();
            pty_manager.set_app_handle(handle.clone());

            // Set app handle for file watcher
            let file_watcher = app.state::<file_watcher::FileWatcher>();
            file_watcher.set_app_handle(handle.clone());

            // Set app handle for process manager
            let process_manager = app.state::<process::ProcessManager>();
            process_manager.set_app_handle(handle.clone());

            // Start DAP event polling loop
            spawn_dap_event_poller(handle.clone());

            // Start process output listener
            spawn_process_output_listener(handle.clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::list_directory,
            commands::create_file,
            commands::delete_file,
            commands::rename_file,
            commands::get_file_info,
            commands::search_files,
            commands::detect_run_configurations,
            commands::run_configuration,
            commands::terminate_process,
            commands::list_running_processes,
            commands::save_run_configuration,
            commands::load_run_configurations,
            commands::delete_run_configuration,
            commands::start_debug_session,
            commands::debug_action,
            commands::get_stack_trace,
            commands::get_scopes,
            commands::get_variables,
            commands::evaluate_expression,
            commands::get_threads,
            commands::add_breakpoint,
            commands::remove_breakpoint,
            commands::set_breakpoints_for_file,
            commands::get_debug_adapter_info,
            commands::install_debug_adapter,
            commands::add_watch_expression,
            commands::remove_watch_expression,
            commands::get_watch_expressions,
            commands::refresh_watch_expressions,
            commands::get_exception_breakpoint_filters,
            commands::set_exception_breakpoints,
            file_watcher::start_watching,
            terminal::terminal_create,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            templates::list_templates,
            templates::list_categories,
            templates::get_template,
            templates::create_project,
            templates::open_folder_dialog,
            lsp::format_rust,
            lsp::format_go,
            lsp::format_python,
            lsp::format_cpp,
            lsp::format_javascript,
            lsp::format_typescript,
            lsp::get_lsp_server_status,
            lsp::install_lsp_server,
            lsp::initialize_lsp_pool,
            lsp::get_completions,
            lsp::get_hover,
            lsp::get_definition,
            lsp::notify_document_opened,
            lsp::notify_document_changed,
            lsp::notify_document_closed,
            lsp::notify_document_saved,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::WindowEvent { label, event, .. } = event {
                if label == "main" {
                    match event {
                        tauri::WindowEvent::CloseRequested { api, .. } => {
                            // Save state before closing
                            println!("Window closing, saving state...");
                            api.prevent_close();
                        }
                        _ => {}
                    }
                }
            }
        });
}
