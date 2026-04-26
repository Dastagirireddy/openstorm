//! Git IPC commands for Tauri

use crate::git;
use crate::git::repo::RepoInfo;
use crate::git::status::RepoStatus;
use crate::git::branch::BranchInfo;
use crate::git::commit::{CommitResult, CommitInfo};
use crate::git::diff::DiffStats;
use crate::git::remote::RemoteInfo;
use crate::git::log::{CommitEntry, LogFilters};
use crate::git::github::{PullRequest, fetch_pull_requests_with_gh, format_relative_time};

/// Check if git is installed on the system
#[tauri::command]
pub fn git_check_installed() -> Result<bool, String> {
    Ok(git::is_git_available())
}

/// Check if a path is a git repository
#[tauri::command]
pub fn git_check_repository(path: String) -> Result<RepoInfo, String> {
    Ok(git::repo::get_repo_info(&path))
}

/// Initialize a git repository
#[tauri::command]
pub fn git_init(path: String) -> Result<String, String> {
    git::repo::init_repository(&path)
}

/// Get current branch name
#[tauri::command]
pub fn git_get_branch(path: String) -> Result<String, String> {
    git::branch::get_current_branch(&path)
}

/// Get repository status (staged, unstaged, untracked files)
#[tauri::command]
pub fn git_get_status(path: String) -> Result<RepoStatus, String> {
    git::status::get_repo_status(&path)
}

/// List all local branches
#[tauri::command]
pub fn git_list_branches(path: String) -> Result<Vec<BranchInfo>, String> {
    git::branch::list_local_branches(&path)
}

/// List all remote branches
#[tauri::command]
pub fn git_list_remote_branches(path: String) -> Result<Vec<BranchInfo>, String> {
    git::branch::list_remote_branches(&path)
}

/// Create a new branch
#[tauri::command]
pub fn git_create_branch(path: String, name: String, start_point: Option<String>) -> Result<(), String> {
    git::branch::create_branch(&path, &name, start_point.as_deref())
}

/// Delete a branch
#[tauri::command]
pub fn git_delete_branch(path: String, name: String, force: bool) -> Result<(), String> {
    git::branch::delete_branch(&path, &name, force)
}

/// Checkout/switch to a branch
#[tauri::command]
pub fn git_checkout_branch(path: String, name: String) -> Result<(), String> {
    git::branch::checkout_branch(&path, &name)
}

/// Stage a file
#[tauri::command]
pub fn git_stage_file(path: String, filePath: String) -> Result<(), String> {
    git::commit::stage_file(&path, &filePath)
}

/// Stage all files
#[tauri::command]
pub fn git_stage_all(path: String) -> Result<(), String> {
    git::commit::stage_all(&path)
}

/// Unstage a file
#[tauri::command]
pub fn git_unstage_file(path: String, filePath: String) -> Result<(), String> {
    git::commit::unstage_file(&path, &filePath)
}

/// Unstage all files
#[tauri::command]
pub fn git_unstage_all(path: String) -> Result<(), String> {
    git::commit::unstage_all(&path)
}

/// Create a commit
#[tauri::command]
pub fn git_commit(path: String, message: String) -> Result<CommitResult, String> {
    git::commit::commit(&path, &message)
}

/// Amend the last commit
#[tauri::command]
pub fn git_amend_commit(path: String, message: Option<String>) -> Result<CommitResult, String> {
    git::commit::amend_commit(&path, message.as_deref())
}

/// Discard changes in a file
#[tauri::command]
pub fn git_discard_file(path: String, filePath: String, staged: bool) -> Result<(), String> {
    git::commit::discard_file_changes(&path, &filePath, staged)
}

/// Discard all changes
#[tauri::command]
pub fn git_discard_all(path: String) -> Result<(), String> {
    git::commit::discard_all_changes(&path)
}

/// Get diff for a file
#[tauri::command]
pub fn git_get_file_diff(path: String, filePath: String, staged: bool) -> Result<String, String> {
    git::status::get_file_diff(&path, &filePath, staged)
}

/// Get repository diff stats
#[tauri::command]
pub fn git_get_diff_stats(path: String) -> Result<DiffStats, String> {
    git::diff::get_diff_stats(&path)
}

/// Fetch from remote
#[tauri::command]
pub fn git_fetch(path: String) -> Result<(), String> {
    git::branch::fetch(&path).map(|_| ())
}

/// Pull from remote
#[tauri::command]
pub fn git_pull(path: String) -> Result<String, String> {
    git::branch::pull(&path)
}

/// Push to remote
#[tauri::command]
pub fn git_push(path: String, force: bool) -> Result<String, String> {
    if force {
        git::branch::push_force(&path, None, None)
    } else {
        git::branch::push(&path, None, None)
    }
}

/// List remotes
#[tauri::command]
pub fn git_list_remotes(path: String) -> Result<Vec<RemoteInfo>, String> {
    git::remote::list_remotes(&path)
}

/// Add a remote
#[tauri::command]
pub fn git_add_remote(path: String, name: String, url: String) -> Result<(), String> {
    git::remote::add_remote(&path, &name, &url)
}

/// Remove a remote
#[tauri::command]
pub fn git_remove_remote(path: String, name: String) -> Result<(), String> {
    git::remote::remove_remote(&path, &name)
}

/// Get commit log
#[tauri::command]
pub fn git_get_log(
    path: String,
    limit: Option<usize>,
    author: Option<String>,
    since: Option<String>,
    until: Option<String>,
    path_filter: Option<String>,
    merges_only: Option<bool>,
    no_merges: Option<bool>,
) -> Result<Vec<CommitEntry>, String> {
    let filters = LogFilters {
        author,
        since,
        until,
        path: path_filter,
        merges_only: merges_only.unwrap_or(false),
        no_merges: no_merges.unwrap_or(false),
    };
    git::log::get_log(&path, limit, Some(filters))
}

/// Get commit details
#[tauri::command]
pub fn git_get_commit(path: String, hash: String) -> Result<CommitEntry, String> {
    git::log::get_commit(&path, &hash)
}

/// Get commit diff
#[tauri::command]
pub fn git_get_commit_diff(path: String, hash: String) -> Result<String, String> {
    git::log::get_commit_diff(&path, &hash)
}

/// Get last commit info
#[tauri::command]
pub fn git_get_last_commit(path: String) -> Result<CommitInfo, String> {
    git::commit::get_last_commit(&path)
}

/// Search commits by message
#[tauri::command]
pub fn git_search_commits(path: String, query: String, limit: Option<usize>) -> Result<Vec<CommitEntry>, String> {
    git::log::search_commits(&path, &query, limit)
}

/// Get file history
#[tauri::command]
pub fn git_get_file_history(path: String, filePath: String, limit: Option<usize>) -> Result<Vec<CommitEntry>, String> {
    git::log::get_file_log(&path, &filePath, limit)
}

/// Get GitHub pull requests
#[tauri::command]
pub fn git_get_pull_requests(path: String) -> Result<Vec<PullRequest>, String> {
    let prs = fetch_pull_requests_with_gh(&path)?;

    // Convert to frontend-friendly format
    Ok(prs.into_iter().map(|pr| PullRequest {
        created_at: format_relative_time(&pr.created_at),
        ..pr
    }).collect())
}
