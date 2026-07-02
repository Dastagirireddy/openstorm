pub mod service;

pub use service::ContextService;

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_module_exports() {
        let _ = ContextService::new(std::path::PathBuf::from("/project"));
    }
}