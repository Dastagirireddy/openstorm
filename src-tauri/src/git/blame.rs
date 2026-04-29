//! Git blame functionality
//!
//! Runs `git blame --porcelain` and returns raw output for parsing.

use crate::git::run_git_command;
use std::path::Path;

/// Get git blame for a file in porcelain format
///
/// Returns the raw porcelain output which includes:
/// - Commit hash, author, author-time, author-tz
/// - Commit summary (subject)
/// - Line content
pub fn get_blame(repo_path: &str, file_path: &str) -> Result<String, String> {
    let repo_path = Path::new(repo_path);

    // Verify file exists
    let full_path = repo_path.join(file_path);
    println!("[git:blame] repo_path={}, file_path={}, full_path={}", repo_path.display(), file_path, full_path.display());
    if !full_path.exists() {
        eprintln!("[git:blame] ERROR: File not found: {}", full_path.display());
        return Err(format!("File not found: {}", file_path));
    }

    // Run git blame --porcelain
    // Porcelain format is stable and designed for parsing
    let args = vec![
        "blame",
        "--porcelain",
        "-M",  // Detect moved lines within file
        "-C",  // Detect moved lines from other files
        "-w",  // Ignore whitespace
        "--",
        file_path,
    ];

    let result = run_git_command(&args, repo_path.to_str().unwrap());
    match &result {
        Ok(output) => println!("[git:blame] SUCCESS: output len={}, first 200 chars: {}", output.len(), &output[..output.len().min(200)]),
        Err(e) => eprintln!("[git:blame] ERROR: {}", e),
    }
    result
}
