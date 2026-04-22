//! Debug Commands - Types
//!
//! Request/response types for debug session commands

use once_cell::sync::Lazy;
use std::sync::Mutex as StdMutex;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DebugAction {
    Continue,
    StepOver,
    StepInto,
    StepOut,
    Pause,
    Terminate,
}

#[derive(Debug, Clone)]
pub struct PendingBreakpoint {
    pub source_path: String,
    pub line: u32,
    pub condition: Option<String>,
    pub hit_condition: Option<String>,
    pub log_message: Option<String>,
}

static PENDING_BREAKPOINTS: Lazy<StdMutex<Vec<PendingBreakpoint>>> = Lazy::new(|| StdMutex::new(Vec::new()));

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AddBreakpointRequest {
    pub source_path: String,
    pub line: u32,
    pub condition: Option<String>,
    pub hit_condition: Option<String>,
    pub log_message: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BreakpointInfo {
    pub id: u32,
    pub source_path: String,
    pub line: u32,
    pub enabled: bool,
    pub verified: bool,
    pub condition: Option<String>,
    pub hit_condition: Option<String>,
    pub log_message: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SetBreakpointsForFileRequest {
    pub source_path: String,
    pub breakpoints: Vec<BreakpointInfo>,
}

pub fn get_pending_breakpoints() -> Vec<PendingBreakpoint> {
    PENDING_BREAKPOINTS.lock().unwrap().clone()
}

pub fn push_pending_breakpoint(bp: PendingBreakpoint) {
    PENDING_BREAKPOINTS.lock().unwrap().push(bp);
}

pub fn clear_pending_breakpoints() {
    PENDING_BREAKPOINTS.lock().unwrap().clear();
}
