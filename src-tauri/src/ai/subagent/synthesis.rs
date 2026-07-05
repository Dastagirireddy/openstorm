use super::types::TaskResult;

/// SynthesisService trait — merges results from multiple sub-agents
#[async_trait::async_trait]
pub trait SynthesisService: Send + Sync {
    /// Synthesize results from multiple sub-agents into a single response
    async fn synthesize(
        &self,
        parent_context: &str,
        results: &[TaskResult],
    ) -> Result<String, SynthesisError>;
}

/// Synthesis errors
#[derive(Debug, thiserror::Error)]
pub enum SynthesisError {
    #[error("No results to synthesize")]
    NoResults,

    #[error("Synthesis failed: {0}")]
    Failed(String),
}

/// Default synthesis service — simple concatenation
pub struct DefaultSynthesisService;

#[async_trait::async_trait]
impl SynthesisService for DefaultSynthesisService {
    async fn synthesize(
        &self,
        _parent_context: &str,
        results: &[TaskResult],
    ) -> Result<String, SynthesisError> {
        if results.is_empty() {
            return Err(SynthesisError::NoResults);
        }

        let mut output = String::new();

        for result in results {
            if result.success {
                output.push_str(&format!("- {}\n", result.summary));
            } else {
                output.push_str(&format!("- [FAILED] {}\n", result.summary));
            }
        }

        Ok(output)
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_synthesize_no_results() {
        let service = DefaultSynthesisService;
        let result = service.synthesize("context", &[]).await;
        assert!(matches!(result, Err(SynthesisError::NoResults)));
    }

    #[tokio::test]
    async fn test_synthesize_single_success() {
        let service = DefaultSynthesisService;
        let results = vec![TaskResult::success(
            "task-1".to_string(),
            "agent-1".to_string(),
            "Found 3 TODOs".to_string(),
            Vec::new(),
            5,
            1000,
        )];

        let output = service.synthesize("context", &results).await.unwrap();
        assert!(output.contains("Found 3 TODOs"));
    }

    #[tokio::test]
    async fn test_synthesize_mixed_results() {
        let service = DefaultSynthesisService;
        let results = vec![
            TaskResult::success(
                "task-1".to_string(),
                "agent-1".to_string(),
                "Found TODOs".to_string(),
                Vec::new(),
                3,
                500,
            ),
            TaskResult::failure(
                "task-2".to_string(),
                "agent-2".to_string(),
                "Timeout".to_string(),
            ),
        ];

        let output = service.synthesize("context", &results).await.unwrap();
        assert!(output.contains("Found TODOs"));
        assert!(output.contains("[FAILED]"));
    }
}