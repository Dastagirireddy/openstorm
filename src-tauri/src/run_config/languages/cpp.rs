use super::LanguageDetector;
use crate::run_config::configuration::{Language, RunConfiguration};
use std::collections::HashMap;
use std::path::Path;

pub struct CppDetector;

impl CppDetector {
    fn has_cmake(workspace_root: &Path) -> bool {
        workspace_root.join("CMakeLists.txt").exists()
    }

    fn has_makefile(workspace_root: &Path) -> bool {
        workspace_root.join("Makefile").exists()
    }

    #[allow(dead_code)]
    fn has_configure(workspace_root: &Path) -> bool {
        workspace_root.join("configure").exists()
    }

    fn find_main_files(workspace_root: &Path) -> Vec<String> {
        let common_names = ["main.cpp", "main.c", "src/main.cpp", "src/main.c"];
        common_names
            .iter()
            .filter(|&f| workspace_root.join(f).exists())
            .map(|&s| s.to_string())
            .collect()
    }

    fn extract_cmake_target(workspace_root: &Path) -> Option<String> {
        let cmake_lists = workspace_root.join("CMakeLists.txt");
        let Ok(content) = std::fs::read_to_string(&cmake_lists) else {
            return None;
        };
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with("add_executable(") {
                let target = line
                    .trim_start_matches("add_executable(")
                    .split_whitespace()
                    .next()?
                    .trim_end_matches(')');
                return Some(target.to_string());
            }
        }
        None
    }
}

impl LanguageDetector for CppDetector {
    fn detect(&self, workspace_root: &Path) -> Vec<RunConfiguration> {
        let mut configs = Vec::new();

        let is_cmake = Self::has_cmake(workspace_root);
        let is_make = Self::has_makefile(workspace_root);

        if !is_cmake && !is_make {
            return configs;
        }

        // CMake-based config
        if is_cmake {
            let target = Self::extract_cmake_target(workspace_root).unwrap_or_else(|| "app".to_string());
            configs.push(RunConfiguration {
                id: "cmake-build".into(),
                name: "CMake Build".into(),
                language: Language::Cpp,
                command: "cmake".into(),
                args: vec!["-B".into(), "build".into(), "-S".into(), ".".into()],
                cwd: Some(workspace_root.to_path_buf()),
                env: HashMap::new(),
                pre_launch_tasks: vec![],
                debug_adapter: None,
            });
            configs.push(RunConfiguration {
                id: "cmake-run".into(),
                name: format!("Run {}", target),
                language: Language::Cpp,
                command: "cmake".into(),
                args: vec!["--build".into(), "build".into(), "--target".into(), target.clone()],
                cwd: Some(workspace_root.to_path_buf()),
                env: HashMap::new(),
                pre_launch_tasks: vec!["cmake-build".into()],
                debug_adapter: Some(crate::run_config::configuration::DebugAdapterConfig {
                    adapter_type: "lldb".to_string(),
                    executable: Some("lldb".to_string()),
                    args: vec![],
                    env: HashMap::new(),
                }),
            });
        }

        // Makefile-based config
        if is_make {
            configs.push(RunConfiguration {
                id: "make-build".into(),
                name: "Make Build".into(),
                language: Language::Cpp,
                command: "make".into(),
                args: vec![],
                cwd: Some(workspace_root.to_path_buf()),
                env: HashMap::new(),
                pre_launch_tasks: vec![],
                debug_adapter: None,
            });

            if let Some(main_file) = Self::find_main_files(workspace_root).into_iter().next() {
                let binary_name = main_file
                    .trim_end_matches(".cpp")
                    .trim_end_matches(".c")
                    .replace('/', "-");
                configs.push(RunConfiguration {
                    id: "make-run".into(),
                    name: format!("Run {}", binary_name),
                    language: Language::Cpp,
                    command: format!("./{}", binary_name),
                    args: vec![],
                    cwd: Some(workspace_root.to_path_buf()),
                    env: HashMap::new(),
                    pre_launch_tasks: vec!["make-build".into()],
                    debug_adapter: Some(crate::run_config::configuration::DebugAdapterConfig {
                        adapter_type: "lldb".to_string(),
                        executable: Some("lldb".to_string()),
                        args: vec![],
                        env: HashMap::new(),
                    }),
                });
            }
        }

        configs
    }
}
