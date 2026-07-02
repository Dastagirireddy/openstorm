pub mod config;
pub mod events;
pub mod filters;
pub mod pipeline;

pub use config::{FilterConfig, FilterContext};
pub use events::AgentEvent;
pub use filters::{CostEnricher, EventFilter, SensitiveFilter, TextFilter, ToolFilter};
pub use pipeline::ResponseFilterPipeline;

// ═══════════════════════════════════════════════════════════════
// DEFAULT PIPELINE BUILDER
// ═══════════════════════════════════════════════════════════════

/// Build a default response filter pipeline
pub fn default_pipeline() -> ResponseFilterPipeline {
    let mut pipeline = ResponseFilterPipeline::new();

    // 1. Strip internal markers
    pipeline.push(std::sync::Arc::new(TextFilter::new()));

    // 2. Truncate long tool results
    pipeline.push(std::sync::Arc::new(ToolFilter::default()));

    // 3. Strip sensitive patterns
    pipeline.push(std::sync::Arc::new(SensitiveFilter::with_default_patterns()));

    // 4. Cost enrichment (passthrough for now)
    pipeline.push(std::sync::Arc::new(CostEnricher::new()));

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
        assert_eq!(pipeline.len(), 4); // Text + Tool + Sensitive + Cost
    }
}