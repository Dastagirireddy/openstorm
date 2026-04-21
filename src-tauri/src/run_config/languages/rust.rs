use super::LanguageDetector;
use crate::run_config::configuration::{Language, RunConfiguration};
use std::path::Path;

pub struct RustDetector;

impl RustDetector {
    fn has_cargo_toml(workspace_root: &Path) -> bool {
        workspace_root.join("Cargo.toml").exists()
    }

    fn find_binary_targets(workspace_root: &Path) -> Vec<String> {
        let cargo_toml = workspace_root.join("Cargo.toml");
        let Ok(content) = std::fs::read_to_string(&cargo_toml) else {
            return vec!["main".to_string()];
        };

        let mut targets = Vec::new();
        let mut in_bin_section = false;
        let mut current_name = None;
        let mut package_name = None;
        let mut in_package_section = false;

        for line in content.lines() {
            let line = line.trim();
            if line == "[package]" {
                in_package_section = true;
                continue;
            }
            if line == "[[bin]]" {
                in_bin_section = true;
                in_package_section = false;
                continue;
            }
            if line.starts_with('[') && line != "[[bin]]" && line != "[package]" {
                in_bin_section = false;
                in_package_section = false;
            }
            if in_package_section && line.starts_with("name =") {
                if let Some(name) = line.split('=').nth(1) {
                    package_name = Some(name.trim().trim_matches('"').to_string());
                }
            }
            if in_bin_section && line.starts_with("name =") {
                if let Some(name) = line.split('=').nth(1) {
                    current_name = Some(name.trim().trim_matches('"').to_string());
                }
            }
            if in_bin_section && current_name.is_some() && line.is_empty() {
                if let Some(name) = current_name.take() {
                    targets.push(name);
                }
            }
        }

        if let Some(name) = current_name {
            targets.push(name);
        }

        // If no explicit [[bin]] targets, use package name (Cargo default)
        if targets.is_empty() {
            targets.push(package_name.unwrap_or_else(|| "main".to_string()));
        }

        targets
    }

    fn has_examples(workspace_root: &Path) -> bool {
        workspace_root.join("examples").is_dir()
    }

    fn find_example_files(workspace_root: &Path) -> Vec<String> {
        let examples_dir = workspace_root.join("examples");
        std::fs::read_dir(&examples_dir)
            .ok()
            .into_iter()
            .flat_map(|entries| {
                entries.filter_map(|e| e.ok()).filter_map(|entry| {
                    let path = entry.path();
                    path.extension()
                        .filter(|ext| ext == &"rs")
                        .and_then(|_| path.file_stem()?.to_str().map(String::from))
                })
            })
            .collect()
    }
}

impl LanguageDetector for RustDetector {
    fn detect(&self, workspace_root: &Path) -> Vec<RunConfiguration> {
        let mut configs = Vec::new();

        if !Self::has_cargo_toml(workspace_root) {
            return configs;
        }

        let targets = Self::find_binary_targets(workspace_root);
        for (i, target) in targets.iter().enumerate() {
            // For debugging, we need the actual binary path, not cargo run args
            // The binary will be at target/debug/<target> after build
            let debug_binary_path = workspace_root.join("target").join("debug").join(target);
            configs.push(RunConfiguration {
                id: format!("rust-run-{}", i),
                name: format!("Run {}", target),
                language: Language::Rust,
                command: "cargo".to_string(),
                args: vec!["run".to_string(), "--bin".to_string(), target.clone()],
                cwd: Some(workspace_root.to_path_buf()),
                env: std::collections::HashMap::new(),
                pre_launch_tasks: Vec::new(),
                debug_adapter: Some(crate::run_config::configuration::DebugAdapterConfig {
                    adapter_type: "lldb".to_string(),
                    executable: Some("rust-lldb".to_string()),
                    args: vec![debug_binary_path.to_string_lossy().to_string()],
                    env: std::collections::HashMap::new(),
                }),
            });
        }

        configs.push(RunConfiguration {
            id: "rust-test".to_string(),
            name: "Run Tests".to_string(),
            language: Language::Rust,
            command: "cargo".to_string(),
            args: vec!["test".to_string()],
            cwd: Some(workspace_root.to_path_buf()),
            env: std::collections::HashMap::new(),
            pre_launch_tasks: Vec::new(),
            debug_adapter: None,
        });

        if Self::has_examples(workspace_root) {
            let examples = Self::find_example_files(workspace_root);
            for (i, example) in examples.iter().enumerate() {
                configs.push(RunConfiguration {
                    id: format!("rust-example-{}", i),
                    name: format!("Example: {}", example),
                    language: Language::Rust,
                    command: "cargo".to_string(),
                    args: vec!["run".to_string(), "--example".to_string(), example.clone()],
                    cwd: Some(workspace_root.to_path_buf()),
                    env: std::collections::HashMap::new(),
                    pre_launch_tasks: Vec::new(),
                    debug_adapter: None,
                });
            }
        }

        configs
    }

    fn language(&self) -> Language {
        Language::Rust
    }
}
