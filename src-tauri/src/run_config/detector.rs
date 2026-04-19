use crate::run_config::configuration::{Language, RunConfiguration};
use crate::run_config::languages::get_detector_for_language;
use std::path::{Path, PathBuf};

pub struct RunConfigurationDetector {
    workspace_root: PathBuf,
}

impl RunConfigurationDetector {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }

    pub fn detect(&self) -> Vec<RunConfiguration> {
        let mut all_configs = Vec::new();

        // Detect by project files first
        for entry in std::fs::read_dir(&self.workspace_root).ok().into_iter().flatten() {
            if let Ok(entry) = entry {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if let Some(language) = Language::from_project_file(&file_name) {
                    let detector = get_detector_for_language(&language);
                    let mut configs = detector.detect(&self.workspace_root);
                    all_configs.append(&mut configs);
                }
            }
        }

        // If no project files found, try detecting from source files
        if all_configs.is_empty() {
            for lang in &[Language::Rust, Language::JavaScript, Language::Python, Language::Go, Language::Cpp] {
                let detector = get_detector_for_language(lang);
                let mut configs = detector.detect(&self.workspace_root);
                if !configs.is_empty() {
                    all_configs.append(&mut configs);
                    break;
                }
            }
        }

        // Deduplicate by name
        let mut seen = std::collections::HashSet::new();
        all_configs.retain(|c| seen.insert(c.name.clone()));

        all_configs
    }

    pub fn detect_for_language(&self, language: &Language) -> Vec<RunConfiguration> {
        let detector = get_detector_for_language(language);
        detector.detect(&self.workspace_root)
    }

    pub fn detect_from_file(&self, file_path: &Path) -> Option<RunConfiguration> {
        let language = crate::run_config::languages::detect_language_from_path(file_path)?;
        let detector = get_detector_for_language(&language);
        let configs = detector.detect(&self.workspace_root);
        configs.into_iter().next()
    }

    pub fn workspace_root(&self) -> &Path {
        &self.workspace_root
    }
}
