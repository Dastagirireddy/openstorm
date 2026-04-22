mod rust;
mod javascript;
mod python;
mod go;
mod cpp;

pub use rust::RustDetector;
pub use javascript::JavaScriptDetector;
pub use python::PythonDetector;
pub use go::GoDetector;
pub use cpp::CppDetector;

use crate::run_config::configuration::{Language, RunConfiguration};
use std::path::Path;

pub trait LanguageDetector: Send + Sync {
    fn detect(&self, workspace_root: &Path) -> Vec<RunConfiguration>;
}

pub fn get_detector_for_language(language: &Language) -> Box<dyn LanguageDetector> {
    match language {
        Language::Rust => Box::new(RustDetector),
        Language::JavaScript => Box::new(JavaScriptDetector),
        Language::TypeScript => Box::new(JavaScriptDetector),
        Language::Python => Box::new(PythonDetector),
        Language::Go => Box::new(GoDetector),
        Language::Cpp => Box::new(CppDetector),
        Language::Unknown => Box::new(UnknownDetector),
    }
}

struct UnknownDetector;
impl LanguageDetector for UnknownDetector {
    fn detect(&self, _workspace_root: &Path) -> Vec<RunConfiguration> {
        Vec::new()
    }
}
