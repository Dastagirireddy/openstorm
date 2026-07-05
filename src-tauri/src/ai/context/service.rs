use std::path::PathBuf;
use std::sync::Arc;

use crate::ai::cache::ToolResultCache;
use crate::ai::store::{MemoryStore, Store};

/// Context Service — manages 4-layer memory
pub struct ContextService {
    /// Layer 1: System prompt context
    system_prompt: String,

    /// Layer 2: Conversation state (managed externally)
    conversation_id: String,

    /// Layer 3: Tool result cache
    cache: Arc<tokio::sync::Mutex<ToolResultCache>>,

    /// Layer 4: Long-term store
    store: Arc<dyn Store>,

    /// Project path
    project_path: PathBuf,
}

impl ContextService {
    /// Create a new context service
    pub fn new(project_path: PathBuf) -> Self {
        Self {
            system_prompt: String::new(),
            conversation_id: uuid::Uuid::new_v4().to_string(),
            cache: Arc::new(tokio::sync::Mutex::new(ToolResultCache::default())),
            store: Arc::new(MemoryStore::new()),
            project_path,
        }
    }

    /// Create with custom store
    pub fn with_store(project_path: PathBuf, store: Arc<dyn Store>) -> Self {
        Self {
            system_prompt: String::new(),
            conversation_id: uuid::Uuid::new_v4().to_string(),
            cache: Arc::new(tokio::sync::Mutex::new(ToolResultCache::default())),
            store,
            project_path,
        }
    }

    /// Set the system prompt
    pub fn set_system_prompt(&mut self, prompt: String) {
        self.system_prompt = prompt;
    }

    /// Get the system prompt
    pub fn system_prompt(&self) -> &str {
        &self.system_prompt
    }

    /// Get the conversation ID
    pub fn conversation_id(&self) -> &str {
        &self.conversation_id
    }

    /// Get the project path
    pub fn project_path(&self) -> &PathBuf {
        &self.project_path
    }

    /// Get the store reference
    pub fn store(&self) -> &Arc<dyn Store> {
        &self.store
    }

    /// Get the cache reference
    pub fn cache(&self) -> &Arc<tokio::sync::Mutex<ToolResultCache>> {
        &self.cache
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_service_new() {
        let service = ContextService::new(PathBuf::from("/project"));
        assert_eq!(service.project_path(), &PathBuf::from("/project"));
        assert!(!service.conversation_id().is_empty());
        assert!(service.system_prompt().is_empty());
    }

    #[test]
    fn test_set_system_prompt() {
        let mut service = ContextService::new(PathBuf::from("/project"));
        service.set_system_prompt("You are an AI assistant.".to_string());
        assert_eq!(service.system_prompt(), "You are an AI assistant.");
    }

    #[test]
    fn test_with_store() {
        let store = Arc::new(MemoryStore::new());
        let service = ContextService::with_store(PathBuf::from("/project"), store);
        assert_eq!(service.project_path(), &PathBuf::from("/project"));
    }

    #[tokio::test]
    async fn test_store_access() {
        let service = ContextService::new(PathBuf::from("/project"));
        service
            .store()
            .put("ns", "key", serde_json::json!("value"))
            .await
            .unwrap();
        let value = service.store().get("ns", "key").await;
        assert_eq!(value, Some(serde_json::json!("value")));
    }

    #[tokio::test]
    async fn test_cache_access() {
        let service = ContextService::new(PathBuf::from("/project"));
        let cache = service.cache().lock().await;
        assert_eq!(cache.stats().total_entries, 0);
    }
}