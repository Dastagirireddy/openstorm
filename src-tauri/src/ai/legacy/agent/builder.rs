use std::sync::Arc;

use tokio::sync::mpsc;

use super::Agent;
use crate::ai::legacy::cost_tracker::create_shared_cost_tracker;
use crate::ai::legacy::embedding_store::EmbeddingStore;
use crate::ai::legacy::permissions::PermissionProfile;
use crate::ai::legacy::tools::ToolRegistry;

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
        provider: Arc<dyn crate::ai::legacy::provider::LlmProvider>,
        model: String,
        project_path: String,
    ) -> Self {
        let project_context = crate::ai::legacy::context::ProjectContext::detect(&project_path);
        let (approval_tx, approval_rx) = mpsc::channel(1);
        let sandbox = crate::ai::legacy::sandbox::Sandbox::new();
        let permissions =
            crate::ai::legacy::permissions::PermissionSystem::new(PermissionProfile::Smart);
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
            context_manager: tokio::sync::Mutex::new(crate::ai::legacy::context::ContextManager::new(8192)),
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
        provider: Arc<dyn crate::ai::legacy::provider::LlmProvider>,
        model: String,
        project_path: String,
        profile: PermissionProfile,
    ) -> Self {
        let project_context = crate::ai::legacy::context::ProjectContext::detect(&project_path);
        let (approval_tx, approval_rx) = mpsc::channel(1);
        let sandbox = crate::ai::legacy::sandbox::Sandbox::new();
        let permissions = crate::ai::legacy::permissions::PermissionSystem::new(profile);
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
            context_manager: tokio::sync::Mutex::new(crate::ai::legacy::context::ContextManager::new(8192)),
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
        provider: Arc<dyn crate::ai::legacy::provider::LlmProvider>,
        model: String,
        project_path: String,
        profile: PermissionProfile,
        orchestrator: Arc<crate::ai::legacy::orchestrator::Orchestrator>,
    ) -> Self {
        let project_context = crate::ai::legacy::context::ProjectContext::detect(&project_path);
        let (approval_tx, approval_rx) = mpsc::channel(1);
        let sandbox = crate::ai::legacy::sandbox::Sandbox::new();
        let permissions = crate::ai::legacy::permissions::PermissionSystem::new(profile);
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
            context_manager: tokio::sync::Mutex::new(crate::ai::legacy::context::ContextManager::new(8192)),
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
        provider: Arc<dyn crate::ai::legacy::provider::LlmProvider>,
        model: String,
        project_path: String,
        profile: PermissionProfile,
        orchestrator: Arc<crate::ai::legacy::orchestrator::Orchestrator>,
        mcp_manager: Arc<tokio::sync::Mutex<crate::ai::legacy::mcp::McpManager>>,
    ) -> Self {
        let project_context = crate::ai::legacy::context::ProjectContext::detect(&project_path);
        let (approval_tx, approval_rx) = mpsc::channel(1);
        let sandbox = crate::ai::legacy::sandbox::Sandbox::new();
        let permissions = crate::ai::legacy::permissions::PermissionSystem::new(profile);
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
            context_manager: tokio::sync::Mutex::new(crate::ai::legacy::context::ContextManager::new(8192)),
            permissions,
            sandbox,
            embedding_store,
            cost_tracker,
            todo_items: tokio::sync::Mutex::new(Vec::new()),
            file_modifications: tokio::sync::Mutex::new(Vec::new()),
            session_start: std::time::Instant::now(),
        }
    }

    /// Create an agent with MCP support and a shared process manager.
    /// The shared process manager persists across agent resets.
    pub fn with_mcp_and_process_manager(
        provider: Arc<dyn crate::ai::legacy::provider::LlmProvider>,
        model: String,
        project_path: String,
        profile: PermissionProfile,
        orchestrator: Arc<crate::ai::legacy::orchestrator::Orchestrator>,
        mcp_manager: Arc<tokio::sync::Mutex<crate::ai::legacy::mcp::McpManager>>,
        process_manager: Arc<tokio::sync::Mutex<crate::ai::legacy::tools::ProcessManager>>,
    ) -> Self {
        let project_context = crate::ai::legacy::context::ProjectContext::detect(&project_path);
        let (approval_tx, approval_rx) = mpsc::channel(1);
        let sandbox = crate::ai::legacy::sandbox::Sandbox::new();
        let permissions = crate::ai::legacy::permissions::PermissionSystem::new(profile);
        let embedding_store = Arc::new(tokio::sync::Mutex::new(EmbeddingStore::new()));
        let tools = ToolRegistry::with_process_manager(
            project_path.clone(),
            sandbox.clone(),
            embedding_store.clone(),
            orchestrator,
            mcp_manager,
            process_manager,
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
            context_manager: tokio::sync::Mutex::new(crate::ai::legacy::context::ContextManager::new(8192)),
            permissions,
            sandbox,
            embedding_store,
            cost_tracker,
            todo_items: tokio::sync::Mutex::new(Vec::new()),
            file_modifications: tokio::sync::Mutex::new(Vec::new()),
            session_start: std::time::Instant::now(),
        }
    }

    /// Set the graph store for graph-based RAG.
    /// Call this after constructing the agent to enable graph-aware semantic search.
    pub fn set_graph_store(&mut self, graph_store: Arc<tokio::sync::Mutex<crate::graph::store::GraphStore>>) {
        self.tools.graph_store = Some(graph_store);
    }
}
