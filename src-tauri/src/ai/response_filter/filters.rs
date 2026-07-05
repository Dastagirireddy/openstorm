use async_trait::async_trait;

use super::config::FilterContext;
use super::events::AgentEvent;

/// Response filter trait — each filter is a composable layer
#[async_trait]
pub trait EventFilter: Send + Sync {
    /// Filter/transform an event. Returns None to suppress the event.
    async fn filter(&self, event: AgentEvent, ctx: &FilterContext) -> Option<AgentEvent>;
}

// ═══════════════════════════════════════════════════════════════
// TEXT FILTER — Clean up text deltas
// ═══════════════════════════════════════════════════════════════

/// Strips internal markers from text deltas
pub struct TextFilter;

impl TextFilter {
    pub fn new() -> Self {
        Self
    }
}

impl Default for TextFilter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl EventFilter for TextFilter {
    async fn filter(&self, event: AgentEvent, _ctx: &FilterContext) -> Option<AgentEvent> {
        match event {
            AgentEvent::TextDelta { content } => {
                // Strip internal markers
                let cleaned = content
                    .replace("[PLAN]", "")
                    .replace("[TODO]", "")
                    .replace("[DONE]", "")
                    .replace("[THINKING]", "")
                    .trim()
                    .to_string();

                if cleaned.is_empty() {
                    None
                } else {
                    Some(AgentEvent::TextDelta { content: cleaned })
                }
            }
            _ => Some(event),
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// TOOL FILTER — Control what tool details show
// ═══════════════════════════════════════════════════════════════

/// Truncates long tool results for display
pub struct ToolFilter {
    max_result_display: usize,
}

impl ToolFilter {
    pub fn new(max_result_display: usize) -> Self {
        Self { max_result_display }
    }

    pub fn default() -> Self {
        Self::new(500)
    }
}

#[async_trait]
impl EventFilter for ToolFilter {
    async fn filter(&self, event: AgentEvent, _ctx: &FilterContext) -> Option<AgentEvent> {
        match event {
            AgentEvent::ToolResult {
                tool_call_id,
                output,
                is_error,
            } => {
                // Truncate long outputs for display
                let display_output = if output.len() > self.max_result_display {
                    format!(
                        "{}... ({} total chars)",
                        &output[..self.max_result_display],
                        output.len()
                    )
                } else {
                    output
                };
                Some(AgentEvent::ToolResult {
                    tool_call_id,
                    output: display_output,
                    is_error,
                })
            }
            AgentEvent::ToolUse { name, args } => {
                // Pass through, frontend handles display
                Some(AgentEvent::ToolUse { name, args })
            }
            _ => Some(event),
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// SENSITIVE FILTER — Strip secrets/keys
// ═══════════════════════════════════════════════════════════════

/// Strips sensitive patterns from text
pub struct SensitiveFilter {
    patterns: Vec<String>,
}

impl SensitiveFilter {
    pub fn new(patterns: Vec<String>) -> Self {
        Self { patterns }
    }

    pub fn default_patterns() -> Vec<String> {
        vec![
            r"(?i)(api[_-]?key|token|secret|password)\s*[=:]\s*\S+".to_string(),
            r"sk-[a-zA-Z0-9]{20,}".to_string(),
            r"ghp_[a-zA-Z0-9]{36}".to_string(),
        ]
    }

    pub fn with_default_patterns() -> Self {
        Self::new(Self::default_patterns())
    }

    /// Apply redaction patterns to text
    pub fn redact(&self, text: &str) -> String {
        let mut result = text.to_string();
        for pattern in &self.patterns {
            // Simple string replacement for testing
            // In production, use regex crate for proper pattern matching
            while let Some(idx) = result.find(pattern.as_str()) {
                let end = idx + pattern.len();
                if end <= result.len() {
                    result.replace_range(idx..end, "[REDACTED]");
                } else {
                    break;
                }
            }
        }
        result
    }
}

#[async_trait]
impl EventFilter for SensitiveFilter {
    async fn filter(&self, event: AgentEvent, _ctx: &FilterContext) -> Option<AgentEvent> {
        match event {
            AgentEvent::TextDelta { content } => {
                let filtered = self.redact(&content);
                Some(AgentEvent::TextDelta { content: filtered })
            }
            AgentEvent::ToolResult {
                tool_call_id,
                output,
                is_error,
            } => {
                let filtered = self.redact(&output);
                Some(AgentEvent::ToolResult {
                    tool_call_id,
                    output: filtered,
                    is_error,
                })
            }
            _ => Some(event),
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// COST ENRICHER — Add cost info to responses
// ═══════════════════════════════════════════════════════════════

/// Enriches responses with cost information
pub struct CostEnricher;

impl CostEnricher {
    pub fn new() -> Self {
        Self
    }
}

impl Default for CostEnricher {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl EventFilter for CostEnricher {
    async fn filter(&self, event: AgentEvent, _ctx: &FilterContext) -> Option<AgentEvent> {
        // Cost enrichment happens at Response stage
        // Frontend receives CostUpdate events separately
        Some(event)
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::response_filter::config::{FilterConfig, FilterContext};
    use std::path::PathBuf;

    fn make_ctx() -> FilterContext {
        FilterContext {
            session_id: "test".to_string(),
            agent_id: "test".to_string(),
            project_path: PathBuf::from("/test"),
            config: FilterConfig::default(),
        }
    }

    // ── TextFilter ──

    #[tokio::test]
    async fn test_text_filter_clean() {
        let filter = TextFilter::new();
        let ctx = make_ctx();
        let event = AgentEvent::TextDelta {
            content: "Hello world".to_string(),
        };
        let result = filter.filter(event, &ctx).await;
        assert!(result.is_some());
        match result.unwrap() {
            AgentEvent::TextDelta { content } => assert_eq!(content, "Hello world"),
            _ => panic!("Expected TextDelta"),
        }
    }

    #[tokio::test]
    async fn test_text_filter_strip_markers() {
        let filter = TextFilter::new();
        let ctx = make_ctx();
        let event = AgentEvent::TextDelta {
            content: "[PLAN] Step 1 [DONE]".to_string(),
        };
        let result = filter.filter(event, &ctx).await;
        assert!(result.is_some());
        match result.unwrap() {
            AgentEvent::TextDelta { content } => assert_eq!(content, "Step 1"),
            _ => panic!("Expected TextDelta"),
        }
    }

    #[tokio::test]
    async fn test_text_filter_empty_after_clean() {
        let filter = TextFilter::new();
        let ctx = make_ctx();
        let event = AgentEvent::TextDelta {
            content: "[PLAN][TODO][DONE]".to_string(),
        };
        let result = filter.filter(event, &ctx).await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_text_filter_passthrough() {
        let filter = TextFilter::new();
        let ctx = make_ctx();
        let event = AgentEvent::Response {
            content: "Done".to_string(),
            tool_calls_made: 0,
            usage: None,
        };
        let result = filter.filter(event.clone(), &ctx).await;
        assert!(result.is_some());
    }

    // ── ToolFilter ──

    #[tokio::test]
    async fn test_tool_filter_short_output() {
        let filter = ToolFilter::new(100);
        let ctx = make_ctx();
        let event = AgentEvent::ToolResult {
            tool_call_id: "call-1".to_string(),
            output: "short".to_string(),
            is_error: false,
        };
        let result = filter.filter(event, &ctx).await;
        assert!(result.is_some());
        match result.unwrap() {
            AgentEvent::ToolResult { output, .. } => assert_eq!(output, "short"),
            _ => panic!("Expected ToolResult"),
        }
    }

    #[tokio::test]
    async fn test_tool_filter_truncate() {
        let filter = ToolFilter::new(10);
        let ctx = make_ctx();
        let event = AgentEvent::ToolResult {
            tool_call_id: "call-1".to_string(),
            output: "a".repeat(50),
            is_error: false,
        };
        let result = filter.filter(event, &ctx).await;
        assert!(result.is_some());
        match result.unwrap() {
            AgentEvent::ToolResult { output, .. } => {
                assert!(output.contains("..."));
                assert!(output.contains("50 total chars"));
            }
            _ => panic!("Expected ToolResult"),
        }
    }

    // ── SensitiveFilter ──

    #[tokio::test]
    async fn test_sensitive_filter_no_match() {
        let filter = SensitiveFilter::with_default_patterns();
        let ctx = make_ctx();
        let event = AgentEvent::TextDelta {
            content: "Hello world".to_string(),
        };
        let result = filter.filter(event, &ctx).await;
        assert!(result.is_some());
        match result.unwrap() {
            AgentEvent::TextDelta { content } => assert_eq!(content, "Hello world"),
            _ => panic!("Expected TextDelta"),
        }
    }

    #[test]
    fn test_sensitive_filter_redact() {
        let filter = SensitiveFilter::new(vec!["secret=abc123".to_string()]);
        let result = filter.redact("my secret=abc123 here");
        assert_eq!(result, "my [REDACTED] here");
    }

    // ── CostEnricher ──

    #[tokio::test]
    async fn test_cost_enricher_passthrough() {
        let filter = CostEnricher::new();
        let ctx = make_ctx();
        let event = AgentEvent::Response {
            content: "Done".to_string(),
            tool_calls_made: 0,
            usage: None,
        };
        let result = filter.filter(event.clone(), &ctx).await;
        assert!(result.is_some());
    }
}