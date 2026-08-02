use super::LanguageDetector;
use crate::run_config::configuration::{Language, RunConfiguration};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

pub struct JavaScriptDetector;

impl JavaScriptDetector {
    fn has_package_json(workspace_root: &Path) -> bool {
        workspace_root.join("package.json").exists()
    }

    fn read_package_scripts(workspace_root: &Path) -> Vec<(String, String)> {
        let package_json = workspace_root.join("package.json");
        let Ok(content) = std::fs::read_to_string(&package_json) else {
            return vec![];
        };
        let Ok(json) = content.parse::<Value>() else {
            return vec![];
        };
        let Some(scripts) = json.get("scripts").and_then(|v| v.as_object()) else {
            return vec![];
        };
        scripts
            .iter()
            .map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").to_string()))
            .collect()
    }

    fn find_entry_files(workspace_root: &Path) -> Vec<String> {
        let common_entries = ["index.js", "app.js", "main.js", "server.js", "src/index.js", "src/main.js"];
        common_entries
            .iter()
            .filter(|&f| workspace_root.join(f).exists())
            .map(|&s| s.to_string())
            .collect()
    }

    fn find_all_js_files(workspace_root: &Path) -> Vec<String> {
        // Look for .js files in root directory only
        std::fs::read_dir(workspace_root)
            .ok()
            .into_iter()
            .flat_map(|entries| {
                entries.filter_map(|e| e.ok()).filter_map(|entry| {
                    let path = entry.path();
                    let ext = path.extension().and_then(|e| e.to_str())?;
                    if ext == "js" && path.is_file() {
                        path.file_name()?.to_str().map(String::from)
                    } else {
                        None
                    }
                })
            })
            .collect()
    }

    fn detect_framework(workspace_root: &Path) -> Option<&'static str> {
        let package_json = workspace_root.join("package.json");
        let Ok(content) = std::fs::read_to_string(&package_json) else {
            return None;
        };
        let Ok(json) = content.parse::<Value>() else {
            return None;
        };
        let deps = json.get("dependencies").and_then(|v| v.as_object())?;
        if deps.contains_key("next") { return Some("next"); }
        if deps.contains_key("nuxt") { return Some("nuxt"); }
        if deps.contains_key("react-scripts") { return Some("cra"); }
        if deps.contains_key("vite") { return Some("vite"); }
        if deps.contains_key("express") { return Some("express"); }
        None
    }

    /// Resolve the entry point file from an npm script command.
    /// E.g., "node server.js" -> Some("server.js"), "nodemon app.js" -> Some("app.js")
    fn resolve_npm_entry_point(script_cmd: &str, workspace_root: &Path) -> Option<String> {
        let trimmed = script_cmd.trim();

        // Handle "node <file>" commands
        if trimmed.starts_with("node ") {
            let file = trimmed.strip_prefix("node ")?.trim().split_whitespace().next()?;
            let path = workspace_root.join(file);
            if path.exists() {
                return Some(file.to_string());
            }
        }

        // Handle "nodemon <file>" or other watchers
        if trimmed.starts_with("nodemon ") || trimmed.starts_with("ts-node ") || trimmed.starts_with("tsx ") {
            let file = trimmed.split_whitespace().nth(1)?;
            let path = workspace_root.join(file);
            if path.exists() {
                return Some(file.to_string());
            }
        }

        // Handle "npx ts-node <file>" or "npx tsx <file>"
        if trimmed.starts_with("npx ") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 3 {
                let tool = parts[1];
                if tool == "ts-node" || tool == "tsx" {
                    let file = parts[2];
                    let path = workspace_root.join(file);
                    if path.exists() {
                        return Some(file.to_string());
                    }
                }
            }
        }

        // Fallback: check common entry points
        let common_entries = ["index.js", "app.js", "main.js", "server.js", "src/index.js", "src/app.js", "src/main.js", "src/server.js"];
        for entry in &common_entries {
            if workspace_root.join(entry).exists() {
                return Some(entry.to_string());
            }
        }

        None
    }
}

impl LanguageDetector for JavaScriptDetector {
    fn detect(&self, workspace_root: &Path) -> Vec<RunConfiguration> {
        let mut configs = Vec::new();

        // Check for package.json first
        if Self::has_package_json(workspace_root) {
            let scripts = Self::read_package_scripts(workspace_root);
            let framework = Self::detect_framework(workspace_root);

            // Add npm scripts
            for (script_name, script_cmd) in &scripts {
                let is_dev = script_name.contains("dev") || script_cmd.contains("--watch");

                // Resolve the actual entry point from the npm script command
                let entry_point = match Self::resolve_npm_entry_point(&script_cmd, workspace_root) {
                    Some(ep) => ep,
                    None => continue, // Skip scripts we can't resolve
                };

                configs.push(RunConfiguration {
                    id: format!("npm-{}", script_name),
                    name: format!("npm run {}", script_name),
                    language: Language::JavaScript,
                    command: "node".to_string(),
                    args: vec![entry_point],
                    cwd: Some(workspace_root.to_path_buf()),
                    env: HashMap::new(),
                    pre_launch_tasks: Vec::new(),
                    debug_adapter: if is_dev { None } else {
                        Some(crate::run_config::configuration::DebugAdapterConfig {
                            adapter_type: "js-debug".to_string(),
                            executable: None,
                            args: vec![],
                            env: HashMap::new(),
                        })
                    },
                });
            }

            // Framework-specific defaults
            match framework {
                Some("next") => {
                    if !scripts.iter().any(|(n, _)| n == "dev") {
                        configs.push(RunConfiguration {
                            id: "next-dev".into(),
                            name: "Next.js Dev".into(),
                            language: Language::JavaScript,
                            command: "npm".into(),
                            args: vec!["run".into(), "dev".into()],
                            cwd: Some(workspace_root.to_path_buf()),
                            env: HashMap::new(),
                            pre_launch_tasks: vec![],
                            debug_adapter: None,
                        });
                    }
                }
                Some("vite") => {
                    if !scripts.iter().any(|(n, _)| n == "dev") {
                        configs.push(RunConfiguration {
                            id: "vite-dev".into(),
                            name: "Vite Dev".into(),
                            language: Language::JavaScript,
                            command: "npm".into(),
                            args: vec!["run".into(), "dev".into()],
                            cwd: Some(workspace_root.to_path_buf()),
                            env: HashMap::new(),
                            pre_launch_tasks: vec![],
                            debug_adapter: None,
                        });
                    }
                }
                _ => {}
            }
        }

        // Fallback: direct node execution for standalone JS files
        if configs.is_empty() {
            // First try common entry points
            let entries = Self::find_entry_files(workspace_root);
            for entry in entries {
                configs.push(RunConfiguration {
                    id: format!("node-{}", entry.replace('/', "-")),
                    name: format!("Run {}", entry),
                    language: Language::JavaScript,
                    command: "node".to_string(),
                    args: vec![entry],
                    cwd: Some(workspace_root.to_path_buf()),
                    env: HashMap::new(),
                    pre_launch_tasks: Vec::new(),
                    debug_adapter: Some(crate::run_config::configuration::DebugAdapterConfig {
                        adapter_type: "node".to_string(),
                        executable: None,
                        args: vec![],
                        env: HashMap::new(),
                    }),
                });
            }

            // If still no configs, try any .js file in root
            if configs.is_empty() {
                let js_files = Self::find_all_js_files(workspace_root);
                for js_file in js_files {
                    configs.push(RunConfiguration {
                        id: format!("node-{}", js_file.replace('/', "-")),
                        name: format!("Run {}", js_file),
                        language: Language::JavaScript,
                        command: "node".to_string(),
                        args: vec![js_file],
                        cwd: Some(workspace_root.to_path_buf()),
                        env: HashMap::new(),
                        pre_launch_tasks: Vec::new(),
                        debug_adapter: Some(crate::run_config::configuration::DebugAdapterConfig {
                            adapter_type: "node".to_string(),
                            executable: None,
                            args: vec![],
                            env: HashMap::new(),
                        }),
                    });
                }
            }
        }

        configs
    }
}
