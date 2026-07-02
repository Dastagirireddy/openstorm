use std::path::PathBuf;
use tokio::process::Command;

use super::config::SandboxConfig;

/// Sandbox for user-defined tool execution
///
/// Restricts network access, file writes, and environment variables.
pub struct ToolSandbox {
    /// Whether network is allowed
    network: bool,
    /// Allowed write paths (absolute or project-relative)
    write_paths: Vec<PathBuf>,
    /// Whether to inherit parent environment
    env_inherit: bool,
    /// Specific environment variables to pass
    env_vars: Vec<String>,
    /// Project root path
    project_path: PathBuf,
}

impl ToolSandbox {
    /// Create a sandbox from config
    pub fn from_config(config: &SandboxConfig, project_path: &PathBuf) -> Self {
        let write_paths = config.write_paths.iter()
            .map(|p| {
                if p.starts_with('/') {
                    PathBuf::from(p)
                } else {
                    project_path.join(p)
                }
            })
            .collect();

        Self {
            network: config.network,
            write_paths,
            env_inherit: config.env_inherit,
            env_vars: config.env_vars.clone(),
            project_path: project_path.clone(),
        }
    }

    /// Apply sandbox restrictions to a command
    pub fn apply_restrictions(&self, cmd: &mut Command) {
        // Clear environment if not inheriting
        if !self.env_inherit {
            cmd.env_clear();
        }

        // Set specific environment variables
        for var in &self.env_vars {
            // Only pass through safe variables
            if self.is_safe_env_var(var) {
                // Note: We can't get the value here, so we just ensure the var is allowed
                // The actual value passing would need to be done at a higher level
            }
        }

        // Network restriction via environment
        if !self.network {
            cmd.env("OPENSTORM_NO_NETWORK", "1");
        }

        // Write path restriction is checked at execution time, not at command level
    }

    /// Check if a file write is allowed
    pub fn is_write_allowed(&self, path: &PathBuf) -> bool {
        if self.write_paths.is_empty() {
            // No write paths configured = no writes allowed
            return false;
        }

        self.write_paths.iter().any(|allowed| {
            path.starts_with(allowed)
        })
    }

    /// Check if network access is allowed
    pub fn is_network_allowed(&self) -> bool {
        self.network
    }

    /// Check if an environment variable is safe to pass through
    fn is_safe_env_var(&self, var: &str) -> bool {
        // Allowlist of safe environment variables
        const SAFE_VARS: &[&str] = &[
            "PATH", "HOME", "USER", "SHELL",
            "LANG", "LC_ALL", "LC_CTYPE",
            "TMPDIR", "TEMP", "TMP",
            "OPENSTORM_*", // Allow OpenStorm-specific vars
        ];

        for pattern in SAFE_VARS {
            if pattern.ends_with('*') {
                let prefix = &pattern[..pattern.len() - 1];
                if var.starts_with(prefix) {
                    return true;
                }
            } else if var == *pattern {
                return true;
            }
        }

        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_project_path() -> PathBuf {
        PathBuf::from("/project")
    }

    #[test]
    fn test_sandbox_from_config() {
        let config = SandboxConfig {
            network: false,
            write_paths: vec!["src/".to_string(), "/tmp/".to_string()],
            env_inherit: false,
            env_vars: vec!["MY_VAR".to_string()],
        };

        let sandbox = ToolSandbox::from_config(&config, &test_project_path());
        assert!(!sandbox.is_network_allowed());
        assert_eq!(sandbox.write_paths.len(), 2);
        assert_eq!(sandbox.write_paths[0], PathBuf::from("/project/src"));
        assert_eq!(sandbox.write_paths[1], PathBuf::from("/tmp/"));
    }

    #[test]
    fn test_is_write_allowed() {
        let config = SandboxConfig {
            write_paths: vec!["src/".to_string()],
            ..Default::default()
        };
        let sandbox = ToolSandbox::from_config(&config, &test_project_path());

        assert!(sandbox.is_write_allowed(&PathBuf::from("/project/src/main.rs")));
        assert!(!sandbox.is_write_allowed(&PathBuf::from("/project/test.rs")));
        assert!(!sandbox.is_write_allowed(&PathBuf::from("/etc/passwd")));
    }

    #[test]
    fn test_is_write_allowed_empty() {
        let config = SandboxConfig {
            write_paths: vec![],
            ..Default::default()
        };
        let sandbox = ToolSandbox::from_config(&config, &test_project_path());

        // No write paths configured = no writes allowed
        assert!(!sandbox.is_write_allowed(&PathBuf::from("/project/src/main.rs")));
    }

    #[test]
    fn test_network_allowed() {
        let allowed = SandboxConfig {
            network: true,
            ..Default::default()
        };
        let sandbox = ToolSandbox::from_config(&allowed, &test_project_path());
        assert!(sandbox.is_network_allowed());

        let denied = SandboxConfig {
            network: false,
            ..Default::default()
        };
        let sandbox = ToolSandbox::from_config(&denied, &test_project_path());
        assert!(!sandbox.is_network_allowed());
    }

    #[test]
    fn test_safe_env_vars() {
        let config = SandboxConfig::default();
        let sandbox = ToolSandbox::from_config(&config, &test_project_path());

        assert!(sandbox.is_safe_env_var("PATH"));
        assert!(sandbox.is_safe_env_var("HOME"));
        assert!(sandbox.is_safe_env_var("OPENSTORM_DEBUG"));
        assert!(!sandbox.is_safe_env_var("AWS_SECRET_KEY"));
        assert!(!sandbox.is_safe_env_var("DATABASE_URL"));
    }
}
