use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PermissionResult {
    Allowed,
    ApprovalRequired { reason: String },
    Denied { reason: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TrustTier {
    Safe,
    Standard,
    Destructive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustTierConfig {
    pub patterns: HashMap<TrustTier, Vec<String>>,
    pub whitelists: HashMap<TrustTier, Vec<String>>,
}

impl Default for TrustTierConfig {
    fn default() -> Self {
        let mut patterns = HashMap::new();
        let mut whitelists = HashMap::new();

        patterns.insert(TrustTier::Safe, vec![
            r"^ls(\s+.*)?$".to_string(),
            r"^cat(\s+.*)?$".to_string(),
            r"^grep(\s+.*)?$".to_string(),
            r"^find(\s+.*)?$".to_string(),
            r"^git\s+status$".to_string(),
            r"^git\s+log(\s+.*)?$".to_string(),
            r"^git\s+diff(\s+.*)?$".to_string(),
            r"^git\s+show(\s+.*)?$".to_string(),
            r"^head(\s+.*)?$".to_string(),
            r"^tail(\s+.*)?$".to_string(),
            r"^wc(\s+.*)?$".to_string(),
            r"^file(\s+.*)?$".to_string(),
        ]);
        whitelists.insert(TrustTier::Safe, vec![
            "read_file".to_string(),
            "list_directory".to_string(),
            "search_code".to_string(),
            "search_files".to_string(),
            "get_diagnostics".to_string(),
            "print_tree".to_string(),
        ]);

        patterns.insert(TrustTier::Standard, vec![
            r"^npm\s+install(\s+.*)?$".to_string(),
            r"^npm\s+run\s+\w+$".to_string(),
            r"^pnpm\s+install(\s+.*)?$".to_string(),
            r"^pnpm\s+run\s+\w+$".to_string(),
            r"^yarn\s+install(\s+.*)?$".to_string(),
            r"^cargo\s+build(\s+.*)?$".to_string(),
            r"^cargo\s+test(\s+.*)?$".to_string(),
            r"^cargo\s+check(\s+.*)?$".to_string(),
            r"^cargo\s+clippy(\s+.*)?$".to_string(),
            r"^cargo\s+fmt(\s+.*)?$".to_string(),
            r"^git\s+add(\s+.*)?$".to_string(),
            r"^git\s+commit(\s+.*)?$".to_string(),
            r"^git\s+checkout(\s+.*)?$".to_string(),
            r"^git\s+branch(\s+.*)?$".to_string(),
            r"^git\s+stash(\s+.*)?$".to_string(),
            r"^git\s+pull(\s+.*)?$".to_string(),
            r"^make(\s+.*)?$".to_string(),
            r"^python(\s+.*)?$".to_string(),
            r"^python3(\s+.*)?$".to_string(),
            r"^node(\s+.*)?$".to_string(),
        ]);
        whitelists.insert(TrustTier::Standard, vec![
            "write_file".to_string(),
            "edit_file".to_string(),
            "run_command".to_string(),
        ]);

        patterns.insert(TrustTier::Destructive, vec![
            r"^rm\s+-rf".to_string(),
            r"^rm\s+-r".to_string(),
            r"^sudo\s+".to_string(),
            r"^curl.*\|\s*sh".to_string(),
            r"^wget.*\|\s*sh".to_string(),
            r"^chmod\s+777".to_string(),
            r"^chown\s+".to_string(),
            r"^kill\s+-9".to_string(),
            r"^pkill\s+".to_string(),
            r"^git\s+push\s+--force".to_string(),
            r"^git\s+push\s+-f".to_string(),
            r"^git\s+reset\s+--hard".to_string(),
            r"^git\s+clean\s+-fd".to_string(),
            r"^git\s+checkout\s+--\s+\.".to_string(),
            r"^docker\s+rm\s+".to_string(),
            r"^docker\s+rmi\s+".to_string(),
            r"^dropdb\s+".to_string(),
            r"^drop\s+database".to_string(),
        ]);
        whitelists.insert(TrustTier::Destructive, vec![
            "git_push_force".to_string(),
            "delete_database".to_string(),
        ]);

        Self { patterns, whitelists }
    }
}

#[derive(Debug, Clone)]
pub struct SessionMemory {
    approved_commands: HashSet<(String, String)>,
    approval_timestamps: HashMap<(String, String), Instant>,
    ttl: Duration,
}

impl SessionMemory {
    pub fn new() -> Self {
        Self {
            approved_commands: HashSet::new(),
            approval_timestamps: HashMap::new(),
            ttl: Duration::from_secs(3600),
        }
    }

    pub fn with_ttl(ttl: Duration) -> Self {
        Self {
            approved_commands: HashSet::new(),
            approval_timestamps: HashMap::new(),
            ttl,
        }
    }

    pub fn approve(&mut self, tool_name: &str, args: &str) {
        let key = (tool_name.to_string(), self.hash_args(args));
        self.approval_timestamps.insert(key.clone(), Instant::now());
        self.approved_commands.insert(key);
    }

    pub fn is_approved(&mut self, tool_name: &str, args: &str) -> bool {
        let key = (tool_name.to_string(), self.hash_args(args));
        if let Some(approved_at) = self.approval_timestamps.get(&key) {
            if approved_at.elapsed() < self.ttl {
                return true;
            }
            self.approved_commands.remove(&key);
            self.approval_timestamps.remove(&key);
        }
        false
    }

    pub fn clear(&mut self) {
        self.approved_commands.clear();
        self.approval_timestamps.clear();
    }

    pub fn count(&self) -> usize {
        self.approved_commands.len()
    }

    fn hash_args(&self, args: &str) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        args.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }
}

impl Default for SessionMemory {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutonomyModeConfig {
    pub enabled: bool,
    pub tier_behavior: HashMap<TrustTier, TierBehavior>,
    pub log_commands: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TierBehavior {
    Allow,
    AskOnce,
    AlwaysAsk,
    Deny,
}

impl Default for AutonomyModeConfig {
    fn default() -> Self {
        let mut tier_behavior = HashMap::new();
        tier_behavior.insert(TrustTier::Safe, TierBehavior::Allow);
        tier_behavior.insert(TrustTier::Standard, TierBehavior::AskOnce);
        tier_behavior.insert(TrustTier::Destructive, TierBehavior::AlwaysAsk);

        Self {
            enabled: false,
            tier_behavior,
            log_commands: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PermissionProfile {
    Full,
    ReadOnly,
    Guided,
    Smart,
    Custom(HashMap<String, ToolPermission>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPermission {
    pub requires_approval: bool,
    pub allowed_patterns: Vec<String>,
    pub denied_patterns: Vec<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandLogEntry {
    pub timestamp: String,
    pub tool_name: String,
    pub args_hash: String,
    pub trust_tier: TrustTier,
    pub approved: bool,
    pub approval_method: String,
}

pub struct PermissionSystem {
    profile: PermissionProfile,
    tool_permissions: HashMap<String, ToolPermission>,
    compiled_denied: HashMap<String, Vec<Regex>>,
    compiled_allowed: HashMap<String, Vec<Regex>>,
    trust_tier_config: TrustTierConfig,
    compiled_tier_patterns: HashMap<TrustTier, Vec<Regex>>,
    session_memory: SessionMemory,
    autonomy_config: AutonomyModeConfig,
    command_log: Vec<CommandLogEntry>,
}

impl PermissionSystem {
    pub fn new(profile: PermissionProfile) -> Self {
        let tool_permissions = Self::default_permissions_for_profile(&profile);
        let trust_tier_config = TrustTierConfig::default();
        let compiled_tier_patterns = Self::compile_tier_patterns(&trust_tier_config);
        let mut system = Self {
            profile,
            tool_permissions,
            compiled_denied: HashMap::new(),
            compiled_allowed: HashMap::new(),
            trust_tier_config,
            compiled_tier_patterns,
            session_memory: SessionMemory::new(),
            autonomy_config: AutonomyModeConfig::default(),
            command_log: Vec::new(),
        };
        system.compile_patterns();
        system
    }

    pub fn with_autonomy(profile: PermissionProfile, autonomy_config: AutonomyModeConfig) -> Self {
        let mut system = Self::new(profile);
        system.autonomy_config = autonomy_config;
        system
    }

    fn compile_tier_patterns(config: &TrustTierConfig) -> HashMap<TrustTier, Vec<Regex>> {
        let mut compiled = HashMap::new();
        for (tier, patterns) in &config.patterns {
            let regexes: Vec<Regex> = patterns
                .iter()
                .filter_map(|p| Regex::new(p).ok())
                .collect();
            compiled.insert(*tier, regexes);
        }
        compiled
    }

    fn default_permissions_for_profile(profile: &PermissionProfile) -> HashMap<String, ToolPermission> {
        match profile {
            PermissionProfile::Full => HashMap::new(),
            PermissionProfile::ReadOnly => {
                let mut perms = HashMap::new();
                let denied = vec![".*".to_string()];
                perms.insert("write_file".to_string(), ToolPermission {
                    requires_approval: false,
                    allowed_patterns: vec![],
                    denied_patterns: denied.clone(),
                    rate_limit: None,
                });
                perms.insert("edit_file".to_string(), ToolPermission {
                    requires_approval: false,
                    allowed_patterns: vec![],
                    denied_patterns: denied.clone(),
                    rate_limit: None,
                });
                perms.insert("run_command".to_string(), ToolPermission {
                    requires_approval: false,
                    allowed_patterns: vec![],
                    denied_patterns: denied.clone(),
                    rate_limit: None,
                });
                perms.insert("git_commit".to_string(), ToolPermission {
                    requires_approval: false,
                    allowed_patterns: vec![],
                    denied_patterns: denied,
                    rate_limit: None,
                });
                perms
            }
            PermissionProfile::Guided => {
                let mut perms = HashMap::new();
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
                perms.insert("write_file".to_string(), ToolPermission {
                    requires_approval: true,
                    allowed_patterns: vec![],
                    denied_patterns: vec![
                        r"^\..*".to_string(),
                        r".*\.lock$".to_string(),
                        r".*\.env$".to_string(),
                    ],
                    rate_limit: Some(10),
                });
                perms.insert("edit_file".to_string(), ToolPermission {
                    requires_approval: true,
                    allowed_patterns: vec![],
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
                    requires_approval: true,
                    allowed_patterns: vec![],
                    denied_patterns: vec![],
                    rate_limit: Some(3),
                });
                perms
            }
            PermissionProfile::Custom(perms) => perms.clone(),
        }
    }

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

    pub fn get_trust_tier(&self, tool_name: &str, args: &str) -> TrustTier {
        // For run_command, check the actual command patterns first
        // This allows "ls -la" to be classified as Safe even though run_command is in Standard whitelist
        if tool_name == "run_command" {
            for (tier, patterns) in &self.compiled_tier_patterns {
                for pattern in patterns {
                    if pattern.is_match(args) {
                        return *tier;
                    }
                }
            }
        }

        // For other tools, check the tool name whitelist first
        for (tier, whitelist) in &self.trust_tier_config.whitelists {
            if whitelist.contains(&tool_name.to_string()) {
                return *tier;
            }
        }

        // For run_command, if no pattern matched, fall back to Standard
        if tool_name == "run_command" {
            return TrustTier::Standard;
        }

        // For other tools, check patterns against args
        for (tier, patterns) in &self.compiled_tier_patterns {
            for pattern in patterns {
                if pattern.is_match(args) {
                    return *tier;
                }
            }
        }

        TrustTier::Standard
    }

    pub fn check_with_tiers(&mut self, tool: &str, args: &str) -> PermissionResult {
        if let Some(perm) = self.tool_permissions.get(tool) {
            if let Some(denied) = self.compiled_denied.get(tool) {
                for pattern in denied {
                    if pattern.is_match(args) {
                        return PermissionResult::Denied {
                            reason: format!("Argument matches denied pattern: {}", pattern.as_str()),
                        };
                    }
                }
            }
        }

        let tier = self.get_trust_tier(tool, args);

        if self.autonomy_config.enabled {
            if let Some(behavior) = self.autonomy_config.tier_behavior.get(&tier) {
                match behavior {
                    TierBehavior::Allow => {
                        self.log_command(tool, args, &tier, true, "autonomy_allow");
                        return PermissionResult::Allowed;
                    }
                    TierBehavior::AskOnce => {
                        if self.session_memory.is_approved(tool, args) {
                            self.log_command(tool, args, &tier, true, "session_memory");
                            return PermissionResult::Allowed;
                        }
                        self.log_command(tool, args, &tier, false, "autonomy_ask_once");
                        return PermissionResult::ApprovalRequired {
                            reason: format!("Trust tier {:?} requires approval (will remember)", tier),
                        };
                    }
                    TierBehavior::AlwaysAsk => {
                        self.log_command(tool, args, &tier, false, "autonomy_always_ask");
                        return PermissionResult::ApprovalRequired {
                            reason: format!("Trust tier {:?} always requires approval", tier),
                        };
                    }
                    TierBehavior::Deny => {
                        return PermissionResult::Denied {
                            reason: format!("Trust tier {:?} is denied", tier),
                        };
                    }
                }
            }
        }

        self.check(tool, args)
    }

    pub fn check(&self, tool: &str, args: &str) -> PermissionResult {
        let perm = self.tool_permissions.get(tool);

        let perm = match perm {
            Some(p) => p,
            None => return PermissionResult::Allowed,
        };

        if let Some(denied) = self.compiled_denied.get(tool) {
            for pattern in denied {
                if pattern.is_match(args) {
                    return PermissionResult::Denied {
                        reason: format!("Argument matches denied pattern: {}", pattern.as_str()),
                    };
                }
            }
        }

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

        if perm.requires_approval {
            return PermissionResult::ApprovalRequired {
                reason: format!("Tool '{}' requires approval", tool),
            };
        }

        PermissionResult::Allowed
    }

    pub fn check_file_write(&mut self, path: &str) -> PermissionResult {
        self.check_with_tiers("write_file", path)
    }

    pub fn check_command(&mut self, command: &str) -> PermissionResult {
        self.check_with_tiers("run_command", command)
    }

    pub fn approve(&mut self, tool_name: &str, args: &str) {
        self.session_memory.approve(tool_name, args);
    }

    pub fn clear_session_memory(&mut self) {
        self.session_memory.clear();
    }

    pub fn session_memory_count(&self) -> usize {
        self.session_memory.count()
    }

    fn log_command(&mut self, tool_name: &str, args: &str, tier: &TrustTier, approved: bool, method: &str) {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        args.hash(&mut hasher);
        let args_hash = format!("{:x}", hasher.finish());

        self.command_log.push(CommandLogEntry {
            timestamp: format!("{:?}", std::time::SystemTime::now()),
            tool_name: tool_name.to_string(),
            args_hash,
            trust_tier: *tier,
            approved,
            approval_method: method.to_string(),
        });
    }

    pub fn get_command_log(&self) -> &[CommandLogEntry] {
        &self.command_log
    }

    pub fn clear_command_log(&mut self) {
        self.command_log.clear();
    }

    pub fn to_prompt_section(&self) -> String {
        let base = match &self.profile {
            PermissionProfile::Full => "Permissions: Full access - you can execute any tool without approval.",
            PermissionProfile::ReadOnly => "Permissions: Read-only mode - you can only read files and search.",
            PermissionProfile::Guided => "Permissions: Guided mode - writes and commands require user approval.",
            PermissionProfile::Smart => "Permissions: Smart mode - safe operations auto-approved, risky require approval.",
            PermissionProfile::Custom(_) => "Permissions: Custom mode - check each tool's approval requirement.",
        };

        if self.autonomy_config.enabled {
            format!("{} Autonomy mode is ACTIVE.", base)
        } else {
            base.to_string()
        }
    }

    pub fn profile(&self) -> &PermissionProfile {
        &self.profile
    }

    pub fn is_denied(&self, tool: &str) -> bool {
        if let Some(perm) = self.tool_permissions.get(tool) {
            if let Some(denied) = self.compiled_denied.get(tool) {
                return denied.iter().any(|p| p.as_str() == ".*");
            }
        }
        false
    }

    pub fn enable_autonomy(&mut self, enabled: bool) {
        self.autonomy_config.enabled = enabled;
    }

    pub fn is_autonomy_enabled(&self) -> bool {
        self.autonomy_config.enabled
    }

    pub fn set_tier_behavior(&mut self, tier: TrustTier, behavior: TierBehavior) {
        self.autonomy_config.tier_behavior.insert(tier, behavior);
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
    fn test_trust_tier_classification() {
        let system = PermissionSystem::new(PermissionProfile::Smart);

        assert_eq!(system.get_trust_tier("read_file", "test.rs"), TrustTier::Safe);
        assert_eq!(system.get_trust_tier("run_command", "ls -la"), TrustTier::Safe);
        assert_eq!(system.get_trust_tier("run_command", "npm install"), TrustTier::Standard);
        assert_eq!(system.get_trust_tier("run_command", "rm -rf /"), TrustTier::Destructive);
    }

    #[test]
    fn test_session_memory_approve_and_check() {
        let mut memory = SessionMemory::new();

        assert!(!memory.is_approved("run_command", "npm install"));

        memory.approve("run_command", "npm install");
        assert!(memory.is_approved("run_command", "npm install"));
        assert!(!memory.is_approved("run_command", "npm test"));
    }

    #[test]
    fn test_session_memory_clear() {
        let mut memory = SessionMemory::new();
        memory.approve("run_command", "npm install");
        assert_eq!(memory.count(), 1);

        memory.clear();
        assert_eq!(memory.count(), 0);
        assert!(!memory.is_approved("run_command", "npm install"));
    }

    #[test]
    fn test_autonomy_mode_safe_commands() {
        let config = AutonomyModeConfig {
            enabled: true,
            ..Default::default()
        };
        let mut system = PermissionSystem::with_autonomy(PermissionProfile::Smart, config);

        assert!(matches!(
            system.check_with_tiers("run_command", "ls -la"),
            PermissionResult::Allowed
        ));
    }

    #[test]
    fn test_autonomy_mode_standard_commands_ask_once() {
        let config = AutonomyModeConfig {
            enabled: true,
            ..Default::default()
        };
        let mut system = PermissionSystem::with_autonomy(PermissionProfile::Smart, config);

        assert!(matches!(
            system.check_with_tiers("run_command", "npm install"),
            PermissionResult::ApprovalRequired { .. }
        ));
    }

    #[test]
    fn test_autonomy_mode_destructive_commands_always_ask() {
        let config = AutonomyModeConfig {
            enabled: true,
            ..Default::default()
        };
        let mut system = PermissionSystem::with_autonomy(PermissionProfile::Smart, config);

        assert!(matches!(
            system.check_with_tiers("run_command", "rm -rf /"),
            PermissionResult::Denied { .. }
        ));
    }

    #[test]
    fn test_session_memory_caches_approval() {
        let config = AutonomyModeConfig {
            enabled: true,
            ..Default::default()
        };
        let mut system = PermissionSystem::with_autonomy(PermissionProfile::Smart, config);

        let result1 = system.check_with_tiers("run_command", "npm install");
        assert!(matches!(result1, PermissionResult::ApprovalRequired { .. }));

        system.approve("run_command", "npm install");

        let result2 = system.check_with_tiers("run_command", "npm install");
        assert!(matches!(result2, PermissionResult::Allowed));
    }

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

    #[test]
    fn test_enable_disable_autonomy() {
        let mut system = PermissionSystem::new(PermissionProfile::Smart);

        assert!(!system.is_autonomy_enabled());

        system.enable_autonomy(true);
        assert!(system.is_autonomy_enabled());

        system.enable_autonomy(false);
        assert!(!system.is_autonomy_enabled());
    }

    #[test]
    fn test_set_tier_behavior() {
        let mut system = PermissionSystem::new(PermissionProfile::Smart);

        system.set_tier_behavior(TrustTier::Standard, TierBehavior::AlwaysAsk);

        let config = AutonomyModeConfig {
            enabled: true,
            ..Default::default()
        };
        system.autonomy_config = config;
        system.set_tier_behavior(TrustTier::Standard, TierBehavior::AlwaysAsk);

        assert!(matches!(
            system.check_with_tiers("run_command", "npm install"),
            PermissionResult::ApprovalRequired { .. }
        ));
    }
}
