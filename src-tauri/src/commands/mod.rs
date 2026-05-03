//! Command modules - IPC handlers for Tauri
//!
//! This module splits commands into logical submodules for better maintainability:
//! - file: File operations (read, write, create, delete, rename)
//! - directory: Directory operations (list, search)
//! - run: Run configuration and process management
//! - debug: Debug session management (DAP)
//! - adapter: Debug adapter installation
//! - watch: Watch expressions and exception breakpoints
//! - git: Git operations (status, branch, commit, remote, log)
//! - database: Database connection management

pub mod file;
pub mod directory;
pub mod run;
pub mod debug;
pub mod adapter;
pub mod watch;
pub mod git;
pub mod database;
pub mod introspection;

// Re-export commonly used types
pub use watch::WatchExpressionResult;
pub use debug::*;
