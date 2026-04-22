//! Adapter Registry - Plugin-ready adapter registration and discovery
//!
//! This module provides a registry pattern for debug adapters, allowing:
//! - Dynamic adapter registration (future plugin support)
//! - Language-to-adapter mapping
//! - Adapter metadata discovery

use crate::dap::adapter::DebugAdapter;
use std::collections::HashMap;

/// Factory function type for creating adapters
pub type AdapterFactory = Box<dyn Fn() -> Box<dyn DebugAdapter> + Send + Sync>;

/// Metadata about a registered adapter
pub struct AdapterDescriptor {
    /// Unique identifier for the adapter (e.g., "lldb", "js-debug", "delve")
    pub id: String,
    /// Human-readable name (e.g., "LLDB Debugger", "JavaScript Debugger")
    pub name: String,
    /// Languages this adapter supports (e.g., ["rust", "cpp"], ["javascript", "typescript"])
    pub languages: Vec<String>,
    /// Factory function to create new instances of this adapter
    pub factory: AdapterFactory,
}

// Manual Debug implementation since factory doesn't implement Debug
impl std::fmt::Debug for AdapterDescriptor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AdapterDescriptor")
            .field("id", &self.id)
            .field("name", &self.name)
            .field("languages", &self.languages)
            .finish()
    }
}

/// Registry for debug adapters
///
/// The registry allows adapters to be registered and looked up by ID or language.
/// This is the foundation for a plugin system where third-party adapters can be
/// discovered and loaded at runtime.
pub struct AdapterRegistry {
    /// Adapters indexed by their ID
    adapters: HashMap<String, AdapterDescriptor>,
    /// Cache of language -> adapter ID mappings
    language_map: HashMap<String, String>,
}

impl AdapterRegistry {
    /// Create a new empty registry
    pub fn new() -> Self {
        Self {
            adapters: HashMap::new(),
            language_map: HashMap::new(),
        }
    }

    /// Register a new adapter
    ///
    /// # Arguments
    /// * `id` - Unique identifier for the adapter
    /// * `name` - Human-readable name
    /// * `languages` - List of language IDs this adapter supports
    /// * `factory` - Factory function to create adapter instances
    pub fn register<F>(&mut self, id: &str, name: &str, languages: &[&str], factory: F)
    where
        F: Fn() -> Box<dyn DebugAdapter> + Send + Sync + 'static,
    {
        let descriptor = AdapterDescriptor {
            id: id.to_string(),
            name: name.to_string(),
            languages: languages.iter().map(|s| s.to_string()).collect(),
            factory: Box::new(factory),
        };

        // Register adapter (clone languages for language_map)
        let languages_clone = descriptor.languages.clone();
        self.adapters.insert(id.to_string(), descriptor);

        // Update language map
        for lang in languages_clone {
            self.language_map.insert(lang, id.to_string());
        }
    }

    /// Create an adapter instance by ID
    pub fn create(&self, id: &str) -> Option<Box<dyn DebugAdapter>> {
        self.adapters.get(id).map(|desc| (desc.factory)())
    }

    /// Get an adapter for a specific language
    pub fn for_language(&self, language: &str) -> Option<Box<dyn DebugAdapter>> {
        self.language_map.get(language).and_then(|id| {
            self.adapters.get(id).map(|desc| (desc.factory)())
        })
    }

}

impl Default for AdapterRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// Global registry instance
use once_cell::sync::Lazy;

static GLOBAL_REGISTRY: Lazy<AdapterRegistry> = Lazy::new(|| {
    let mut registry = AdapterRegistry::new();

    // Register built-in adapters
    registry.register(
        "lldb",
        "LLDB Debugger",
        &["rust", "cpp", "c"],
        || Box::new(crate::dap::adapters::LldbAdapter::new()),
    );

    registry.register(
        "js-debug",
        "JavaScript Debugger",
        &["javascript", "typescript"],
        || Box::new(crate::dap::adapters::JsDebugAdapter::new()),
    );

    registry.register(
        "delve",
        "Delve Debugger",
        &["go"],
        || Box::new(crate::dap::adapters::GoAdapter::new()),
    );

    registry
});

/// Get the global adapter registry
pub fn get_registry() -> &'static AdapterRegistry {
    &GLOBAL_REGISTRY
}

/// Create an adapter by ID using the global registry
pub fn create_adapter(id: &str) -> Option<Box<dyn DebugAdapter>> {
    get_registry().create(id)
}

/// Create an adapter for a language using the global registry
pub fn create_adapter_for_language(language: &str) -> Option<Box<dyn DebugAdapter>> {
    get_registry().for_language(language)
}
