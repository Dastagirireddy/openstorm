use std::collections::HashMap;
use std::time::{Duration, Instant};

use super::types::GrantScope;

/// Cache for approved (tool, args) pairs
pub struct SessionMemory {
    /// Approved (tool, args_hash) pairs with expiry
    approved: HashMap<(String, String), Instant>,
    /// TTL for session grants
    ttl: Duration,
    /// Project-scoped grants (tool -> expiry)
    project_grants: HashMap<String, Instant>,
}

impl SessionMemory {
    /// Create a new session memory with default TTL (1 hour)
    pub fn new() -> Self {
        Self::with_ttl(Duration::from_secs(3600))
    }

    /// Create with custom TTL
    pub fn with_ttl(ttl: Duration) -> Self {
        Self {
            approved: HashMap::new(),
            ttl,
            project_grants: HashMap::new(),
        }
    }

    /// Check if a tool call is approved
    pub fn is_approved(&self, tool_name: &str, args_hash: &str) -> bool {
        // Check project grants first
        if let Some(expiry) = self.project_grants.get(tool_name) {
            if Instant::now() < *expiry {
                return true;
            }
        }

        // Check session grants
        if let Some(expiry) = self.approved.get(&(tool_name.to_string(), args_hash.to_string())) {
            if Instant::now() < *expiry {
                return true;
            }
        }

        false
    }

    /// Grant permission for a tool call
    pub fn grant(&mut self, tool_name: &str, args_hash: &str, scope: GrantScope) {
        let now = Instant::now();
        match scope {
            GrantScope::Once => {
                // Don't cache - just return true for this check
            }
            GrantScope::Session => {
                self.approved
                    .insert((tool_name.to_string(), args_hash.to_string()), now + self.ttl);
            }
            GrantScope::Project => {
                self.project_grants
                    .insert(tool_name.to_string(), now + self.ttl);
            }
        }
    }

    /// Revoke permission for a tool
    pub fn revoke(&mut self, tool_name: &str) {
        // Remove all session grants for this tool
        self.approved
            .retain(|(tool, _), _| tool != tool_name);
        // Remove project grant
        self.project_grants.remove(tool_name);
    }

    /// Revoke all permissions
    pub fn revoke_all(&mut self) {
        self.approved.clear();
        self.project_grants.clear();
    }

    /// Clean up expired entries
    pub fn cleanup(&mut self) {
        let now = Instant::now();
        self.approved.retain(|_, expiry| now < *expiry);
        self.project_grants.retain(|_, expiry| now < *expiry);
    }

    /// Get count of active approvals
    pub fn active_count(&self) -> usize {
        let now = Instant::now();
        let session_count = self.approved.values().filter(|e| now < **e).count();
        let project_count = self.project_grants.values().filter(|e| now < **e).count();
        session_count + project_count
    }
}

impl Default for SessionMemory {
    fn default() -> Self {
        Self::new()
    }
}

// ═══════════════════════════════════════════════════════════════
// ARGS HASH
// ═══════════════════════════════════════════════════════════════

/// Create a simple hash of args for caching
pub fn args_hash(args: &serde_json::Value) -> String {
    // Simple serialization for hashing
    // In production, use a proper hash function
    format!("{:?}", args)
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_memory_new() {
        let mem = SessionMemory::new();
        assert_eq!(mem.active_count(), 0);
    }

    #[test]
    fn test_session_memory_default() {
        let mem = SessionMemory::default();
        assert_eq!(mem.active_count(), 0);
    }

    #[test]
    fn test_grant_session() {
        let mut mem = SessionMemory::new();
        mem.grant("tool1", "hash1", GrantScope::Session);
        assert!(mem.is_approved("tool1", "hash1"));
        assert!(!mem.is_approved("tool1", "hash2")); // Different args
        assert!(!mem.is_approved("tool2", "hash1")); // Different tool
    }

    #[test]
    fn test_grant_project() {
        let mut mem = SessionMemory::new();
        mem.grant("tool1", "hash1", GrantScope::Project);
        assert!(mem.is_approved("tool1", "hash1"));
        assert!(mem.is_approved("tool1", "any_hash")); // Project grants any args
    }

    #[test]
    fn test_grant_once() {
        let mut mem = SessionMemory::new();
        mem.grant("tool1", "hash1", GrantScope::Once);
        // Once grants are not cached
        assert!(!mem.is_approved("tool1", "hash1"));
    }

    #[test]
    fn test_revoke() {
        let mut mem = SessionMemory::new();
        mem.grant("tool1", "hash1", GrantScope::Session);
        mem.grant("tool1", "hash2", GrantScope::Session);
        mem.grant("tool2", "hash1", GrantScope::Session);

        mem.revoke("tool1");
        assert!(!mem.is_approved("tool1", "hash1"));
        assert!(!mem.is_approved("tool1", "hash2"));
        assert!(mem.is_approved("tool2", "hash1")); // Other tool unaffected
    }

    #[test]
    fn test_revoke_all() {
        let mut mem = SessionMemory::new();
        mem.grant("tool1", "hash1", GrantScope::Session);
        mem.grant("tool2", "hash1", GrantScope::Project);

        mem.revoke_all();
        assert_eq!(mem.active_count(), 0);
    }

    #[test]
    fn test_cleanup() {
        let mut mem = SessionMemory::with_ttl(Duration::from_millis(1));
        mem.grant("tool1", "hash1", GrantScope::Session);

        // Wait for expiry
        std::thread::sleep(Duration::from_millis(10));

        mem.cleanup();
        assert!(!mem.is_approved("tool1", "hash1"));
    }

    #[test]
    fn test_args_hash() {
        let args1 = serde_json::json!({"path": "/test"});
        let args2 = serde_json::json!({"path": "/test"});
        let args3 = serde_json::json!({"path": "/other"});

        assert_eq!(args_hash(&args1), args_hash(&args2));
        assert_ne!(args_hash(&args1), args_hash(&args3));
    }

    #[test]
    fn test_active_count() {
        let mut mem = SessionMemory::new();
        assert_eq!(mem.active_count(), 0);

        mem.grant("tool1", "hash1", GrantScope::Session);
        assert_eq!(mem.active_count(), 1);

        mem.grant("tool2", "hash1", GrantScope::Project);
        assert_eq!(mem.active_count(), 2);
    }
}