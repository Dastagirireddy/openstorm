//! Debug Adapter trait and implementations
//!
//! This module defines the DebugAdapter trait that all debug adapters must implement.
//! Concrete adapter implementations live in the `adapters` subdirectory.

// Re-export types for adapters
pub use super::types::{LaunchRequestArgs, Capabilities, SetBreakpointsArgs, StackFrame, Variable, Thread, Scope};
pub use super::connection::{DapConnection, DapEvent, DapMessage, Breakpoint};

/// The DebugAdapter trait defines the interface for all debug adapters.
/// Each adapter (LLDB, Delve, js-debug, etc.) implements this trait.
pub trait DebugAdapter: Send + Sync {
    fn name(&self) -> &'static str;
    fn start(&mut self, args: &LaunchRequestArgs) -> Result<(), String>;
    fn initialize(&mut self) -> Result<Capabilities, String>;
    fn launch(&mut self, args: &LaunchRequestArgs) -> Result<(), String>;
    fn finalize_launch(&mut self) -> Result<(), String>;
    fn set_breakpoints(&mut self, args: &SetBreakpointsArgs) -> Result<Vec<Breakpoint>, String>;
    fn continue_execution(&mut self, thread_id: i64) -> Result<(), String>;
    fn step_over(&mut self, thread_id: i64) -> Result<(), String>;
    fn step_into(&mut self, thread_id: i64) -> Result<(), String>;
    fn step_out(&mut self, thread_id: i64) -> Result<(), String>;
    fn pause(&mut self, thread_id: i64) -> Result<(), String>;
    fn stack_trace(&mut self, thread_id: i64) -> Result<Vec<StackFrame>, String>;
    fn scopes(&mut self, frame_id: i64) -> Result<Vec<Scope>, String>;
    fn variables(&mut self, variables_reference: i64) -> Result<Vec<Variable>, String>;
    fn evaluate(&mut self, expression: &str, frame_id: Option<i64>) -> Result<Variable, String>;
    fn threads(&mut self) -> Result<Vec<Thread>, String>;
    fn terminate(&mut self) -> Result<(), String>;
    fn poll_events(&mut self) -> Vec<DapEvent>;
    fn get_exception_breakpoint_filters(&mut self) -> Vec<crate::dap::ExceptionBreakpointFilter>;
    fn set_exception_breakpoints(&mut self, filter_ids: Vec<String>) -> Result<(), String>;
}
