use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Rust,
    JavaScript,
    TypeScript,
    Python,
    Go,
    Cpp,
    Unknown,
}

impl Language {
    pub fn from_file_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "rs" => Some(Language::Rust),
            "js" | "mjs" | "cjs" => Some(Language::JavaScript),
            "ts" | "tsx" | "mts" | "cts" => Some(Language::TypeScript),
            "py" | "pyw" => Some(Language::Python),
            "go" => Some(Language::Go),
            "c" | "cpp" | "cc" | "cxx" | "h" | "hpp" => Some(Language::Cpp),
            _ => None,
        }
    }

    pub fn project_markers(&self) -> &'static [&'static str] {
        match self {
            Language::Rust => &["Cargo.toml"],
            Language::JavaScript | Language::TypeScript => &["package.json"],
            Language::Python => &["pyproject.toml", "setup.py", "requirements.txt"],
            Language::Go => &["go.mod", "go.sum"],
            Language::Cpp => &["CMakeLists.txt", "Makefile", "configure"],
            Language::Unknown => &[],
        }
    }

    pub fn from_project_file(file_name: &str) -> Option<Self> {
        match file_name {
            "Cargo.toml" => Some(Language::Rust),
            "package.json" => Some(Language::JavaScript),
            "pyproject.toml" | "setup.py" | "requirements.txt" => Some(Language::Python),
            "go.mod" | "go.sum" => Some(Language::Go),
            "CMakeLists.txt" | "Makefile" => Some(Language::Cpp),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebugAdapterConfig {
    pub adapter_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executable: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunConfiguration {
    pub id: String,
    pub name: String,
    pub language: Language,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub cwd: Option<PathBuf>,
    #[serde(skip_serializing_if = "HashMap::is_empty", default)]
    pub env: HashMap<String, String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub pre_launch_tasks: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub debug_adapter: Option<DebugAdapterConfig>,
}

impl RunConfiguration {
    pub fn new(id: String, name: String, language: Language, command: String) -> Self {
        Self {
            id,
            name,
            language,
            command,
            args: Vec::new(),
            cwd: None,
            env: HashMap::new(),
            pre_launch_tasks: Vec::new(),
            debug_adapter: None,
        }
    }
}
