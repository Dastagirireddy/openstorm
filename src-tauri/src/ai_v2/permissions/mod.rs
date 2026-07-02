pub mod service;
pub mod session_memory;
pub mod types;

pub use service::{DefaultPermissionService, PermissionConfig, PermissionService};
pub use session_memory::SessionMemory;
pub use types::{GrantScope, PermissionCard, PermissionDecision, RiskLevel};

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_module_exports() {
        // Verify all types are properly exported
        let _ = PermissionDecision::Allow {
            reason: "test".to_string(),
        };
        let _ = RiskLevel::Low;
        let _ = GrantScope::Once;
    }
}