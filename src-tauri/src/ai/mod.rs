pub mod provider;
pub mod ollama;
pub mod lmstudio;
pub mod agent;
pub mod tools;
pub mod commands;
pub mod project_context;

pub use provider::*;
pub use ollama::OllamaProvider;
pub use lmstudio::LmStudioProvider;
pub use agent::Agent;
pub use tools::ToolRegistry;
pub use project_context::ProjectContext;
