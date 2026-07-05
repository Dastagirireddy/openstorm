pub mod tool_cache;

pub use tool_cache::{CacheStats, ToolResultCache};

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_module_exports() {
        let _ = ToolResultCache::new(Duration::from_secs(60), 100);
    }
}