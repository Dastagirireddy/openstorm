use serde::{Deserialize, Serialize};
use std::path::Path;

/// Verification engine for post-action checks
pub struct Verifier {
    /// Project path
    project_path: String,
    /// Whether verification is enabled
    enabled: bool,
}

/// Result of a verification check
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationResult {
    /// Whether all checks passed
    pub passed: bool,
    /// Individual check results
    pub checks: Vec<CheckResult>,
    /// Suggestion for fixing issues
    pub suggestion: Option<String>,
}

/// A single check result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckResult {
    /// Check name
    pub name: String,
    /// Whether the check passed
    pub passed: bool,
    /// Check message
    pub message: String,
    /// Severity level
    pub severity: Severity,
}

/// Severity of a check result
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Severity {
    Info,
    Warning,
    Error,
}

impl Verifier {
    /// Create a new verifier
    pub fn new(project_path: String) -> Self {
        Self {
            project_path,
            enabled: true,
        }
    }

    /// Create a disabled verifier
    pub fn disabled(project_path: String) -> Self {
        Self {
            project_path,
            enabled: false,
        }
    }

    /// Verify a file write action
    pub async fn verify_write(&self, path: &str, _content: &str) -> VerificationResult {
        if !self.enabled {
            return VerificationResult {
                passed: true,
                checks: vec![],
                suggestion: None,
            };
        }

        let mut checks = Vec::new();

        // Check file extension and run appropriate linter
        if let Some(ext) = Path::new(path).extension().and_then(|e| e.to_str()) {
            match ext {
                "rs" => {
                    if let Some(check) = self.check_rust_syntax(path).await {
                        checks.push(check);
                    }
                }
                "ts" | "tsx" => {
                    if let Some(check) = self.check_typescript_syntax(path).await {
                        checks.push(check);
                    }
                }
                "js" | "jsx" => {
                    if let Some(check) = self.check_javascript_syntax(path).await {
                        checks.push(check);
                    }
                }
                "py" => {
                    if let Some(check) = self.check_python_syntax(path).await {
                        checks.push(check);
                    }
                }
                _ => {}
            }
        }

        let passed = checks.iter().all(|c| c.passed || c.severity != Severity::Error);

        VerificationResult {
            passed,
            checks,
            suggestion: if !passed {
                Some("Consider reverting the changes and trying a different approach".to_string())
            } else {
                None
            },
        }
    }

    /// Verify a command execution
    pub async fn verify_command(&self, command: &str, exit_code: i32, stderr: &str) -> VerificationResult {
        if !self.enabled {
            return VerificationResult {
                passed: true,
                checks: vec![],
                suggestion: None,
            };
        }

        let mut checks = Vec::new();

        // Check exit code
        checks.push(CheckResult {
            name: "exit_code".to_string(),
            passed: exit_code == 0,
            message: format!("Exit code: {}", exit_code),
            severity: if exit_code == 0 {
                Severity::Info
            } else {
                Severity::Warning
            },
        });

        // Check for common error patterns in stderr
        let error_patterns = ["error:", "Error:", "FAILED", "panic:", "fatal:", "Permission denied"];
        for pattern in &error_patterns {
            if stderr.contains(pattern) {
                checks.push(CheckResult {
                    name: "error_pattern".to_string(),
                    passed: false,
                    message: format!("Found error pattern: '{}'", pattern),
                    severity: Severity::Error,
                });
            }
        }

        let passed = checks.iter().all(|c| c.passed || c.severity != Severity::Error);

        VerificationResult {
            passed,
            checks,
            suggestion: if !passed {
                Some("The command encountered errors. Check the output for details.".to_string())
            } else {
                None
            },
        }
    }

    /// Check Rust syntax using cargo check
    async fn check_rust_syntax(&self, _path: &str) -> Option<CheckResult> {
        let output = tokio::process::Command::new("cargo")
            .args(["check", "--message-format=json", "--quiet"])
            .current_dir(&self.project_path)
            .output()
            .await
            .ok()?;

        let success = output.status.success();
        let stderr = String::from_utf8_lossy(&output.stderr);

        Some(CheckResult {
            name: "rust_syntax".to_string(),
            passed: success,
            message: if success {
                "Rust syntax check passed".to_string()
            } else {
                format!("Rust syntax errors: {}", truncate_str(&stderr, 200))
            },
            severity: if success {
                Severity::Info
            } else {
                Severity::Error
            },
        })
    }

    /// Check TypeScript syntax using tsc
    async fn check_typescript_syntax(&self, path: &str) -> Option<CheckResult> {
        let output = tokio::process::Command::new("npx")
            .args(["tsc", "--noEmit", "--pretty", "false", path])
            .current_dir(&self.project_path)
            .output()
            .await
            .ok()?;

        let success = output.status.success();
        let stdout = String::from_utf8_lossy(&output.stdout);

        Some(CheckResult {
            name: "typescript_syntax".to_string(),
            passed: success,
            message: if success {
                "TypeScript syntax check passed".to_string()
            } else {
                format!("TypeScript errors: {}", truncate_str(&stdout, 200))
            },
            severity: if success {
                Severity::Info
            } else {
                Severity::Error
            },
        })
    }

    /// Check JavaScript syntax using eslint
    async fn check_javascript_syntax(&self, path: &str) -> Option<CheckResult> {
        let output = tokio::process::Command::new("npx")
            .args(["eslint", "--format=json", path])
            .current_dir(&self.project_path)
            .output()
            .await
            .ok()?;

        let success = output.status.success();
        let stdout = String::from_utf8_lossy(&output.stdout);

        Some(CheckResult {
            name: "javascript_syntax".to_string(),
            passed: success,
            message: if success {
                "JavaScript syntax check passed".to_string()
            } else {
                format!("JavaScript errors: {}", truncate_str(&stdout, 200))
            },
            severity: if success {
                Severity::Info
            } else {
                Severity::Error
            },
        })
    }

    /// Check Python syntax using py_compile
    async fn check_python_syntax(&self, path: &str) -> Option<CheckResult> {
        let output = tokio::process::Command::new("python")
            .args(["-m", "py_compile", path])
            .current_dir(&self.project_path)
            .output()
            .await
            .ok()?;

        let success = output.status.success();
        let stderr = String::from_utf8_lossy(&output.stderr);

        Some(CheckResult {
            name: "python_syntax".to_string(),
            passed: success,
            message: if success {
                "Python syntax check passed".to_string()
            } else {
                format!("Python syntax errors: {}", truncate_str(&stderr, 200))
            },
            severity: if success {
                Severity::Info
            } else {
                Severity::Error
            },
        })
    }

    /// Check if verification is enabled
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }
}

impl Default for Verifier {
    fn default() -> Self {
        Self::new(".".to_string())
    }
}

/// Truncate a string to max_len characters
fn truncate_str(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verification_result_passed() {
        let result = VerificationResult {
            passed: true,
            checks: vec![CheckResult {
                name: "test".to_string(),
                passed: true,
                message: "ok".to_string(),
                severity: Severity::Info,
            }],
            suggestion: None,
        };
        assert!(result.passed);
    }

    #[test]
    fn test_verification_result_failed() {
        let result = VerificationResult {
            passed: false,
            checks: vec![CheckResult {
                name: "test".to_string(),
                passed: false,
                message: "error".to_string(),
                severity: Severity::Error,
            }],
            suggestion: Some("fix it".to_string()),
        };
        assert!(!result.passed);
    }
}
