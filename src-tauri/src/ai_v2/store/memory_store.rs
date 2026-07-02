use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use serde_json::Value;
use tokio::sync::RwLock;

use super::store_trait::{Store, StoreError};

/// In-memory store implementation
pub struct MemoryStore {
    data: Arc<RwLock<HashMap<String, HashMap<String, Value>>>>,
}

impl MemoryStore {
    /// Create a new memory store
    pub fn new() -> Self {
        Self {
            data: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create with initial data
    pub fn with_data(data: HashMap<String, HashMap<String, Value>>) -> Self {
        Self {
            data: Arc::new(RwLock::new(data)),
        }
    }

    /// Get all data (for testing/debugging)
    pub async fn get_all(&self) -> HashMap<String, HashMap<String, Value>> {
        self.data.read().await.clone()
    }

    /// Clear all data
    pub async fn clear(&self) {
        self.data.write().await.clear();
    }

    /// Get total count of all entries
    pub async fn total_count(&self) -> usize {
        self.data.read().await.values().map(|m| m.len()).sum()
    }
}

impl Default for MemoryStore {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Store for MemoryStore {
    async fn get(&self, namespace: &str, key: &str) -> Option<Value> {
        let data = self.data.read().await;
        data.get(namespace).and_then(|m| m.get(key)).cloned()
    }

    async fn put(&self, namespace: &str, key: &str, value: Value) -> Result<(), StoreError> {
        let mut data = self.data.write().await;
        let ns = data
            .entry(namespace.to_string())
            .or_insert_with(HashMap::new);
        ns.insert(key.to_string(), value);
        Ok(())
    }

    async fn delete(&self, namespace: &str, key: &str) -> Result<(), StoreError> {
        let mut data = self.data.write().await;
        if let Some(ns) = data.get_mut(namespace) {
            ns.remove(key);
        }
        Ok(())
    }

    async fn list(&self, namespace: &str) -> Vec<String> {
        let data = self.data.read().await;
        data.get(namespace)
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default()
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_memory_store_new() {
        let store = MemoryStore::new();
        assert_eq!(store.total_count().await, 0);
    }

    #[tokio::test]
    async fn test_memory_store_default() {
        let store = MemoryStore::default();
        assert_eq!(store.total_count().await, 0);
    }

    #[tokio::test]
    async fn test_put_and_get() {
        let store = MemoryStore::new();
        let value = serde_json::json!({"key": "value"});

        store.put("ns", "key1", value.clone()).await.unwrap();
        let result = store.get("ns", "key1").await;
        assert_eq!(result, Some(value));
    }

    #[tokio::test]
    async fn test_get_nonexistent() {
        let store = MemoryStore::new();
        assert!(store.get("ns", "nonexistent").await.is_none());
    }

    #[tokio::test]
    async fn test_delete() {
        let store = MemoryStore::new();
        store.put("ns", "key1", serde_json::json!("v1")).await.unwrap();

        store.delete("ns", "key1").await.unwrap();
        assert!(store.get("ns", "key1").await.is_none());
    }

    #[tokio::test]
    async fn test_list() {
        let store = MemoryStore::new();
        store.put("ns", "k1", serde_json::json!("v1")).await.unwrap();
        store.put("ns", "k2", serde_json::json!("v2")).await.unwrap();
        store.put("other", "k3", serde_json::json!("v3")).await.unwrap();

        let mut keys = store.list("ns").await;
        keys.sort();
        assert_eq!(keys, vec!["k1", "k2"]);
    }

    #[tokio::test]
    async fn test_list_empty_namespace() {
        let store = MemoryStore::new();
        let keys = store.list("nonexistent").await;
        assert!(keys.is_empty());
    }

    #[tokio::test]
    async fn test_exists() {
        let store = MemoryStore::new();
        store.put("ns", "key1", serde_json::json!("v1")).await.unwrap();

        assert!(store.exists("ns", "key1").await);
        assert!(!store.exists("ns", "nonexistent").await);
    }

    #[tokio::test]
    async fn test_count() {
        let store = MemoryStore::new();
        assert_eq!(store.count("ns").await, 0);

        store.put("ns", "k1", serde_json::json!("v1")).await.unwrap();
        assert_eq!(store.count("ns").await, 1);

        store.put("ns", "k2", serde_json::json!("v2")).await.unwrap();
        assert_eq!(store.count("ns").await, 2);
    }

    #[tokio::test]
    async fn test_overwrite() {
        let store = MemoryStore::new();
        store.put("ns", "key1", serde_json::json!("v1")).await.unwrap();
        store.put("ns", "key1", serde_json::json!("v2")).await.unwrap();

        let result = store.get("ns", "key1").await;
        assert_eq!(result, Some(serde_json::json!("v2")));
    }

    #[tokio::test]
    async fn test_clear() {
        let store = MemoryStore::new();
        store.put("ns", "k1", serde_json::json!("v1")).await.unwrap();
        store.put("ns", "k2", serde_json::json!("v2")).await.unwrap();

        store.clear().await;
        assert_eq!(store.total_count().await, 0);
    }

    #[tokio::test]
    async fn test_multiple_namespaces() {
        let store = MemoryStore::new();
        store.put("ns1", "k1", serde_json::json!("v1")).await.unwrap();
        store.put("ns2", "k2", serde_json::json!("v2")).await.unwrap();

        assert_eq!(store.get("ns1", "k1").await, Some(serde_json::json!("v1")));
        assert_eq!(store.get("ns2", "k2").await, Some(serde_json::json!("v2")));
        assert!(store.get("ns1", "k2").await.is_none());
    }

    #[tokio::test]
    async fn test_with_data() {
        let mut data = HashMap::new();
        let mut ns = HashMap::new();
        ns.insert("key".to_string(), serde_json::json!("value"));
        data.insert("namespace".to_string(), ns);

        let store = MemoryStore::with_data(data);
        assert_eq!(
            store.get("namespace", "key").await,
            Some(serde_json::json!("value"))
        );
    }
}