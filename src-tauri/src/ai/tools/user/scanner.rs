use std::path::{Path, PathBuf};

use super::config::{UserToolsConfig, ConfigError};

/// Scan directories for user-defined tool configurations
pub struct ToolScanner;

impl ToolScanner {
    /// Scan a directory for tools.json files
    ///
    /// Looks for:
    /// - tools.json
    /// - tools/*.json
    pub fn scan_dir(dir: &Path) -> Result<Vec<UserToolsConfig>, ConfigError> {
        let mut configs = Vec::new();

        // Check for tools.json in the directory
        let tools_file = dir.join("tools.json");
        if tools_file.exists() {
            match UserToolsConfig::load(&tools_file) {
                Ok(config) => configs.push(config),
                Err(e) => {
                    eprintln!("[ToolScanner] Warning: Failed to load {}: {}", tools_file.display(), e);
                }
            }
        }

        // Check for tools/*.json
        let tools_dir = dir.join("tools");
        if tools_dir.is_dir() {
            Self::scan_tools_dir(&tools_dir, &mut configs)?;
        }

        Ok(configs)
    }

    /// Recursively scan a tools directory for JSON files
    fn scan_tools_dir(dir: &Path, configs: &mut Vec<UserToolsConfig>) -> Result<(), ConfigError> {
        if !dir.is_dir() {
            return Ok(());
        }

        for entry in std::fs::read_dir(dir)
            .map_err(|e| ConfigError::Io(format!("Failed to read dir: {}", e)))?
        {
            let entry = entry.map_err(|e| ConfigError::Io(format!("Failed to read entry: {}", e)))?;
            let path = entry.path();

            if path.is_file() && path.extension().map_or(false, |ext| ext == "json") {
                match UserToolsConfig::load(&path) {
                    Ok(config) => configs.push(config),
                    Err(e) => {
                        eprintln!("[ToolScanner] Warning: Failed to load {}: {}", path.display(), e);
                    }
                }
            } else if path.is_dir() {
                // Recurse into subdirectories (max 1 level)
                Self::scan_tools_dir(&path, configs)?;
            }
        }

        Ok(())
    }

    /// Find global user tools directory (~/.openstorm/tools)
    pub fn global_tools_dir() -> Option<PathBuf> {
        dirs::home_dir().map(|home| home.join(".openstorm").join("tools"))
    }

    /// Find project-scoped tools directory
    pub fn project_tools_dir(project_path: &Path) -> PathBuf {
        project_path.join(".openstorm").join("tools")
    }

    /// Load all user tool configs (global + project)
    pub fn load_all(project_path: &Path) -> UserToolsConfig {
        let mut combined = UserToolsConfig::parse("{}").unwrap();

        // Load global tools first
        if let Some(global_dir) = Self::global_tools_dir() {
            if let Ok(configs) = Self::scan_dir(&global_dir) {
                for config in configs {
                    combined = combined.merge(config);
                }
            }
        }

        // Load project tools (overrides global)
        let project_dir = Self::project_tools_dir(project_path);
        if let Ok(configs) = Self::scan_dir(&project_dir) {
            for config in configs {
                combined = combined.merge(config);
            }
        }

        combined
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn create_temp_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("openstorm_test_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn cleanup_dir(dir: &std::path::Path) {
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn test_scan_empty_dir() {
        let dir = create_temp_dir();
        let configs = ToolScanner::scan_dir(&dir).unwrap();
        assert!(configs.is_empty());
        cleanup_dir(&dir);
    }

    #[test]
    fn test_scan_dir_with_tools_json() {
        let dir = create_temp_dir();
        let tools_file = dir.join("tools.json");
        fs::write(&tools_file, r#"{
            "tools": [
                {"name": "test_tool", "description": "Test", "command": "echo"}
            ]
        }"#).unwrap();

        let configs = ToolScanner::scan_dir(&dir).unwrap();
        assert_eq!(configs.len(), 1);
        assert_eq!(configs[0].tools[0].name, "test_tool");
        cleanup_dir(&dir);
    }

    #[test]
    fn test_scan_tools_dir() {
        let dir = create_temp_dir();
        let tools_dir = dir.join("tools");
        fs::create_dir(&tools_dir).unwrap();

        fs::write(tools_dir.join("linter.json"), r#"{
            "tools": [
                {"name": "linter", "description": "Lint", "command": "pylint"}
            ]
        }"#).unwrap();

        fs::write(tools_dir.join("formatter.json"), r#"{
            "tools": [
                {"name": "formatter", "description": "Format", "command": "black"}
            ]
        }"#).unwrap();

        let configs = ToolScanner::scan_dir(&dir).unwrap();
        assert_eq!(configs.len(), 2);
        cleanup_dir(&dir);
    }

    #[test]
    fn test_project_tools_dir() {
        let project = std::path::Path::new("/my/project");
        let tools_dir = ToolScanner::project_tools_dir(project);
        assert_eq!(tools_dir, std::path::PathBuf::from("/my/project/.openstorm/tools"));
    }

    #[test]
    fn test_global_tools_dir() {
        let dir = ToolScanner::global_tools_dir();
        assert!(dir.is_some());
        let dir = dir.unwrap();
        assert!(dir.ends_with(".openstorm/tools"));
    }

    #[test]
    fn test_load_all_no_dirs() {
        let dir = create_temp_dir();
        let combined = ToolScanner::load_all(&dir);
        assert!(combined.tools.is_empty());
        cleanup_dir(&dir);
    }
}
