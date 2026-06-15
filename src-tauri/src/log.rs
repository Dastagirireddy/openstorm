/**
 * Application Log Module
 *
 * Provides logging that emits Tauri events to the frontend console panel.
 * Also writes to stderr for debugging in development mode.
 */

use std::sync::OnceLock;
use tauri::AppHandle;
use tauri::Emitter;

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

/// Initialize the log system with the app handle
pub fn init(app_handle: AppHandle) {
    let _ = APP_HANDLE.set(app_handle);
}

/// Emit a log event to the frontend console panel
pub fn emit_log(level: &str, message: &str) {
    // Always print to stderr for debugging
    match level {
        "error" => eprintln!("[ERROR] {}", message),
        "warn" => eprintln!("[WARN] {}", message),
        _ => println!("[{}] {}", level.to_uppercase(), message),
    }

    // Emit to frontend if app handle is available
    if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("app-log", serde_json::json!({
            "level": level,
            "message": message,
            "timestamp": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        }));
    }
}

/// Log an info message
#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => {
        $crate::log::emit_log("info", &format!($($arg)*))
    };
}

/// Log a warning message
#[macro_export]
macro_rules! log_warn {
    ($($arg:tt)*) => {
        $crate::log::emit_log("warn", &format!($($arg)*))
    };
}

/// Log an error message
#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => {
        $crate::log::emit_log("error", &format!($($arg)*))
    };
}

/// Log a debug message (only in debug builds)
#[macro_export]
macro_rules! log_debug {
    ($($arg:tt)*) => {
        #[cfg(debug_assertions)]
        $crate::log::emit_log("debug", &format!($($arg)*))
    };
}
