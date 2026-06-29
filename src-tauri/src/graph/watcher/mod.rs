pub mod file_change;

use std::path::Path;

use crate::graph::errors::GraphResult;
use crate::graph::extractor::registry::ExtractorRegistry;
use crate::graph::extractor::ExtractResult;
use crate::graph::store::GraphStore;

use super::extractor::rust::RustExtractor;
use super::extractor::typescript::TypeScriptExtractor;
use super::extractor::python::PythonExtractor;
use super::extractor::go::GoExtractor;

pub struct GraphWatcher {
    registry: ExtractorRegistry,
}

impl GraphWatcher {
    pub fn new() -> Self {
        let mut registry = ExtractorRegistry::new();
        registry.register(RustExtractor::create());
        registry.register(TypeScriptExtractor::create());
        registry.register(PythonExtractor::create());
        registry.register(GoExtractor::create());

        Self { registry }
    }

    pub fn on_file_changed(&self, store: &GraphStore, path: &Path, content: &str) -> GraphResult<()> {
        file_change::handle_change(store, &self.registry, path, content)
    }

    pub fn on_file_deleted(&self, store: &GraphStore, path: &Path) -> GraphResult<()> {
        file_change::handle_deletion(store, path)
    }

    pub fn extract_file(&self, path: &str, content: &str) -> ExtractResult {
        self.registry.extract(path, content)
    }

    pub fn registry(&self) -> &ExtractorRegistry {
        &self.registry
    }
}
