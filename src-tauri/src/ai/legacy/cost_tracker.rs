use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use super::Usage;

/// Cost per token for different models
#[derive(Debug, Clone)]
pub struct ModelPricing {
    /// Cost per input token (in dollars)
    pub input_per_token: f64,
    /// Cost per output token (in dollars)
    pub output_per_token: f64,
}

impl ModelPricing {
    pub fn new(input_per_token: f64, output_per_token: f64) -> Self {
        Self {
            input_per_token,
            output_per_token,
        }
    }
}

/// Default pricing for common models (USD per token)
pub fn default_pricing() -> HashMap<String, ModelPricing> {
    let mut pricing = HashMap::new();

    // OpenAI models
    pricing.insert(
        "gpt-4o".to_string(),
        ModelPricing::new(0.0000025, 0.00001),
    );
    pricing.insert(
        "gpt-4o-mini".to_string(),
        ModelPricing::new(0.00000015, 0.0000006),
    );
    pricing.insert(
        "gpt-4-turbo".to_string(),
        ModelPricing::new(0.00001, 0.00003),
    );
    pricing.insert(
        "gpt-4".to_string(),
        ModelPricing::new(0.00003, 0.00006),
    );
    pricing.insert(
        "gpt-3.5-turbo".to_string(),
        ModelPricing::new(0.0000005, 0.0000015),
    );

    // Anthropic models
    pricing.insert(
        "claude-sonnet-4-20250514".to_string(),
        ModelPricing::new(0.000003, 0.000015),
    );
    pricing.insert(
        "claude-3-5-haiku-20241022".to_string(),
        ModelPricing::new(0.0000008, 0.000004),
    );
    pricing.insert(
        "claude-3-5-sonnet-20241022".to_string(),
        ModelPricing::new(0.000003, 0.000015),
    );
    pricing.insert(
        "claude-3-opus-20240229".to_string(),
        ModelPricing::new(0.000015, 0.000075),
    );

    pricing
}

/// Cost tracking for LLM API calls
#[derive(Debug, Clone)]
pub struct CostEntry {
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub cost: f64,
    pub timestamp: u64,
}

/// Cost tracker for LLM API usage
#[derive(Debug, Clone)]
pub struct CostTracker {
    entries: Vec<CostEntry>,
    pricing: HashMap<String, ModelPricing>,
}

impl CostTracker {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            pricing: default_pricing(),
        }
    }

    pub fn with_pricing(pricing: HashMap<String, ModelPricing>) -> Self {
        Self {
            entries: Vec::new(),
            pricing,
        }
    }

    /// Record an API call
    pub fn record(&mut self, model: &str, usage: &Usage) -> f64 {
        let cost = self.calculate_cost(model, usage);

        self.entries.push(CostEntry {
            model: model.to_string(),
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            cost,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        });

        cost
    }

    /// Calculate cost for an API call
    pub fn calculate_cost(&self, model: &str, usage: &Usage) -> f64 {
        if let Some(pricing) = self.pricing.get(model) {
            let input_cost = usage.prompt_tokens as f64 * pricing.input_per_token;
            let output_cost = usage.completion_tokens as f64 * pricing.output_per_token;
            input_cost + output_cost
        } else {
            // Default estimate if model not found
            let input_cost = usage.prompt_tokens as f64 * 0.000003;
            let output_cost = usage.completion_tokens as f64 * 0.000015;
            input_cost + output_cost
        }
    }

    /// Get total cost
    pub fn total_cost(&self) -> f64 {
        self.entries.iter().map(|e| e.cost).sum()
    }

    /// Get total tokens
    pub fn total_tokens(&self) -> (u64, u64) {
        let prompt: u64 = self.entries.iter().map(|e| e.prompt_tokens as u64).sum();
        let completion: u64 = self.entries.iter().map(|e| e.completion_tokens as u64).sum();
        (prompt, completion)
    }

    /// Get cost by model
    pub fn cost_by_model(&self) -> HashMap<String, f64> {
        let mut costs = HashMap::new();
        for entry in &self.entries {
            *costs.entry(entry.model.clone()).or_insert(0.0) += entry.cost;
        }
        costs
    }

    /// Get cost summary
    pub fn summary(&self) -> String {
        let (prompt_tokens, completion_tokens) = self.total_tokens();
        let total_cost = self.total_cost();
        let costs_by_model = self.cost_by_model();

        let mut summary = format!(
            "Cost Summary:\n\
             - Total API calls: {}\n\
             - Total prompt tokens: {}\n\
             - Total completion tokens: {}\n\
             - Total cost: ${:.6}",
            self.entries.len(),
            prompt_tokens,
            completion_tokens,
            total_cost
        );

        if !costs_by_model.is_empty() {
            summary.push_str("\n\nCost by model:");
            for (model, cost) in &costs_by_model {
                summary.push_str(&format!("\n  {}: ${:.6}", model, cost));
            }
        }

        summary
    }

    /// Clear all entries
    pub fn clear(&mut self) {
        self.entries.clear();
    }
}

impl Default for CostTracker {
    fn default() -> Self {
        Self::new()
    }
}

/// Thread-safe cost tracker
pub type SharedCostTracker = Arc<Mutex<CostTracker>>;

/// Create a shared cost tracker
pub fn create_shared_cost_tracker() -> SharedCostTracker {
    Arc::new(Mutex::new(CostTracker::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cost_calculation() {
        let tracker = CostTracker::new();
        let usage = Usage {
            prompt_tokens: 1000,
            completion_tokens: 500,
            total_tokens: 1500,
        };

        let cost = tracker.calculate_cost("gpt-4o", &usage);
        // 1000 * 0.0000025 + 500 * 0.00001 = 0.0025 + 0.005 = 0.0075
        assert!((cost - 0.0075).abs() < 1e-10);
    }

    #[test]
    fn test_record_and_total() {
        let mut tracker = CostTracker::new();
        let usage = Usage {
            prompt_tokens: 1000,
            completion_tokens: 500,
            total_tokens: 1500,
        };

        tracker.record("gpt-4o", &usage);
        tracker.record("gpt-4o", &usage);

        let total = tracker.total_cost();
        assert!((total - 0.015).abs() < 1e-10);

        let (prompt, completion) = tracker.total_tokens();
        assert_eq!(prompt, 2000);
        assert_eq!(completion, 1000);
    }

    #[test]
    fn test_cost_by_model() {
        let mut tracker = CostTracker::new();
        let usage = Usage {
            prompt_tokens: 1000,
            completion_tokens: 500,
            total_tokens: 1500,
        };

        tracker.record("gpt-4o", &usage);
        tracker.record("claude-3-5-sonnet-20241022", &usage);

        let costs = tracker.cost_by_model();
        assert_eq!(costs.len(), 2);
        assert!(costs.contains_key("gpt-4o"));
        assert!(costs.contains_key("claude-3-5-sonnet-20241022"));
    }
}
