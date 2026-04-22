/// LSP Connection Pool
///
/// Manages persistent connections to language servers for intellisense features.

use super::client::LspClient;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Connection pool for LSP servers - maintains persistent connections for intellisense
pub struct LspConnectionPool {
    connections: HashMap<String, LspClient>,
    root_path: String,
}

impl LspConnectionPool {
    pub fn new(root_path: String) -> Self {
        LspConnectionPool {
            connections: HashMap::new(),
            root_path,
        }
    }

    /// Get or create a connection for a language
    pub fn get_or_create(&mut self, language_id: &str) -> Result<&mut LspClient, String> {
        if !self.connections.contains_key(language_id) {
            let (server, args) = get_server_for_language(language_id)
                .ok_or_else(|| {
                    format!("No LSP server configured for language: {}. Install the language server for intellisense features.", language_id)
                })?;

            let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            let mut client = LspClient::new(&server, &args_ref)?;
            client.initialize(&self.root_path)?;

            self.connections.insert(language_id.to_string(), client);
        }

        Ok(self.connections.get_mut(language_id).unwrap())
    }
}

impl Drop for LspConnectionPool {
    fn drop(&mut self) {
        for (lang, client) in &mut self.connections {
            eprintln!("[LSP Pool] Shutting down {} server", lang);
            let _ = client.send_notification("exit", serde_json::json!({}));
        }
    }
}

// Global connection pool - wrapped in Arc<Mutex> for thread safety
static mut CONNECTION_POOL: Option<Arc<Mutex<LspConnectionPool>>> = None;

/// Initialize the global connection pool
pub fn init_connection_pool(root_path: String) {
    unsafe {
        CONNECTION_POOL = Some(Arc::new(Mutex::new(LspConnectionPool::new(root_path))));
    }
}

/// Get the global connection pool
#[allow(static_mut_refs)]
pub fn get_pool() -> Option<Arc<Mutex<LspConnectionPool>>> {
    unsafe { CONNECTION_POOL.clone() }
}

/// Get the LSP server command and arguments for a language
/// Returns (binary_path, args) - checks cached install first, then system PATH
pub fn get_server_for_language(language_id: &str) -> Option<(String, Vec<String>)> {
    // First check if we have a cached/downloaded version
    if let Some(config) = crate::lsp_installer::get_server_config(language_id) {
        if crate::lsp_installer::is_server_installed_cached(&config) {
            let path = crate::lsp_installer::get_binary_path(&config);
            eprintln!("[LSP] Found cached {} server at {:?}", language_id, path);
            // Use appropriate args based on language
            let args = match language_id {
                "rust" => vec![], // rust-analyzer runs in LSP mode by default
                "typescript" | "javascript" => vec!["--stdio".to_string()],
                "python" => vec![], // pyright uses --stdio by default when run directly
                _ => vec![],
            };
            return Some((path.to_string_lossy().to_string(), args));
        } else {
            eprintln!("[LSP] {} server not installed in cache", language_id);
        }
    }

    // Fall back to system PATH
    let result = match language_id {
        "rust" => Some(("rust-analyzer".to_string(), vec![])), // rust-analyzer runs in LSP mode by default
        "go" => Some(("gopls".to_string(), vec![])),
        "python" => Some(("pyright".to_string(), vec!["--stdio".to_string()])),
        "cpp" | "c" => Some(("clangd".to_string(), vec![])),
        "typescript" | "javascript" => Some(("typescript-language-server".to_string(), vec!["--stdio".to_string()])),
        _ => None,
    };

    if let Some((ref binary, _)) = result {
        use std::env;

        let path = env::var_os("PATH").unwrap_or_default();
        let binary_exists = env::split_paths(&path).any(|dir| {
            let full_path = dir.join(binary);
            full_path.exists() || full_path.with_extension("exe").exists()
        });

        if !binary_exists {
            return None;
        }
    }

    result
}
