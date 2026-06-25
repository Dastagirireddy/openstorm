use std::sync::Arc;

use tokio::sync::mpsc;

use super::Agent;
use crate::ai::cost_tracker::create_shared_cost_tracker;
use crate::ai::embedding_store::EmbeddingStore;
use crate::ai::permissions::PermissionProfile;
use crate::ai::tools::ToolRegistry;

impl Agent {
    /// Create a new agent with default settings.
    ///
    /// Initializes all subsystems: project context detection, sandbox,
    /// permissions (Smart profile), RAG embedding store, tool registry,
    /// and cost tracker.
    ///
    /// # Arguments
    /// * `provider` - The LLM provider to use.
    /// * `model` - Model identifier string.
    /// * `project_path` - Root path of the user's project.
    pub fn new(
        provider: Arc<dyn crate::ai::provider::LlmProvider>,
        model: String,
        project_path: String,
    ) -> Self {
        let project_context = crate::ai::context::ProjectContext::detect(&project_path);
        let (approval_tx, approval_rx) = mpsc::channel(1);
        let sandbox = crate::ai::sandbox::Sandbox::new();
        let permissions =
            crate::ai::permissions::PermissionSystem::new(PermissionProfile::Smart);
        let embedding_store = Arc::new(tokio::sync::Mutex::new(EmbeddingStore::new()));
        let tools = ToolRegistry::with_embedding_store(
            project_path.clone(),
            sandbox.clone(),
            embedding_store.clone(),
        );
        let cost_tracker = create_shared_cost_tracker();

        Self {
            provider,
            model,
            tools,
            project_context,
            approval_rx: tokio::sync::Mutex::new(Some(approval_rx)),
            approval_tx: tokio::sync::Mutex::new(Some(approval_tx)),
            plan_steps: tokio::sync::Mutex::new(Vec::new()),
            context_manager: tokio::sync::Mutex::new(crate::ai::context::ContextManager::new(8192)),
            permissions,
            sandbox,
            embedding_store,
            cost_tracker,
            todo_items: tokio::sync::Mutex::new(Vec::new()),
            file_modifications: tokio::sync::Mutex::new(Vec::new()),
            session_start: std::time::Instant::now(),
        }
    }

    /// Create an agent with a custom permission profile.
    ///
    /// # Arguments
    /// * `provider` - The LLM provider to use.
    /// * `model` - Model identifier string.
    /// * `project_path` - Root path of the user's project.
    /// * `profile` - Permission profile controlling tool access.
    pub fn with_permissions(
        provider: Arc<dyn crate::ai::provider::LlmProvider>,
        model: String,
        project_path: String,
        profile: PermissionProfile,
    ) -> Self {
        let project_context = crate::ai::context::ProjectContext::detect(&project_path);
        let (approval_tx, approval_rx) = mpsc::channel(1);
        let sandbox = crate::ai::sandbox::Sandbox::new();
        let permissions = crate::ai::permissions::PermissionSystem::new(profile);
        let embedding_store = Arc::new(tokio::sync::Mutex::new(EmbeddingStore::new()));
        let tools = ToolRegistry::with_embedding_store(
            project_path.clone(),
            sandbox.clone(),
            embedding_store.clone(),
        );
        let cost_tracker = create_shared_cost_tracker();

        Self {
            provider,
            model,
            tools,
            project_context,
            approval_rx: tokio::sync::Mutex::new(Some(approval_rx)),
            approval_tx: tokio::sync::Mutex::new(Some(approval_tx)),
            plan_steps: tokio::sync::Mutex::new(Vec::new()),
            context_manager: tokio::sync::Mutex::new(crate::ai::context::ContextManager::new(8192)),
            permissions,
            sandbox,
            embedding_store,
            cost_tracker,
            todo_items: tokio::sync::Mutex::new(Vec::new()),
            file_modifications: tokio::sync::Mutex::new(Vec::new()),
            session_start: std::time::Instant::now(),
        }
    }

    /// Create an agent with orchestrator for sub-agent support.
    ///
    /// # Arguments
    /// * `provider` - The LLM provider to use.
    /// * `model` - Model identifier string.
    /// * `project_path` - Root path of the user's project.
    /// * `profile` - Permission profile controlling tool access.
    /// * `orchestrator` - Shared orchestrator for managing sub-agents.
    pub fn with_orchestrator(
        provider: Arc<dyn crate::ai::provider::LlmProvider>,
        model: String,
        project_path: String,
        profile: PermissionProfile,
        orchestrator: Arc<crate::ai::orchestrator::Orchestrator>,
    ) -> Self {
        let project_context = crate::ai::context::ProjectContext::detect(&project_path);
        let (approval_tx, approval_rx) = mpsc::channel(1);
        let sandbox = crate::ai::sandbox::Sandbox::new();
        let permissions = crate::ai::permissions::PermissionSystem::new(profile);
        let embedding_store = Arc::new(tokio::sync::Mutex::new(EmbeddingStore::new()));
        let tools = ToolRegistry::with_orchestrator(
            project_path.clone(),
            sandbox.clone(),
            embedding_store.clone(),
            orchestrator,
        );
        let cost_tracker = create_shared_cost_tracker();

        Self {
            provider,
            model,
            tools,
            project_context,
            approval_rx: tokio::sync::Mutex::new(Some(approval_rx)),
            approval_tx: tokio::sync::Mutex::new(Some(approval_tx)),
            plan_steps: tokio::sync::Mutex::new(Vec::new()),
            context_manager: tokio::sync::Mutex::new(crate::ai::context::ContextManager::new(8192)),
            permissions,
            sandbox,
            embedding_store,
            cost_tracker,
            todo_items: tokio::sync::Mutex::new(Vec::new()),
            file_modifications: tokio::sync::Mutex::new(Vec::new()),
            session_start: std::time::Instant::now(),
        }
    }

    /// Create an agent with orchestrator and MCP support.
    ///
    /// # Arguments
    /// * `provider` - The LLM provider to use.
    /// * `model` - Model identifier string.
    /// * `project_path` - Root path of the user's project.
    /// * `profile` - Permission profile controlling tool access.
    /// * `orchestrator` - Shared orchestrator for managing sub-agents.
    /// * `mcp_manager` - Shared MCP manager for external tool servers.
    pub fn with_mcp(
        provider: Arc<dyn crate::ai::provider::LlmProvider>,
        model: String,
        project_path: String,
        profile: PermissionProfile,
        orchestrator: Arc<crate::ai::orchestrator::Orchestrator>,
        mcp_manager: Arc<tokio::sync::Mutex<crate::ai::mcp::McpManager>>,
    ) -> Self {
        let project_context = crate::ai::context::ProjectContext::detect(&project_path);
        let (approval_tx, approval_rx) = mpsc::channel(1);
        let sandbox = crate::ai::sandbox::Sandbox::new();
        let permissions = crate::ai::permissions::PermissionSystem::new(profile);
        let embedding_store = Arc::new(tokio::sync::Mutex::new(EmbeddingStore::new()));
        let tools = ToolRegistry::with_mcp(
            project_path.clone(),
            sandbox.clone(),
            embedding_store.clone(),
            orchestrator,
            mcp_manager,
        );
        let cost_tracker = create_shared_cost_tracker();

        Self {
            provider,
            model,
            tools,
            project_context,
            approval_rx: tokio::sync::Mutex::new(Some(approval_rx)),
            approval_tx: tokio::sync::Mutex::new(Some(approval_tx)),
            plan_steps: tokio::sync::Mutex::new(Vec::new()),
            context_manager: tokio::sync::Mutex::new(crate::ai::context::ContextManager::new(8192)),
            permissions,
            sandbox,
            embedding_store,
            cost_tracker,
            todo_items: tokio::sync::Mutex::new(Vec::new()),
            file_modifications: tokio::sync::Mutex::new(Vec::new()),
            session_start: std::time::Instant::now(),
        }
    }
}
