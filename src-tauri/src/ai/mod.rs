pub mod providers;
pub mod agent;
pub mod tools;
pub mod commands;
pub mod project_context;
pub mod context;
pub mod permissions;
pub mod sandbox;
pub mod verifier;
pub mod memory;
pub mod rag;
pub mod embedding_store;
pub mod cost_tracker;
pub mod ignore;
pub mod orchestrator;
pub mod mcp;
pub mod session_log;

/// Backward-compatible alias for `providers::traits`
pub use providers::traits as provider;

pub use providers::*;
pub use agent::Agent;
pub use tools::ToolRegistry;
pub use project_context::ProjectContext;
pub use context::ContextManager;
pub use permissions::{PermissionSystem, PermissionProfile, PermissionResult};
pub use sandbox::Sandbox;
pub use verifier::Verifier;
pub use memory::MemoryStore;
pub use rag::CodeChunker;
pub use embedding_store::EmbeddingStore;
pub use cost_tracker::{CostTracker, SharedCostTracker, create_shared_cost_tracker};
pub use orchestrator::Orchestrator;
pub use mcp::{McpManager, McpServerConfig, McpServerStatus, McpCachedToolInfo};
