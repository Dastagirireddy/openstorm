use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

use crate::ai_v2::tools::tool_trait::{Tool, ToolCategory, ToolResult, TrustTier};

// ═══════════════════════════════════════════════════════════════
// TOOL SOURCE — Origin of a tool
// ═══════════════════════════════════════════════════════════════

/// Where a tool comes from
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ToolSource {
    /// Built-in tools (inventory crate)
    BuiltIn,
    /// MCP server tool
    Mcp { server: String },
    /// User-defined tool (from .openstorm/tools.json or executable)
    UserDefined,
}

impl std::fmt::Display for ToolSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ToolSource::BuiltIn => write!(f, "builtin"),
            ToolSource::Mcp { server } => write!(f, "mcp:{}", server),
            ToolSource::UserDefined => write!(f, "user"),
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// TOOL ENTRY — Tool with metadata
// ═══════════════════════════════════════════════════════════════

/// Registered tool with source information
pub struct ToolEntry {
    pub tool: Arc<dyn Tool>,
    pub source: ToolSource,
    pub name: String,
}

impl ToolEntry {
    pub fn new(tool: Arc<dyn Tool>, source: ToolSource) -> Self {
        let name = tool.name().to_string();
        Self { tool, source, name }
    }
}

// ═══════════════════════════════════════════════════════════════
// TOOL REGISTRY — Central tool discovery and execution
// ═══════════════════════════════════════════════════════════════

/// Central registry for all tool sources
pub struct ToolRegistry {
    tools: RwLock<HashMap<String, ToolEntry>>,
}

impl ToolRegistry {
    /// Create a new empty registry
    pub fn new() -> Self {
        Self {
            tools: RwLock::new(HashMap::new()),
        }
    }

    /// Register a tool
    pub async fn register(&self, tool: Arc<dyn Tool>, source: ToolSource) {
        let entry = ToolEntry::new(tool, source);
        let name = entry.name.clone();
        self.tools.write().await.insert(name, entry);
    }

    /// Unregister a tool by name
    pub async fn unregister(&self, name: &str) -> bool {
        self.tools.write().await.remove(name).is_some()
    }

    /// Get a tool by name
    pub async fn get(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools.read().await.get(name).map(|e| Arc::clone(&e.tool))
    }

    /// Get tool source by name
    pub async fn get_source(&self, name: &str) -> Option<ToolSource> {
        self.tools.read().await.get(name).map(|e| e.source.clone())
    }

    /// List all tool names
    pub async fn list(&self) -> Vec<String> {
        self.tools.read().await.keys().cloned().collect()
    }

    /// List tools by source
    pub async fn list_by_source(&self, source: &ToolSource) -> Vec<String> {
        self.tools
            .read()
            .await
            .iter()
            .filter(|(_, e)| &e.source == source)
            .map(|(name, _)| name.clone())
            .collect()
    }

    /// List tools by trust tier
    pub async fn list_by_trust(&self, tier: TrustTier) -> Vec<String> {
        self.tools
            .read()
            .await
            .iter()
            .filter(|(_, e)| e.tool.trust_tier() == tier)
            .map(|(name, _)| name.clone())
            .collect()
    }

    /// List tools by category
    pub async fn list_by_category(&self, category: ToolCategory) -> Vec<String> {
        self.tools
            .read()
            .await
            .iter()
            .filter(|(_, e)| e.tool.category() == category)
            .map(|(name, _)| name.clone())
            .collect()
    }

    /// Get tool definition (for LLM)
    pub async fn definition(&self, name: &str) -> Option<serde_json::Value> {
        self.tools.read().await.get(name).map(|e| {
            serde_json::json!({
                "name": e.tool.name(),
                "description": e.tool.description(),
                "parameters": e.tool.input_schema(),
                "trust_tier": format!("{:?}", e.tool.trust_tier()),
            })
        })
    }

    /// Get all tool definitions (for LLM)
    pub async fn definitions(&self) -> Vec<serde_json::Value> {
        let tools = self.tools.read().await;
        tools
            .iter()
            .map(|(_, e)| {
                serde_json::json!({
                    "name": e.tool.name(),
                    "description": e.tool.description(),
                    "parameters": e.tool.input_schema(),
                    "trust_tier": format!("{:?}", e.tool.trust_tier()),
                })
            })
            .collect()
    }

    /// Execute a tool by name
    pub async fn execute(
        &self,
        name: &str,
        args: serde_json::Value,
        runtime: &super::tool_trait::ToolRuntime,
    ) -> Result<ToolResult, ToolExecutionError> {
        let tool = self
            .get(name)
            .await
            .ok_or_else(|| ToolExecutionError::NotFound(name.to_string()))?;

        Ok(tool.execute(args, runtime).await)
    }

    /// Execute a tool by name with validation
    pub async fn execute_validated(
        &self,
        name: &str,
        args: serde_json::Value,
        runtime: &super::tool_trait::ToolRuntime,
    ) -> Result<ToolResult, ToolExecutionError> {
        // Validate tool exists
        let tool = self
            .get(name)
            .await
            .ok_or_else(|| ToolExecutionError::NotFound(name.to_string()))?;

        // Validate args against schema
        let schema = tool.input_schema();
        if !schema.is_null() {
            self.validate_args(&args, &schema)
                .map_err(|e| ToolExecutionError::InvalidArgs {
                    tool: name.to_string(),
                    error: e,
                })?;
        }

        // Execute
        Ok(tool.execute(args, runtime).await)
    }

    /// Validate args against JSON schema (basic validation)
    fn validate_args(&self, args: &serde_json::Value, schema: &serde_json::Value) -> Result<(), String> {
        // Basic validation: check required fields exist
        if let Some(required) = schema.get("required").and_then(|r| r.as_array()) {
            for field in required {
                if let Some(field_name) = field.as_str() {
                    if args.get(field_name).is_none() {
                        return Err(format!("Missing required field: {}", field_name));
                    }
                }
            }
        }
        Ok(())
    }

    /// Load user tools from project directory
    pub async fn load_user_tools(&self, project_path: &std::path::Path) -> Result<usize, String> {
        let config = super::user::scanner::ToolScanner::load_all(project_path);
        let mut count = 0;

        for tool_config in config.tools {
            // Create a wrapper for user-defined tools
            let user_tool = UserToolWrapper::new(tool_config);
            self.register(
                Arc::new(user_tool),
                ToolSource::UserDefined,
            )
            .await;
            count += 1;
        }

        Ok(count)
    }

    /// Reload all user tools (clear and reload)
    pub async fn reload_user_tools(&self, project_path: &std::path::Path) -> Result<usize, String> {
        // Remove existing user tools
        {
            let mut tools = self.tools.write().await;
            tools.retain(|_, e| e.source != ToolSource::UserDefined);
        }

        // Reload
        self.load_user_tools(project_path).await
    }

    /// Get registry statistics
    pub async fn stats(&self) -> RegistryStats {
        let tools = self.tools.read().await;
        let mut stats = RegistryStats::default();

        for (_, entry) in tools.iter() {
            stats.total += 1;
            match &entry.source {
                ToolSource::BuiltIn => stats.builtin += 1,
                ToolSource::Mcp { .. } => stats.mcp += 1,
                ToolSource::UserDefined => stats.user += 1,
            }
            *stats.by_trust.entry(entry.tool.trust_tier()).or_insert(0) += 1;
            *stats.by_category.entry(entry.tool.category()).or_insert(0) += 1;
        }

        stats
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ═══════════════════════════════════════════════════════════════
// USER TOOL WRAPPER — Wraps user-defined tools as Tool trait
// ═══════════════════════════════════════════════════════════════

/// Wrapper to adapt user-defined tool config to Tool trait
pub struct UserToolWrapper {
    config: super::user::config::UserToolConfig,
}

impl UserToolWrapper {
    pub fn new(config: super::user::config::UserToolConfig) -> Self {
        Self { config }
    }
}

#[async_trait::async_trait]
impl Tool for UserToolWrapper {
    fn name(&self) -> &str {
        &self.config.name
    }

    fn description(&self) -> &str {
        &self.config.description
    }

    fn input_schema(&self) -> serde_json::Value {
        self.config.input_schema.clone()
    }

    async fn execute(&self, args: serde_json::Value, runtime: &super::tool_trait::ToolRuntime) -> ToolResult {
        let start = std::time::Instant::now();

        // Create executor and run
        match super::user::executor::ToolExecutor::execute(&self.config, &args, &runtime.project_path)
            .await
        {
            Ok(output) => ToolResult {
                content: output.result.to_string(),
                artifact: None,
                success: true,
                token_count: output.result.to_string().len() / 4, // rough estimate
                execution_time_ms: start.elapsed().as_millis() as u64,
                tool_call_id: String::new(),
            },
            Err(e) => ToolResult {
                content: format!("Tool execution failed: {}", e),
                artifact: None,
                success: false,
                token_count: 0,
                execution_time_ms: start.elapsed().as_millis() as u64,
                tool_call_id: String::new(),
            },
        }
    }

    fn trust_tier(&self) -> TrustTier {
        match self.config.trust_tier {
            super::user::config::TrustTierConfig::Safe => TrustTier::Safe,
            super::user::config::TrustTierConfig::Standard => TrustTier::Standard,
            super::user::config::TrustTierConfig::Destructive => TrustTier::Destructive,
        }
    }

    fn category(&self) -> ToolCategory {
        // Parse category string or default to External
        match self.config.category.as_str() {
            "file_system" | "filesystem" => ToolCategory::FileSystem,
            "search" => ToolCategory::Search,
            "execution" => ToolCategory::Execution,
            "analysis" => ToolCategory::Analysis,
            "agent" => ToolCategory::Agent,
            "vcs" => ToolCategory::Vcs,
            _ => ToolCategory::External,
        }
    }

    fn auto_approvable(&self) -> bool {
        matches!(self.config.trust_tier, super::user::config::TrustTierConfig::Safe)
    }
}

// ═══════════════════════════════════════════════════════════════
// REGISTRY STATS
// ═══════════════════════════════════════════════════════════════

/// Registry statistics
#[derive(Debug, Default, Clone)]
pub struct RegistryStats {
    pub total: usize,
    pub builtin: usize,
    pub mcp: usize,
    pub user: usize,
    pub by_trust: HashMap<TrustTier, usize>,
    pub by_category: HashMap<ToolCategory, usize>,
}

// ═══════════════════════════════════════════════════════════════
// TOOL EXECUTION ERROR
// ═══════════════════════════════════════════════════════════════

/// Errors from tool execution
#[derive(Debug, thiserror::Error)]
pub enum ToolExecutionError {
    #[error("Tool not found: {0}")]
    NotFound(String),

    #[error("Invalid arguments for {tool}: {error}")]
    InvalidArgs { tool: String, error: String },

    #[error("Execution failed for {tool}: {error}")]
    ExecutionFailed { tool: String, error: String },
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai_v2::tools::tool_trait::{Tool, ToolCategory, ToolResult, TrustTier, ToolRuntime};

    // Mock tool for testing
    struct MockTool {
        name: String,
        description: String,
        tier: TrustTier,
        category: ToolCategory,
    }

    impl MockTool {
        fn new(name: &str, tier: TrustTier, category: ToolCategory) -> Self {
            Self {
                name: name.to_string(),
                description: format!("Mock tool: {}", name),
                tier,
                category,
            }
        }
    }

    #[async_trait::async_trait]
    impl Tool for MockTool {
        fn name(&self) -> &str {
            &self.name
        }

        fn description(&self) -> &str {
            &self.description
        }

        fn input_schema(&self) -> serde_json::Value {
            serde_json::json!({
                "type": "object",
                "properties": {
                    "input": {"type": "string"}
                },
                "required": ["input"]
            })
        }

        async fn execute(&self, _args: serde_json::Value, _runtime: &ToolRuntime) -> ToolResult {
            ToolResult::success("mock-call", format!("Executed: {}", self.name))
        }

        fn trust_tier(&self) -> TrustTier {
            self.tier
        }

        fn category(&self) -> ToolCategory {
            self.category
        }
    }

    fn make_runtime() -> ToolRuntime {
        ToolRuntime {
            project_path: std::path::PathBuf::from("/test"),
            session_id: "test-session".to_string(),
        }
    }

    // ── Registry creation ──

    #[tokio::test]
    async fn test_registry_new() {
        let registry = ToolRegistry::new();
        assert_eq!(registry.list().await.len(), 0);
    }

    #[tokio::test]
    async fn test_registry_default() {
        let registry = ToolRegistry::default();
        assert_eq!(registry.list().await.len(), 0);
    }

    // ── Registration ──

    #[tokio::test]
    async fn test_register_tool() {
        let registry = ToolRegistry::new();
        let tool = Arc::new(MockTool::new("test", TrustTier::Standard, ToolCategory::External));
        registry.register(tool, ToolSource::BuiltIn).await;
        assert_eq!(registry.list().await.len(), 1);
        assert!(registry.get("test").await.is_some());
    }

    #[tokio::test]
    async fn test_register_multiple() {
        let registry = ToolRegistry::new();
        registry
            .register(
                Arc::new(MockTool::new("tool1", TrustTier::Safe, ToolCategory::FileSystem)),
                ToolSource::BuiltIn,
            )
            .await;
        registry
            .register(
                Arc::new(MockTool::new("tool2", TrustTier::Standard, ToolCategory::Search)),
                ToolSource::Mcp {
                    server: "test".to_string(),
                },
            )
            .await;
        registry
            .register(
                Arc::new(MockTool::new("tool3", TrustTier::Destructive, ToolCategory::Execution)),
                ToolSource::UserDefined,
            )
            .await;

        let tools = registry.list().await;
        assert_eq!(tools.len(), 3);
        assert!(tools.contains(&"tool1".to_string()));
        assert!(tools.contains(&"tool2".to_string()));
        assert!(tools.contains(&"tool3".to_string()));
    }

    // ── Unregistration ──

    #[tokio::test]
    async fn test_unregister_tool() {
        let registry = ToolRegistry::new();
        let tool = Arc::new(MockTool::new("test", TrustTier::Standard, ToolCategory::External));
        registry.register(tool, ToolSource::BuiltIn).await;

        assert!(registry.unregister("test").await);
        assert!(registry.get("test").await.is_none());
        assert_eq!(registry.list().await.len(), 0);
    }

    #[tokio::test]
    async fn test_unregister_nonexistent() {
        let registry = ToolRegistry::new();
        assert!(!registry.unregister("nonexistent").await);
    }

    // ── Get tools ──

    #[tokio::test]
    async fn test_get_tool() {
        let registry = ToolRegistry::new();
        let tool = Arc::new(MockTool::new("test", TrustTier::Standard, ToolCategory::External));
        registry.register(tool, ToolSource::BuiltIn).await;

        let retrieved = registry.get("test").await;
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().name(), "test");
    }

    #[tokio::test]
    async fn test_get_nonexistent() {
        let registry = ToolRegistry::new();
        assert!(registry.get("nonexistent").await.is_none());
    }

    #[tokio::test]
    async fn test_get_source() {
        let registry = ToolRegistry::new();
        let tool = Arc::new(MockTool::new("test", TrustTier::Standard, ToolCategory::External));
        registry
            .register(tool, ToolSource::Mcp { server: "mcp1".to_string() })
            .await;

        let source = registry.get_source("test").await;
        assert_eq!(source, Some(ToolSource::Mcp { server: "mcp1".to_string() }));
    }

    // ── List tools ──

    #[tokio::test]
    async fn test_list_empty() {
        let registry = ToolRegistry::new();
        let list = registry.list().await;
        assert!(list.is_empty());
    }

    #[tokio::test]
    async fn test_list_by_source() {
        let registry = ToolRegistry::new();
        registry
            .register(
                Arc::new(MockTool::new("builtin1", TrustTier::Safe, ToolCategory::FileSystem)),
                ToolSource::BuiltIn,
            )
            .await;
        registry
            .register(
                Arc::new(MockTool::new("mcp1", TrustTier::Standard, ToolCategory::Search)),
                ToolSource::Mcp {
                    server: "test".to_string(),
                },
            )
            .await;
        registry
            .register(
                Arc::new(MockTool::new("builtin2", TrustTier::Safe, ToolCategory::FileSystem)),
                ToolSource::BuiltIn,
            )
            .await;

        let builtin = registry.list_by_source(&ToolSource::BuiltIn).await;
        assert_eq!(builtin.len(), 2);
        assert!(builtin.contains(&"builtin1".to_string()));
        assert!(builtin.contains(&"builtin2".to_string()));

        let mcp = registry
            .list_by_source(&ToolSource::Mcp {
                server: "test".to_string(),
            })
            .await;
        assert_eq!(mcp.len(), 1);
        assert!(mcp.contains(&"mcp1".to_string()));
    }

    #[tokio::test]
    async fn test_list_by_trust() {
        let registry = ToolRegistry::new();
        registry
            .register(
                Arc::new(MockTool::new("safe", TrustTier::Safe, ToolCategory::FileSystem)),
                ToolSource::BuiltIn,
            )
            .await;
        registry
            .register(
                Arc::new(MockTool::new("standard", TrustTier::Standard, ToolCategory::Search)),
                ToolSource::BuiltIn,
            )
            .await;
        registry
            .register(
                Arc::new(MockTool::new("destructive", TrustTier::Destructive, ToolCategory::Execution)),
                ToolSource::BuiltIn,
            )
            .await;

        let safe = registry.list_by_trust(TrustTier::Safe).await;
        assert_eq!(safe.len(), 1);
        assert!(safe.contains(&"safe".to_string()));

        let standard = registry.list_by_trust(TrustTier::Standard).await;
        assert_eq!(standard.len(), 1);
        assert!(standard.contains(&"standard".to_string()));

        let destructive = registry.list_by_trust(TrustTier::Destructive).await;
        assert_eq!(destructive.len(), 1);
        assert!(destructive.contains(&"destructive".to_string()));
    }

    #[tokio::test]
    async fn test_list_by_category() {
        let registry = ToolRegistry::new();
        registry
            .register(
                Arc::new(MockTool::new("fs1", TrustTier::Safe, ToolCategory::FileSystem)),
                ToolSource::BuiltIn,
            )
            .await;
        registry
            .register(
                Arc::new(MockTool::new("fs2", TrustTier::Safe, ToolCategory::FileSystem)),
                ToolSource::BuiltIn,
            )
            .await;
        registry
            .register(
                Arc::new(MockTool::new("search", TrustTier::Standard, ToolCategory::Search)),
                ToolSource::BuiltIn,
            )
            .await;

        let fs_tools = registry.list_by_category(ToolCategory::FileSystem).await;
        assert_eq!(fs_tools.len(), 2);
        assert!(fs_tools.contains(&"fs1".to_string()));
        assert!(fs_tools.contains(&"fs2".to_string()));

        let search_tools = registry.list_by_category(ToolCategory::Search).await;
        assert_eq!(search_tools.len(), 1);
        assert!(search_tools.contains(&"search".to_string()));
    }

    // ── Tool definitions ──

    #[tokio::test]
    async fn test_definition() {
        let registry = ToolRegistry::new();
        let tool = Arc::new(MockTool::new("test", TrustTier::Standard, ToolCategory::External));
        registry.register(tool, ToolSource::BuiltIn).await;

        let def = registry.definition("test").await;
        assert!(def.is_some());
        let def = def.unwrap();
        assert_eq!(def["name"], "test");
        assert_eq!(def["description"], "Mock tool: test");
        assert!(def["parameters"].is_object());
    }

    #[tokio::test]
    async fn test_definitions() {
        let registry = ToolRegistry::new();
        registry
            .register(
                Arc::new(MockTool::new("tool1", TrustTier::Safe, ToolCategory::FileSystem)),
                ToolSource::BuiltIn,
            )
            .await;
        registry
            .register(
                Arc::new(MockTool::new("tool2", TrustTier::Standard, ToolCategory::Search)),
                ToolSource::BuiltIn,
            )
            .await;

        let defs = registry.definitions().await;
        assert_eq!(defs.len(), 2);
        let names: Vec<_> = defs.iter().map(|d| d["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"tool1"));
        assert!(names.contains(&"tool2"));
    }

    // ── Execute tools ──

    #[tokio::test]
    async fn test_execute_tool() {
        let registry = ToolRegistry::new();
        let tool = Arc::new(MockTool::new("test", TrustTier::Standard, ToolCategory::External));
        registry.register(tool, ToolSource::BuiltIn).await;

        let runtime = make_runtime();
        let result = registry
            .execute("test", serde_json::json!({"input": "hello"}), &runtime)
            .await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().content, "Executed: test");
    }

    #[tokio::test]
    async fn test_execute_nonexistent() {
        let registry = ToolRegistry::new();
        let runtime = make_runtime();
        let result = registry
            .execute("nonexistent", serde_json::json!({}), &runtime)
            .await;
        assert!(result.is_err());
        match result.unwrap_err() {
            ToolExecutionError::NotFound(name) => assert_eq!(name, "nonexistent"),
            _ => panic!("Expected NotFound error"),
        }
    }

    #[tokio::test]
    async fn test_execute_validated() {
        let registry = ToolRegistry::new();
        let tool = Arc::new(MockTool::new("test", TrustTier::Standard, ToolCategory::External));
        registry.register(tool, ToolSource::BuiltIn).await;

        let runtime = make_runtime();

        // Missing required field should fail
        let result = registry
            .execute_validated("test", serde_json::json!({}), &runtime)
            .await;
        assert!(result.is_err());
        match result.unwrap_err() {
            ToolExecutionError::InvalidArgs { tool, error } => {
                assert_eq!(tool, "test");
                assert!(error.contains("Missing required field"));
            }
            _ => panic!("Expected InvalidArgs error"),
        }

        // With required field should succeed
        let result = registry
            .execute_validated("test", serde_json::json!({"input": "hello"}), &runtime)
            .await;
        assert!(result.is_ok());
    }

    // ── Stats ──

    #[tokio::test]
    async fn test_stats_empty() {
        let registry = ToolRegistry::new();
        let stats = registry.stats().await;
        assert_eq!(stats.total, 0);
        assert_eq!(stats.builtin, 0);
        assert_eq!(stats.mcp, 0);
        assert_eq!(stats.user, 0);
    }

    #[tokio::test]
    async fn test_stats_populated() {
        let registry = ToolRegistry::new();
        registry
            .register(
                Arc::new(MockTool::new("builtin1", TrustTier::Safe, ToolCategory::FileSystem)),
                ToolSource::BuiltIn,
            )
            .await;
        registry
            .register(
                Arc::new(MockTool::new("builtin2", TrustTier::Safe, ToolCategory::FileSystem)),
                ToolSource::BuiltIn,
            )
            .await;
        registry
            .register(
                Arc::new(MockTool::new("mcp1", TrustTier::Standard, ToolCategory::Search)),
                ToolSource::Mcp {
                    server: "test".to_string(),
                },
            )
            .await;
        registry
            .register(
                Arc::new(MockTool::new("user1", TrustTier::Destructive, ToolCategory::Execution)),
                ToolSource::UserDefined,
            )
            .await;

        let stats = registry.stats().await;
        assert_eq!(stats.total, 4);
        assert_eq!(stats.builtin, 2);
        assert_eq!(stats.mcp, 1);
        assert_eq!(stats.user, 1);
        assert_eq!(*stats.by_trust.get(&TrustTier::Safe).unwrap(), 2);
        assert_eq!(*stats.by_trust.get(&TrustTier::Standard).unwrap(), 1);
        assert_eq!(*stats.by_trust.get(&TrustTier::Destructive).unwrap(), 1);
        assert_eq!(*stats.by_category.get(&ToolCategory::FileSystem).unwrap(), 2);
        assert_eq!(*stats.by_category.get(&ToolCategory::Search).unwrap(), 1);
        assert_eq!(*stats.by_category.get(&ToolCategory::Execution).unwrap(), 1);
    }

    // ── Tool Source Display ──

    #[test]
    fn test_tool_source_display() {
        assert_eq!(ToolSource::BuiltIn.to_string(), "builtin");
        assert_eq!(
            ToolSource::Mcp {
                server: "myserver".to_string()
            }
            .to_string(),
            "mcp:myserver"
        );
        assert_eq!(ToolSource::UserDefined.to_string(), "user");
    }

    // ── Tool Source Eq ──

    #[test]
    fn test_tool_source_eq() {
        assert_eq!(ToolSource::BuiltIn, ToolSource::BuiltIn);
        assert_ne!(ToolSource::BuiltIn, ToolSource::UserDefined);
        assert_eq!(
            ToolSource::Mcp {
                server: "s1".to_string()
            },
            ToolSource::Mcp {
                server: "s1".to_string()
            }
        );
        assert_ne!(
            ToolSource::Mcp {
                server: "s1".to_string()
            },
            ToolSource::Mcp {
                server: "s2".to_string()
            }
        );
    }

    // ── Validation ──

    #[test]
    fn test_validate_args_valid() {
        let registry = ToolRegistry::new();
        let args = serde_json::json!({"name": "test"});
        let schema = serde_json::json!({
            "type": "object",
            "required": ["name"]
        });
        assert!(registry.validate_args(&args, &schema).is_ok());
    }

    #[test]
    fn test_validate_args_missing_required() {
        let registry = ToolRegistry::new();
        let args = serde_json::json!({});
        let schema = serde_json::json!({
            "type": "object",
            "required": ["name"]
        });
        let result = registry.validate_args(&args, &schema);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing required field"));
    }

    #[test]
    fn test_validate_args_no_required() {
        let registry = ToolRegistry::new();
        let args = serde_json::json!({});
        let schema = serde_json::json!({
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            }
        });
        assert!(registry.validate_args(&args, &schema).is_ok());
    }
}