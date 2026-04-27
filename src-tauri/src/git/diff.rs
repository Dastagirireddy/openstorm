//! Git diff operations

use serde::{Deserialize, Serialize};
use super::run_git_command;

/// A single line in a diff
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub line_number: usize,
    pub content: String,
    pub line_type: DiffLineType,
}

/// Type of diff line
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DiffLineType {
    Context,
    Added,
    Removed,
    Header,
}

/// Diff statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffStats {
    pub additions: usize,
    pub deletions: usize,
    pub files_changed: usize,
}

/// Get unified diff for repository
pub fn get_diff(path: &str, staged: bool) -> Result<String, String> {
    if staged {
        run_git_command(&["diff", "--cached"], path)
    } else {
        run_git_command(&["diff"], path)
    }
}

/// Get diff stats for repository
pub fn get_diff_stats(path: &str) -> Result<DiffStats, String> {
    let output = run_git_command(&["diff", "--stat"], path)?;

    let mut additions = 0;
    let mut deletions = 0;
    let files_changed = output.lines().count();

    for line in output.lines() {
        // Parse stats like: " src/main.rs | 10 +++++-----"
        if let Some(stats_start) = line.find('|') {
            let stats_part = &line[stats_start..];

            // Count + and -
            additions += stats_part.matches('+').count();
            deletions += stats_part.matches('-').count();
        }
    }

    Ok(DiffStats {
        additions,
        deletions,
        files_changed,
    })
}

/// Parse diff into structured lines
pub fn parse_diff(diff: &str) -> Vec<DiffLine> {
    let mut lines = Vec::new();
    let mut line_number = 0;

    for line in diff.lines() {
        let (line_type, content) = if line.starts_with('+') && !line.starts_with("+++") {
            (DiffLineType::Added, line[1..].to_string())
        } else if line.starts_with('-') && !line.starts_with("---") {
            (DiffLineType::Removed, line[1..].to_string())
        } else if line.starts_with("@@") || line.starts_with("diff --git") || line.starts_with("index") {
            (DiffLineType::Header, line.to_string())
        } else if line.starts_with(' ') || line.is_empty() {
            (DiffLineType::Context, line.trim_start().to_string())
        } else {
            (DiffLineType::Header, line.to_string())
        };

        lines.push(DiffLine {
            line_number,
            content,
            line_type,
        });

        line_number += 1;
    }

    lines
}

/// Get word diff (more granular than line diff)
pub fn get_word_diff(path: &str, staged: bool) -> Result<String, String> {
    if staged {
        run_git_command(&["diff", "--cached", "--word-diff"], path)
    } else {
        run_git_command(&["diff", "--word-diff"], path)
    }
}

/// Get diff stats for a specific file
pub fn get_file_diff_stats(path: &str, file_path: &str, staged: bool) -> Result<DiffStats, String> {
    let diff_arg = if staged { "--cached" } else { "" };
    let args = if staged {
        vec!["diff", "--cached", "--stat", "--", file_path]
    } else {
        vec!["diff", "--stat", "--", file_path]
    };

    let output = run_git_command(&args, path)?;

    let mut additions = 0;
    let mut deletions = 0;

    for line in output.lines() {
        // Parse stats like: " src/main.rs | 10 +++++-----"
        if let Some(stats_start) = line.find('|') {
            let stats_part = &line[stats_start..];

            // Count + and -
            additions += stats_part.matches('+').count();
            deletions += stats_part.matches('-').count();
        }
    }

    Ok(DiffStats {
        additions,
        deletions,
        files_changed: if additions > 0 || deletions > 0 { 1 } else { 0 },
    })
}

/// Check if there are any changes
pub fn has_changes(path: &str) -> bool {
    // Check for staged changes
    if run_git_command(&["diff", "--cached", "--quiet"], path).is_err() {
        return true;
    }
    // Check for unstaged changes
    if run_git_command(&["diff", "--quiet"], path).is_err() {
        return true;
    }
    // Check for untracked files
    if run_git_command(&["ls-files", "--others", "--exclude-standard"], path)
        .map(|o| !o.is_empty())
        .unwrap_or(false)
    {
        return true;
    }
    false
}
