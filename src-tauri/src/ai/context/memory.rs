use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// Three-tier memory: working (session), project (persisted), and facts.
pub struct MemoryStore {
    pub working: WorkingMemory,
    pub project: ProjectMemory,
}

#[derive(Debug, Clone, Default)]
pub struct WorkingMemory {
    pub current_task: Option<String>,
    pub file_cache: HashMap<String, u64>,
    pub facts: Vec<Fact>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectMemory {
    pub file_index: HashMap<String, FileMeta>,
    pub preferences: HashMap<String, serde_json::Value>,
    pub patterns: Vec<Pattern>,
    pub failures: Vec<Failure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMeta { pub path: String, pub size: u64, pub modified: Option<String>, pub language: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fact { pub key: String, pub value: String, pub confidence: f32, pub source: String, pub learned_at: DateTime<Utc> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pattern { pub description: String, pub trigger: String, pub action: String, pub success_count: u32, pub last_used: Option<DateTime<Utc>> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Failure { pub description: String, pub context: String, pub error: String, pub avoided_count: u32, pub last_seen: Option<DateTime<Utc>> }

#[derive(Debug)]
pub enum MemoryError { Io(std::io::Error), Json(serde_json::Error) }
impl std::fmt::Display for MemoryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self { Self::Io(e) => write!(f, "IO: {}", e), Self::Json(e) => write!(f, "JSON: {}", e) }
    }
}
impl From<std::io::Error> for MemoryError { fn from(e: std::io::Error) -> Self { Self::Io(e) } }
impl From<serde_json::Error> for MemoryError { fn from(e: serde_json::Error) -> Self { Self::Json(e) } }

impl MemoryStore {
    pub fn new() -> Self { Self { working: WorkingMemory::default(), project: ProjectMemory::default() } }

    pub async fn load_project(project_path: &str) -> Result<Self, MemoryError> {
        let path = format!("{}/.openstorm/memory.json", project_path);
        let project = if tokio::fs::metadata(&path).await.is_ok() {
            serde_json::from_str(&tokio::fs::read_to_string(&path).await?).unwrap_or_default()
        } else { ProjectMemory::default() };
        Ok(Self { working: WorkingMemory::default(), project })
    }

    pub async fn save_project(&self, project_path: &str) -> Result<(), MemoryError> {
        let dir = format!("{}/.openstorm", project_path);
        tokio::fs::create_dir_all(&dir).await?;
        tokio::fs::write(format!("{}/memory.json", dir), serde_json::to_string_pretty(&self.project)?).await?;
        Ok(())
    }

    pub fn learn_success(&mut self, context: &str, action: &str) {
        if let Some(p) = self.project.patterns.iter_mut().find(|p| p.trigger == context) {
            p.success_count += 1; p.last_used = Some(Utc::now()); return;
        }
        self.project.patterns.push(Pattern {
            description: format!("When {}, do {}", context, action), trigger: context.into(),
            action: action.into(), success_count: 1, last_used: Some(Utc::now()),
        });
    }

    pub fn learn_failure(&mut self, context: &str, error: &str) {
        if let Some(f) = self.project.failures.iter_mut().find(|f| f.context == context && f.error == error) {
            f.avoided_count += 1; f.last_seen = Some(Utc::now()); return;
        }
        self.project.failures.push(Failure {
            description: format!("Failed: {}", error), context: context.into(),
            error: error.into(), avoided_count: 0, last_seen: Some(Utc::now()),
        });
    }

    pub fn add_fact(&mut self, key: &str, value: &str, source: &str) {
        self.working.facts.push(Fact {
            key: key.into(), value: value.into(), confidence: 0.8,
            source: source.into(), learned_at: Utc::now(),
        });
    }

    pub fn to_prompt_section(&self) -> String {
        let mut s = Vec::new();
        if !self.working.facts.is_empty() {
            let f: Vec<String> = self.working.facts.iter().rev().take(5)
                .map(|f| format!("- {}: {}", f.key, f.value)).collect();
            s.push(format!("Known facts:\n{}", f.join("\n")));
        }
        if !self.project.patterns.is_empty() {
            let p: Vec<String> = self.project.patterns.iter().filter(|p| p.success_count > 1)
                .take(3).map(|p| format!("- {}", p.description)).collect();
            if !p.is_empty() { s.push(format!("Learned patterns:\n{}", p.join("\n"))); }
        }
        if !self.project.failures.is_empty() {
            let f: Vec<String> = self.project.failures.iter().take(2)
                .map(|f| format!("- Avoid: {}", f.description)).collect();
            if !f.is_empty() { s.push(format!("Avoid:\n{}", f.join("\n"))); }
        }
        if s.is_empty() { String::new() } else { format!("Memory:\n{}", s.join("\n\n")) }
    }

    pub fn index_file(&mut self, path: &str, size: u64, language: Option<String>) {
        self.project.file_index.insert(path.into(), FileMeta { path: path.into(), size, modified: None, language });
    }
}

impl Default for MemoryStore { fn default() -> Self { Self::new() } }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_learn_success() {
        let mut m = MemoryStore::new();
        m.learn_success("editing Rust", "use cargo check");
        m.learn_success("editing Rust", "use cargo check");
        assert_eq!(m.project.patterns.len(), 1);
        assert_eq!(m.project.patterns[0].success_count, 2);
    }

    #[test]
    fn test_learn_failure() {
        let mut m = MemoryStore::new();
        m.learn_failure("running tests", "cargo test failed");
        assert_eq!(m.project.failures.len(), 1);
    }

    #[test]
    fn test_add_fact() {
        let mut m = MemoryStore::new();
        m.add_fact("project", "Rust IDE", "user message");
        assert_eq!(m.working.facts[0].key, "project");
    }
}
