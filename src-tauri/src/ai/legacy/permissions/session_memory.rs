use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct SessionMemory {
    approved_commands: HashSet<(String, String)>,
    approval_timestamps: HashMap<(String, String), Instant>,
    ttl: Duration,
}

impl SessionMemory {
    pub fn new() -> Self {
        Self {
            approved_commands: HashSet::new(),
            approval_timestamps: HashMap::new(),
            ttl: Duration::from_secs(3600),
        }
    }

    pub fn with_ttl(ttl: Duration) -> Self {
        Self {
            approved_commands: HashSet::new(),
            approval_timestamps: HashMap::new(),
            ttl,
        }
    }

    pub fn approve(&mut self, tool_name: &str, args: &str) {
        let key = (tool_name.to_string(), self.hash_args(args));
        self.approval_timestamps.insert(key.clone(), Instant::now());
        self.approved_commands.insert(key);
    }

    pub fn is_approved(&mut self, tool_name: &str, args: &str) -> bool {
        let key = (tool_name.to_string(), self.hash_args(args));
        if let Some(approved_at) = self.approval_timestamps.get(&key) {
            if approved_at.elapsed() < self.ttl {
                return true;
            }
            self.approved_commands.remove(&key);
            self.approval_timestamps.remove(&key);
        }
        false
    }

    pub fn clear(&mut self) {
        self.approved_commands.clear();
        self.approval_timestamps.clear();
    }

    pub fn count(&self) -> usize {
        self.approved_commands.len()
    }

    fn hash_args(&self, args: &str) -> String {
        let mut hasher = DefaultHasher::new();
        args.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }
}

impl Default for SessionMemory {
    fn default() -> Self {
        Self::new()
    }
}
