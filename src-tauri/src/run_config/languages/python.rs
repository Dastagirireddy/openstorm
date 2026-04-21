use super::LanguageDetector;
use crate::run_config::configuration::{Language, RunConfiguration};
use std::collections::HashMap;
use std::path::Path;

pub struct PythonDetector;

impl PythonDetector {
    fn has_pyproject(workspace_root: &Path) -> bool {
        workspace_root.join("pyproject.toml").exists()
    }

    fn has_setup_py(workspace_root: &Path) -> bool {
        workspace_root.join("setup.py").exists()
    }

    fn has_requirements(workspace_root: &Path) -> bool {
        workspace_root.join("requirements.txt").exists()
    }

    fn find_entry_files(workspace_root: &Path) -> Vec<String> {
        let common_entries = [
            "main.py", "app.py", "manage.py", "wsgi.py", "asgi.py",
            "src/main.py", "src/app.py",
        ];
        common_entries
            .iter()
            .filter(|&f| workspace_root.join(f).exists())
            .map(|&s| s.to_string())
            .collect()
    }

    fn detect_framework(workspace_root: &Path) -> Option<&'static str> {
        let requirements = workspace_root.join("requirements.txt");
        if let Ok(content) = std::fs::read_to_string(&requirements) {
            let content_lower = content.to_lowercase();
            if content_lower.contains("django") { return Some("django"); }
            if content_lower.contains("flask") { return Some("flask"); }
            if content_lower.contains("fastapi") { return Some("fastapi"); }
        }
        if let Ok(content) = std::fs::read_to_string(workspace_root.join("pyproject.toml")) {
            let content_lower = content.to_lowercase();
            if content_lower.contains("django") { return Some("django"); }
            if content_lower.contains("flask") { return Some("flask"); }
            if content_lower.contains("fastapi") { return Some("fastapi"); }
        }
        if workspace_root.join("manage.py").exists() { return Some("django"); }
        None
    }
}

impl LanguageDetector for PythonDetector {
    fn detect(&self, workspace_root: &Path) -> Vec<RunConfiguration> {
        let mut configs = Vec::new();
        let has_project_file = Self::has_pyproject(workspace_root)
            || Self::has_setup_py(workspace_root)
            || Self::has_requirements(workspace_root);

        if !has_project_file {
            return configs;
        }

        let framework = Self::detect_framework(workspace_root);

        match framework {
            Some("django") => {
                configs.push(RunConfiguration {
                    id: "django-run".into(),
                    name: "Django Run Server".into(),
                    language: Language::Python,
                    command: "python".into(),
                    args: vec!["manage.py".into(), "runserver".into()],
                    cwd: Some(workspace_root.to_path_buf()),
                    env: HashMap::new(),
                    pre_launch_tasks: vec![],
                    debug_adapter: Some(crate::run_config::configuration::DebugAdapterConfig {
                        adapter_type: "debugpy".to_string(),
                        executable: None,
                        args: vec![],
                        env: HashMap::new(),
                    }),
                });
            }
            Some("flask") => {
                configs.push(RunConfiguration {
                    id: "flask-run".into(),
                    name: "Flask Run".into(),
                    language: Language::Python,
                    command: "flask".into(),
                    args: vec!["run".into()],
                    cwd: Some(workspace_root.to_path_buf()),
                    env: HashMap::new(),
                    pre_launch_tasks: vec![],
                    debug_adapter: Some(crate::run_config::configuration::DebugAdapterConfig {
                        adapter_type: "debugpy".to_string(),
                        executable: None,
                        args: vec![],
                        env: HashMap::new(),
                    }),
                });
            }
            Some("fastapi") => {
                configs.push(RunConfiguration {
                    id: "fastapi-run".into(),
                    name: "FastAPI Run".into(),
                    language: Language::Python,
                    command: "uvicorn".into(),
                    args: vec!["main:app".into(), "--reload".into()],
                    cwd: Some(workspace_root.to_path_buf()),
                    env: HashMap::new(),
                    pre_launch_tasks: vec![],
                    debug_adapter: Some(crate::run_config::configuration::DebugAdapterConfig {
                        adapter_type: "debugpy".to_string(),
                        executable: None,
                        args: vec![],
                        env: HashMap::new(),
                    }),
                });
            }
            _ => {}
        }

        // Generic Python run configs
        for entry in Self::find_entry_files(workspace_root) {
            configs.push(RunConfiguration {
                id: format!("python-{}", entry.replace('/', "-")),
                name: format!("Run {}", entry),
                language: Language::Python,
                command: "python".to_string(),
                args: vec![entry],
                cwd: Some(workspace_root.to_path_buf()),
                env: HashMap::new(),
                pre_launch_tasks: Vec::new(),
                debug_adapter: Some(crate::run_config::configuration::DebugAdapterConfig {
                    adapter_type: "debugpy".to_string(),
                    executable: None,
                    args: vec![],
                    env: HashMap::new(),
                }),
            });
        }

        // Test config
        if workspace_root.join("tests").is_dir() || workspace_root.join("test").is_dir() {
            configs.push(RunConfiguration {
                id: "python-test".into(),
                name: "Run Tests".into(),
                language: Language::Python,
                command: "pytest".into(),
                args: vec![],
                cwd: Some(workspace_root.to_path_buf()),
                env: HashMap::new(),
                pre_launch_tasks: vec![],
                debug_adapter: None,
            });
        }

        configs
    }

    fn language(&self) -> Language {
        Language::Python
    }
}
