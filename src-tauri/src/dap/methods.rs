//! DAP Protocol Methods - Debug Adapter Protocol request implementations
//!
//! This module handles DAP protocol requests:
//! - Breakpoint management
//! - Thread control (continue, step, pause)
//! - Stack traces, variables, evaluation
//! - Event polling

use super::types::*;
use super::protocol::{Breakpoint, DapEvent};
use super::transport::{DapConnection, DapMessage};
use serde::Serialize;
use std::io::Write;

impl DapConnection {
    fn next_seq(&mut self) -> u32 {
        self.seq += 1;
        self.seq
    }

    fn send_message<T: Serialize>(&mut self, message: &T) -> Result<(), String> {
        let json = serde_json::to_string(message).map_err(|e| format!("Failed to serialize: {}", e))?;
        let content = format!("Content-Length: {}\r\n\r\n{}", json.len(), json);

        if let Some(tcp_stream) = &mut self.tcp_stream {
            tcp_stream.write_all(content.as_bytes()).map_err(|e| format!("Failed to write: {}", e))?;
            tcp_stream.flush().map_err(|e| format!("Failed to flush: {}", e))?;
        } else if let Some(stdin) = &mut self.stdin {
            stdin.write_all(content.as_bytes()).map_err(|e| format!("Failed to write: {}", e))?;
            stdin.flush().map_err(|e| format!("Failed to flush: {}", e))?;
        } else {
            return Err("No output stream available".to_string());
        }
        Ok(())
    }

    pub fn send_request_no_wait(&mut self, command: &str, arguments: Option<serde_json::Value>) -> Result<u32, String> {
        let seq = self.next_seq();
        let request = Request {
            seq,
            message_type: "request".to_string(),
            command: command.to_string(),
            arguments: arguments.clone(),
        };

        self.send_message(&request)?;
        Ok(seq)
    }

    pub fn send_request(&mut self, command: &str, arguments: Option<serde_json::Value>) -> Result<Response, String> {
        let seq = self.next_seq();
        let request = Request {
            seq,
            message_type: "request".to_string(),
            command: command.to_string(),
            arguments: arguments.clone(),
        };

        self.send_message(&request)?;

        let timeout = if command == "launch" {
            std::time::Duration::from_secs(120)
        } else {
            std::time::Duration::from_secs(60)
        };

        let start = std::time::Instant::now();
        loop {
            if start.elapsed() > timeout {
                return Err(format!("Timeout waiting for response to '{}'", command));
            }

            if let Ok(mut buffer) = self.message_buffer.lock() {
                if let Some(pos) = buffer.iter().position(|msg| {
                    matches!(msg, DapMessage::Response(r) if r.request_seq == seq)
                }) {
                    if let DapMessage::Response(response) = buffer.remove(pos) {
                        let remaining: Vec<DapMessage> = buffer.drain(..).collect();
                        for msg in remaining {
                            match msg {
                                DapMessage::Event(e) => self.event_buffer.push(e),
                                DapMessage::Response(r) => {
                                    self.event_buffer.push(DapEvent {
                                        event: "response".to_string(),
                                        body: Some(serde_json::json!({
                                            "seq": r.seq,
                                            "request_seq": r.request_seq,
                                            "command": r.command,
                                            "success": r.success,
                                            "body": r.body
                                        })),
                                    });
                                }
                            }
                        }
                        return Ok(response);
                    }
                }
            }

            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }

    pub fn poll_events(&mut self) -> Vec<DapEvent> {
        let mut events = std::mem::take(&mut self.event_buffer);

        if let Ok(mut buffer) = self.message_buffer.lock() {
            for msg in buffer.drain(..) {
                match msg {
                    DapMessage::Event(e) => events.push(e),
                    DapMessage::Response(r) => {
                        events.push(DapEvent {
                            event: "response".to_string(),
                            body: Some(serde_json::json!({
                                "seq": r.seq,
                                "request_seq": r.request_seq,
                                "command": r.command,
                                "success": r.success,
                                "body": r.body
                            })),
                        });
                    }
                }
            }
        }

        events
    }

    pub fn set_breakpoints(&mut self, args: &SetBreakpointsArgs) -> Result<Vec<Breakpoint>, String> {
        let json_args = serde_json::to_value(args).map_err(|e| e.to_string())?;
        let response = self.send_request("setBreakpoints", Some(json_args))?;
        let body = response.body.ok_or("No body in response")?;
        let breakpoints: Vec<Breakpoint> = serde_json::from_value(
            body.get("breakpoints").ok_or("No breakpoints in body")?.clone()
        ).map_err(|e| format!("Failed to parse breakpoints: {}", e))?;
        Ok(breakpoints)
    }

    pub fn continue_execution(&mut self, thread_id: i64) -> Result<(), String> {
        let _response = self.send_request("continue", Some(serde_json::json!({
            "threadId": thread_id
        })))?;
        Ok(())
    }

    pub fn step_over(&mut self, thread_id: i64) -> Result<(), String> {
        let _response = self.send_request("next", Some(serde_json::json!({
            "threadId": thread_id
        })))?;
        Ok(())
    }

    pub fn step_into(&mut self, thread_id: i64) -> Result<(), String> {
        let _response = self.send_request("stepIn", Some(serde_json::json!({
            "threadId": thread_id
        })))?;
        Ok(())
    }

    pub fn step_out(&mut self, thread_id: i64) -> Result<(), String> {
        let _response = self.send_request("stepOut", Some(serde_json::json!({
            "threadId": thread_id
        })))?;
        Ok(())
    }

    pub fn pause(&mut self, thread_id: i64) -> Result<(), String> {
        let _response = self.send_request("pause", Some(serde_json::json!({
            "threadId": thread_id
        })))?;
        Ok(())
    }

    pub fn stack_trace(&mut self, thread_id: i64) -> Result<Vec<StackFrame>, String> {
        let response = self.send_request("stackTrace", Some(serde_json::json!({
            "threadId": thread_id
        })))?;
        let body = response.body.ok_or("No body in response")?;
        let stack_frames: Vec<StackFrame> = serde_json::from_value(
            body.get("stackFrames").ok_or("No stackFrames in body")?.clone()
        ).map_err(|e| format!("Failed to parse stack frames: {}", e))?;
        Ok(stack_frames)
    }

    pub fn variables(&mut self, variables_reference: i64) -> Result<Vec<Variable>, String> {
        let response = self.send_request("variables", Some(serde_json::json!({
            "variablesReference": variables_reference
        })))?;
        let body = response.body.ok_or("No body in response")?;
        let variables: Vec<Variable> = serde_json::from_value(
            body.get("variables").ok_or("No variables in body")?.clone()
        ).map_err(|e| format!("Failed to parse variables: {}", e))?;
        Ok(variables)
    }

    pub fn evaluate(&mut self, expression: &str, frame_id: Option<i64>) -> Result<Variable, String> {
        let response = self.send_request("evaluate", Some(serde_json::json!({
            "expression": expression,
            "frameId": frame_id
        })))?;
        let body = response.body.ok_or("No body in response")?;
        let variable: Variable = serde_json::from_value(body.clone())
            .map_err(|e| format!("Failed to parse evaluation result: {}", e))?;
        Ok(variable)
    }

    pub fn threads(&mut self) -> Result<Vec<Thread>, String> {
        let response = self.send_request("threads", None)?;
        let body = response.body.ok_or("No body in response")?;
        let threads: Vec<Thread> = serde_json::from_value(
            body.get("threads").ok_or("No threads in body")?.clone()
        ).map_err(|e| format!("Failed to parse threads: {}", e))?;
        Ok(threads)
    }

    pub fn scopes(&mut self, frame_id: i64) -> Result<Vec<Scope>, String> {
        let response = self.send_request("scopes", Some(serde_json::json!({
            "frameId": frame_id
        })))?;
        let body = response.body.ok_or("No body in response")?;
        let scopes: Vec<Scope> = serde_json::from_value(
            body.get("scopes").ok_or("No scopes in body")?.clone()
        ).map_err(|e| format!("Failed to parse scopes: {}", e))?;
        Ok(scopes)
    }
}
