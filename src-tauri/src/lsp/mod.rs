/// LSP (Language Server Protocol) module
///
/// This module provides integration with language servers for features like:
/// - Code formatting
/// - Completions
/// - Go to definition
/// - Hover information
/// - Document synchronization
///
/// # Architecture
///
/// - `protocol` - JSON-RPC 2.0 message types
/// - `client` - LspClient core (process management, JSON-RPC)
/// - `requests` - LSP request methods (textDocument/*)
/// - `notifications` - LSP notification methods (textDocument/did*)
/// - `helpers` - Text editing utilities
/// - `pool` - Connection pool for managing multiple persistent connections
/// - `commands` - Tauri commands (thin wrappers)
/// - `fallbacks` - Command-line formatter fallbacks (rustfmt, gofmt, etc.)

pub mod protocol;
pub mod client;
pub mod requests;
pub mod notifications;
pub mod helpers;
pub mod pool;
pub mod commands;
pub mod fallbacks;

// Re-export Tauri commands and types needed by main.rs
pub use commands::*;
