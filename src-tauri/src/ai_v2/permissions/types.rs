use std::fmt;

/// Decision for a permission check
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PermissionDecision {
    /// Allow the tool call
    Allow { reason: String },
    /// Ask user for approval
    Ask {
        reason: String,
        card: PermissionCard,
    },
    /// Deny the tool call
    Deny { reason: String },
    /// Redirect to another tool
    Redirect { to_tool: String, reason: String },
}

impl fmt::Display for PermissionDecision {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PermissionDecision::Allow { reason } => write!(f, "Allow: {}", reason),
            PermissionDecision::Ask { reason, card } => {
                write!(f, "Ask: {} (tool: {})", reason, card.tool_name)
            }
            PermissionDecision::Deny { reason } => write!(f, "Deny: {}", reason),
            PermissionDecision::Redirect { to_tool, reason } => {
                write!(f, "Redirect to {}: {}", to_tool, reason)
            }
        }
    }
}

/// Permission card shown to user
#[derive(Debug, Clone)]
pub struct PermissionCard {
    /// Tool name
    pub tool_name: String,
    /// Arguments summary
    pub args_summary: String,
    /// Risk level
    pub risk_level: RiskLevel,
    /// Rollback info (if available)
    pub rollback_info: Option<String>,
    /// Whether this is project-scoped
    pub project_scoped: bool,
}

impl PartialEq for PermissionCard {
    fn eq(&self, other: &Self) -> bool {
        self.tool_name == other.tool_name && self.risk_level == other.risk_level
    }
}

impl Eq for PermissionCard {}

/// Risk level for permission decisions
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

impl fmt::Display for RiskLevel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RiskLevel::Low => write!(f, "Low"),
            RiskLevel::Medium => write!(f, "Medium"),
            RiskLevel::High => write!(f, "High"),
            RiskLevel::Critical => write!(f, "Critical"),
        }
    }
}

/// Scope for permission grants
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum GrantScope {
    /// This call only
    Once,
    /// Same (tool, args) in this session
    Session,
    /// All calls with this tool in this project
    Project,
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permission_decision_allow() {
        let decision = PermissionDecision::Allow {
            reason: "Safe tool".to_string(),
        };
        assert!(decision.to_string().contains("Allow"));
        assert!(decision.to_string().contains("Safe tool"));
    }

    #[test]
    fn test_permission_decision_deny() {
        let decision = PermissionDecision::Deny {
            reason: "Not allowed".to_string(),
        };
        assert!(decision.to_string().contains("Deny"));
    }

    #[test]
    fn test_permission_decision_redirect() {
        let decision = PermissionDecision::Redirect {
            to_tool: "list_directory".to_string(),
            reason: "ls redirected".to_string(),
        };
        assert!(decision.to_string().contains("Redirect"));
        assert!(decision.to_string().contains("list_directory"));
    }

    #[test]
    fn test_risk_level_ordering() {
        assert!(RiskLevel::Low < RiskLevel::Medium);
        assert!(RiskLevel::Medium < RiskLevel::High);
        assert!(RiskLevel::High < RiskLevel::Critical);
    }

    #[test]
    fn test_risk_level_display() {
        assert_eq!(RiskLevel::Low.to_string(), "Low");
        assert_eq!(RiskLevel::Critical.to_string(), "Critical");
    }

    #[test]
    fn test_grant_scope() {
        assert_eq!(GrantScope::Once, GrantScope::Once);
        assert_ne!(GrantScope::Once, GrantScope::Session);
        assert_ne!(GrantScope::Session, GrantScope::Project);
    }

    #[test]
    fn test_permission_card() {
        let card = PermissionCard {
            tool_name: "write_file".to_string(),
            args_summary: "src/main.rs".to_string(),
            risk_level: RiskLevel::High,
            rollback_info: Some("git checkout".to_string()),
            project_scoped: true,
        };
        assert_eq!(card.tool_name, "write_file");
        assert_eq!(card.risk_level, RiskLevel::High);
        assert!(card.project_scoped);
    }

    #[test]
    fn test_permission_card_eq() {
        let card1 = PermissionCard {
            tool_name: "write_file".to_string(),
            args_summary: "".to_string(),
            risk_level: RiskLevel::High,
            rollback_info: None,
            project_scoped: false,
        };
        let card2 = PermissionCard {
            tool_name: "write_file".to_string(),
            args_summary: "different".to_string(),
            risk_level: RiskLevel::High,
            rollback_info: None,
            project_scoped: false,
        };
        assert_eq!(card1, card2); // Only tool_name and risk_level matter
    }
}