use std::time::Duration;

/// Agent configuration
#[derive(Debug, Clone)]
pub struct AgentConfig {
    /// Model name to use
    pub model: String,

    /// Maximum number of iterations
    pub max_iterations: usize,

    /// Maximum consecutive text responses without tool calls
    pub max_consecutive_text: usize,

    /// Context token budget
    pub context_token_budget: usize,

    /// Tool result cache TTL
    pub tool_result_cache_ttl: Duration,

    /// Temperature for LLM calls
    pub temperature: f32,

    /// Max tokens for LLM response
    pub max_tokens: usize,

    /// System prompt
    pub system_prompt: Option<String>,

    /// Whether to stream responses
    pub stream: bool,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            model: "claude-3-5-sonnet-20241022".to_string(),
            max_iterations: 20,
            max_consecutive_text: 3,
            context_token_budget: 8192,
            tool_result_cache_ttl: Duration::from_secs(300),
            temperature: 0.0,
            max_tokens: 4096,
            system_prompt: None,
            stream: true,
        }
    }
}

impl AgentConfig {
    /// Create config for a specific model
    pub fn for_model(model: &str) -> Self {
        Self {
            model: model.to_string(),
            ..Default::default()
        }
    }

    /// Set max iterations
    pub fn with_max_iterations(mut self, max: usize) -> Self {
        self.max_iterations = max;
        self
    }

    /// Set temperature
    pub fn with_temperature(mut self, temp: f32) -> Self {
        self.temperature = temp;
        self
    }

    /// Set system prompt
    pub fn with_system_prompt(mut self, prompt: &str) -> Self {
        self.system_prompt = Some(prompt.to_string());
        self
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_config_default() {
        let config = AgentConfig::default();
        assert_eq!(config.model, "claude-3-5-sonnet-20241022");
        assert_eq!(config.max_iterations, 20);
        assert_eq!(config.max_consecutive_text, 3);
        assert_eq!(config.context_token_budget, 8192);
        assert_eq!(config.temperature, 0.0);
        assert_eq!(config.max_tokens, 4096);
        assert!(config.stream);
    }

    #[test]
    fn test_agent_config_for_model() {
        let config = AgentConfig::for_model("gpt-4");
        assert_eq!(config.model, "gpt-4");
        assert_eq!(config.max_iterations, 20); // Default
    }

    #[test]
    fn test_agent_config_builder() {
        let config = AgentConfig::default()
            .with_max_iterations(10)
            .with_temperature(0.5)
            .with_system_prompt("You are helpful");
        assert_eq!(config.max_iterations, 10);
        assert_eq!(config.temperature, 0.5);
        assert_eq!(config.system_prompt.unwrap(), "You are helpful");
    }
}