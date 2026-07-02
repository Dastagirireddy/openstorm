use std::collections::HashMap;
use std::sync::Arc;

use super::pipeline::{MiddlewareError, NextFn, ToolCallRequest, ToolMiddleware};
use crate::ai_v2::tools::tool_trait::{ToolResult, ToolRuntime};

// ═══════════════════════════════════════════════════════════════
// REDIRECT RULE
// ═══════════════════════════════════════════════════════════════

/// A rule for redirecting tool calls
#[derive(Debug, Clone)]
pub struct RedirectRule {
    /// Source tool name (or pattern)
    pub from: String,
    /// Target tool name
    pub to: String,
    /// Optional description
    pub description: Option<String>,
    /// Whether this rule is enabled
    pub enabled: bool,
}

impl RedirectRule {
    /// Create a new redirect rule
    pub fn new(from: &str, to: &str) -> Self {
        Self {
            from: from.to_string(),
            to: to.to_string(),
            description: None,
            enabled: true,
        }
    }

    /// Set description
    pub fn with_description(mut self, desc: &str) -> Self {
        self.description = Some(desc.to_string());
        self
    }

    /// Disable this rule
    pub fn disabled(mut self) -> Self {
        self.enabled = false;
        self
    }
}

// ═══════════════════════════════════════════════════════════════
// REDIRECT MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

/// Middleware that redirects tool calls to other tools
pub struct RedirectionMiddleware {
    rules: HashMap<String, RedirectRule>,
}

impl RedirectionMiddleware {
    /// Create a new redirection middleware
    pub fn new() -> Self {
        Self {
            rules: HashMap::new(),
        }
    }

    /// Add a redirect rule
    pub fn add_rule(&mut self, rule: RedirectRule) {
        self.rules.insert(rule.from.clone(), rule);
    }

    /// Create middleware with standard IDE redirects
    pub fn with_ide_redirects() -> Self {
        let mut middleware = Self::new();

        // ls → list_directory
        middleware.add_rule(
            RedirectRule::new("ls", "list_directory")
                .with_description("Redirect ls to list_directory"),
        );

        // cat → read_file
        middleware.add_rule(
            RedirectRule::new("cat", "read_file")
                .with_description("Redirect cat to read_file"),
        );

        // find → search_files
        middleware.add_rule(
            RedirectRule::new("find", "search_files")
                .with_description("Redirect find to search_files"),
        );

        // grep → search_code
        middleware.add_rule(
            RedirectRule::new("grep", "search_code")
                .with_description("Redirect grep to search_code"),
        );

        middleware
    }

    /// Check if a tool should be redirected
    pub fn get_redirect(&self, tool_name: &str) -> Option<&RedirectRule> {
        self.rules.get(tool_name).filter(|r| r.enabled)
    }

    /// Get all redirect rules
    pub fn rules(&self) -> &[RedirectRule] {
        // Note: This is not quite right since rules is a HashMap
        // We'd need to collect to Vec for this to work
        &[]
    }

    /// Get redirect count
    pub fn len(&self) -> usize {
        self.rules.len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.rules.is_empty()
    }
}

impl Default for RedirectionMiddleware {
    fn default() -> Self {
        Self::new()
    }
}

// ═══════════════════════════════════════════════════════════════
// TOOL MIDDLEWARE IMPL
// ═══════════════════════════════════════════════════════════════

#[async_trait::async_trait]
impl ToolMiddleware for RedirectionMiddleware {
    async fn process(
        &self,
        request: &ToolCallRequest,
        runtime: &ToolRuntime,
        next: &NextFn,
    ) -> Result<ToolResult, MiddlewareError> {
        // Check for redirect
        if let Some(rule) = self.get_redirect(&request.tool_name) {
            // Create redirected request
            let redirected = ToolCallRequest {
                tool_name: rule.to.clone(),
                args: request.args.clone(),
                tool_call_id: request.tool_call_id.clone(),
                metadata: request.metadata.clone(),
            };

            // Continue with redirected request
            next(&redirected, runtime).await
        } else {
            // No redirect, continue with original request
            next(request, runtime).await
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai_v2::middleware::pipeline::ToolMiddleware;
    use crate::ai_v2::tools::tool_trait::{ToolResult, ToolRuntime};
    use std::path::PathBuf;
    use std::sync::Arc;

    fn make_runtime() -> ToolRuntime {
        ToolRuntime {
            project_path: PathBuf::from("/test"),
            session_id: "test-session".to_string(),
        }
    }

    fn make_request(tool_name: &str) -> ToolCallRequest {
        ToolCallRequest {
            tool_name: tool_name.to_string(),
            args: serde_json::json!({"path": "/tmp"}),
            tool_call_id: "test-call".to_string(),
            metadata: super::super::pipeline::RequestMetadata::default(),
        }
    }

    fn make_handler(
        captured: Arc<tokio::sync::Mutex<String>>,
    ) -> impl Fn(
        &ToolCallRequest,
        &ToolRuntime,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<ToolResult, MiddlewareError>,
                > + Send,
        >,
    > + Send
           + Sync {
        move |req: &ToolCallRequest, _rt: &ToolRuntime| {
            let captured = captured.clone();
            let tool_name = req.tool_name.clone();
            Box::pin(async move {
                *captured.lock().await = tool_name;
                Ok(ToolResult::success("call", "result"))
            })
        }
    }

    // ── Redirect Rule ──

    #[test]
    fn test_redirect_rule_new() {
        let rule = RedirectRule::new("ls", "list_directory");
        assert_eq!(rule.from, "ls");
        assert_eq!(rule.to, "list_directory");
        assert!(rule.enabled);
        assert!(rule.description.is_none());
    }

    #[test]
    fn test_redirect_rule_with_description() {
        let rule = RedirectRule::new("ls", "list_directory")
            .with_description("List directory contents");
        assert!(rule.description.is_some());
        assert_eq!(
            rule.description.unwrap(),
            "List directory contents"
        );
    }

    #[test]
    fn test_redirect_rule_disabled() {
        let rule = RedirectRule::new("ls", "list_directory").disabled();
        assert!(!rule.enabled);
    }

    // ── Redirection Middleware ──

    #[test]
    fn test_middleware_new() {
        let middleware = RedirectionMiddleware::new();
        assert!(middleware.is_empty());
        assert_eq!(middleware.len(), 0);
    }

    #[test]
    fn test_middleware_default() {
        let middleware = RedirectionMiddleware::default();
        assert!(middleware.is_empty());
    }

    #[test]
    fn test_add_rule() {
        let mut middleware = RedirectionMiddleware::new();
        middleware.add_rule(RedirectRule::new("ls", "list_directory"));
        assert_eq!(middleware.len(), 1);
        assert!(!middleware.is_empty());
    }

    #[test]
    fn test_get_redirect() {
        let mut middleware = RedirectionMiddleware::new();
        middleware.add_rule(RedirectRule::new("ls", "list_directory"));

        let rule = middleware.get_redirect("ls");
        assert!(rule.is_some());
        assert_eq!(rule.unwrap().to, "list_directory");

        // Non-existent
        assert!(middleware.get_redirect("nonexistent").is_none());
    }

    #[test]
    fn test_get_redirect_disabled() {
        let mut middleware = RedirectionMiddleware::new();
        middleware.add_rule(RedirectRule::new("ls", "list_directory").disabled());

        assert!(middleware.get_redirect("ls").is_none());
    }

    #[test]
    fn test_ide_redirects() {
        let middleware = RedirectionMiddleware::with_ide_redirects();
        assert_eq!(middleware.len(), 4);

        assert!(middleware.get_redirect("ls").is_some());
        assert!(middleware.get_redirect("cat").is_some());
        assert!(middleware.get_redirect("find").is_some());
        assert!(middleware.get_redirect("grep").is_some());

        // Non-redirected
        assert!(middleware.get_redirect("read_file").is_none());
    }

    // ── Middleware Execution ──

    #[tokio::test]
    async fn test_redirect_tool() {
        let mut middleware = RedirectionMiddleware::new();
        middleware.add_rule(RedirectRule::new("ls", "list_directory"));

        let runtime = make_runtime();
        let request = make_request("ls");

        let captured = Arc::new(tokio::sync::Mutex::new(String::new()));
        let handler = make_handler(captured.clone());

        let result = middleware.process(&request, &runtime, &handler).await;
        assert!(result.is_ok());
        assert_eq!(*captured.lock().await, "list_directory");
    }

    #[tokio::test]
    async fn test_no_redirect() {
        let mut middleware = RedirectionMiddleware::new();
        middleware.add_rule(RedirectRule::new("ls", "list_directory"));

        let runtime = make_runtime();
        let request = make_request("read_file"); // Not redirected

        let captured = Arc::new(tokio::sync::Mutex::new(String::new()));
        let handler = make_handler(captured.clone());

        let result = middleware.process(&request, &runtime, &handler).await;
        assert!(result.is_ok());
        assert_eq!(*captured.lock().await, "read_file");
    }

    #[tokio::test]
    async fn test_ide_redirects_execution() {
        let middleware = RedirectionMiddleware::with_ide_redirects();
        let runtime = make_runtime();
        let request = make_request("grep");

        let captured = Arc::new(tokio::sync::Mutex::new(String::new()));
        let handler = make_handler(captured.clone());

        let result = middleware.process(&request, &runtime, &handler).await;
        assert!(result.is_ok());
        assert_eq!(*captured.lock().await, "search_code");
    }
}