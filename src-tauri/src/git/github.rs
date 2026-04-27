//! GitHub Pull Requests support

use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequest {
    pub id: i64,
    pub number: i64,
    pub title: String,
    pub state: String, // open, closed, merged
    pub author: String,
    pub created_at: String,
    pub head_branch: String,
    pub base_branch: String,
    pub body: Option<String>,
    pub commits: i32,
    pub changed_files: i32,
    pub additions: i32,
    pub deletions: i32,
}

/// Get the GitHub remote URL from a repository
pub fn get_github_remote(path: &str) -> Option<String> {
    let output = Command::new("git")
        .args(["-C", path, "remote", "get-url", "origin"])
        .output()
        .ok()?;

    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if url.contains("github.com") {
        Some(url)
    } else {
        None
    }
}

/// Parse owner and repo name from GitHub URL
pub fn parse_github_repo(url: &str) -> Option<(String, String)> {
    let url = url.trim_end_matches(".git");

    // Handle SSH URLs: git@github.com:owner/repo.git
    if url.starts_with("git@github.com:") {
        let parts = url.strip_prefix("git@github.com:")?.split('/').collect::<Vec<_>>();
        if parts.len() >= 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }

    // Handle HTTPS URLs: https://github.com/owner/repo.git
    if url.starts_with("https://github.com/") {
        let parts = url.strip_prefix("https://github.com/")?.split('/').collect::<Vec<_>>();
        if parts.len() >= 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }

    None
}

/// Fetch pull requests using gh CLI
pub fn fetch_pull_requests_with_gh(path: &str) -> Result<Vec<PullRequest>, String> {
    // Check if gh is available
    if !is_gh_available() {
        return Err("gh CLI not available".to_string());
    }

    // Get remote URL
    let remote_url = get_github_remote(path)
        .ok_or_else(|| "No GitHub remote found".to_string())?;

    let (owner, repo) = parse_github_repo(&remote_url)
        .ok_or_else(|| "Could not parse GitHub owner/repo".to_string())?;

    // Fetch PRs using gh CLI
    let output = Command::new("gh")
        .args([
            "pr", "list",
            "--repo", &format!("{}/{}", owner, repo),
            "--state", "all",
            "--limit", "100",
            "--json", "number,title,state,author,createdAt,headRefName,baseRefName,body,commits,changedFiles,additions,deletions,id"
        ])
        .output()
        .map_err(|e| format!("Failed to run gh: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh command failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let prs: Vec<serde_json::Value> = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse gh output: {}", e))?;

    let mut pull_requests = Vec::new();

    for pr in prs {
        let state = pr["state"].as_str().unwrap_or("open").to_string();
        // gh returns "OPEN", "CLOSED", "MERGED" - normalize to lowercase
        let normalized_state = match state.to_lowercase().as_str() {
            "open" => "open",
            "closed" => "closed",
            "merged" => "merged",
            _ => "open",
        }.to_string();

        let pr = PullRequest {
            id: pr["id"].as_i64().unwrap_or(0),
            number: pr["number"].as_i64().unwrap_or(0),
            title: pr["title"].as_str().unwrap_or("").to_string(),
            state: normalized_state,
            author: pr["author"]["login"].as_str().unwrap_or("").to_string(),
            created_at: pr["createdAt"].as_str().unwrap_or("").to_string(),
            head_branch: pr["headRefName"].as_str().unwrap_or("").to_string(),
            base_branch: pr["baseRefName"].as_str().unwrap_or("").to_string(),
            body: pr["body"].as_str().map(|s| s.to_string()),
            commits: pr["commits"].as_i64().map(|v| v as i32).unwrap_or(0),
            changed_files: pr["changedFiles"].as_i64().map(|v| v as i32).unwrap_or(0),
            additions: pr["additions"].as_i64().map(|v| v as i32).unwrap_or(0),
            deletions: pr["deletions"].as_i64().map(|v| v as i32).unwrap_or(0),
        };

        pull_requests.push(pr);
    }

    Ok(pull_requests)
}

/// Check if gh CLI is available
fn is_gh_available() -> bool {
    Command::new("gh")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Format timestamp as relative (e.g., "2 hours ago")
pub fn format_relative_time(iso_date: &str) -> String {
    if let Ok(utc_time) = iso_date.parse::<chrono::DateTime<chrono::Utc>>() {
        let now = chrono::Utc::now();
        let duration = now.signed_duration_since(utc_time);

        let hours = duration.num_hours();
        let days = duration.num_days();
        let weeks = duration.num_weeks();
        let months = duration.num_days() / 30;

        if hours < 1 {
            let minutes = duration.num_minutes();
            if minutes < 1 {
                "Just now".to_string()
            } else {
                format!("{} minutes ago", minutes)
            }
        } else if hours < 24 {
            format!("{} hours ago", hours)
        } else if days < 7 {
            format!("{} days ago", days)
        } else if weeks < 4 {
            format!("{} weeks ago", weeks)
        } else if months < 12 {
            format!("{} months ago", months)
        } else {
            let years = months / 12;
            format!("{} years ago", years)
        }
    } else {
        iso_date.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_github_url_https() {
        let url = "https://github.com/owner/repo.git";
        let (owner, repo) = parse_github_repo(url).unwrap();
        assert_eq!(owner, "owner");
        assert_eq!(repo, "repo");
    }

    #[test]
    fn test_parse_github_url_ssh() {
        let url = "git@github.com:owner/repo.git";
        let (owner, repo) = parse_github_repo(url).unwrap();
        assert_eq!(owner, "owner");
        assert_eq!(repo, "repo");
    }
}
