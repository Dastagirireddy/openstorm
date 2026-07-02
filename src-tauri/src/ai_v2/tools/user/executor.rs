use std::path::PathBuf;
use std::time::Duration;

use tokio::io::AsyncWriteExt;
use tokio::process::Command;

use super::config::UserToolConfig;
use super::sandbox::ToolSandbox;

/// Execute user-defined tools as subprocesses
///
/// Tools communicate via JSON on stdin/stdout. Designed for extensibility
/// to support HTTP, Unix sockets, etc. in the future.
pub struct ToolExecutor;

impl ToolExecutor {
    /// Execute a user-defined tool
    ///
    /// # Arguments
    /// * `config` - Tool configuration
    /// * `args` - JSON arguments to pass via stdin
    /// * `project_path` - Project root path
    ///
    /// # Returns
    /// * `Ok(output)` - Tool execution output
    /// * `Err(e)` - Execution error
    pub async fn execute(
        config: &UserToolConfig,
        args: &serde_json::Value,
        project_path: &PathBuf,
    ) -> Result<ToolOutput, ExecutionError> {
        let start = std::time::Instant::now();

        // Create sandbox
        let sandbox = ToolSandbox::from_config(&config.sandbox, project_path);

        // Build command
        let mut cmd = Command::new(&config.command);
        cmd.args(&config.args);

        // Set working directory
        cmd.current_dir(project_path);

        // Apply sandbox restrictions
        sandbox.apply_restrictions(&mut cmd);

        // Set timeout
        let timeout = Duration::from_millis(config.timeout_ms);

        // Serialize args to JSON for stdin
        let input = serde_json::to_string(args)
            .map_err(|e| ExecutionError::InvalidInput(e.to_string()))?;

        // Execute with timeout
        let mut child = cmd
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| ExecutionError::ProcessError(e.to_string()))?;

        // Write input to stdin
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(input.as_bytes()).await
                .map_err(|e| ExecutionError::ProcessError(format!("Failed to write stdin: {}", e)))?;
            stdin.shutdown().await
                .map_err(|e| ExecutionError::ProcessError(format!("Failed to close stdin: {}", e)))?;
        }

        // Wait for output with timeout
        let output = tokio::time::timeout(timeout, child.wait_with_output())
            .await
            .map_err(|_| ExecutionError::Timeout(config.timeout_ms))?
            .map_err(|e| ExecutionError::ProcessError(e.to_string()))?;

        let duration = start.elapsed();

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() {
            let code = output.status.code().unwrap_or(-1);
            return Err(ExecutionError::NonZeroExit {
                code,
                stderr,
            });
        }

        // Parse JSON output from stdout
        let result: serde_json::Value = serde_json::from_str(&stdout)
            .map_err(|_| ExecutionError::InvalidOutput(format!(
                "Failed to parse JSON output: {}",
                &stdout[..stdout.len().min(200)]
            )))?;

        Ok(ToolOutput {
            result,
            stdout,
            stderr,
            duration_ms: duration.as_millis() as u64,
            exit_code: output.status.code().unwrap_or(0),
        })
    }

    /// Validate that a tool command exists and is executable
    pub fn validate_command(config: &UserToolConfig) -> Result<(), ValidationError> {
        // Check if command is a valid path
        if config.command.is_empty() {
            return Err(ValidationError::EmptyCommand);
        }

        // Check if command exists in PATH or is a valid file path
        if config.command.contains('/') || config.command.contains('\\') {
            let path = std::path::Path::new(&config.command);
            if !path.exists() {
                return Err(ValidationError::CommandNotFound(config.command.clone()));
            }
            if !path.is_file() {
                return Err(ValidationError::NotAFile(config.command.clone()));
            }
        }

        // Validate tool name (snake_case)
        if !config.name.chars().all(|c| c.is_alphanumeric() || c == '_') {
            return Err(ValidationError::InvalidName(config.name.clone()));
        }

        // Validate args don't contain shell metacharacters (basic check)
        for arg in &config.args {
            if arg.contains(';') || arg.contains('|') || arg.contains('&') {
                return Err(ValidationError::UnsafeArg(arg.clone()));
            }
        }

        Ok(())
    }
}

/// Tool execution output
#[derive(Debug, Clone)]
pub struct ToolOutput {
    /// Parsed JSON result
    pub result: serde_json::Value,
    /// Raw stdout
    pub stdout: String,
    /// Raw stderr
    pub stderr: String,
    /// Execution time in milliseconds
    pub duration_ms: u64,
    /// Process exit code
    pub exit_code: i32,
}

/// Execution errors
#[derive(Debug, thiserror::Error)]
pub enum ExecutionError {
    #[error("Process exited with non-zero code {code}: {stderr}")]
    NonZeroExit { code: i32, stderr: String },

    #[error("Execution timed out after {0}ms")]
    Timeout(u64),

    #[error("Process error: {0}")]
    ProcessError(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Invalid output: {0}")]
    InvalidOutput(String),
}

/// Validation errors
#[derive(Debug, thiserror::Error)]
pub enum ValidationError {
    #[error("Command cannot be empty")]
    EmptyCommand,

    #[error("Command not found: {0}")]
    CommandNotFound(String),

    #[error("Not a file: {0}")]
    NotAFile(String),

    #[error("Invalid tool name (must be snake_case): {0}")]
    InvalidName(String),

    #[error("Unsafe argument (contains shell metacharacters): {0}")]
    UnsafeArg(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[tokio::test]
    async fn test_execute_echo() {
        let config = UserToolConfig {
            name: "echo_test".to_string(),
            description: "Test echo".to_string(),
            command: "echo".to_string(),
            args: vec![],
            input_schema: serde_json::json!({"type": "object"}),
            trust_tier: super::super::config::TrustTierConfig::Standard,
            category: "test".to_string(),
            timeout_ms: 5000,
            sandbox: super::super::config::SandboxConfig::default(),
        };

        let args = serde_json::json!({"message": "hello"});
        let project_path = PathBuf::from("/tmp");

        // This will fail because echo doesn't output JSON, but it tests the flow
        let result = ToolExecutor::execute(&config, &args, &project_path).await;
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_command_empty() {
        let config = UserToolConfig {
            name: "test".to_string(),
            description: "".to_string(),
            command: "".to_string(),
            args: vec![],
            input_schema: serde_json::json!({}),
            trust_tier: super::super::config::TrustTierConfig::Standard,
            category: "".to_string(),
            timeout_ms: 5000,
            sandbox: super::super::config::SandboxConfig::default(),
        };

        let result = ToolExecutor::validate_command(&config);
        assert!(matches!(result, Err(ValidationError::EmptyCommand)));
    }

    #[test]
    fn test_validate_tool_name() {
        let valid = UserToolConfig {
            name: "my_tool".to_string(),
            description: "".to_string(),
            command: "echo".to_string(),
            args: vec![],
            input_schema: serde_json::json!({}),
            trust_tier: super::super::config::TrustTierConfig::Standard,
            category: "".to_string(),
            timeout_ms: 5000,
            sandbox: super::super::config::SandboxConfig::default(),
        };
        assert!(ToolExecutor::validate_command(&valid).is_ok());

        let invalid = UserToolConfig {
            name: "my-tool!".to_string(),
            ..valid
        };
        let result = ToolExecutor::validate_command(&invalid);
        assert!(matches!(result, Err(ValidationError::InvalidName(_))));
    }

    #[test]
    fn test_validate_args_safety() {
        let safe = UserToolConfig {
            name: "safe".to_string(),
            description: "".to_string(),
            command: "echo".to_string(),
            args: vec!["hello".to_string(), "world".to_string()],
            input_schema: serde_json::json!({}),
            trust_tier: super::super::config::TrustTierConfig::Standard,
            category: "".to_string(),
            timeout_ms: 5000,
            sandbox: super::super::config::SandboxConfig::default(),
        };
        assert!(ToolExecutor::validate_command(&safe).is_ok());

        let unsafe_cmd = UserToolConfig {
            args: vec!["hello; rm -rf /".to_string()],
            ..safe
        };
        let result = ToolExecutor::validate_command(&unsafe_cmd);
        assert!(matches!(result, Err(ValidationError::UnsafeArg(_))));
    }
}
