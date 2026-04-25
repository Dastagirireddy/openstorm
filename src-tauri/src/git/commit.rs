//! Git commit operations

use serde::{Deserialize, Serialize};
use super::{run_git_command, run_git_command_void};

/// Result of a commit operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitResult {
    pub success: bool,
    pub commit_hash: Option<String>,
    pub message: Option<String>,
    pub error: Option<String>,
}

/// Stage a file
pub fn stage_file(path: &str, file_path: &str) -> Result<(), String> {
    run_git_command_void(&["add", file_path], path)
}

/// Stage all files
pub fn stage_all(path: &str) -> Result<(), String> {
    run_git_command_void(&["add", "-A"], path)
}

/// Unstage a file (remove from index but keep changes)
pub fn unstage_file(path: &str, file_path: &str) -> Result<(), String> {
    // First try to unstage (works for already-tracked files)
    let result = run_git_command_void(&["restore", "--staged", file_path], path);

    // If that fails, file might be newly added - use reset HEAD
    if result.is_err() {
        run_git_command_void(&["reset", "HEAD", "--", file_path], path)?;
    }

    Ok(())
}

/// Unstage all files
pub fn unstage_all(path: &str) -> Result<(), String> {
    run_git_command_void(&["reset", "HEAD"], path)
}

/// Create a commit
pub fn commit(path: &str, message: &str) -> Result<CommitResult, String> {
    // Check if there are staged changes
    let staged_status = run_git_command(&["diff", "--cached", "--quiet"], path);

    if staged_status.is_ok() {
        // No staged changes (exit code 0 means no diff)
        return Ok(CommitResult {
            success: false,
            commit_hash: None,
            message: None,
            error: Some("No staged changes to commit".to_string()),
        });
    }

    // Create commit
    run_git_command_void(&["commit", "-m", message], path)?;

    // Get the commit hash
    let hash = run_git_command(&["rev-parse", "HEAD"], path).ok();

    Ok(CommitResult {
        success: true,
        commit_hash: hash,
        message: Some(message.to_string()),
        error: None,
    })
}

/// Amend the last commit
pub fn amend_commit(path: &str, message: Option<&str>) -> Result<CommitResult, String> {
    let mut args = vec!["commit", "--amend", "--no-edit"];

    if let Some(msg) = message {
        args = vec!["commit", "--amend", "-m", msg];
    }

    run_git_command_void(&args, path)?;

    let hash = run_git_command(&["rev-parse", "HEAD"], path).ok();

    Ok(CommitResult {
        success: true,
        commit_hash: hash,
        message: message.map(|s| s.to_string()),
        error: None,
    })
}

/// Discard changes in a file (restore to HEAD or index)
pub fn discard_file_changes(path: &str, file_path: &str, staged: bool) -> Result<(), String> {
    if staged {
        // Restore from HEAD, discarding staged changes
        run_git_command_void(&["restore", "--staged", "--worktree", file_path], path)?;
    } else {
        // Restore working directory from index
        run_git_command_void(&["restore", file_path], path)?;
    }
    Ok(())
}

/// Discard all changes
pub fn discard_all_changes(path: &str) -> Result<(), String> {
    // Reset index
    run_git_command_void(&["reset", "--hard"], path)?;

    // Clean untracked files (optional - could be dangerous)
    // run_git_command_void(&["clean", "-fd"], path)?;

    Ok(())
}

/// Get the last commit info
pub fn get_last_commit(path: &str) -> Result<CommitInfo, String> {
    let hash = run_git_command(&["rev-parse", "HEAD"], path)?;
    let short_hash = hash.chars().take(7).collect();
    let subject = run_git_command(&["log", "-1", "--format=%s"], path)?;
    let body = run_git_command(&["log", "-1", "--format=%b"], path)?;
    let author = run_git_command(&["log", "-1", "--format=%an"], path)?;
    let email = run_git_command(&["log", "-1", "--format=%ae"], path)?;
    let timestamp = run_git_command(&["log", "-1", "--format=%ct"], path)?;

    Ok(CommitInfo {
        hash,
        short_hash,
        subject,
        body,
        author,
        author_email: email,
        timestamp: timestamp.parse().unwrap_or(0),
    })
}

/// Commit information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub body: String,
    pub author: String,
    pub author_email: String,
    pub timestamp: i64,
}
