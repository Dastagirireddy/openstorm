use std::collections::HashMap;
use std::time::{Duration, Instant};

use crate::ai_v2::tools::tool_trait::ToolResult;

/// Cached tool result
#[derive(Debug, Clone)]
struct CachedResult {
    result: ToolResult,
    cached_at: Instant,
    ttl: Duration,
    hit_count: u32,
}

impl CachedResult {
    fn new(result: ToolResult, ttl: Duration) -> Self {
        Self {
            result,
            cached_at: Instant::now(),
            ttl,
            hit_count: 0,
        }
    }

    fn is_expired(&self) -> bool {
        self.cached_at.elapsed() > self.ttl
    }

    fn touch(&mut self) {
        self.hit_count += 1;
    }
}

/// Tool result cache
pub struct ToolResultCache {
    entries: HashMap<(String, String), CachedResult>,
    default_ttl: Duration,
    max_entries: usize,
}

impl ToolResultCache {
    /// Create a new cache
    pub fn new(default_ttl: Duration, max_entries: usize) -> Self {
        Self {
            entries: HashMap::new(),
            default_ttl,
            max_entries,
        }
    }

    /// Create with default settings (5 min TTL, 1000 entries)
    pub fn default() -> Self {
        Self::new(Duration::from_secs(300), 1000)
    }

    /// Get a cached result
    pub fn get(&mut self, tool_name: &str, args: &serde_json::Value) -> Option<ToolResult> {
        let key = (tool_name.to_string(), format!("{:?}", args));

        if let Some(entry) = self.entries.get_mut(&key) {
            if !entry.is_expired() {
                entry.touch();
                return Some(entry.result.clone());
            }
            // Remove expired entry
            self.entries.remove(&key);
        }

        None
    }

    /// Insert a result into the cache
    pub fn insert(
        &mut self,
        tool_name: &str,
        args: &serde_json::Value,
        result: ToolResult,
    ) {
        let key = (tool_name.to_string(), format!("{:?}", args));

        // Evict oldest if at capacity
        if self.entries.len() >= self.max_entries {
            self.evict_oldest();
        }

        self.entries
            .insert(key, CachedResult::new(result, self.default_ttl));
    }

    /// Evict the oldest entry
    fn evict_oldest(&mut self) {
        if let Some(oldest_key) = self
            .entries
            .iter()
            .min_by_key(|(_, entry)| entry.cached_at)
            .map(|(key, _)| key.clone())
        {
            self.entries.remove(&oldest_key);
        }
    }

    /// Clear all cached entries
    pub fn clear(&mut self) {
        self.entries.clear();
    }

    /// Get cache statistics
    pub fn stats(&self) -> CacheStats {
        let mut stats = CacheStats::default();
        stats.total_entries = self.entries.len();

        for entry in self.entries.values() {
            stats.total_accesses += entry.hit_count as usize;
            if entry.is_expired() {
                stats.expired_entries += 1;
            }
        }

        stats
    }

    /// Remove expired entries
    pub fn cleanup(&mut self) {
        self.entries.retain(|_, entry| !entry.is_expired());
    }
}

impl Default for ToolResultCache {
    fn default() -> Self {
        Self::default()
    }
}

/// Cache statistics
#[derive(Debug, Default, Clone)]
pub struct CacheStats {
    pub total_entries: usize,
    pub expired_entries: usize,
    pub total_accesses: usize,
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_result_cache_new() {
        let cache = ToolResultCache::new(Duration::from_secs(60), 100);
        assert_eq!(cache.stats().total_entries, 0);
    }

    #[test]
    fn test_tool_result_cache_default() {
        let cache = ToolResultCache::default();
        assert_eq!(cache.stats().total_entries, 0);
    }

    #[test]
    fn test_insert_and_get() {
        let mut cache = ToolResultCache::new(Duration::from_secs(60), 100);
        let args = serde_json::json!({"key": "value"});
        let result = ToolResult::success("call-1", "output");

        cache.insert("tool", &args, result.clone());
        let cached = cache.get("tool", &args);
        assert!(cached.is_some());
        assert_eq!(cached.unwrap().content, "output");
    }

    #[test]
    fn test_cache_miss() {
        let mut cache = ToolResultCache::new(Duration::from_secs(60), 100);
        let args = serde_json::json!({"key": "value"});
        assert!(cache.get("tool", &args).is_none());
    }

    #[test]
    fn test_eviction() {
        let mut cache = ToolResultCache::new(Duration::from_secs(60), 2);

        // Insert 3 entries into cache of size 2
        for i in 0..3 {
            let args = serde_json::json!({"index": i});
            let result = ToolResult::success("call", format!("result {}", i));
            cache.insert("tool", &args, result);
        }

        assert_eq!(cache.stats().total_entries, 2);
    }

    #[test]
    fn test_hit_count() {
        let mut cache = ToolResultCache::new(Duration::from_secs(60), 100);
        let args = serde_json::json!({"key": "value"});
        let result = ToolResult::success("call-1", "output");

        cache.insert("tool", &args, result);
        cache.get("tool", &args);
        cache.get("tool", &args);

        let stats = cache.stats();
        assert_eq!(stats.total_accesses, 2);
    }

    #[test]
    fn test_clear() {
        let mut cache = ToolResultCache::new(Duration::from_secs(60), 100);
        let args = serde_json::json!({"key": "value"});
        cache.insert("tool", &args, ToolResult::success("call", "output"));

        cache.clear();
        assert_eq!(cache.stats().total_entries, 0);
    }

    #[test]
    fn test_cleanup() {
        let mut cache = ToolResultCache::new(Duration::from_millis(1), 100);
        let args = serde_json::json!({"key": "value"});
        cache.insert("tool", &args, ToolResult::success("call", "output"));

        // Wait for expiry
        std::thread::sleep(Duration::from_millis(10));

        cache.cleanup();
        assert_eq!(cache.stats().total_entries, 0);
    }
}