use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use chrono::{DateTime, Utc};

/// Three-tier memory system for the agent
pub struct MemoryStore {
    /// Working memory (current session only)
    pub working: WorkingMemory,
    /// Project memory (persisted per-project)
    pub project: ProjectMemory,
}

/// Working memory: ephemeral, per-session
#[derive(Debug, Clone, Default)]
pub struct WorkingMemory {
    /// Current task context
    pub current_task: Option<String>,
    /// Recently accessed files (path -> content hash)
    pub file_cache: HashMap<String, u64>,
    /// Key facts extracted from conversation
    pub facts: Vec<Fact>,
}

/// Project memory: persisted in .openstorm/memory.json
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectMemory {
    /// File index (path -> metadata)
    pub file_index: HashMap<String, FileMeta>,
    /// User preferences learned
    pub preferences: HashMap<String, serde_json::Value>,
    /// Successful patterns (what worked before)
    pub patterns: Vec<Pattern>,
    /// Failed attempts (what to avoid)
    pub failures: Vec<Failure>,
}

/// File metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMeta {
    pub path: String,
    pub size: u64,
    pub modified: Option<String>,
    pub language: Option<String>,
}

/// A fact learned during conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fact {
    pub key: String,
    pub value: String,
    pub confidence: f32,
    pub source: String,
    pub learned_at: DateTime<Utc>,
}

/// A successful pattern
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pattern {
    pub description: String,
    pub trigger: String,
    pub action: String,
    pub success_count: u32,
    pub last_used: Option<DateTime<Utc>>,
}

/// A failed attempt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Failure {
    pub description: String,
    pub context: String,
    pub error: String,
    pub avoided_count: u32,
    pub last_seen: Option<DateTime<Utc>>,
}

/// Memory errors
#[derive(Debug)]
pub enum MemoryError {
    IoError(std::io::Error),
    JsonError(serde_json::Error),
    NoHomeDir,
}

impl std::fmt::Display for MemoryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::IoError(e) => write!(f, "IO error: {}", e),
            Self::JsonError(e) => write!(f, "JSON error: {}", e),
            Self::NoHomeDir => write!(f, "Could not find home directory"),
        }
    }
}

impl From<std::io::Error> for MemoryError {
    fn from(e: std::io::Error) -> Self {
        Self::IoError(e)
    }
}

impl From<serde_json::Error> for MemoryError {
    fn from(e: serde_json::Error) -> Self {
        Self::JsonError(e)
    }
}

impl MemoryStore {
    /// Create a new empty memory store
    pub fn new() -> Self {
        Self {
            working: WorkingMemory::default(),
            project: ProjectMemory::default(),
        }
    }

    /// Load project memory from disk
    pub async fn load_project(project_path: &str) -> Result<Self, MemoryError> {
        let mem_path = format!("{}/.openstorm/memory.json", project_path);
        let project = if tokio::fs::metadata(&mem_path).await.is_ok() {
            let data = tokio::fs::read_to_string(&mem_path).await?;
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            ProjectMemory::default()
        };

        Ok(Self {
            working: WorkingMemory::default(),
            project,
        })
    }

    /// Save project memory to disk
    pub async fn save_project(&self, project_path: &str) -> Result<(), MemoryError> {
        let dir = format!("{}/.openstorm", project_path);
        tokio::fs::create_dir_all(&dir).await?;
        let mem_path = format!("{}/memory.json", dir);
        let data = serde_json::to_string_pretty(&self.project)?;
        tokio::fs::write(&mem_path, data).await?;
        Ok(())
    }

    /// Learn from a successful action
    pub fn learn_success(&mut self, context: &str, action: &str) {
        // Check if pattern already exists
        if let Some(existing) = self.project.patterns.iter_mut().find(|p| p.trigger == context) {
            existing.success_count += 1;
            existing.last_used = Some(Utc::now());
            return;
        }

        self.project.patterns.push(Pattern {
            description: format!("When {}, do {}", context, action),
            trigger: context.to_string(),
            action: action.to_string(),
            success_count: 1,
            last_used: Some(Utc::now()),
        });
    }

    /// Learn from a failure
    pub fn learn_failure(&mut self, context: &str, error: &str) {
        // Check if failure already exists
        if let Some(existing) = self.project.failures.iter_mut().find(|f| f.context == context && f.error == error) {
            existing.avoided_count += 1;
            existing.last_seen = Some(Utc::now());
            return;
        }

        self.project.failures.push(Failure {
            description: format!("Failed: {}", error),
            context: context.to_string(),
            error: error.to_string(),
            avoided_count: 0,
            last_seen: Some(Utc::now()),
        });
    }

    /// Add a fact to working memory
    pub fn add_fact(&mut self, key: &str, value: &str, source: &str) {
        self.working.facts.push(Fact {
            key: key.to_string(),
            value: value.to_string(),
            confidence: 0.8,
            source: source.to_string(),
            learned_at: Utc::now(),
        });
    }

    /// Build memory context for system prompt
    pub fn to_prompt_section(&self) -> String {
        let mut sections = Vec::new();

        // Recent facts from working memory
        if !self.working.facts.is_empty() {
            let facts: Vec<String> = self
                .working
                .facts
                .iter()
                .rev()
                .take(5)
                .map(|f| format!("- {}: {}", f.key, f.value))
                .collect();
            sections.push(format!("Known facts:\n{}", facts.join("\n")));
        }

        // Learned patterns from project memory
        if !self.project.patterns.is_empty() {
            let patterns: Vec<String> = self
                .project
                .patterns
                .iter()
                .filter(|p| p.success_count > 1)
                .take(3)
                .map(|p| format!("- {}", p.description))
                .collect();
            if !patterns.is_empty() {
                sections.push(format!("Learned patterns:\n{}", patterns.join("\n")));
            }
        }

        // Recent failures to avoid
        if !self.project.failures.is_empty() {
            let avoid: Vec<String> = self
                .project
                .failures
                .iter()
                .take(2)
                .map(|f| format!("- Avoid: {}", f.description))
                .collect();
            if !avoid.is_empty() {
                sections.push(format!("Avoid:\n{}", avoid.join("\n")));
            }
        }

        if sections.is_empty() {
            String::new()
        } else {
            format!("Memory:\n{}", sections.join("\n\n"))
        }
    }

    /// Update file index
    pub fn index_file(&mut self, path: &str, size: u64, language: Option<String>) {
        self.project.file_index.insert(
            path.to_string(),
            FileMeta {
                path: path.to_string(),
                size,
                modified: None,
                language,
            },
        );
    }

    /// Get the most successful patterns
    pub fn top_patterns(&self, n: usize) -> Vec<&Pattern> {
        let mut patterns: Vec<&Pattern> = self.project.patterns.iter().collect();
        patterns.sort_by(|a, b| b.success_count.cmp(&a.success_count));
        patterns.into_iter().take(n).collect()
    }

    /// Get recent failures
    pub fn recent_failures(&self, n: usize) -> Vec<&Failure> {
        self.project.failures.iter().rev().take(n).collect()
    }
}

impl Default for MemoryStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_learn_success() {
        let mut memory = MemoryStore::new();
        memory.learn_success("editing Rust files", "use cargo check");
        memory.learn_success("editing Rust files", "use cargo check");

        assert_eq!(memory.project.patterns.len(), 1);
        assert_eq!(memory.project.patterns[0].success_count, 2);
    }

    #[test]
    fn test_learn_failure() {
        let mut memory = MemoryStore::new();
        memory.learn_failure("running tests", "cargo test failed");

        assert_eq!(memory.project.failures.len(), 1);
    }

    #[test]
    fn test_add_fact() {
        let mut memory = MemoryStore::new();
        memory.add_fact("project", "Rust IDE", "user message");

        assert_eq!(memory.working.facts.len(), 1);
        assert_eq!(memory.working.facts[0].key, "project");
    }
}
