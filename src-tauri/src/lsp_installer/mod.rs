/// LSP Server Installer
///
/// Downloads and installs language servers from various sources:
/// - GitHub releases (pre-built binaries)
/// - npm packages (Node.js-based servers like typescript-language-server, pyright)
/// - Go toolchain (go install for servers like gopls)
///
/// # Architecture
///
/// - `config` - LspServerConfig and server configuration lookup
/// - `installer` - Main entry point and shared utilities
/// - `github` - GitHub release downloads
/// - `npm` - npm package installation
/// - `go` - Go toolchain installation

pub mod config;
pub mod installer;
pub mod github;
pub mod npm;
pub mod go;

// Re-export public API
pub use config::{get_server_config, get_binary_path};
pub use installer::{is_server_installed_cached, is_server_installed, install_server};
