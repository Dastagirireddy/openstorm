//! Go Debug Adapter (Delve)
//!
//! Modular structure:
//! - `lifecycle` - Session lifecycle (start, initialize, launch, terminate)
//! - `execution` - Thread control (continue, step, pause, stack traces)
//! - `breakpoints` - Breakpoint management

mod lifecycle;
mod execution;
mod breakpoints;

use crate::dap::adapter::{DebugAdapter, Breakpoint, DapEvent};
use crate::dap::types::{Capabilities, LaunchRequestArgs, SetBreakpointsArgs, StackFrame, Scope, Variable, Thread};
use crate::dap::ExceptionBreakpointFilter;

use lifecycle::GoLifecycle;
use execution::GoExecution;
use breakpoints::GoBreakpoints;

pub struct GoAdapter {
    lifecycle: GoLifecycle,
    initialized: bool,
}

impl GoAdapter {
    pub fn new() -> Self {
        Self {
            lifecycle: GoLifecycle::new(),
            initialized: false,
        }
    }
}

impl DebugAdapter for GoAdapter {
    fn name(&self) -> &'static str {
        "delve"
    }

    fn start(&mut self, args: &LaunchRequestArgs) -> Result<(), String> {
        self.lifecycle.start(args)
    }

    fn initialize(&mut self) -> Result<Capabilities, String> {
        let result = self.lifecycle.initialize();
        if result.is_ok() {
            self.initialized = true;
        }
        result
    }

    fn launch(&mut self, args: &LaunchRequestArgs) -> Result<(), String> {
        self.lifecycle.launch(args)
    }

    fn finalize_launch(&mut self) -> Result<(), String> {
        self.lifecycle.finalize_launch()
    }

    fn set_breakpoints(&mut self, args: &SetBreakpointsArgs) -> Result<Vec<Breakpoint>, String> {
        GoBreakpoints::new(&mut self.lifecycle).set_breakpoints(args)
    }

    fn continue_execution(&mut self, thread_id: i64) -> Result<(), String> {
        GoExecution::new(&mut self.lifecycle).continue_execution(thread_id)
    }

    fn step_over(&mut self, thread_id: i64) -> Result<(), String> {
        GoExecution::new(&mut self.lifecycle).step_over(thread_id)
    }

    fn step_into(&mut self, thread_id: i64) -> Result<(), String> {
        GoExecution::new(&mut self.lifecycle).step_into(thread_id)
    }

    fn step_out(&mut self, thread_id: i64) -> Result<(), String> {
        GoExecution::new(&mut self.lifecycle).step_out(thread_id)
    }

    fn pause(&mut self, thread_id: i64) -> Result<(), String> {
        GoExecution::new(&mut self.lifecycle).pause(thread_id)
    }

    fn stack_trace(&mut self, thread_id: i64) -> Result<Vec<StackFrame>, String> {
        GoExecution::new(&mut self.lifecycle).stack_trace(thread_id)
    }

    fn scopes(&mut self, frame_id: i64) -> Result<Vec<Scope>, String> {
        GoExecution::new(&mut self.lifecycle).scopes(frame_id)
    }

    fn variables(&mut self, variables_reference: i64) -> Result<Vec<Variable>, String> {
        GoExecution::new(&mut self.lifecycle).variables(variables_reference)
    }

    fn evaluate(&mut self, expression: &str, frame_id: Option<i64>) -> Result<Variable, String> {
        GoExecution::new(&mut self.lifecycle).evaluate(expression, frame_id)
    }

    fn threads(&mut self) -> Result<Vec<Thread>, String> {
        GoExecution::new(&mut self.lifecycle).threads()
    }

    fn terminate(&mut self) -> Result<(), String> {
        self.initialized = false;
        self.lifecycle.terminate()
    }

    fn poll_events(&mut self) -> Vec<DapEvent> {
        self.lifecycle.get_connection_mut().poll_events()
    }

    fn get_exception_breakpoint_filters(&mut self) -> Vec<ExceptionBreakpointFilter> {
        GoBreakpoints::new(&mut self.lifecycle).get_exception_breakpoint_filters()
    }

    fn set_exception_breakpoints(&mut self, filter_ids: Vec<String>) -> Result<(), String> {
        GoBreakpoints::new(&mut self.lifecycle).set_exception_breakpoints(filter_ids)
    }
}
