/**
 * Application Log Module
 *
 * Provides logging that emits Tauri events to the frontend console panel.
 * Writes to stderr, stdout, and a persistent log file at ~/.config/openstorm/logs/
 */

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;
use tauri::Emitter;

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static LOG_FILE: OnceLock<Mutex<Option<std::fs::File>>> = OnceLock::new();

fn log_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("openstorm")
        .join("logs")
}

fn timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let dt: chrono::DateTime<chrono::Utc> = chrono::DateTime::from_timestamp(now as i64, 0)
        .unwrap_or_default();
    dt.format("%Y-%m-%d %H:%M:%S UTC").to_string()
}

fn file_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let dt: chrono::DateTime<chrono::Utc> = chrono::DateTime::from_timestamp(now as i64, 0)
        .unwrap_or_default();
    dt.format("%Y-%m-%d").to_string()
}

fn ensure_log_file() -> Option<std::fs::File> {
    let dir = log_dir();
    let _ = fs::create_dir_all(&dir);

    let filename = format!("openstorm-{}.log", file_timestamp());
    let path = dir.join(filename);

    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .ok()
}

fn write_log(level: &str, message: &str) {
    let ts = timestamp();
    let line = format!("[{}] [{}] {}\n", ts, level.to_uppercase(), message);

    // Write to file
    if let Some(file_lock) = LOG_FILE.get() {
        if let Ok(mut guard) = file_lock.lock() {
            if let Some(ref mut file) = *guard {
                let _ = file.write_all(line.as_bytes());
                let _ = file.flush();
            }
        }
    }
}

/// Initialize the log system with the app handle
pub fn init(app_handle: AppHandle) {
    let _ = APP_HANDLE.set(app_handle);

    let file = ensure_log_file();
    let _ = LOG_FILE.set(Mutex::new(file));

    emit_log("info", &format!("Log file initialized at: {:?}", log_dir()));
}

/// Emit a log event to the frontend console panel
pub fn emit_log(level: &str, message: &str) {
    // Print to stderr/stdout
    match level {
        "error" => eprintln!("[ERROR] {}", message),
        "warn" => eprintln!("[WARN] {}", message),
        _ => println!("[{}] {}", level.to_uppercase(), message),
    }

    // Write to log file
    write_log(level, message);

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

/// Log a debug message (enabled in all builds for production debugging)
#[macro_export]
macro_rules! log_debug {
    ($($arg:tt)*) => {
        $crate::log::emit_log("debug", &format!($($arg)*))
    };
}
