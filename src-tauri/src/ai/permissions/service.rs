use std::sync::Arc;

use async_trait::async_trait;

use super::session_memory::{args_hash, SessionMemory};
use super::types::{GrantScope, PermissionCard, PermissionDecision, RiskLevel};
use crate::ai::tools::tool_trait::TrustTier;

/// Permission service trait
#[async_trait]
pub trait PermissionService: Send + Sync {
    /// Check if a tool call is allowed
    async fn check(
        &self,
        agent_id: &str,
        tool_name: &str,
        args: &serde_json::Value,
        trust_tier: TrustTier,
    ) -> PermissionDecision;

    /// Grant permission for a tool call
    fn grant(&self, agent_id: &str, tool_name: &str, args: &serde_json::Value, scope: GrantScope);

    /// Revoke permission for a tool
    fn revoke(&self, agent_id: &str, tool_name: &str);

    /// Check if a tool call is already approved
    fn is_approved(&self, agent_id: &str, tool_name: &str, args: &serde_json::Value) -> bool;
}

/// Permission configuration
#[derive(Debug, Clone)]
pub struct PermissionConfig {
    /// Auto-approve safe tools in autonomy mode
    pub auto_approve_safe: bool,
    /// Autonomy mode (fewer prompts)
    pub autonomy_mode: bool,
    /// Tools that always require approval
    pub always_ask: Vec<String>,
    /// Tools that are always denied
    pub always_deny: Vec<String>,
}

impl Default for PermissionConfig {
    fn default() -> Self {
        Self {
            auto_approve_safe: true,
            autonomy_mode: false,
            always_ask: vec![
                "delete_file".to_string(),
                "run_command".to_string(),
                "write_file".to_string(),
            ],
            always_deny: vec![],
        }
    }
}

/// Default permission service implementation
pub struct DefaultPermissionService {
    config: PermissionConfig,
    session_memory: Arc<tokio::sync::Mutex<SessionMemory>>,
}

impl DefaultPermissionService {
    pub fn new(config: PermissionConfig) -> Self {
        Self {
            config,
            session_memory: Arc::new(tokio::sync::Mutex::new(SessionMemory::new())),
        }
    }

    pub fn with_config(config: PermissionConfig) -> Self {
        Self::new(config)
    }

    /// Determine risk level for a tool call
    fn risk_level(&self, trust_tier: TrustTier, tool_name: &str) -> RiskLevel {
        // Check if tool is in always_ask list
        if self.config.always_ask.contains(&tool_name.to_string()) {
            return RiskLevel::High;
        }

        match trust_tier {
            TrustTier::Safe => RiskLevel::Low,
            TrustTier::Standard => RiskLevel::Medium,
            TrustTier::Destructive => RiskLevel::High,
        }
    }

    /// Create a permission card for user approval
    fn create_card(
        &self,
        tool_name: &str,
        args: &serde_json::Value,
        trust_tier: TrustTier,
    ) -> PermissionCard {
        let args_summary = if args.is_object() {
            args.as_object()
                .map(|m| {
                    m.keys()
                        .map(|k| k.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default()
        } else {
            args.to_string()
        };

        PermissionCard {
            tool_name: tool_name.to_string(),
            args_summary,
            risk_level: self.risk_level(trust_tier, tool_name),
            rollback_info: self.rollback_info(tool_name),
            project_scoped: false,
        }
    }

    /// Get rollback info for a tool (if available)
    fn rollback_info(&self, tool_name: &str) -> Option<String> {
        match tool_name {
            "write_file" => Some("Use git checkout to restore file".to_string()),
            "delete_file" => Some("Use git restore to recover file".to_string()),
            _ => None,
        }
    }
}

#[async_trait]
impl PermissionService for DefaultPermissionService {
    async fn check(
        &self,
        agent_id: &str,
        tool_name: &str,
        args: &serde_json::Value,
        trust_tier: TrustTier,
    ) -> PermissionDecision {
        // Check if tool is always denied
        if self.config.always_deny.contains(&tool_name.to_string()) {
            return PermissionDecision::Deny {
                reason: format!("Tool '{}' is not allowed", tool_name),
            };
        }

        // Check if already approved in session memory
        let memory = self.session_memory.lock().await;
        if memory.is_approved(agent_id, &args_hash(args)) {
            return PermissionDecision::Allow {
                reason: "Already approved in session".to_string(),
            };
        }
        drop(memory);

        // Determine decision based on trust tier and autonomy mode
        match trust_tier {
            TrustTier::Safe => {
                if self.config.auto_approve_safe && self.config.autonomy_mode {
                    PermissionDecision::Allow {
                        reason: "Safe tool in autonomy mode".to_string(),
                    }
                } else {
                    let card = self.create_card(tool_name, args, trust_tier);
                    PermissionDecision::Ask {
                        reason: "Safe tool requires approval".to_string(),
                        card,
                    }
                }
            }
            TrustTier::Standard => {
                if self.config.autonomy_mode {
                    // Ask once, then cache
                    let card = self.create_card(tool_name, args, trust_tier);
                    PermissionDecision::Ask {
                        reason: "Standard tool in autonomy mode".to_string(),
                        card,
                    }
                } else {
                    let card = self.create_card(tool_name, args, trust_tier);
                    PermissionDecision::Ask {
                        reason: "Standard tool requires approval".to_string(),
                        card,
                    }
                }
            }
            TrustTier::Destructive => {
                let card = self.create_card(tool_name, args, trust_tier);
                PermissionDecision::Ask {
                    reason: "Destructive tool requires approval".to_string(),
                    card,
                }
            }
        }
    }

    fn grant(&self, agent_id: &str, tool_name: &str, args: &serde_json::Value, scope: GrantScope) {
        let memory = self.session_memory.clone();
        let agent_id = agent_id.to_string();
        let tool_name = tool_name.to_string();
        let args = args.clone();

        tokio::spawn(async move {
            let mut mem = memory.lock().await;
            mem.grant(&tool_name, &args_hash(&args), scope);
        });
    }

    fn revoke(&self, agent_id: &str, tool_name: &str) {
        let memory = self.session_memory.clone();
        let tool_name = tool_name.to_string();

        tokio::spawn(async move {
            let mut mem = memory.lock().await;
            mem.revoke(&tool_name);
        });
    }

    fn is_approved(&self, agent_id: &str, tool_name: &str, args: &serde_json::Value) -> bool {
        // This would need to be async in production
        // For now, return false
        false
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permission_config_default() {
        let config = PermissionConfig::default();
        assert!(config.auto_approve_safe);
        assert!(!config.autonomy_mode);
        assert!(!config.always_ask.is_empty());
        assert!(config.always_deny.is_empty());
    }

    #[tokio::test]
    async fn test_check_safe_tool() {
        let service = DefaultPermissionService::new(PermissionConfig::default());
        let decision = service
            .check(
                "agent-1",
                "read_file",
                &serde_json::json!({"path": "/test"}),
                TrustTier::Safe,
            )
            .await;
        // Should ask for approval since autonomy_mode is false
        assert!(matches!(decision, PermissionDecision::Ask { .. }));
    }

    #[tokio::test]
    async fn test_check_always_deny() {
        let mut config = PermissionConfig::default();
        config.always_deny.push("dangerous_tool".to_string());
        let service = DefaultPermissionService::new(config);

        let decision = service
            .check(
                "agent-1",
                "dangerous_tool",
                &serde_json::json!({}),
                TrustTier::Safe,
            )
            .await;
        assert!(matches!(decision, PermissionDecision::Deny { .. }));
    }

    #[tokio::test]
    async fn test_check_always_ask() {
        let service = DefaultPermissionService::new(PermissionConfig::default());
        let decision = service
            .check(
                "agent-1",
                "write_file", // in always_ask list
                &serde_json::json!({"path": "/test"}),
                TrustTier::Safe,
            )
            .await;
        assert!(matches!(decision, PermissionDecision::Ask { .. }));
    }

    #[tokio::test]
    async fn test_check_autonomy_mode_safe() {
        let config = PermissionConfig {
            auto_approve_safe: true,
            autonomy_mode: true,
            ..Default::default()
        };
        let service = DefaultPermissionService::new(config);

        let decision = service
            .check(
                "agent-1",
                "read_file",
                &serde_json::json!({"path": "/test"}),
                TrustTier::Safe,
            )
            .await;
        assert!(matches!(decision, PermissionDecision::Allow { .. }));
    }

    #[tokio::test]
    async fn test_check_destructive_always_asks() {
        let config = PermissionConfig {
            autonomy_mode: true,
            ..Default::default()
        };
        let service = DefaultPermissionService::new(config);

        let decision = service
            .check(
                "agent-1",
                "delete_file",
                &serde_json::json!({"path": "/test"}),
                TrustTier::Destructive,
            )
            .await;
        assert!(matches!(decision, PermissionDecision::Ask { .. }));
    }

    #[test]
    fn test_risk_level() {
        let service = DefaultPermissionService::new(PermissionConfig::default());
        assert_eq!(service.risk_level(TrustTier::Safe, "read_file"), RiskLevel::Low);
        assert_eq!(
            service.risk_level(TrustTier::Standard, "read_file"),
            RiskLevel::Medium
        );
        assert_eq!(
            service.risk_level(TrustTier::Destructive, "read_file"),
            RiskLevel::High
        );
        // Always ask tools get High risk
        assert_eq!(
            service.risk_level(TrustTier::Safe, "write_file"),
            RiskLevel::High
        );
    }

    #[test]
    fn test_create_card() {
        let service = DefaultPermissionService::new(PermissionConfig::default());
        let card = service.create_card(
            "read_file",
            &serde_json::json!({"path": "/test", "encoding": "utf-8"}),
            TrustTier::Safe,
        );
        assert_eq!(card.tool_name, "read_file");
        assert!(card.args_summary.contains("path"));
        assert!(card.args_summary.contains("encoding"));
        assert_eq!(card.risk_level, RiskLevel::Low);
    }

    #[test]
    fn test_rollback_info() {
        let service = DefaultPermissionService::new(PermissionConfig::default());
        assert!(service.rollback_info("write_file").is_some());
        assert!(service.rollback_info("delete_file").is_some());
        assert!(service.rollback_info("read_file").is_none());
    }
}