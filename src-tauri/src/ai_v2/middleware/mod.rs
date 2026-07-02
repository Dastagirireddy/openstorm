pub mod cache;
pub mod permission;
pub mod pipeline;
pub mod redirect;

pub use cache::CacheMiddleware;
pub use permission::PermissionMiddleware;
pub use pipeline::{MiddlewareError, MiddlewarePipeline, ToolCallRequest, ToolMiddleware};
pub use redirect::RedirectionMiddleware;

// ═══════════════════════════════════════════════════════════════
// DEFAULT PIPELINE BUILDER
// ═══════════════════════════════════════════════════════════════

/// Build a default middleware pipeline
pub fn default_pipeline() -> MiddlewarePipeline {
    let mut pipeline = MiddlewarePipeline::new();

    // Add cache middleware (5 min TTL, 1000 entries)
    pipeline.push(std::sync::Arc::new(CacheMiddleware::default()));

    // Add IDE redirects
    pipeline.push(std::sync::Arc::new(RedirectionMiddleware::with_ide_redirects()));

    pipeline
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_pipeline() {
        let pipeline = default_pipeline();
        assert_eq!(pipeline.len(), 2); // Cache + Redirect
    }
}