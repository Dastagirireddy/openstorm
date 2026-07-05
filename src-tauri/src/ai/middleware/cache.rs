use std::collections::HashMap;
use std::time::{Duration, Instant};

use tokio::sync::RwLock;

use super::pipeline::{MiddlewareError, NextFn, ToolCallRequest, ToolMiddleware};
use crate::ai::tools::tool_trait::{ToolResult, ToolRuntime};

// ═══════════════════════════════════════════════════════════════
// CACHE ENTRY
// ═══════════════════════════════════════════════════════════════

/// Cached tool result
#[derive(Debug, Clone)]
struct CacheEntry {
    result: ToolResult,
    inserted_at: Instant,
    access_count: u64,
    last_accessed: Instant,
}

impl CacheEntry {
    fn new(result: ToolResult, _ttl: Duration) -> Self {
        let now = Instant::now();
        Self {
            result,
            inserted_at: now,
            access_count: 1,
            last_accessed: now,
        }
    }

    fn is_expired(&self, ttl: Duration) -> bool {
        self.inserted_at.elapsed() > ttl
    }

    fn touch(&mut self) {
        self.access_count += 1;
        self.last_accessed = Instant::now();
    }
}

// ═══════════════════════════════════════════════════════════════
// CACHE KEY
// ═══════════════════════════════════════════════════════════════

/// Cache key for tool results
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
struct CacheKey {
    tool_name: String,
    args_hash: String,
}

impl CacheKey {
    fn new(tool_name: &str, args: &serde_json::Value) -> Self {
        let args_hash = format!("{:?}", args); // Simple hash for now
        Self {
            tool_name: tool_name.to_string(),
            args_hash,
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// CACHE MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

/// Middleware that caches tool results
pub struct CacheMiddleware {
    cache: RwLock<HashMap<CacheKey, CacheEntry>>,
    ttl: Duration,
    max_entries: usize,
}

impl CacheMiddleware {
    /// Create a new cache middleware
    pub fn new(ttl: Duration, max_entries: usize) -> Self {
        Self {
            cache: RwLock::new(HashMap::new()),
            ttl,
            max_entries,
        }
    }

    /// Create cache with default settings (5 min TTL, 1000 entries)
    pub fn default() -> Self {
        Self::new(Duration::from_secs(300), 1000)
    }

    /// Get a cached result
    pub async fn get(&self, tool_name: &str, args: &serde_json::Value) -> Option<ToolResult> {
        let key = CacheKey::new(tool_name, args);
        let mut cache = self.cache.write().await;

        if let Some(entry) = cache.get_mut(&key) {
            if !entry.is_expired(self.ttl) {
                entry.touch();
                return Some(entry.result.clone());
            }
            // Remove expired entry
            cache.remove(&key);
        }

        None
    }

    /// Insert a result into the cache
    pub async fn insert(
        &self,
        tool_name: &str,
        args: &serde_json::Value,
        result: ToolResult,
    ) {
        let key = CacheKey::new(tool_name, args);
        let mut cache = self.cache.write().await;

        // Evict oldest if at capacity
        if cache.len() >= self.max_entries {
            self.evict_oldest(&mut cache);
        }

        cache.insert(key, CacheEntry::new(result, self.ttl));
    }

    /// Evict the oldest entry
    fn evict_oldest(&self, cache: &mut HashMap<CacheKey, CacheEntry>) {
        if let Some(oldest_key) = cache
            .iter()
            .min_by_key(|(_, entry)| entry.last_accessed)
            .map(|(key, _)| key.clone())
        {
            cache.remove(&oldest_key);
        }
    }

    /// Clear all cached entries
    pub async fn clear(&self) {
        self.cache.write().await.clear();
    }

    /// Get cache statistics
    pub async fn stats(&self) -> CacheStats {
        let cache = self.cache.read().await;
        let mut stats = CacheStats::default();
        stats.total_entries = cache.len();

        for entry in cache.values() {
            stats.total_accesses += entry.access_count;
            if entry.is_expired(self.ttl) {
                stats.expired_entries += 1;
            }
        }

        stats
    }
}

// ═══════════════════════════════════════════════════════════════
// CACHE STATS
// ═══════════════════════════════════════════════════════════════

/// Cache statistics
#[derive(Debug, Default, Clone)]
pub struct CacheStats {
    pub total_entries: usize,
    pub expired_entries: usize,
    pub total_accesses: u64,
}

// ═══════════════════════════════════════════════════════════════
// TOOL MIDDLEWARE IMPL
// ═══════════════════════════════════════════════════════════════

#[async_trait::async_trait]
impl ToolMiddleware for CacheMiddleware {
    async fn process(
        &self,
        request: &ToolCallRequest,
        runtime: &ToolRuntime,
        next: &NextFn,
    ) -> Result<ToolResult, MiddlewareError> {
        // Check cache first
        if let Some(cached) = self.get(&request.tool_name, &request.args).await {
            return Ok(cached);
        }

        // Execute next middleware/handler
        let result = next(request, runtime).await?;

        // Cache successful results
        if result.success {
            self.insert(&request.tool_name, &request.args, result.clone())
                .await;
        }

        Ok(result)
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::middleware::pipeline::ToolMiddleware;
    use crate::ai::tools::tool_trait::{ToolResult, ToolRuntime};
    use std::path::PathBuf;

    fn make_runtime() -> ToolRuntime {
        ToolRuntime {
            project_path: PathBuf::from("/test"),
            session_id: "test-session".to_string(),
        }
    }

    fn make_request(tool_name: &str) -> ToolCallRequest {
        ToolCallRequest {
            tool_name: tool_name.to_string(),
            args: serde_json::json!({"key": "value"}),
            tool_call_id: "test-call".to_string(),
            metadata: super::super::pipeline::RequestMetadata::default(),
        }
    }

    #[tokio::test]
    async fn test_cache_middleware_new() {
        let cache = CacheMiddleware::new(Duration::from_secs(60), 100);
        assert_eq!(cache.stats().await.total_entries, 0);
    }

    #[tokio::test]
    async fn test_cache_middleware_default() {
        let cache = CacheMiddleware::default();
        assert_eq!(cache.stats().await.total_entries, 0);
    }

    #[tokio::test]
    async fn test_cache_insert_and_get() {
        let cache = CacheMiddleware::new(Duration::from_secs(60), 100);
        let request = make_request("test_tool");

        let result = ToolResult::success("call-1", "cached result");
        cache
            .insert(&request.tool_name, &request.args, result.clone())
            .await;

        let cached = cache.get(&request.tool_name, &request.args).await;
        assert!(cached.is_some());
        assert_eq!(cached.unwrap().content, "cached result");
    }

    #[tokio::test]
    async fn test_cache_miss() {
        let cache = CacheMiddleware::new(Duration::from_secs(60), 100);
        let cached = cache.get("nonexistent", &serde_json::json!({})).await;
        assert!(cached.is_none());
    }

    #[tokio::test]
    async fn test_cache_eviction() {
        let cache = CacheMiddleware::new(Duration::from_secs(60), 2);

        // Insert 3 entries into cache of size 2
        for i in 0..3 {
            let result = ToolResult::success("call", format!("result {}", i));
            let args = serde_json::json!({"index": i});
            cache.insert("tool", &args, result).await;
        }

        let stats = cache.stats().await;
        assert_eq!(stats.total_entries, 2); // One evicted
    }

    #[tokio::test]
    async fn test_cache_middleware_pass_through() {
        let cache = CacheMiddleware::new(Duration::from_secs(60), 100);
        let runtime = make_runtime();
        let request = make_request("test_tool");

        let call_count = Arc::new(tokio::sync::Mutex::new(0));
        let count = call_count.clone();

        let handler = move |_req: &ToolCallRequest, _rt: &ToolRuntime| {
            let count = count.clone();
            Box::pin(async move {
                *count.lock().await += 1;
                Ok(ToolResult::success("call", "fresh result"))
            })
            as std::pin::Pin<
                Box<dyn std::future::Future<Output = Result<ToolResult, MiddlewareError>> + Send>,
            >
        };

        // First call - should execute handler
        let result = cache.process(&request, &runtime, &handler).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().content, "fresh result");
        assert_eq!(*call_count.lock().await, 1);

        // Second call - should use cache
        let result = cache.process(&request, &runtime, &handler).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().content, "fresh result");
        assert_eq!(*call_count.lock().await, 1); // Not called again
    }

    #[tokio::test]
    async fn test_cache_clear() {
        let cache = CacheMiddleware::new(Duration::from_secs(60), 100);

        // Insert some entries
        for i in 0..5 {
            let result = ToolResult::success("call", format!("result {}", i));
            let args = serde_json::json!({"index": i});
            cache.insert("tool", &args, result).await;
        }

        assert_eq!(cache.stats().await.total_entries, 5);

        cache.clear().await;
        assert_eq!(cache.stats().await.total_entries, 0);
    }

    #[tokio::test]
    async fn test_cache_stats() {
        let cache = CacheMiddleware::new(Duration::from_secs(60), 100);

        // Insert some entries
        for i in 0..3 {
            let result = ToolResult::success("call", format!("result {}", i));
            let args = serde_json::json!({"index": i});
            cache.insert("tool", &args, result).await;
        }

        // Access some entries
        let args0 = serde_json::json!({"index": 0});
        cache.get("tool", &args0).await;
        cache.get("tool", &args0).await;

        let stats = cache.stats().await;
        assert_eq!(stats.total_entries, 3);
        assert!(stats.total_accesses >= 2); // At least 2 accesses
    }
}