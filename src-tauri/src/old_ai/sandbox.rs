use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;

/// Sandbox for safe command execution
#[derive(Clone)]
pub struct Sandbox {
    /// Resource limits
    limits: ResourceLimits,
    /// Whether sandbox is enabled
    enabled: bool,
}

/// Resource limits for command execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLimits {
    /// Max execution time in seconds
    pub max_timeout: u64,
    /// Max output size in bytes
    pub max_output: usize,
    /// Max file size for writes in bytes
    pub max_write_size: usize,
    /// Allowed file extensions for write
    pub allowed_write_extensions: Vec<String>,
    /// Denied directories (cannot write to)
    pub denied_directories: Vec<String>,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            max_timeout: 30,
            max_output: 10_000,
            max_write_size: 1_000_000, // 1MB
            allowed_write_extensions: vec![
                "rs".to_string(),
                "ts".to_string(),
                "tsx".to_string(),
                "js".to_string(),
                "jsx".to_string(),
                "py".to_string(),
                "go".to_string(),
                "java".to_string(),
                "rb".to_string(),
                "css".to_string(),
                "html".to_string(),
                "json".to_string(),
                "yaml".to_string(),
                "yml".to_string(),
                "toml".to_string(),
                "md".to_string(),
                "txt".to_string(),
                "sh".to_string(),
                "bash".to_string(),
                "sql".to_string(),
                "xml".to_string(),
                "graphql".to_string(),
            ],
            denied_directories: vec![
                "/".to_string(),
                "/etc".to_string(),
                "/usr".to_string(),
                "/var".to_string(),
                "/tmp".to_string(),
            ],
        }
    }
}

/// Result of a sandbox execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub timed_out: bool,
}

/// Sandbox execution errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SandboxError {
    /// Command timed out
    Timeout { timeout_secs: u64 },
    /// Output exceeded limit
    OutputTooLarge { limit: usize, actual: usize },
    /// File write denied
    WriteDenied { path: String, reason: String },
    /// Execution failed
    ExecutionFailed(String),
}

impl std::fmt::Display for SandboxError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Timeout { timeout_secs } => {
                write!(f, "Command timed out after {} seconds", timeout_secs)
            }
            Self::OutputTooLarge { limit, actual } => {
                write!(
                    f,
                    "Output too large: {} bytes (limit: {} bytes)",
                    actual, limit
                )
            }
            Self::WriteDenied { path, reason } => {
                write!(f, "Write denied for {}: {}", path, reason)
            }
            Self::ExecutionFailed(msg) => write!(f, "Execution failed: {}", msg),
        }
    }
}

impl Sandbox {
    /// Create a new sandbox with default limits
    pub fn new() -> Self {
        Self {
            limits: ResourceLimits::default(),
            enabled: true,
        }
    }

    /// Create a sandbox with custom limits
    pub fn with_limits(limits: ResourceLimits) -> Self {
        Self {
            limits,
            enabled: true,
        }
    }

    /// Create a disabled sandbox (no restrictions)
    pub fn disabled() -> Self {
        Self {
            limits: ResourceLimits::default(),
            enabled: false,
        }
    }

    /// Check if a file write is allowed
    pub fn check_write(&self, path: &str, content_len: usize) -> Result<(), SandboxError> {
        if !self.enabled {
            return Ok(());
        }

        // Check file extension
        if let Some(ext) = Path::new(path).extension().and_then(|e| e.to_str()) {
            if !self
                .limits
                .allowed_write_extensions
                .contains(&ext.to_string())
            {
                return Err(SandboxError::WriteDenied {
                    path: path.to_string(),
                    reason: format!("File extension '.{}' is not allowed", ext),
                });
            }
        }

        // Check file size
        if content_len > self.limits.max_write_size {
            return Err(SandboxError::WriteDenied {
                path: path.to_string(),
                reason: format!(
                    "Write size {} bytes exceeds limit {} bytes",
                    content_len, self.limits.max_write_size
                ),
            });
        }

        // Check denied directories
        for dir in &self.limits.denied_directories {
            if path.starts_with(dir) || path == dir.trim_end_matches('/') {
                return Err(SandboxError::WriteDenied {
                    path: path.to_string(),
                    reason: format!("Cannot write to directory: {}", dir),
                });
            }
        }

        Ok(())
    }

    /// Execute a command with resource limits
    pub async fn execute_command(
        &self,
        command: &str,
        cwd: &str,
    ) -> Result<CommandOutput, SandboxError> {
        if !self.enabled {
            // Execute without restrictions
            return self.execute_unrestricted(command, cwd).await;
        }

        let result = tokio::time::timeout(
            Duration::from_secs(self.limits.max_timeout),
            tokio::process::Command::new("sh")
                .args(["-c", command])
                .current_dir(cwd)
                .output(),
        )
        .await;

        match result {
            Ok(Ok(output)) => {
                let mut stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let mut stderr = String::from_utf8_lossy(&output.stderr).to_string();

                // Truncate output if too large
                let mut timed_out = false;
                if stdout.len() > self.limits.max_output {
                    stdout.truncate(self.limits.max_output);
                    stdout.push_str("\n... (output truncated)");
                    timed_out = true;
                }
                if stderr.len() > self.limits.max_output {
                    stderr.truncate(self.limits.max_output);
                    stderr.push_str("\n... (output truncated)");
                }

                Ok(CommandOutput {
                    stdout,
                    stderr,
                    exit_code: output.status.code().unwrap_or(-1),
                    timed_out,
                })
            }
            Ok(Err(e)) => Err(SandboxError::ExecutionFailed(e.to_string())),
            Err(_) => Err(SandboxError::Timeout {
                timeout_secs: self.limits.max_timeout,
            }),
        }
    }

    /// Execute without restrictions (for when sandbox is disabled)
    async fn execute_unrestricted(
        &self,
        command: &str,
        cwd: &str,
    ) -> Result<CommandOutput, SandboxError> {
        let output = tokio::process::Command::new("sh")
            .args(["-c", command])
            .current_dir(cwd)
            .output()
            .await
            .map_err(|e| SandboxError::ExecutionFailed(e.to_string()))?;

        Ok(CommandOutput {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code().unwrap_or(-1),
            timed_out: false,
        })
    }

    /// Get limits for display
    pub fn limits(&self) -> &ResourceLimits {
        &self.limits
    }

    /// Check if sandbox is enabled
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }
}

impl Default for Sandbox {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_write_allowed_extension() {
        let sandbox = Sandbox::new();
        assert!(sandbox.check_write("src/main.rs", 100).is_ok());
        assert!(sandbox.check_write("index.ts", 100).is_ok());
    }

    #[test]
    fn test_check_write_denied_extension() {
        let sandbox = Sandbox::new();
        assert!(sandbox.check_write("file.exe", 100).is_err());
        assert!(sandbox.check_write("file.dll", 100).is_err());
    }

    #[test]
    fn test_check_write_denied_directory() {
        let sandbox = Sandbox::new();
        assert!(sandbox.check_write("/etc/passwd", 100).is_err());
        assert!(sandbox.check_write("/usr/bin/test", 100).is_err());
    }

    #[test]
    fn test_check_write_size_limit() {
        let limits = ResourceLimits {
            max_write_size: 100,
            ..Default::default()
        };
        let sandbox = Sandbox::with_limits(limits);
        assert!(sandbox.check_write("test.rs", 50).is_ok());
        assert!(sandbox.check_write("test.rs", 200).is_err());
    }

    #[test]
    fn test_disabled_sandbox_allows_all() {
        let sandbox = Sandbox::disabled();
        assert!(sandbox.check_write("/etc/passwd", 1000).is_ok());
    }
}
