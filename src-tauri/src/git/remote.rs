//! Git remote operations

use serde::{Deserialize, Serialize};
use super::{run_git_command, run_git_command_void};

/// Information about a remote
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
    pub fetch_url: String,
    pub push_url: String,
}

/// List all remotes
pub fn list_remotes(path: &str) -> Result<Vec<RemoteInfo>, String> {
    let output = run_git_command(&["remote", "-v"], path)?;

    let mut remotes: Vec<RemoteInfo> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for line in output.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 {
            let name = parts[0].to_string();

            // Skip duplicates (fetch/push show twice)
            if seen.contains(&name) {
                continue;
            }
            seen.insert(name.clone());

            remotes.push(RemoteInfo {
                name: name.clone(),
                url: parts[1].to_string(),
                fetch_url: parts[1].to_string(),
                push_url: parts[1].to_string(),
            });
        }
    }

    Ok(remotes)
}

/// Add a new remote
pub fn add_remote(path: &str, name: &str, url: &str) -> Result<(), String> {
    run_git_command_void(&["remote", "add", name, url], path)
}

/// Remove a remote
pub fn remove_remote(path: &str, name: &str) -> Result<(), String> {
    run_git_command_void(&["remote", "remove", name], path)
}

/// Rename a remote
pub fn rename_remote(path: &str, old_name: &str, new_name: &str) -> Result<(), String> {
    run_git_command_void(&["remote", "rename", old_name, new_name], path)
}

/// Change remote URL
pub fn set_remote_url(path: &str, name: &str, url: &str) -> Result<(), String> {
    run_git_command_void(&["remote", "set-url", name, url], path)
}

/// Fetch from a specific remote
pub fn fetch_remote(path: &str, remote: &str) -> Result<String, String> {
    run_git_command(&["fetch", remote], path)
}

/// Fetch from all remotes
pub fn fetch_all(path: &str) -> Result<String, String> {
    run_git_command(&["fetch", "--all"], path)
}

/// Pull from remote (fetch + merge)
pub fn pull(path: &str, remote: Option<&str>, branch: Option<&str>) -> Result<String, String> {
    let mut args = vec!["pull"];

    if let Some(r) = remote {
        args.push(r);
    }

    if let Some(b) = branch {
        args.push(b);
    }

    run_git_command(&args, path)
}

/// Push to remote
pub fn push(path: &str, remote: Option<&str>, branch: Option<&str>, force: bool) -> Result<String, String> {
    let mut args = vec!["push"];

    if force {
        args.push("--force");
    }

    if let Some(r) = remote {
        args.push(r);
    } else {
        args.push("origin");
    }

    if let Some(b) = branch {
        args.push(b);
    } else {
        args.push("HEAD");
    }

    run_git_command(&args, path)
}

/// Get the default remote (usually "origin")
pub fn get_default_remote(path: &str) -> Option<String> {
    // Try to get the remote for the current branch's upstream
    if let Ok(upstream) = run_git_command(&["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], path) {
        if let Some(slash_pos) = upstream.find('/') {
            return Some(upstream[..slash_pos].to_string());
        }
    }

    // Fallback to "origin" if it exists
    if run_git_command(&["remote", "get-url", "origin"], path).is_ok() {
        return Some("origin".to_string());
    }

    None
}

/// Check if remote is reachable
pub fn check_remote(path: &str, remote: &str) -> bool {
    run_git_command(&["ls-remote", remote], path).is_ok()
}
