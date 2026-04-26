//! Git branch operations

use serde::{Deserialize, Serialize};
use super::{run_git_command, run_git_command_void};

/// Information about a branch
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
    pub top_commit: Option<String>,
}

/// Get current branch name
pub fn get_current_branch(path: &str) -> Result<String, String> {
    run_git_command(&["branch", "--show-current"], path)
}

/// List all local branches with top commit
pub fn list_local_branches(path: &str) -> Result<Vec<BranchInfo>, String> {
    let output = run_git_command(&["branch", "-v"], path)?;

    let mut branches: Vec<BranchInfo> = output
        .lines()
        .map(|line| {
            let is_current = line.starts_with('*');
            let trimmed = line.trim_start_matches('*').trim_start();
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            let name = parts.first().unwrap_or(&"").to_string();
            let top_commit = parts.get(1).map(|s| s.to_string());

            BranchInfo {
                name,
                is_current,
                is_remote: false,
                upstream: None,
                top_commit,
            }
        })
        .collect();

    // Also fetch remote branches and append them
    if let Ok(remote_output) = run_git_command(&["branch", "-rv"], path) {
        let remote_branches: Vec<BranchInfo> = remote_output
            .lines()
            .map(|line| {
                // Handle HEAD symbolic ref (e.g., "* (HEAD detached at abc1234)" or "remotes/origin/HEAD -> origin/main")
                if line.contains("->") {
                    // Parse symbolic ref like "origin/HEAD -> origin/main"
                    let parts: Vec<&str> = line.split("->").collect();
                    if parts.len() == 2 {
                        let name = parts[0].trim().to_string();
                        let target = parts[1].trim().to_string();
                        return Some(BranchInfo {
                            name,
                            is_current: line.starts_with('*'),
                            is_remote: true,
                            upstream: Some(target),
                            top_commit: None,
                        });
                    }
                    return None;
                }

                let trimmed = line.trim();
                let is_current = trimmed.starts_with('*');
                let trimmed = trimmed.trim_start_matches('*').trim_start();
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                let name = parts.first().unwrap_or(&"").to_string();
                let top_commit = parts.get(1).map(|s| s.to_string());

                // Extract upstream info (e.g., "origin/main" has upstream "origin")
                let upstream = name.split('/').next().map(|s| s.to_string());

                Some(BranchInfo {
                    name,
                    is_current,
                    is_remote: true,
                    upstream,
                    top_commit,
                })
            })
            .filter_map(|x| x)
            .collect();

        branches.extend(remote_branches);
    }

    Ok(branches)
}

/// List all remote branches with top commit
pub fn list_remote_branches(path: &str) -> Result<Vec<BranchInfo>, String> {
    let output = run_git_command(&["branch", "-rv"], path)?;

    let branches: Vec<BranchInfo> = output
        .lines()
        .filter(|line| !line.contains("->")) // Skip HEAD symbolic refs
        .map(|line| {
            let trimmed = line.trim();
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            let name = parts.first().unwrap_or(&"").to_string();
            let top_commit = parts.get(1).map(|s| s.to_string());

            BranchInfo {
                name,
                is_current: false,
                is_remote: true,
                upstream: None,
                top_commit,
            }
        })
        .collect();

    Ok(branches)
}

/// Create a new branch
pub fn create_branch(path: &str, name: &str, start_point: Option<&str>) -> Result<(), String> {
    match start_point {
        Some(point) => run_git_command_void(&["checkout", "-b", name, point], path),
        None => run_git_command_void(&["checkout", "-b", name], path),
    }
}

/// Delete a branch
pub fn delete_branch(path: &str, name: &str, force: bool) -> Result<(), String> {
    if force {
        run_git_command_void(&["branch", "-D", name], path)
    } else {
        run_git_command_void(&["branch", "-d", name], path)
    }
}

/// Checkout/switch to a branch
pub fn checkout_branch(path: &str, name: &str) -> Result<(), String> {
    run_git_command_void(&["checkout", name], path)
}

/// Get upstream branch for current branch
pub fn get_upstream_branch(path: &str) -> Option<String> {
    run_git_command(&["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], path).ok()
}

/// Fetch from remote
pub fn fetch(path: &str) -> Result<String, String> {
    run_git_command(&["fetch", "--all"], path)
}

/// Pull from remote
pub fn pull(path: &str) -> Result<String, String> {
    run_git_command(&["pull"], path)
}

/// Push to remote
pub fn push(path: &str, remote: Option<&str>, branch: Option<&str>) -> Result<String, String> {
    let mut args = vec!["push"];

    if let Some(r) = remote {
        args.push(r);
    }

    if let Some(b) = branch {
        args.push(b);
    }

    run_git_command(&args, path)
}

/// Push with force
pub fn push_force(path: &str, remote: Option<&str>, branch: Option<&str>) -> Result<String, String> {
    let mut args = vec!["push", "--force"];

    if let Some(r) = remote {
        args.push(r);
    }

    if let Some(b) = branch {
        args.push(b);
    }

    run_git_command(&args, path)
}

/// Set upstream for current branch
pub fn set_upstream(path: &str, remote: &str, branch: &str) -> Result<(), String> {
    let upstream = format!("{}/{}", remote, branch);
    run_git_command_void(&["branch", "--set-upstream-to", &upstream], path)
}
