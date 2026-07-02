use std::path::PathBuf;

/// Filter configuration
#[derive(Debug, Clone)]
pub struct FilterConfig {
    /// Max chars for tool results shown to user
    pub max_tool_result_display: usize,

    /// Strip internal reasoning from display
    pub strip_reasoning: bool,

    /// Add cost summary to final response
    pub add_cost_summary: bool,

    /// Patterns to strip from text (API keys, tokens, etc.)
    pub sensitive_patterns: Vec<String>,

    /// Events to suppress entirely
    pub suppressed_events: Vec<String>,
}

impl Default for FilterConfig {
    fn default() -> Self {
        Self {
            max_tool_result_display: 500,
            strip_reasoning: true,
            add_cost_summary: true,
            sensitive_patterns: vec![
                r"(?i)(api[_-]?key|token|secret|password)\s*[=:]\s*\S+".to_string(),
                r"sk-[a-zA-Z0-9]{20,}".to_string(),
                r"ghp_[a-zA-Z0-9]{36}".to_string(),
            ],
            suppressed_events: Vec::new(),
        }
    }
}

/// Context available to all filters
#[derive(Debug, Clone)]
pub struct FilterContext {
    pub session_id: String,
    pub agent_id: String,
    pub project_path: PathBuf,
    pub config: FilterConfig,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filter_config_default() {
        let config = FilterConfig::default();
        assert_eq!(config.max_tool_result_display, 500);
        assert!(config.strip_reasoning);
        assert!(config.add_cost_summary);
        assert!(!config.sensitive_patterns.is_empty());
        assert!(config.suppressed_events.is_empty());
    }

    #[test]
    fn test_filter_context() {
        let ctx = FilterContext {
            session_id: "session-1".to_string(),
            agent_id: "agent-1".to_string(),
            project_path: PathBuf::from("/test"),
            config: FilterConfig::default(),
        };
        assert_eq!(ctx.session_id, "session-1");
    }
}