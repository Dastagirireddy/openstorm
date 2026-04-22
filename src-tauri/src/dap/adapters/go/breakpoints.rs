//! Go Adapter - Breakpoint Management
//!
//! Handles breakpoint operations: set, update, exception breakpoints

use crate::dap::adapter::Breakpoint;
use crate::dap::types::SetBreakpointsArgs;
use crate::dap::ExceptionBreakpointFilter;
use super::lifecycle::GoLifecycle;

pub(super) struct GoBreakpoints<'a> {
    lifecycle: &'a mut GoLifecycle,
}

impl<'a> GoBreakpoints<'a> {
    pub(super) fn new(lifecycle: &'a mut GoLifecycle) -> Self {
        Self { lifecycle }
    }

    pub(super) fn set_breakpoints(&mut self, args: &SetBreakpointsArgs) -> Result<Vec<Breakpoint>, String> {
        let response = self.lifecycle.get_connection_mut().send_request("setBreakpoints", Some(serde_json::json!({
            "source": args.source,
            "breakpoints": args.breakpoints,
        })))?;

        let body = response.body.ok_or_else(|| "No body in response".to_string())?;
        let breakpoints = body.get("breakpoints")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "No breakpoints in response".to_string())?;

        let result: Vec<Breakpoint> = breakpoints.iter().filter_map(|bp| {
            serde_json::from_value(bp.clone()).ok()
        }).collect();

        Ok(result)
    }

    pub(super) fn get_exception_breakpoint_filters(&mut self) -> Vec<ExceptionBreakpointFilter> {
        vec![
            ExceptionBreakpointFilter {
                filter_id: "panic".to_string(),
                label: "Go Panic".to_string(),
                description: Some("Break when panic occurs".to_string()),
                default: Some(false),
                condition: None,
            },
        ]
    }

    pub(super) fn set_exception_breakpoints(&mut self, filter_ids: Vec<String>) -> Result<(), String> {
        let filters: Vec<serde_json::Value> = filter_ids.iter().map(|id| {
            serde_json::json!({
                "filterId": id,
            })
        }).collect();

        let _response = self.lifecycle.get_connection_mut().send_request("setExceptionBreakpoints", Some(serde_json::json!({
            "filters": filters
        })))?;
        Ok(())
    }
}
