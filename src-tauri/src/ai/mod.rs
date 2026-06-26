pub mod providers;
pub mod agent;
pub mod tools;
pub mod commands;
pub mod context;
pub mod permissions;
pub mod sandbox;
pub mod verifier;
pub mod rag;
pub mod embedding_store;
pub mod cost_tracker;
pub mod ignore;
pub mod orchestrator;
pub mod mcp;

/// Backward-compatible alias for `providers::traits`
pub use providers::traits as provider;

pub use providers::*;
#[allow(unused_imports)]
pub use context::{ContextManager, ProjectContext, AiSessionLog};
#[allow(unused_imports)]
pub use cost_tracker::SharedCostTracker;
