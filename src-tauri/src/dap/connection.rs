//! DAP Connection - Re-exports
//!
//! This module now re-exports from split modules:
//! - `transport` - Connection struct and transport layer
//! - `methods` - DAP protocol method implementations
//! - `protocol` - Protocol types (Breakpoint, DapEvent, DapMessage)

pub use super::transport::{DapConnection, DapMessage};
pub use super::protocol::{Breakpoint, DapEvent};
