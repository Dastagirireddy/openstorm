/// DAP Protocol Types
///
/// JSON-RPC protocol types for the Debug Adapter Protocol.

use serde::{Deserialize, Serialize};

pub use super::types::Source;

/// DAP Breakpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Breakpoint {
    pub id: Option<i32>,
    pub verified: bool,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub source: Option<Source>,
    pub message: Option<String>,
}

/// DAP Event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DapEvent {
    #[serde(rename = "event")]
    pub event: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<serde_json::Value>,
}

/// DAP Message (response or event)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DapMessage {
    Response(super::types::Response),
    Event(DapEvent),
}
