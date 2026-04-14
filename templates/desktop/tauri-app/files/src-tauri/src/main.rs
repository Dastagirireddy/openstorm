#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct Greeting {
    message: String,
}

#[tauri::command]
fn greet(name: &str) -> Greeting {
    Greeting {
        message: format!("Hello, {}! Welcome to {{project-name}}!", name),
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
