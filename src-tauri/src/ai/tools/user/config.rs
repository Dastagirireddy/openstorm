use std::path::Path;
use serde::{Deserialize, Serialize};

/// Configuration for user-defined tools
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserToolsConfig {
    /// List of user-defined tools
    #[serde(default)]
    pub tools: Vec<UserToolConfig>,
}

/// Configuration for a single user-defined tool
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserToolConfig {
    /// Tool name (snake_case, no spaces)
    pub name: String,
    /// Description shown to the LLM
    pub description: String,
    /// Command to execute (e.g., "python3", "bash", "node")
    pub command: String,
    /// Arguments to pass to the command
    #[serde(default)]
    pub args: Vec<String>,
    /// JSON Schema for input validation
    #[serde(default = "default_object_schema")]
    pub input_schema: serde_json::Value,
    /// Trust tier classification
    #[serde(default)]
    pub trust_tier: TrustTierConfig,
    /// Tool category
    #[serde(default)]
    pub category: String,
    /// Execution timeout in milliseconds
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
    /// Sandbox configuration
    #[serde(default)]
    pub sandbox: SandboxConfig,
}

/// Trust tier configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrustTierConfig {
    /// Safe — auto-approve in autonomy mode
    Safe,
    /// Standard — may ask depending on settings
    Standard,
    /// Destructive — always ask
    Destructive,
}

impl Default for TrustTierConfig {
    fn default() -> Self {
        Self::Standard
    }
}

/// Sandbox configuration for user-defined tools
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxConfig {
    /// Allow network access
    #[serde(default = "default_true")]
    pub network: bool,
    /// Allowed write directories (relative to project root)
    #[serde(default)]
    pub write_paths: Vec<String>,
    /// Inherit parent environment variables
    #[serde(default)]
    pub env_inherit: bool,
    /// Specific environment variables to pass
    #[serde(default)]
    pub env_vars: Vec<String>,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            network: false,
            write_paths: Vec::new(),
            env_inherit: false,
            env_vars: Vec::new(),
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_object_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {}
    })
}

fn default_timeout_ms() -> u64 {
    30_000
}

impl UserToolsConfig {
    /// Load configuration from a JSON file
    pub fn load(path: &Path) -> Result<Self, ConfigError> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| ConfigError::Io(format!("Failed to read {}: {}", path.display(), e)))?;
        Self::parse(&content)
    }

    /// Parse configuration from a JSON string
    pub fn parse(json: &str) -> Result<Self, ConfigError> {
        serde_json::from_str(json).map_err(ConfigError::Json)
    }

    /// Merge another config into this one (other overrides self)
    pub fn merge(mut self, other: UserToolsConfig) -> Self {
        for tool in other.tools {
            // Remove existing tool with same name
            self.tools.retain(|t| t.name != tool.name);
            self.tools.push(tool);
        }
        self
    }

    /// Find a tool by name
    pub fn find_tool(&self, name: &str) -> Option<&UserToolConfig> {
        self.tools.iter().find(|t| t.name == name)
    }

    /// Get all tool names
    pub fn tool_names(&self) -> Vec<&str> {
        self.tools.iter().map(|t| t.name.as_str()).collect()
    }
}

/// Configuration error types
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("IO error: {0}")]
    Io(String),

    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Validation error: {0}")]
    Validation(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_empty_config() {
        let config = UserToolsConfig::parse("{}").unwrap();
        assert!(config.tools.is_empty());
    }

    #[test]
    fn test_parse_config_with_tools() {
        let json = r#"{
            "tools": [
                {
                    "name": "my_linter",
                    "description": "Run custom linter",
                    "command": "python3",
                    "args": ["scripts/lint.py"],
                    "trust_tier": "safe",
                    "category": "analysis"
                }
            ]
        }"#;
        let config = UserToolsConfig::parse(json).unwrap();
        assert_eq!(config.tools.len(), 1);
        assert_eq!(config.tools[0].name, "my_linter");
        assert_eq!(config.tools[0].command, "python3");
    }

    #[test]
    fn test_find_tool() {
        let config = UserToolsConfig::parse(r#"{
            "tools": [
                {"name": "tool1", "description": "desc", "command": "echo"},
                {"name": "tool2", "description": "desc", "command": "ls"}
            ]
        }"#).unwrap();
        assert!(config.find_tool("tool1").is_some());
        assert!(config.find_tool("tool3").is_none());
    }

    #[test]
    fn test_tool_names() {
        let config = UserToolsConfig::parse(r#"{
            "tools": [
                {"name": "alpha", "description": "desc", "command": "echo"},
                {"name": "beta", "description": "desc", "command": "ls"}
            ]
        }"#).unwrap();
        let names = config.tool_names();
        assert_eq!(names, vec!["alpha", "beta"]);
    }

    #[test]
    fn test_merge_configs() {
        let mut config1 = UserToolsConfig::parse(r#"{
            "tools": [
                {"name": "tool1", "description": "v1", "command": "echo"}
            ]
        }"#).unwrap();
        let config2 = UserToolsConfig::parse(r#"{
            "tools": [
                {"name": "tool1", "description": "v2", "command": "ls"},
                {"name": "tool2", "description": "new", "command": "pwd"}
            ]
        }"#).unwrap();
        config1 = config1.merge(config2);
        assert_eq!(config1.tools.len(), 2);
        assert_eq!(config1.tools[0].description, "v2"); // overridden
        assert_eq!(config1.tools[1].name, "tool2"); // new
    }

    #[test]
    fn test_sandbox_config_defaults() {
        let sandbox = SandboxConfig::default();
        assert!(!sandbox.network);
        assert!(sandbox.write_paths.is_empty());
        assert!(!sandbox.env_inherit);
    }

    #[test]
    fn test_trust_tier_default() {
        let tier = TrustTierConfig::default();
        assert!(matches!(tier, TrustTierConfig::Standard));
    }
}
