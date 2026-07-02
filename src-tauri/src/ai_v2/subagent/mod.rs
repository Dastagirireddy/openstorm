pub mod spawner;
pub mod synthesis;
pub mod types;

pub use spawner::{AgentInfo, AgentSpawner, InMemorySpawner, SpawnerError};
pub use synthesis::{DefaultSynthesisService, SynthesisError, SynthesisService};
pub use types::{ParentContext, SpawnConfig, SubAgentRole, TaskHandle, TaskResult, TaskStatus};

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_module_exports() {
        let _ = InMemorySpawner::new(3);
        let _ = DefaultSynthesisService;
        let _ = ParentContext::new(PathBuf::from("/project"));
    }
}