//! Repository detection and initialization

use std::process::Command;
use super::run_git_command;

/// Information about a git repository
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RepoInfo {
    pub is_repository: bool,
    pub root_path: Option<String>,
    pub git_dir: Option<String>,
}

/// Check if a path is inside a git repository
pub fn is_git_repository(path: &str) -> bool {
    let output = Command::new("git")
        .arg("rev-parse")
        .arg("--is-inside-work-tree")
        .current_dir(path)
        .output();

    match output {
        Ok(o) => o.status.success(),
        Err(_) => false,
    }
}

/// Get repository root path
pub fn get_repository_root(path: &str) -> Option<String> {
    let output = Command::new("git")
        .arg("rev-parse")
        .arg("--show-toplevel")
        .current_dir(path)
        .output()
        .ok()?;

    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

/// Get .git directory path
pub fn get_git_dir(path: &str) -> Option<String> {
    let output = Command::new("git")
        .arg("rev-parse")
        .arg("--git-dir")
        .current_dir(path)
        .output()
        .ok()?;

    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

/// Get full repository information
pub fn get_repo_info(path: &str) -> RepoInfo {
    let is_repo = is_git_repository(path);

    if !is_repo {
        return RepoInfo {
            is_repository: false,
            root_path: None,
            git_dir: None,
        };
    }

    RepoInfo {
        is_repository: true,
        root_path: get_repository_root(path),
        git_dir: get_git_dir(path),
    }
}

/// Initialize a git repository
pub fn init_repository(path: &str) -> Result<String, String> {
    run_git_command(&["init"], path)?;

    // Get the initial branch name
    match run_git_command(&["branch", "--show-current"], path) {
        Ok(branch) => Ok(branch),
        Err(_) => Ok("main".to_string()), // Default if no commits yet
    }
}
