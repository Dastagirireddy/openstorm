//! Git commit log operations

use serde::{Deserialize, Serialize};
use std::process::Command;
use super::run_git_command;

/// Commit entry in the log
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitEntry {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub body: String,
    pub author: String,
    pub author_email: String,
    pub timestamp: i64,
    pub parent_hashes: Vec<String>,
}

/// Filter options for git log
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LogFilters {
    pub author: Option<String>,
    pub since: Option<String>,
    pub until: Option<String>,
    pub path: Option<String>,
    pub merges_only: bool,
    pub no_merges: bool,
}

/// Get commit log with filters
pub fn get_log(path: &str, limit: Option<usize>, filters: Option<LogFilters>) -> Result<Vec<CommitEntry>, String> {
    let mut cmd = Command::new("git");
    cmd.arg("log")
        .arg("--format=%H%x00%h%x00%s%x00%b%x00%an%x00%ae%x00%ct%x00%P")
        .arg("--no-decorate")
        .current_dir(path);

    if let Some(n) = limit {
        cmd.arg("-n").arg(n.to_string());
    }

    // Apply filters
    if let Some(ref f) = filters {
        if let Some(ref author) = f.author {
            cmd.arg("--author").arg(author);
        }
        if let Some(ref since) = f.since {
            cmd.arg("--since").arg(since);
        }
        if let Some(ref until) = f.until {
            cmd.arg("--until").arg(until);
        }
        if let Some(ref p) = f.path {
            cmd.arg("--").arg(p);
        }
        if f.merges_only {
            cmd.arg("--merges");
        }
        if f.no_merges {
            cmd.arg("--no-merges");
        }
    }

    let output = cmd.output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if output.status.success() {
        let output_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let entries: Vec<CommitEntry> = output_str
            .lines()
            .filter_map(|line| parse_commit_line(line))
            .collect();
        Ok(entries)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Parse a single commit line
fn parse_commit_line(line: &str) -> Option<CommitEntry> {
    let parts: Vec<&str> = line.split('\0').collect();

    if parts.len() < 8 {
        return None;
    }

    Some(CommitEntry {
        hash: parts[0].to_string(),
        short_hash: parts[1].to_string(),
        subject: parts[2].to_string(),
        body: parts[3].to_string(),
        author: parts[4].to_string(),
        author_email: parts[5].to_string(),
        timestamp: parts[6].parse().unwrap_or(0),
        parent_hashes: parts[7]
            .split_whitespace()
            .map(|s| s.to_string())
            .collect(),
    })
}

/// Get commit details
pub fn get_commit(path: &str, hash: &str) -> Result<CommitEntry, String> {
    let output = run_git_command(
        &[
            "show",
            "--format=%H%x00%h%x00%s%x00%b%x00%an%x00%ae%x00%ct%x00%P",
            "--no-patch",
            hash,
        ],
        path,
    )?;

    parse_commit_line(output.trim()).ok_or_else(|| "Failed to parse commit".to_string())
}

/// Get commit diff
pub fn get_commit_diff(path: &str, hash: &str) -> Result<String, String> {
    run_git_command(&["show", hash], path)
}

/// Get commit stats
pub fn get_commit_stats(path: &str, hash: &str) -> Result<String, String> {
    run_git_command(&["show", "--stat", hash], path)
}

/// Search commits by message
pub fn search_commits(path: &str, query: &str, limit: Option<usize>) -> Result<Vec<CommitEntry>, String> {
    let mut cmd = Command::new("git");
    cmd.arg("log")
        .arg("--format=%H%x00%h%x00%s%x00%b%x00%an%x00%ae%x00%ct%x00%P")
        .arg("--grep")
        .arg(query)
        .arg("--no-decorate")
        .current_dir(path);

    if let Some(n) = limit {
        cmd.arg("-n").arg(n.to_string());
    }

    let output = cmd.output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if output.status.success() {
        let output_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let entries: Vec<CommitEntry> = output_str
            .lines()
            .filter_map(|line| parse_commit_line(line))
            .collect();
        Ok(entries)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Get commits by author
pub fn get_commits_by_author(path: &str, author: &str, limit: Option<usize>) -> Result<Vec<CommitEntry>, String> {
    let mut cmd = Command::new("git");
    cmd.arg("log")
        .arg("--format=%H%x00%h%x00%s%x00%b%x00%an%x00%ae%x00%ct%x00%P")
        .arg("--author")
        .arg(author)
        .arg("--no-decorate")
        .current_dir(path);

    if let Some(n) = limit {
        cmd.arg("-n").arg(n.to_string());
    }

    let output = cmd.output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if output.status.success() {
        let output_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let entries: Vec<CommitEntry> = output_str
            .lines()
            .filter_map(|line| parse_commit_line(line))
            .collect();
        Ok(entries)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Get file history
pub fn get_file_log(path: &str, file_path: &str, limit: Option<usize>) -> Result<Vec<CommitEntry>, String> {
    let mut cmd = Command::new("git");
    cmd.arg("log")
        .arg("--format=%H%x00%h%x00%s%x00%b%x00%an%x00%ae%x00%ct%x00%P")
        .arg("--follow")
        .arg("--")
        .arg(file_path)
        .current_dir(path);

    if let Some(n) = limit {
        cmd.arg("-n").arg(n.to_string());
    }

    let output = cmd.output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if output.status.success() {
        let output_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let entries: Vec<CommitEntry> = output_str
            .lines()
            .filter_map(|line| parse_commit_line(line))
            .collect();
        Ok(entries)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
