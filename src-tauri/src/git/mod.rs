//! Git integration module
//!
//! Provides git repository operations via CLI spawning.
//! All operations require git to be installed on the system.

pub mod repo;
pub mod status;
pub mod branch;
pub mod diff;
pub mod commit;
pub mod remote;
pub mod log;
pub mod github;

use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};

/// Global flag indicating if git binary is available
static GIT_AVAILABLE: AtomicBool = AtomicBool::new(false);

/// Check if git is installed on first run
pub fn check_git_installed() -> bool {
    let available = Command::new("git")
        .arg("--version")
        .output()
        .is_ok();

    GIT_AVAILABLE.store(available, Ordering::Relaxed);
    available
}

/// Check if git is available (uses cached result)
pub fn is_git_available() -> bool {
    GIT_AVAILABLE.load(Ordering::Relaxed)
}

/// Run a git command and return the output
/// Returns Ok(stdout) on success, Err(stderr) on failure
pub fn run_git_command(args: &[&str], cwd: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Run a git command and ignore output (for side effects)
pub fn run_git_command_void(args: &[&str], cwd: &str) -> Result<(), String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
