pub mod config;
pub mod runtime;

pub use config::AgentConfig;
pub use runtime::{AgentError, AgentRuntime, LLMProvider, LLMResponse, ToolService};

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_module_exports() {
        // Verify all types are properly exported
        let _ = AgentConfig::default();
    }
}