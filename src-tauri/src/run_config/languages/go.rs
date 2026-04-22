use super::LanguageDetector;
use crate::run_config::configuration::{Language, RunConfiguration};
use std::collections::HashMap;
use std::path::Path;

pub struct GoDetector;

impl GoDetector {
    fn has_go_mod(workspace_root: &Path) -> bool {
        workspace_root.join("go.mod").exists()
    }

    fn find_main_packages(workspace_root: &Path) -> Vec<String> {
        let mut mains = Vec::new();

        // Check for main.go in root
        if workspace_root.join("main.go").exists() {
            mains.push(".".to_string());
        }

        // Check for main.go in cmd/
        let cmd_dir = workspace_root.join("cmd");
        if cmd_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&cmd_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let main_go = entry.path().join("main.go");
                    if main_go.exists() {
                        if let Some(name) = entry.file_name().to_str() {
                            mains.push(format!("./cmd/{}", name));
                        }
                    }
                }
            }
        }

        // Check for main.go in internal/
        let internal_dir = workspace_root.join("internal");
        if internal_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&internal_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let main_go = entry.path().join("main.go");
                    if main_go.exists() {
                        if let Some(name) = entry.file_name().to_str() {
                            mains.push(format!("./internal/{}", name));
                        }
                    }
                }
            }
        }

        if mains.is_empty() {
            mains.push(".".to_string());
        }

        mains
    }
}

impl LanguageDetector for GoDetector {
    fn detect(&self, workspace_root: &Path) -> Vec<RunConfiguration> {
        let mut configs = Vec::new();

        if !Self::has_go_mod(workspace_root) {
            return configs;
        }

        let mains = Self::find_main_packages(workspace_root);
        for (i, main_pkg) in mains.iter().enumerate() {
            configs.push(RunConfiguration {
                id: format!("go-run-{}", i),
                name: format!("Run Go {}", if mains.len() == 1 { "App" } else { main_pkg }),
                language: Language::Go,
                command: "go".to_string(),
                args: vec!["run".to_string(), main_pkg.clone()],
                cwd: Some(workspace_root.to_path_buf()),
                env: HashMap::new(),
                pre_launch_tasks: Vec::new(),
                debug_adapter: Some(crate::run_config::configuration::DebugAdapterConfig {
                    adapter_type: "delve".to_string(),
                    executable: Some("dlv".to_string()),
                    args: vec![main_pkg.clone()], // For delve: the package path
                    env: HashMap::new(),
                }),
            });
        }

        // Test config
        configs.push(RunConfiguration {
            id: "go-test".into(),
            name: "Run Tests".into(),
            language: Language::Go,
            command: "go".to_string(),
            args: vec!["test".to_string(), "./...".to_string()],
            cwd: Some(workspace_root.to_path_buf()),
            env: HashMap::new(),
            pre_launch_tasks: Vec::new(),
            debug_adapter: None,
        });

        // Build config
        configs.push(RunConfiguration {
            id: "go-build".into(),
            name: "Build".into(),
            language: Language::Go,
            command: "go".to_string(),
            args: vec!["build".to_string(), "-o".to_string(), "bin/app".to_string(), ".".to_string()],
            cwd: Some(workspace_root.to_path_buf()),
            env: HashMap::new(),
            pre_launch_tasks: Vec::new(),
            debug_adapter: None,
        });

        configs
    }
}
