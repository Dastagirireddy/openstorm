#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod dap;
pub mod dap_installer;
mod database;
mod file_watcher;
mod git;
mod lsp;
mod lsp_installer;
mod process;
mod run_config;
mod terminal;
mod templates;
mod theme;

use tauri::{Manager, RunEvent, Emitter, menu::{Menu, MenuItem, Submenu}};
use tokio::sync::Mutex;

/// Poll DAP events and emit them to the frontend
fn spawn_dap_event_poller(app_handle: tauri::AppHandle) {
    println!("[DAP event_poller] Starting event poller thread...");
    std::thread::spawn(move || {
        // Create a runtime for this thread
        let rt = tokio::runtime::Runtime::new().unwrap();
        println!("[DAP event_poller] Runtime created, starting loop...");
        rt.block_on(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                // Get the DAP client from app state
                let dap_client = app_handle.state::<Mutex<dap::DapClient>>();

                let mut client = match dap_client.try_lock() {
                    Ok(c) => c,
                    Err(e) => {
                        println!("[DAP event_poller] Failed to lock client: {}", e);
                        continue;
                    }
                };

                let events = client.poll_events();

                // Check if session exists and log its state
                if let Some(session) = client.get_session() {
                    println!("[DAP event_poller] Session {} state: {:?}", session.id, session.state);
                }

                // Check if session is in Terminated state (set by terminate_session)
                // This handles cases where the adapter doesn't send a 'terminated' event
                let session_terminated = client.get_session()
                    .map(|s| matches!(s.state, dap::DebugSessionState::Terminated))
                    .unwrap_or(false);

                if session_terminated {
                    println!("[DAP event_poller] Session is terminated, clearing and emitting event");
                    client.clear_session();
                    match app_handle.emit("debug-session-ended", ()) {
                        Ok(_) => println!("[DAP event_poller] Successfully emitted debug-session-ended"),
                        Err(e) => println!("[DAP event_poller] Failed to emit debug-session-ended: {}", e),
                    }
                    continue; // Skip event processing for this iteration
                }

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
                        "terminated" => {
                            // Clear session state before emitting event to frontend
                            client.clear_session();
                            let _ = app_handle.emit("debug-session-ended", ());
                            println!("[DAP] Emitted debug-session-ended for terminated, session cleared");
                            "debug-terminated"
                        },
                        "exited" => {
                            // Clear session state before emitting event to frontend
                            client.clear_session();
                            let _ = app_handle.emit("debug-session-ended", ());
                            println!("[DAP] Emitted debug-session-ended for exited, session cleared");
                            "debug-exited"
                        },
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
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(terminal::PtyManager::new())
        .manage(file_watcher::FileWatcher::new())
        .manage(process::ProcessManager::new())
        .manage(Mutex::new(dap::DapClient::new()))
        .manage(dap_installer::DebugAdapterInstaller::new())
        .manage(database::DatabaseManager::new())
        .setup(|app| {
            let handle = app.handle().clone();
            println!("OpenStorm IDE starting up...");

            // Check if git is installed
            let git_available = git::check_git_installed();
            if !git_available {
                println!("[Git] Git binary not found in PATH");
                // Emit event to notify frontend
                handle.emit("git-not-found", ()).ok();
            }

            // Initialize configuration and create directories
            let config = config::AppConfig::new();
            if let Err(e) = config.create_directories() {
                eprintln!("Failed to create configuration directories: {}", e);
            }

            // Create native menu bar
            #[cfg(target_os = "macos")]
            let menu = Menu::with_items(app, &[
                &Submenu::with_items(app, "OpenStorm", true, &[
                    &MenuItem::with_id(app, "about", "About OpenStorm", true, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "check-updates", "Check for Updates...", true, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "settings", "Settings", true, Some("Cmd+,")).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "services", "Services", true, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "hide", "Hide OpenStorm", true, Some("Cmd+H")).unwrap(),
                    &MenuItem::with_id(app, "hide-others", "Hide Others", true, Some("Cmd+Shift+H")).unwrap(),
                    &MenuItem::with_id(app, "quit", "Quit OpenStorm", true, Some("Cmd+Q")).unwrap(),
                ]).unwrap(),
                &Submenu::with_items(app, "File", true, &[
                    &MenuItem::with_id(app, "new-file", "New File", true, Some("Cmd+N")).unwrap(),
                    &MenuItem::with_id(app, "new-project", "New Project...", true, Some("Cmd+Shift+N")).unwrap(),
                    &MenuItem::with_id(app, "open-file", "Open File...", true, Some("Cmd+O")).unwrap(),
                    &MenuItem::with_id(app, "open-folder", "Open Folder...", true, Some("Cmd+Shift+O")).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "save", "Save", true, Some("Cmd+S")).unwrap(),
                    &MenuItem::with_id(app, "save-as", "Save As...", true, Some("Cmd+Shift+S")).unwrap(),
                    &MenuItem::with_id(app, "save-all", "Save All", true, Some("Cmd+Option+S")).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "close-tab", "Close Tab", true, Some("Cmd+W")).unwrap(),
                ]).unwrap(),
                &Submenu::with_items(app, "Edit", true, &[
                    &MenuItem::with_id(app, "undo", "Undo", true, Some("Cmd+Z")).unwrap(),
                    &MenuItem::with_id(app, "redo", "Redo", true, Some("Cmd+Shift+Z")).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "cut", "Cut", true, Some("Cmd+X")).unwrap(),
                    &MenuItem::with_id(app, "copy", "Copy", true, Some("Cmd+C")).unwrap(),
                    &MenuItem::with_id(app, "paste", "Paste", true, Some("Cmd+V")).unwrap(),
                    &MenuItem::with_id(app, "select-all", "Select All", true, Some("Cmd+A")).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "find", "Find", true, Some("Cmd+F")).unwrap(),
                    &MenuItem::with_id(app, "replace", "Find and Replace", true, Some("Cmd+Option+F")).unwrap(),
                ]).unwrap(),
                &Submenu::with_items(app, "View", true, &[
                    &MenuItem::with_id(app, "command-palette", "Command Palette", true, Some("Cmd+Shift+P")).unwrap(),
                    &MenuItem::with_id(app, "theme-picker", "Theme Picker", true, Some("Cmd+Shift+T")).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "toggle-sidebar", "Toggle Sidebar", true, Some("Cmd+B")).unwrap(),
                    &MenuItem::with_id(app, "toggle-terminal", "Toggle Terminal", true, Some("Cmd+`")).unwrap(),
                    &MenuItem::with_id(app, "toggle-debug", "Toggle Debug Panel", true, Some("Cmd+Shift+D")).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "zoom-in", "Zoom In", true, Some("Cmd+")).unwrap(),
                    &MenuItem::with_id(app, "zoom-out", "Zoom Out", true, Some("Cmd+-")).unwrap(),
                    &MenuItem::with_id(app, "reset-zoom", "Reset Zoom", true, Some("Cmd+0")).unwrap(),
                ]).unwrap(),
                &Submenu::with_items(app, "Run", true, &[
                    &MenuItem::with_id(app, "run", "Run", true, Some("Cmd+R")).unwrap(),
                    &MenuItem::with_id(app, "debug", "Debug", true, Some("Cmd+Shift+R")).unwrap(),
                    &MenuItem::with_id(app, "stop", "Stop", true, Some("Cmd+Shift+K")).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "step-over", "Step Over", true, Some("F10")).unwrap(),
                    &MenuItem::with_id(app, "step-into", "Step Into", true, Some("F11")).unwrap(),
                    &MenuItem::with_id(app, "step-out", "Step Out", true, Some("Shift+F11")).unwrap(),
                    &MenuItem::with_id(app, "continue", "Continue", true, Some("F5")).unwrap(),
                ]).unwrap(),
                &Submenu::with_items(app, "Help", true, &[
                    &MenuItem::with_id(app, "documentation", "Documentation", true, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "report-issue", "Report Issue", true, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "about", "About OpenStorm", true, None::<&str>).unwrap(),
                ]).unwrap(),
            ]).ok();

            #[cfg(not(target_os = "macos"))]
            let menu = Menu::with_items(app, &[
                &Submenu::with_items(app, "File", true, &[
                    &MenuItem::with_id(app, "new-file", "New File", true, Some("Ctrl+N")).unwrap(),
                    &MenuItem::with_id(app, "new-project", "New Project...", true, Some("Ctrl+Shift+N")).unwrap(),
                    &MenuItem::with_id(app, "open-file", "Open File...", true, Some("Ctrl+O")).unwrap(),
                    &MenuItem::with_id(app, "open-folder", "Open Folder...", true, Some("Ctrl+Shift+O")).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "save", "Save", true, Some("Ctrl+S")).unwrap(),
                    &MenuItem::with_id(app, "save-as", "Save As...", true, Some("Ctrl+Shift+S")).unwrap(),
                    &MenuItem::with_id(app, "save-all", "Save All", true, Some("Ctrl+Alt+S")).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "close-tab", "Close Tab", true, Some("Ctrl+W")).unwrap(),
                    &MenuItem::with_id(app, "quit", "Quit OpenStorm", true, Some("Alt+F4")).unwrap(),
                ]).unwrap(),
                &Submenu::with_items(app, "Edit", true, &[
                    &MenuItem::with_id(app, "undo", "Undo", true, Some("Ctrl+Z")).unwrap(),
                    &MenuItem::with_id(app, "redo", "Redo", true, Some("Ctrl+Y")).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "cut", "Cut", true, Some("Ctrl+X")).unwrap(),
                    &MenuItem::with_id(app, "copy", "Copy", true, Some("Ctrl+C")).unwrap(),
                    &MenuItem::with_id(app, "paste", "Paste", true, Some("Ctrl+V")).unwrap(),
                    &MenuItem::with_id(app, "select-all", "Select All", true, Some("Ctrl+A")).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "find", "Find", true, Some("Ctrl+F")).unwrap(),
                    &MenuItem::with_id(app, "replace", "Find and Replace", true, Some("Ctrl+H")).unwrap(),
                ]).unwrap(),
                &Submenu::with_items(app, "View", true, &[
                    &MenuItem::with_id(app, "command-palette", "Command Palette", true, Some("Ctrl+Shift+P")).unwrap(),
                    &MenuItem::with_id(app, "theme-picker", "Theme Picker", true, Some("Ctrl+Shift+T")).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "toggle-sidebar", "Toggle Sidebar", true, Some("Ctrl+B")).unwrap(),
                    &MenuItem::with_id(app, "toggle-terminal", "Toggle Terminal", true, Some("Ctrl+`")).unwrap(),
                    &MenuItem::with_id(app, "toggle-debug", "Toggle Debug Panel", true, Some("Ctrl+Shift+D")).unwrap(),
                ]).unwrap(),
                &Submenu::with_items(app, "Run", true, &[
                    &MenuItem::with_id(app, "run", "Run", true, Some("Ctrl+R")).unwrap(),
                    &MenuItem::with_id(app, "debug", "Debug", true, Some("Ctrl+Shift+R")).unwrap(),
                    &MenuItem::with_id(app, "stop", "Stop", true, Some("Ctrl+Shift+K")).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "step-over", "Step Over", true, Some("F10")).unwrap(),
                    &MenuItem::with_id(app, "step-into", "Step Into", true, Some("F11")).unwrap(),
                    &MenuItem::with_id(app, "step-out", "Step Out", true, Some("Shift+F11")).unwrap(),
                    &MenuItem::with_id(app, "continue", "Continue", true, Some("F5")).unwrap(),
                ]).unwrap(),
                &Submenu::with_items(app, "Help", true, &[
                    &MenuItem::with_id(app, "documentation", "Documentation", true, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "report-issue", "Report Issue", true, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "separator", "", false, None::<&str>).unwrap(),
                    &MenuItem::with_id(app, "about", "About OpenStorm", true, None::<&str>).unwrap(),
                ]).unwrap(),
            ]).ok();

            // Set the menu
            if let Some(menu) = menu {
                app.set_menu(menu).ok();
            }

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
        .on_menu_event(|app, event| {
            // Handle menu item clicks
            println!("[Menu] Event: {}", event.id.0);
            // Forward menu events to frontend via custom events
            app.emit("menu-item-clicked", event.id.0.to_string()).ok();
        })
        .invoke_handler(tauri::generate_handler![
            // === File Operations ===
            commands::file::read_file,
            commands::file::write_file,
            commands::file::create_file,
            commands::file::delete_file,
            commands::file::rename_file,
            commands::file::get_file_info,
            commands::file::read_file_base64,
            commands::file::get_image_metadata,

            // === Directory Operations ===
            commands::directory::list_directory,
            commands::directory::search_files,

            // === Run & Process Management ===
            commands::run::detect_run_configurations,
            commands::run::run_configuration,
            commands::run::terminate_process,
            commands::run::list_running_processes,
            commands::run::save_run_configuration,
            commands::run::load_run_configurations,
            commands::run::delete_run_configuration,

            // === Debug Adapter Protocol ===
            commands::debug::start_debug_session,
            commands::debug::debug_action,
            commands::debug::get_stack_trace,
            commands::debug::get_scopes,
            commands::debug::get_variables,
            commands::debug::evaluate_expression,
            commands::debug::get_threads,
            commands::debug::add_breakpoint,
            commands::debug::remove_breakpoint,
            commands::debug::set_breakpoints_for_file,
            commands::adapter::get_debug_adapter_info,
            commands::adapter::install_debug_adapter,
            commands::watch::add_watch_expression,
            commands::watch::remove_watch_expression,
            commands::watch::get_watch_expressions,
            commands::watch::refresh_watch_expressions,
            commands::watch::get_exception_breakpoint_filters,
            commands::watch::set_exception_breakpoints,

            // === Terminal ===
            terminal::terminal_create,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,

            // === File Watcher ===
            file_watcher::start_watching,

            // === Templates & Project Generation ===
            templates::list_templates,
            templates::list_categories,
            templates::get_template,
            templates::create_project,
            templates::open_folder_dialog,

            // === Language Server Protocol ===
            lsp::format_code,
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

            // === Database ===
            commands::database::db_list_connections,
            commands::database::db_add_connection,
            commands::database::db_update_connection,
            commands::database::db_remove_connection,
            commands::database::db_test_connection,
            commands::database::db_make_connection_global,
            commands::database::db_make_connection_project,

            // === Theme ===
            theme::get_system_theme,

            // === Git ===
            commands::git::git_check_installed,
            commands::git::git_check_repository,
            commands::git::git_init,
            commands::git::git_get_branch,
            commands::git::git_get_status,
            commands::git::git_list_branches,
            commands::git::git_list_remote_branches,
            commands::git::git_create_branch,
            commands::git::git_delete_branch,
            commands::git::git_checkout_branch,
            commands::git::git_stage_file,
            commands::git::git_stage_all,
            commands::git::git_unstage_file,
            commands::git::git_unstage_all,
            commands::git::git_commit,
            commands::git::git_amend_commit,
            commands::git::git_discard_file,
            commands::git::git_discard_all,
            commands::git::git_get_file_diff,
            commands::git::git_get_file_diff_stats,
            commands::git::git_get_diff_stats,
            commands::git::git_fetch,
            commands::git::git_pull,
            commands::git::git_push,
            commands::git::git_list_remotes,
            commands::git::git_add_remote,
            commands::git::git_remove_remote,
            commands::git::git_get_log,
            commands::git::git_get_commit,
            commands::git::git_get_commit_diff,
            commands::git::git_get_last_commit,
            commands::git::git_search_commits,
            commands::git::git_get_file_history,
            commands::git::git_get_pull_requests,
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
