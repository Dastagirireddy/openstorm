use regex::Regex;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

/// Permission check result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PermissionResult {
    /// Action is allowed
    Allowed,
    /// Action requires user approval
    ApprovalRequired { reason: String },
    /// Action is denied
    Denied { reason: String },
}

/// Permission profile for controlling agent actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PermissionProfile {
    /// Full access - no approval needed (dangerous)
    Full,
    /// Read-only - no writes allowed
    ReadOnly,
    /// Guided - ask for every write/delete
    Guided,
    /// Smart - auto-approve safe actions, ask for risky ones
    Smart,
    /// Custom - user-defined permissions
    Custom(HashMap<String, ToolPermission>),
}

/// Permission settings for a specific tool
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPermission {
    /// Whether this tool requires approval before execution
    pub requires_approval: bool,
    /// Regex patterns for allowed arguments (empty = all allowed)
    pub allowed_patterns: Vec<String>,
    /// Regex patterns for denied arguments (checked first)
    pub denied_patterns: Vec<String>,
    /// Max calls per minute (None = unlimited)
    pub rate_limit: Option<u32>,
}

impl Default for ToolPermission {
    fn default() -> Self {
        Self {
            requires_approval: false,
            allowed_patterns: vec![],
            denied_patterns: vec![],
            rate_limit: None,
        }
    }
}

/// Permission system for controlling agent actions
pub struct PermissionSystem {
    /// Current permission profile
    profile: PermissionProfile,
    /// Per-tool permissions
    tool_permissions: HashMap<String, ToolPermission>,
    /// Compiled regex cache
    compiled_denied: HashMap<String, Vec<Regex>>,
    compiled_allowed: HashMap<String, Vec<Regex>>,
}

impl PermissionSystem {
    /// Create a new permission system with the given profile
    pub fn new(profile: PermissionProfile) -> Self {
        let tool_permissions = Self::default_permissions_for_profile(&profile);
        let mut system = Self {
            profile,
            tool_permissions,
            compiled_denied: HashMap::new(),
            compiled_allowed: HashMap::new(),
        };
        system.compile_patterns();
        system
    }

    /// Get default permissions for a profile
    fn default_permissions_for_profile(profile: &PermissionProfile) -> HashMap<String, ToolPermission> {
        match profile {
            PermissionProfile::Full => {
                // All tools allowed, no approval needed
                HashMap::new()
            }
            PermissionProfile::ReadOnly => {
                let mut perms = HashMap::new();
                // Deny all write operations
                perms.insert("write_file".to_string(), ToolPermission {
                    requires_approval: false,
                    allowed_patterns: vec![],
                    denied_patterns: vec![".*".to_string()],
                    rate_limit: None,
                });
                perms.insert("edit_file".to_string(), ToolPermission {
                    requires_approval: false,
                    allowed_patterns: vec![],
                    denied_patterns: vec![".*".to_string()],
                    rate_limit: None,
                });
                perms.insert("run_command".to_string(), ToolPermission {
                    requires_approval: false,
                    allowed_patterns: vec![],
                    denied_patterns: vec![".*".to_string()],
                    rate_limit: None,
                });
                perms.insert("git_commit".to_string(), ToolPermission {
                    requires_approval: false,
                    allowed_patterns: vec![],
                    denied_patterns: vec![".*".to_string()],
                    rate_limit: None,
                });
                perms
            }
            PermissionProfile::Guided => {
                let mut perms = HashMap::new();
                // Write tools require approval
                perms.insert("write_file".to_string(), ToolPermission {
                    requires_approval: true,
                    allowed_patterns: vec![],
                    denied_patterns: vec![],
                    rate_limit: Some(10),
                });
                perms.insert("edit_file".to_string(), ToolPermission {
                    requires_approval: true,
                    allowed_patterns: vec![],
                    denied_patterns: vec![],
                    rate_limit: Some(15),
                });
                perms.insert("run_command".to_string(), ToolPermission {
                    requires_approval: true,
                    allowed_patterns: vec![],
                    denied_patterns: vec![],
                    rate_limit: Some(5),
                });
                perms.insert("git_commit".to_string(), ToolPermission {
                    requires_approval: true,
                    allowed_patterns: vec![],
                    denied_patterns: vec![],
                    rate_limit: Some(3),
                });
                perms
            }
            PermissionProfile::Smart => {
                let mut perms = HashMap::new();
                // Auto-approve safe writes, ask for risky ones
                perms.insert("write_file".to_string(), ToolPermission {
                    requires_approval: false,
                    allowed_patterns: vec![],  // Allow all writes (denied_patterns still apply)
                    denied_patterns: vec![
                        r"^\..*".to_string(),          // No dotfiles
                        r".*\.lock$".to_string(),      // No lock files
                        r".*\.env$".to_string(),       // No env files
                    ],
                    rate_limit: Some(10),
                });
                perms.insert("edit_file".to_string(), ToolPermission {
                    requires_approval: false,
                    allowed_patterns: vec![],  // Allow all edits
                    denied_patterns: vec![
                        r"^\..*".to_string(),
                        r".*\.lock$".to_string(),
                    ],
                    rate_limit: Some(15),
                });
                perms.insert("run_command".to_string(), ToolPermission {
                    requires_approval: true,
                    allowed_patterns: vec![],
                    denied_patterns: vec![
                        r"rm\s+-rf\s+/".to_string(),
                        r"sudo\s+".to_string(),
                        r"curl.*\|\s*sh".to_string(),
                    ],
                    rate_limit: Some(5),
                });
                perms.insert("git_commit".to_string(), ToolPermission {
                    requires_approval: false,
                    allowed_patterns: vec![],
                    denied_patterns: vec![],
                    rate_limit: Some(3),
                });
                perms
            }
            PermissionProfile::Custom(perms) => perms.clone(),
        }
    }

    /// Compile regex patterns for faster matching
    fn compile_patterns(&mut self) {
        for (tool, perm) in &self.tool_permissions {
            let denied: Vec<Regex> = perm
                .denied_patterns
                .iter()
                .filter_map(|p| Regex::new(p).ok())
                .collect();
            let allowed: Vec<Regex> = perm
                .allowed_patterns
                .iter()
                .filter_map(|p| Regex::new(p).ok())
                .collect();
            self.compiled_denied.insert(tool.clone(), denied);
            self.compiled_allowed.insert(tool.clone(), allowed);
        }
    }

    /// Check if a tool call is allowed
    pub fn check(&self, tool: &str, args: &str) -> PermissionResult {
        // Get tool-specific permissions (or default = allowed)
        let perm = self.tool_permissions.get(tool);

        let perm = match perm {
            Some(p) => p,
            None => {
                // Tool not in permissions map = allowed by default
                return PermissionResult::Allowed;
            }
        };

        // Check denied patterns first (highest priority)
        if let Some(denied) = self.compiled_denied.get(tool) {
            for pattern in denied {
                if pattern.is_match(args) {
                    return PermissionResult::Denied {
                        reason: format!("Argument matches denied pattern: {}", pattern.as_str()),
                    };
                }
            }
        }

        // Check allowed patterns (if any are defined, argument must match one)
        if let Some(allowed) = self.compiled_allowed.get(tool) {
            if !allowed.is_empty() {
                let any_allowed = allowed.iter().any(|p| p.is_match(args));
                if !any_allowed {
                    return PermissionResult::Denied {
                        reason: "Argument doesn't match any allowed pattern".to_string(),
                    };
                }
            }
        }

        // Check if approval is required
        if perm.requires_approval {
            return PermissionResult::ApprovalRequired {
                reason: format!("Tool '{}' requires approval", tool),
            };
        }

        PermissionResult::Allowed
    }

    /// Check if a tool call is allowed, with specific argument validation
    pub fn check_file_write(&self, path: &str) -> PermissionResult {
        self.check("write_file", path)
    }

    pub fn check_command(&self, command: &str) -> PermissionResult {
        self.check("run_command", command)
    }

    /// Get permission info for the system prompt
    pub fn to_prompt_section(&self) -> String {
        match &self.profile {
            PermissionProfile::Full => {
                "Permissions: Full access - you can execute any tool without approval.".to_string()
            }
            PermissionProfile::ReadOnly => {
                "Permissions: Read-only mode - you can only read files and search. Writing and command execution are disabled.".to_string()
            }
            PermissionProfile::Guided => {
                "Permissions: Guided mode - you can read freely, but writes and commands require user approval.".to_string()
            }
            PermissionProfile::Smart => {
                "Permissions: Smart mode - safe operations are auto-approved, risky operations require approval.".to_string()
            }
            PermissionProfile::Custom(_) => {
                "Permissions: Custom mode - check each tool's approval requirement.".to_string()
            }
        }
    }

    /// Get the current profile
    pub fn profile(&self) -> &PermissionProfile {
        &self.profile
    }

    /// Check if a tool is completely denied
    pub fn is_denied(&self, tool: &str) -> bool {
        if let Some(perm) = self.tool_permissions.get(tool) {
            // If there's a catch-all denied pattern, the tool is fully denied
            if let Some(denied) = self.compiled_denied.get(tool) {
                return denied.iter().any(|p| p.as_str() == ".*");
            }
        }
        false
    }
}

impl Default for PermissionSystem {
    fn default() -> Self {
        Self::new(PermissionProfile::Smart)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_full_profile_allows_all() {
        let system = PermissionSystem::new(PermissionProfile::Full);
        assert!(matches!(
            system.check("write_file", "anything"),
            PermissionResult::Allowed
        ));
        assert!(matches!(
            system.check("run_command", "rm -rf /"),
            PermissionResult::Allowed
        ));
    }

    #[test]
    fn test_readonly_denies_writes() {
        let system = PermissionSystem::new(PermissionProfile::ReadOnly);
        assert!(matches!(
            system.check("write_file", "test.rs"),
            PermissionResult::Denied { .. }
        ));
        assert!(matches!(
            system.check("read_file", "test.rs"),
            PermissionResult::Allowed
        ));
    }

    #[test]
    fn test_guided_requires_approval() {
        let system = PermissionSystem::new(PermissionProfile::Guided);
        assert!(matches!(
            system.check("write_file", "test.rs"),
            PermissionResult::ApprovalRequired { .. }
        ));
        assert!(matches!(
            system.check("read_file", "test.rs"),
            PermissionResult::Allowed
        ));
    }

    #[test]
    fn test_smart_denies_dangerous_commands() {
        let system = PermissionSystem::new(PermissionProfile::Smart);
        assert!(matches!(
            system.check("run_command", "rm -rf /"),
            PermissionResult::Denied { .. }
        ));
        assert!(matches!(
            system.check("run_command", "sudo something"),
            PermissionResult::Denied { .. }
        ));
    }
}
