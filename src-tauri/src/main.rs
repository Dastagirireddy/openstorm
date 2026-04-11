#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod file_watcher;
mod lsp;
mod terminal;

use tauri::{Manager, RunEvent};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(terminal::PtyManager::new())
        .manage(file_watcher::FileWatcher::new())
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::list_directory,
            commands::create_file,
            commands::delete_file,
            commands::rename_file,
            commands::get_file_info,
            commands::search_files,
            file_watcher::start_watching,
            terminal::terminal_create,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            println!("OpenStorm IDE starting up...");

            // Set app handle for terminal manager
            let pty_manager = app.state::<terminal::PtyManager>();
            pty_manager.set_app_handle(handle.clone());

            // Set app handle for file watcher
            let file_watcher = app.state::<file_watcher::FileWatcher>();
            file_watcher.set_app_handle(handle);

            Ok(())
        })
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
