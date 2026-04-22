//! Go Adapter - Execution Control
//!
//! Handles thread execution: continue, step, pause, stack traces, variables, evaluation

use crate::dap::types::{StackFrame, Scope, Variable, Thread};
use super::lifecycle::GoLifecycle;

pub(super) struct GoExecution<'a> {
    lifecycle: &'a mut GoLifecycle,
}

impl<'a> GoExecution<'a> {
    pub(super) fn new(lifecycle: &'a mut GoLifecycle) -> Self {
        Self { lifecycle }
    }

    pub(super) fn continue_execution(&mut self, thread_id: i64) -> Result<(), String> {
        self.lifecycle.get_connection_mut().send_request("continue", Some(serde_json::json!({
            "threadId": thread_id,
        })))?;
        Ok(())
    }

    pub(super) fn step_over(&mut self, thread_id: i64) -> Result<(), String> {
        self.lifecycle.get_connection_mut().send_request("next", Some(serde_json::json!({
            "threadId": thread_id,
        })))?;
        Ok(())
    }

    pub(super) fn step_into(&mut self, thread_id: i64) -> Result<(), String> {
        self.lifecycle.get_connection_mut().send_request("stepIn", Some(serde_json::json!({
            "threadId": thread_id,
            "targetId": null,
            "granularity": "statement"
        })))?;
        Ok(())
    }

    pub(super) fn step_out(&mut self, thread_id: i64) -> Result<(), String> {
        self.lifecycle.get_connection_mut().send_request("stepOut", Some(serde_json::json!({
            "threadId": thread_id,
        })))?;
        Ok(())
    }

    pub(super) fn pause(&mut self, thread_id: i64) -> Result<(), String> {
        self.lifecycle.get_connection_mut().send_request("pause", Some(serde_json::json!({
            "threadId": thread_id,
        })))?;
        Ok(())
    }

    pub(super) fn stack_trace(&mut self, thread_id: i64) -> Result<Vec<StackFrame>, String> {
        let response = self.lifecycle.get_connection_mut().send_request("stackTrace", Some(serde_json::json!({
            "threadId": thread_id,
        })))?;

        let body = response.body.ok_or_else(|| "No body in response".to_string())?;
        let frames = body.get("stackFrames")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "No stack frames in response".to_string())?;

        let result: Vec<StackFrame> = frames.iter().filter_map(|frame| {
            serde_json::from_value(frame.clone()).ok()
        }).collect();

        Ok(result)
    }

    pub(super) fn scopes(&mut self, frame_id: i64) -> Result<Vec<Scope>, String> {
        let response = self.lifecycle.get_connection_mut().send_request("scopes", Some(serde_json::json!({
            "frameId": frame_id,
        })))?;

        let body = response.body.ok_or_else(|| "No body in response".to_string())?;
        let scopes = body.get("scopes")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "No scopes in response".to_string())?;

        let result: Vec<Scope> = scopes.iter().filter_map(|scope| {
            serde_json::from_value(scope.clone()).ok()
        }).collect();

        Ok(result)
    }

    pub(super) fn variables(&mut self, variables_reference: i64) -> Result<Vec<Variable>, String> {
        let response = self.lifecycle.get_connection_mut().send_request("variables", Some(serde_json::json!({
            "variablesReference": variables_reference,
        })))?;

        let body = response.body.ok_or_else(|| "No body in response".to_string())?;
        let variables = body.get("variables")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "No variables in response".to_string())?;

        let result: Vec<Variable> = variables.iter().filter_map(|var| {
            serde_json::from_value(var.clone()).ok()
        }).collect();

        Ok(result)
    }

    pub(super) fn evaluate(&mut self, expression: &str, frame_id: Option<i64>) -> Result<Variable, String> {
        let mut args = serde_json::json!({
            "expression": expression,
            "context": "repl",
        });

        if let Some(fid) = frame_id {
            args["frameId"] = serde_json::json!(fid);
        }

        let response = self.lifecycle.get_connection_mut().send_request("evaluate", Some(args))?;

        let body = response.body.ok_or_else(|| "No body in response".to_string())?;
        serde_json::from_value(body.clone())
            .map_err(|e| format!("Failed to parse evaluate result: {}", e))
    }

    pub(super) fn threads(&mut self) -> Result<Vec<Thread>, String> {
        let response = self.lifecycle.get_connection_mut().send_request("threads", None)?;

        let body = response.body.ok_or_else(|| "No body in response".to_string())?;
        let threads = body.get("threads")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "No threads in response".to_string())?;

        let result: Vec<Thread> = threads.iter().filter_map(|thread| {
            serde_json::from_value(thread.clone()).ok()
        }).collect();

        Ok(result)
    }
}
