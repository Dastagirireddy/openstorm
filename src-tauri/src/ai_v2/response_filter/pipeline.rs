use std::sync::Arc;

use super::config::FilterContext;
use super::events::AgentEvent;
use super::filters::EventFilter;

/// The filter pipeline — processes events through multiple filters
pub struct ResponseFilterPipeline {
    filters: Vec<Arc<dyn EventFilter>>,
}

impl ResponseFilterPipeline {
    /// Create a new empty pipeline
    pub fn new() -> Self {
        Self {
            filters: Vec::new(),
        }
    }

    /// Add a filter to the pipeline
    pub fn push(&mut self, filter: Arc<dyn EventFilter>) {
        self.filters.push(filter);
    }

    /// Apply all filters to an event
    ///
    /// Returns None if the event should be suppressed
    pub async fn apply(&self, event: AgentEvent, ctx: &FilterContext) -> Option<AgentEvent> {
        let mut current = Some(event);
        for filter in &self.filters {
            if let Some(evt) = current {
                current = filter.filter(evt, ctx).await;
            } else {
                return None; // Event suppressed
            }
        }
        current
    }

    /// Get number of filters
    pub fn len(&self) -> usize {
        self.filters.len()
    }

    /// Check if pipeline is empty
    pub fn is_empty(&self) -> bool {
        self.filters.is_empty()
    }

    /// Clear all filters
    pub fn clear(&mut self) {
        self.filters.clear();
    }
}

impl Default for ResponseFilterPipeline {
    fn default() -> Self {
        Self::new()
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai_v2::response_filter::config::{FilterConfig, FilterContext};
    use crate::ai_v2::response_filter::events::AgentEvent;
    use crate::ai_v2::response_filter::filters::{EventFilter, TextFilter};
    use std::path::PathBuf;

    fn make_ctx() -> FilterContext {
        FilterContext {
            session_id: "test".to_string(),
            agent_id: "test".to_string(),
            project_path: PathBuf::from("/test"),
            config: FilterConfig::default(),
        }
    }

    // Mock filter for testing
    struct UppercaseFilter;

    #[async_trait::async_trait]
    impl EventFilter for UppercaseFilter {
        async fn filter(&self, event: AgentEvent, _ctx: &FilterContext) -> Option<AgentEvent> {
            match event {
                AgentEvent::TextDelta { content } => Some(AgentEvent::TextDelta {
                    content: content.to_uppercase(),
                }),
                _ => Some(event),
            }
        }
    }

    struct SuppressFilter;

    #[async_trait::async_trait]
    impl EventFilter for SuppressFilter {
        async fn filter(&self, event: AgentEvent, _ctx: &FilterContext) -> Option<AgentEvent> {
            match event {
                AgentEvent::TextDelta { .. } => None,
                _ => Some(event),
            }
        }
    }

    // ── Pipeline creation ──

    #[test]
    fn test_pipeline_new() {
        let pipeline = ResponseFilterPipeline::new();
        assert!(pipeline.is_empty());
        assert_eq!(pipeline.len(), 0);
    }

    #[test]
    fn test_pipeline_default() {
        let pipeline = ResponseFilterPipeline::default();
        assert!(pipeline.is_empty());
    }

    // ── Pipeline operations ──

    #[test]
    fn test_push_filter() {
        let mut pipeline = ResponseFilterPipeline::new();
        pipeline.push(Arc::new(TextFilter::new()));
        assert_eq!(pipeline.len(), 1);
        assert!(!pipeline.is_empty());
    }

    #[test]
    fn test_clear_pipeline() {
        let mut pipeline = ResponseFilterPipeline::new();
        pipeline.push(Arc::new(TextFilter::new()));
        pipeline.push(Arc::new(UppercaseFilter));
        pipeline.clear();
        assert!(pipeline.is_empty());
    }

    // ── Apply ──

    #[tokio::test]
    async fn test_apply_empty_pipeline() {
        let pipeline = ResponseFilterPipeline::new();
        let ctx = make_ctx();
        let event = AgentEvent::TextDelta {
            content: "test".to_string(),
        };
        let result = pipeline.apply(event, &ctx).await;
        assert!(result.is_some());
        match result.unwrap() {
            AgentEvent::TextDelta { content } => assert_eq!(content, "test"),
            _ => panic!("Expected TextDelta"),
        }
    }

    #[tokio::test]
    async fn test_apply_single_filter() {
        let mut pipeline = ResponseFilterPipeline::new();
        pipeline.push(Arc::new(UppercaseFilter));
        let ctx = make_ctx();
        let event = AgentEvent::TextDelta {
            content: "hello".to_string(),
        };
        let result = pipeline.apply(event, &ctx).await;
        assert!(result.is_some());
        match result.unwrap() {
            AgentEvent::TextDelta { content } => assert_eq!(content, "HELLO"),
            _ => panic!("Expected TextDelta"),
        }
    }

    #[tokio::test]
    async fn test_apply_chained_filters() {
        let mut pipeline = ResponseFilterPipeline::new();
        pipeline.push(Arc::new(TextFilter::new())); // strips markers
        pipeline.push(Arc::new(UppercaseFilter)); // uppercases
        let ctx = make_ctx();
        let event = AgentEvent::TextDelta {
            content: "[PLAN] hello".to_string(),
        };
        let result = pipeline.apply(event, &ctx).await;
        assert!(result.is_some());
        match result.unwrap() {
            AgentEvent::TextDelta { content } => assert_eq!(content, "HELLO"),
            _ => panic!("Expected TextDelta"),
        }
    }

    #[tokio::test]
    async fn test_apply_suppress_event() {
        let mut pipeline = ResponseFilterPipeline::new();
        pipeline.push(Arc::new(SuppressFilter));
        let ctx = make_ctx();
        let event = AgentEvent::TextDelta {
            content: "test".to_string(),
        };
        let result = pipeline.apply(event, &ctx).await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_apply_suppress_then_continue() {
        let mut pipeline = ResponseFilterPipeline::new();
        pipeline.push(Arc::new(SuppressFilter));
        pipeline.push(Arc::new(UppercaseFilter)); // Should not run
        let ctx = make_ctx();
        let event = AgentEvent::TextDelta {
            content: "test".to_string(),
        };
        let result = pipeline.apply(event, &ctx).await;
        assert!(result.is_none()); // Suppressed, so no result
    }

    #[tokio::test]
    async fn test_apply_non_text_event() {
        let mut pipeline = ResponseFilterPipeline::new();
        pipeline.push(Arc::new(SuppressFilter)); // Only suppresses text
        pipeline.push(Arc::new(UppercaseFilter)); // Only affects text
        let ctx = make_ctx();
        let event = AgentEvent::Response {
            content: "done".to_string(),
            tool_calls_made: 0,
            usage: None,
        };
        let result = pipeline.apply(event.clone(), &ctx).await;
        assert!(result.is_some());
    }
}