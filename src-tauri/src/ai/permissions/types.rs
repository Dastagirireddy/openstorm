use std::collections::HashMap;
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
pub enum TierBehavior {
    Allow,
    AskOnce,
    AlwaysAsk,
    Deny,
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
pub struct TrustTierConfig {
    pub patterns: HashMap<TrustTier, Vec<String>>,
    pub whitelists: HashMap<TrustTier, Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutonomyModeConfig {
    pub enabled: bool,
    pub tier_behavior: HashMap<TrustTier, TierBehavior>,
    pub log_commands: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPermission {
    pub requires_approval: bool,
    pub allowed_patterns: Vec<String>,
    pub denied_patterns: Vec<String>,
    pub rate_limit: Option<u32>,
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
    pub(super) profile: PermissionProfile,
    pub(super) tool_permissions: HashMap<String, ToolPermission>,
    pub(super) compiled_denied: HashMap<String, Vec<regex::Regex>>,
    pub(super) compiled_allowed: HashMap<String, Vec<regex::Regex>>,
    pub(super) trust_tier_config: TrustTierConfig,
    pub(super) compiled_tier_patterns: HashMap<TrustTier, Vec<regex::Regex>>,
    pub(super) session_memory: SessionMemory,
    pub(super) autonomy_config: AutonomyModeConfig,
    pub(super) command_log: Vec<CommandLogEntry>,
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

use super::session_memory::SessionMemory;
