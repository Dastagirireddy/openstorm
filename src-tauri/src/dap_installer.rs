//! DAP Installer - Debug Adapter Installation
//!
//! This module handles installation of debug adapters:
//! - LLDB (Rust, C, C++)
//! - Delve (Go)
//! - vscode-js-debug (JavaScript, TypeScript)
//! - debugpy (Python)
//!
//! # Architecture
//!
//! - `types` - AdapterInfo, AdapterInstallResult, AdapterInfoResponse
//! - `registry` - AdapterRegistry for adapter metadata
//! - `installers` - Per-adapter installation logic
//! - `installer` - Main DebugAdapterInstaller

pub mod types;
pub mod registry;
pub mod installers;
pub mod installer;

pub use types::{AdapterInfo, AdapterInstallResult, AdapterInfoResponse};
pub use registry::AdapterRegistry;
pub use installer::DebugAdapterInstaller;
pub use installers::find_binary;
