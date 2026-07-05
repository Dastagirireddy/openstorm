use std::sync::Arc;

use super::pipeline::{MiddlewareError, NextFn, ToolCallRequest, ToolMiddleware};
use crate::ai::tools::tool_trait::{ToolResult, ToolRuntime, TrustTier};

// ═══════════════════════════════════════════════════════════════
// PERMISSION DECISION
// ═══════════════════════════════════════════════════════════════

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
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

// ═══════════════════════════════════════════════════════════════
// PERMISSION CHECKER
// ═══════════════════════════════════════════════════════════════

/// Trait for checking tool permissions
#[async_trait::async_trait]
pub trait PermissionChecker: Send + Sync {
    /// Check if a tool call is allowed
    async fn check(
        &self,
        tool_name: &str,
        args: &serde_json::Value,
        trust_tier: TrustTier,
    ) -> PermissionDecision;
}

// ═══════════════════════════════════════════════════════════════
// PERMISSION MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

/// Middleware that checks tool permissions before execution
pub struct PermissionMiddleware {
    checker: Arc<dyn PermissionChecker>,
    auto_approve_safe: bool,
}

impl PermissionMiddleware {
    /// Create a new permission middleware
    pub fn new(checker: Arc<dyn PermissionChecker>, auto_approve_safe: bool) -> Self {
        Self {
            checker,
            auto_approve_safe,
        }
    }

    /// Create middleware that auto-approves safe tools
    pub fn auto_approve_safe(checker: Arc<dyn PermissionChecker>) -> Self {
        Self::new(checker, true)
    }

    /// Create middleware that always asks
    pub fn always_ask(checker: Arc<dyn PermissionChecker>) -> Self {
        Self::new(checker, false)
    }
}

#[async_trait::async_trait]
impl ToolMiddleware for PermissionMiddleware {
    async fn process(
        &self,
        request: &ToolCallRequest,
        runtime: &ToolRuntime,
        next: &NextFn,
    ) -> Result<ToolResult, MiddlewareError> {
        // Get tool trust tier (default to Standard)
        // In real implementation, this would look up from registry
        let trust_tier = TrustTier::Standard;

        // Check permissions
        let decision = self
            .checker
            .check(&request.tool_name, &request.args, trust_tier)
            .await;

        match decision {
            PermissionDecision::Allow { .. } => {
                // Proceed to next middleware/handler
                next(request, runtime).await
            }
            PermissionDecision::Ask { reason, card } => {
                // Auto-approve safe tools if configured
                if self.auto_approve_safe && trust_tier == TrustTier::Safe {
                    return next(request, runtime).await;
                }

                // In real implementation, this would emit an event to frontend
                // and wait for user response. For now, we deny.
                Err(MiddlewareError::PermissionDenied(format!(
                    "{}: {} (requires user approval)",
                    reason, card.tool_name
                )))
            }
            PermissionDecision::Deny { reason } => {
                Err(MiddlewareError::PermissionDenied(reason))
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// MOCK PERMISSION CHECKER
// ═══════════════════════════════════════════════════════════════

/// Mock permission checker for testing
#[cfg(test)]
pub struct MockPermissionChecker {
    decisions: std::collections::HashMap<String, PermissionDecision>,
    default: PermissionDecision,
}

#[cfg(test)]
impl MockPermissionChecker {
    pub fn new(default: PermissionDecision) -> Self {
        Self {
            decisions: std::collections::HashMap::new(),
            default,
        }
    }

    pub fn allow_tool(&mut self, tool_name: &str) {
        self.decisions.insert(
            tool_name.to_string(),
            PermissionDecision::Allow {
                reason: "allowed".to_string(),
            },
        );
    }

    pub fn deny_tool(&mut self, tool_name: &str, reason: &str) {
        self.decisions.insert(
            tool_name.to_string(),
            PermissionDecision::Deny {
                reason: reason.to_string(),
            },
        );
    }
}

#[cfg(test)]
#[async_trait::async_trait]
impl PermissionChecker for MockPermissionChecker {
    async fn check(
        &self,
        tool_name: &str,
        _args: &serde_json::Value,
        _trust_tier: TrustTier,
    ) -> PermissionDecision {
        self.decisions
            .get(tool_name)
            .cloned()
            .unwrap_or_else(|| self.default.clone())
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::tools::tool_trait::{ToolRuntime, ToolResult};
    use std::path::PathBuf;

    fn make_runtime() -> ToolRuntime {
        ToolRuntime {
            project_path: PathBuf::from("/test"),
            session_id: "test-session".to_string(),
        }
    }

    fn make_request(tool_name: &str) -> ToolCallRequest {
        ToolCallRequest {
            tool_name: tool_name.to_string(),
            args: serde_json::json!({}),
            tool_call_id: "test-call".to_string(),
            metadata: super::super::pipeline::RequestMetadata::default(),
        }
    }

    fn mock_handler(
        _req: &ToolCallRequest,
        _rt: &ToolRuntime,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<ToolResult, MiddlewareError>> + Send>,
    > {
        Box::pin(async { Ok(ToolResult::success("test", "executed")) })
    }

    // ── Permission Middleware ──

    #[tokio::test]
    async fn test_permission_allow() {
        let mut checker = MockPermissionChecker::new(PermissionDecision::Allow {
            reason: "default allow".to_string(),
        });
        checker.allow_tool("test_tool");

        let middleware = PermissionMiddleware::new(Arc::new(checker), false);
        let runtime = make_runtime();
        let request = make_request("test_tool");

        let result = middleware.process(&request, &runtime, &mock_handler).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().content, "executed");
    }

    #[tokio::test]
    async fn test_permission_deny() {
        let mut checker = MockPermissionChecker::new(PermissionDecision::Allow {
            reason: "default allow".to_string(),
        });
        checker.deny_tool("test_tool", "not allowed");

        let middleware = PermissionMiddleware::new(Arc::new(checker), false);
        let runtime = make_runtime();
        let request = make_request("test_tool");

        let result = middleware.process(&request, &runtime, &mock_handler).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            MiddlewareError::PermissionDenied(reason) => {
                assert!(reason.contains("not allowed"));
            }
            _ => panic!("Expected PermissionDenied"),
        }
    }

    #[tokio::test]
    async fn test_permission_ask_deny() {
        let checker = MockPermissionChecker::new(PermissionDecision::Ask {
            reason: "need approval".to_string(),
            card: PermissionCard {
                tool_name: "test_tool".to_string(),
                args_summary: "no args".to_string(),
                risk_level: RiskLevel::Medium,
                rollback_info: None,
                project_scoped: false,
            },
        });

        let middleware = PermissionMiddleware::new(Arc::new(checker), false);
        let runtime = make_runtime();
        let request = make_request("test_tool");

        let result = middleware.process(&request, &runtime, &mock_handler).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_permission_ask_auto_approve_safe() {
        let checker = MockPermissionChecker::new(PermissionDecision::Ask {
            reason: "need approval".to_string(),
            card: PermissionCard {
                tool_name: "test_tool".to_string(),
                args_summary: "no args".to_string(),
                risk_level: RiskLevel::Low,
                rollback_info: None,
                project_scoped: false,
            },
        });

        // Auto-approve safe - but tool is Standard tier, so still asks
        let middleware = PermissionMiddleware::auto_approve_safe(Arc::new(checker));
        let runtime = make_runtime();
        let request = make_request("test_tool");

        let result = middleware.process(&request, &runtime, &mock_handler).await;
        // Standard tier should still be denied
        assert!(result.is_err());
    }

    // ── Permission Card ──

    #[test]
    fn test_permission_card() {
        let card = PermissionCard {
            tool_name: "write_file".to_string(),
            args_summary: "src/main.rs".to_string(),
            risk_level: RiskLevel::High,
            rollback_info: Some("git checkout -- src/main.rs".to_string()),
            project_scoped: true,
        };

        assert_eq!(card.tool_name, "write_file");
        assert_eq!(card.risk_level, RiskLevel::High);
        assert!(card.rollback_info.is_some());
        assert!(card.project_scoped);
    }

    // ── Risk Level ──

    #[test]
    fn test_risk_level_ordering() {
        assert!(RiskLevel::Low < RiskLevel::Medium);
        assert!(RiskLevel::Medium < RiskLevel::High);
        assert!(RiskLevel::High < RiskLevel::Critical);
    }
}