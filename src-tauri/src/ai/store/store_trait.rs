use async_trait::async_trait;
use serde_json::Value;

/// Store trait — long-term memory across sessions
#[async_trait]
pub trait Store: Send + Sync {
    /// Get a value from the store
    async fn get(&self, namespace: &str, key: &str) -> Option<Value>;

    /// Put a value into the store
    async fn put(&self, namespace: &str, key: &str, value: Value) -> Result<(), StoreError>;

    /// Delete a value from the store
    async fn delete(&self, namespace: &str, key: &str) -> Result<(), StoreError>;

    /// List all keys in a namespace
    async fn list(&self, namespace: &str) -> Vec<String>;

    /// Check if a key exists
    async fn exists(&self, namespace: &str, key: &str) -> bool {
        self.get(namespace, key).await.is_some()
    }

    /// Get count of keys in a namespace
    async fn count(&self, namespace: &str) -> usize {
        self.list(namespace).await.len()
    }
}

/// Store errors
#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Other: {0}")]
    Other(String),
}

// ═══════════════════════════════════════════════════════════════
// STORE NAMESPACES
// ═══════════════════════════════════════════════════════════════

/// Standard store namespaces
pub struct StoreNamespaces;

impl StoreNamespaces {
    /// Project-specific rules and conventions
    pub const PROJECT_RULES: &'static str = "project_rules";

    /// Tool result cache
    pub const TOOL_CACHE: &'static str = "tool_cache";

    /// Lessons learned in this session
    pub const SESSION_LESSONS: &'static str = "session_lessons";

    /// User preferences
    pub const USER_PREFS: &'static str = "user_preferences";

    /// Agent memory (long-term)
    pub const AGENT_MEMORY: &'static str = "agent_memory";

    /// All namespaces
    pub fn all() -> &'static [&'static str] {
        &[
            Self::PROJECT_RULES,
            Self::TOOL_CACHE,
            Self::SESSION_LESSONS,
            Self::USER_PREFS,
            Self::AGENT_MEMORY,
        ]
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_store_namespaces() {
        assert_eq!(StoreNamespaces::PROJECT_RULES, "project_rules");
        assert_eq!(StoreNamespaces::TOOL_CACHE, "tool_cache");
        assert_eq!(StoreNamespaces::SESSION_LESSONS, "session_lessons");
        assert_eq!(StoreNamespaces::USER_PREFS, "user_preferences");
        assert_eq!(StoreNamespaces::AGENT_MEMORY, "agent_memory");
    }

    #[test]
    fn test_store_namespaces_all() {
        let all = StoreNamespaces::all();
        assert_eq!(all.len(), 5);
    }
}