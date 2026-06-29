use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use super::{ExtractResult, LanguageExtractor};

pub struct ExtractorRegistry {
    extractors: HashMap<String, Arc<dyn LanguageExtractor>>,
}

impl ExtractorRegistry {
    pub fn new() -> Self {
        Self {
            extractors: HashMap::new(),
        }
    }

    pub fn register(&mut self, extractor: Arc<dyn LanguageExtractor>) {
        for ext in extractor.extensions() {
            self.extractors.insert(ext.to_string(), extractor.clone());
        }
    }

    pub fn get_for_file(&self, file_path: &str) -> Option<&Arc<dyn LanguageExtractor>> {
        let ext = Path::new(file_path)
            .extension()?
            .to_str()?;
        self.extractors.get(ext)
    }

    pub fn extract(&self, file_path: &str, content: &str) -> ExtractResult {
        match self.get_for_file(file_path) {
            Some(extractor) => extractor.extract(file_path, content),
            None => ExtractResult {
                nodes: Vec::new(),
                edges: Vec::new(),
            },
        }
    }

    pub fn supported_extensions(&self) -> Vec<&str> {
        self.extractors.keys().map(|s| s.as_str()).collect()
    }

    pub fn is_supported(&self, file_path: &str) -> bool {
        self.get_for_file(file_path).is_some()
    }
}

impl Default for ExtractorRegistry {
    fn default() -> Self {
        Self::new()
    }
}
