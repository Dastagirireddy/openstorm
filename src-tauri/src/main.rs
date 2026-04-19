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
