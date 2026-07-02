pub mod memory_store;
pub mod store_trait;

pub use memory_store::MemoryStore;
pub use store_trait::{Store, StoreError, StoreNamespaces};

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_module_exports() {
        // Verify all types are properly exported
        let _ = MemoryStore::new();
    }
}