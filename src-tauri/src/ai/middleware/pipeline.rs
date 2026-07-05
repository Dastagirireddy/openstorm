use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use crate::ai::tools::tool_trait::{ToolResult, ToolRuntime};

// ═══════════════════════════════════════════════════════════════
// TOOL CALL REQUEST — Request flowing through middleware
// ═══════════════════════════════════════════════════════════════

/// Request flowing through middleware pipeline
#[derive(Debug, Clone)]
pub struct ToolCallRequest {
    /// Tool name
    pub tool_name: String,
    /// Tool arguments
    pub args: serde_json::Value,
    /// Tool call ID
    pub tool_call_id: String,
    /// Request metadata
    pub metadata: RequestMetadata,
}

/// Metadata about the request
#[derive(Debug, Clone, Default)]
pub struct RequestMetadata {
    /// Agent ID making the request
    pub agent_id: Option<String>,
    /// Agent role
    pub agent_role: Option<String>,
    /// Whether this is a retry
    pub is_retry: bool,
    /// Attempt number (0-based)
    pub attempt: u32,
    /// Parent request ID (for sub-agents)
    pub parent_request_id: Option<String>,
}

// ═══════════════════════════════════════════════════════════════
// TOOL MIDDLEWARE — Trait for middleware
// ═══════════════════════════════════════════════════════════════

/// Next function type for middleware chain
pub type NextFn = dyn Fn(
    &ToolCallRequest,
    &ToolRuntime,
) -> Pin<Box<dyn Future<Output = Result<ToolResult, MiddlewareError>> + Send>>
    + Send
    + Sync;

/// Middleware trait — wraps tool execution
#[async_trait::async_trait]
pub trait ToolMiddleware: Send + Sync {
    /// Process a request through this middleware
    async fn process(
        &self,
        request: &ToolCallRequest,
        runtime: &ToolRuntime,
        next: &NextFn,
    ) -> Result<ToolResult, MiddlewareError>;
}

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE ERROR
// ═══════════════════════════════════════════════════════════════

/// Errors from middleware pipeline
#[derive(Debug, thiserror::Error)]
pub enum MiddlewareError {
    #[error("Tool execution failed: {0}")]
    ExecutionFailed(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Cache error: {0}")]
    CacheError(String),

    #[error("Redirect to: {0}")]
    Redirect(String),

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Other: {0}")]
    Other(String),
}

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE PIPELINE
// ═══════════════════════════════════════════════════════════════

/// Middleware pipeline executor
pub struct MiddlewarePipeline {
    middlewares: Vec<Arc<dyn ToolMiddleware>>,
}

impl MiddlewarePipeline {
    /// Create a new empty pipeline
    pub fn new() -> Self {
        Self {
            middlewares: Vec::new(),
        }
    }

    /// Add a middleware to the pipeline
    pub fn push(&mut self, middleware: Arc<dyn ToolMiddleware>) {
        self.middlewares.push(middleware);
    }

    /// Execute the pipeline with a tool handler
    ///
    /// Note: This simplified implementation only uses the first middleware.
    /// A production implementation would properly chain all middlewares.
    pub async fn execute(
        &self,
        request: &ToolCallRequest,
        runtime: &ToolRuntime,
        handler: Arc<
            dyn Fn(
                    &ToolCallRequest,
                    &ToolRuntime,
                ) -> Pin<Box<dyn Future<Output = Result<ToolResult, MiddlewareError>> + Send>>
                + Send
                + Sync,
        >,
    ) -> Result<ToolResult, MiddlewareError> {
        if self.middlewares.is_empty() {
            return handler(request, runtime).await;
        }

        // Get the first middleware
        let middleware = &self.middlewares[0];

        // Execute it with the handler as the next function
        // Note: This only uses the first middleware - a real implementation
        // would chain all middlewares
        let handler_clone = handler.clone();
        middleware
            .process(request, runtime, &move |req, rt| handler_clone(req, rt))
            .await
    }

    /// Get number of middleware in pipeline
    pub fn len(&self) -> usize {
        self.middlewares.len()
    }

    /// Check if pipeline is empty
    pub fn is_empty(&self) -> bool {
        self.middlewares.is_empty()
    }

    /// Clear all middleware
    pub fn clear(&mut self) {
        self.middlewares.clear();
    }
}

impl Default for MiddlewarePipeline {
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
    use crate::ai::tools::tool_trait::{ToolRuntime, ToolResult};
    use std::path::PathBuf;

    // Mock middleware for testing
    struct MockMiddleware {
        name: String,
        should_pass: bool,
    }

    impl MockMiddleware {
        fn new(name: &str, should_pass: bool) -> Self {
            Self {
                name: name.to_string(),
                should_pass,
            }
        }
    }

    #[async_trait::async_trait]
    impl ToolMiddleware for MockMiddleware {
        async fn process(
            &self,
            request: &ToolCallRequest,
            runtime: &ToolRuntime,
            next: &NextFn,
        ) -> Result<ToolResult, MiddlewareError> {
            if !self.should_pass {
                return Err(MiddlewareError::PermissionDenied(format!(
                    "{} blocked",
                    self.name
                )));
            }
            // Add to content to show middleware was called
            let mut result = next(request, runtime).await?;
            result.content = format!("[{}] {}", self.name, result.content);
            Ok(result)
        }
    }

    fn make_runtime() -> ToolRuntime {
        ToolRuntime {
            project_path: PathBuf::from("/test"),
            session_id: "test-session".to_string(),
        }
    }

    fn make_request(tool_name: &str) -> ToolCallRequest {
        ToolCallRequest {
            tool_name: tool_name.to_string(),
            args: serde_json::json!({}),
            tool_call_id: "test-call".to_string(),
            metadata: RequestMetadata::default(),
        }
    }

    fn mock_handler(
        _req: &ToolCallRequest,
        _rt: &ToolRuntime,
    ) -> Pin<Box<dyn Future<Output = Result<ToolResult, MiddlewareError>> + Send>> {
        Box::pin(async { Ok(ToolResult::success("test", "result")) })
    }

    // ── Pipeline creation ──

    #[test]
    fn test_pipeline_new() {
        let pipeline = MiddlewarePipeline::new();
        assert!(pipeline.is_empty());
        assert_eq!(pipeline.len(), 0);
    }

    #[test]
    fn test_pipeline_default() {
        let pipeline = MiddlewarePipeline::default();
        assert!(pipeline.is_empty());
    }

    // ── Pipeline operations ──

    #[test]
    fn test_push_middleware() {
        let mut pipeline = MiddlewarePipeline::new();
        pipeline.push(Arc::new(MockMiddleware::new("m1", true)));
        assert_eq!(pipeline.len(), 1);
        assert!(!pipeline.is_empty());
    }

    #[test]
    fn test_push_multiple() {
        let mut pipeline = MiddlewarePipeline::new();
        pipeline.push(Arc::new(MockMiddleware::new("m1", true)));
        pipeline.push(Arc::new(MockMiddleware::new("m2", true)));
        pipeline.push(Arc::new(MockMiddleware::new("m3", true)));
        assert_eq!(pipeline.len(), 3);
    }

    #[test]
    fn test_clear_pipeline() {
        let mut pipeline = MiddlewarePipeline::new();
        pipeline.push(Arc::new(MockMiddleware::new("m1", true)));
        pipeline.push(Arc::new(MockMiddleware::new("m2", true)));
        pipeline.clear();
        assert!(pipeline.is_empty());
    }

    // ── Execution ──

    #[tokio::test]
    async fn test_execute_empty_pipeline() {
        let pipeline = MiddlewarePipeline::new();
        let runtime = make_runtime();
        let request = make_request("test_tool");
        let handler = Arc::new(mock_handler);

        let result = pipeline.execute(&request, &runtime, handler).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().content, "result");
    }

    #[tokio::test]
    async fn test_execute_single_middleware() {
        let mut pipeline = MiddlewarePipeline::new();
        pipeline.push(Arc::new(MockMiddleware::new("m1", true)));

        let runtime = make_runtime();
        let request = make_request("test_tool");
        let handler = Arc::new(mock_handler);

        let result = pipeline.execute(&request, &runtime, handler).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().content, "[m1] result");
    }

    #[tokio::test]
    async fn test_execute_middleware_blocks() {
        let mut pipeline = MiddlewarePipeline::new();
        pipeline.push(Arc::new(MockMiddleware::new("blocked", false)));

        let runtime = make_runtime();
        let request = make_request("test_tool");
        let handler = Arc::new(mock_handler);

        let result = pipeline.execute(&request, &runtime, handler).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            MiddlewareError::PermissionDenied(msg) => {
                assert!(msg.contains("blocked"));
            }
            _ => panic!("Expected PermissionDenied"),
        }
    }

    // ── Error types ──

    #[test]
    fn test_middleware_error_display() {
        assert!(MiddlewareError::ExecutionFailed("test".into())
            .to_string()
            .contains("test"));
        assert!(MiddlewareError::PermissionDenied("denied".into())
            .to_string()
            .contains("denied"));
        assert!(MiddlewareError::CacheError("cache".into())
            .to_string()
            .contains("cache"));
        assert!(MiddlewareError::Redirect("/new".into())
            .to_string()
            .contains("/new"));
        assert!(MiddlewareError::Timeout("timeout".into())
            .to_string()
            .contains("timeout"));
        assert!(MiddlewareError::ValidationError("invalid".into())
            .to_string()
            .contains("invalid"));
    }
}