//! Debug Commands
//!
//! This module handles debug session operations:
//! - `session` - Start/stop debug sessions, debug actions
//! - `inspection` - Stack traces, variables, scopes, evaluation
//! - `breakpoints` - Add, remove, manage breakpoints
//! - `types` - Shared types and pending breakpoint storage

pub mod types;
pub mod session;
pub mod inspection;
pub mod breakpoints;

pub use types::{DebugAction, AddBreakpointRequest, BreakpointInfo, SetBreakpointsForFileRequest};
pub use session::*;
pub use inspection::*;
pub use breakpoints::*;
