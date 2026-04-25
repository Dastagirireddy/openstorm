//! Git status and file change detection

use serde::{Deserialize, Serialize};
use super::run_git_command;

/// Status of a file in the repository
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Added,
    Copied,
    Deleted,
    Modified,
    Renamed,
    TypeChanged,
    Unmerged,
    Untracked,
    Ignored,
}

impl FileStatus {
    pub fn from_short_code(code: char) -> Option<FileStatus> {
        match code {
            'A' => Some(FileStatus::Added),
            'C' => Some(FileStatus::Copied),
            'D' => Some(FileStatus::Deleted),
            'M' => Some(FileStatus::Modified),
            'R' => Some(FileStatus::Renamed),
            'T' => Some(FileStatus::TypeChanged),
            'U' => Some(FileStatus::Unmerged),
            '?' => Some(FileStatus::Untracked),
            '!' => Some(FileStatus::Ignored),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            FileStatus::Added => "added",
            FileStatus::Copied => "copied",
            FileStatus::Deleted => "deleted",
            FileStatus::Modified => "modified",
            FileStatus::Renamed => "renamed",
            FileStatus::TypeChanged => "type_changed",
            FileStatus::Unmerged => "unmerged",
            FileStatus::Untracked => "untracked",
            FileStatus::Ignored => "ignored",
        }
    }
}

/// A file change in the repository
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub path: String,
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub staged: bool,
    pub index: usize,
}

/// Overall repository status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoStatus {
    pub branch: String,
    pub ahead: Option<usize>,
    pub behind: Option<usize>,
    pub staged: Vec<FileChange>,
    pub unstaged: Vec<FileChange>,
    pub untracked: Vec<FileChange>,
    pub total_changes: usize,
}

/// Parse git status output into file changes
fn parse_status_output(output: &str, staged: bool) -> Vec<FileChange> {
    let mut changes = Vec::new();

    for (index, line) in output.lines().enumerate() {
        if line.len() < 4 {
            continue;
        }

        // Format: "XY filename" or "XY old_filename -> new_filename"
        let status_x = line.chars().next().unwrap_or(' ');
        let status_y = line.chars().nth(1).unwrap_or(' ');
        let rest = &line[3..];

        // Determine which status to use (staged vs unstaged)
        let status_char = if staged { status_x } else { status_y };

        if let Some(status) = FileStatus::from_short_code(status_char) {
            // Handle renames: "old_name -> new_name"
            let (path, old_path) = if rest.contains(" -> ") {
                let parts: Vec<&str> = rest.split(" -> ").collect();
                if parts.len() == 2 {
                    (parts[1].to_string(), Some(parts[0].to_string()))
                } else {
                    (rest.to_string(), None)
                }
            } else {
                (rest.to_string(), None)
            };

            changes.push(FileChange {
                path,
                old_path,
                status,
                staged,
                index,
            });
        }
    }

    changes
}

/// Get repository status
pub fn get_repo_status(path: &str) -> Result<RepoStatus, String> {
    // Get current branch
    let branch = run_git_command(&["branch", "--show-current"], path)
        .unwrap_or_else(|_| "HEAD".to_string());

    // Get ahead/behind count
    let (ahead, behind) = get_ahead_behind(path, &branch);

    // Get staged changes (cached)
    let staged_output = run_git_command(&["status", "--porcelain", "--cached"], path)
        .unwrap_or_default();
    let staged = parse_status_output(&staged_output, true);

    // Get unstaged changes (working directory)
    let unstaged_output = run_git_command(&["status", "--porcelain"], path)
        .unwrap_or_default();
    let mut unstaged = parse_status_output(&unstaged_output, false);

    // Filter out already-staged files from unstaged list
    let staged_paths: std::collections::HashSet<_> = staged.iter().map(|c| &c.path).collect();
    unstaged.retain(|c| !staged_paths.contains(&c.path));

    // Get untracked files
    let untracked_output = run_git_command(&["ls-files", "--others", "--exclude-standard"], path)
        .unwrap_or_default();
    let untracked: Vec<FileChange> = untracked_output
        .lines()
        .enumerate()
        .map(|(index, path)| FileChange {
            path: path.to_string(),
            old_path: None,
            status: FileStatus::Untracked,
            staged: false,
            index,
        })
        .collect();

    let total_changes = staged.len() + unstaged.len() + untracked.len();

    Ok(RepoStatus {
        branch,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
        total_changes,
    })
}

/// Get ahead/behind count relative to remote
fn get_ahead_behind(path: &str, branch: &str) -> (Option<usize>, Option<usize>) {
    let remote_branch = format!("origin/{}", branch);

    let output = run_git_command(
        &["rev-list", "--left-right", "--count", &remote_branch, "...HEAD"],
        path,
    );

    match output {
        Ok(counts) => {
            let parts: Vec<&str> = counts.split_whitespace().collect();
            if parts.len() == 2 {
                let ahead = parts[0].parse().ok();
                let behind = parts[1].parse().ok();
                (ahead, behind)
            } else {
                (None, None)
            }
        }
        Err(_) => (None, None),
    }
}

/// Get diff for a specific file
pub fn get_file_diff(path: &str, file_path: &str, staged: bool) -> Result<String, String> {
    if staged {
        run_git_command(&["diff", "--cached", "--", file_path], path)
    } else {
        run_git_command(&["diff", "--", file_path], path)
    }
}

/// Check if a file has changes
pub fn has_file_changes(path: &str, file_path: &str) -> bool {
    // Check staged
    if run_git_command(&["diff", "--cached", "--quiet", "--", file_path], path).is_err() {
        return true;
    }
    // Check unstaged
    if run_git_command(&["diff", "--quiet", "--", file_path], path).is_err() {
        return true;
    }
    false
}
