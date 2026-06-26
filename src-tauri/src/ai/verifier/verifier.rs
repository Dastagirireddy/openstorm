use std::path::Path;

use super::types::*;

pub struct Verifier {
    project_path: String,
    enabled: bool,
}

impl Verifier {
    pub fn new(project_path: String) -> Self {
        Self {
            project_path,
            enabled: true,
        }
    }

    pub fn disabled(project_path: String) -> Self {
        Self {
            project_path,
            enabled: false,
        }
    }

    pub async fn verify_write(&self, path: &str, _content: &str) -> VerificationResult {
        if !self.enabled {
            return VerificationResult {
                passed: true,
                checks: vec![],
                suggestion: None,
            };
        }

        let mut checks = Vec::new();

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

    pub async fn verify_command(&self, _command: &str, exit_code: i32, stderr: &str) -> VerificationResult {
        if !self.enabled {
            return VerificationResult {
                passed: true,
                checks: vec![],
                suggestion: None,
            };
        }

        let mut checks = Vec::new();

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

    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

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
}

impl Default for Verifier {
    fn default() -> Self {
        Self::new(".".to_string())
    }
}

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
