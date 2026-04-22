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
            println!("[DAP] Writing to TCP: {} bytes", content.len());
            tcp_stream.write_all(content.as_bytes()).map_err(|e| format!("Failed to write: {}", e))?;
            tcp_stream.flush().map_err(|e| format!("Failed to flush: {}", e))?;
            println!("[DAP] Flushed TCP");
        } else if let Some(stdin) = &mut self.stdin {
            println!("[DAP] Writing to stdin: {} bytes", content.len());
            stdin.write_all(content.as_bytes()).map_err(|e| format!("Failed to write: {}", e))?;
            stdin.flush().map_err(|e| format!("Failed to flush: {}", e))?;
            println!("[DAP] Flushed stdin");
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

        println!("[DAP] Sending request (no wait): {} (seq {})", command, seq);
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

        println!("[DAP] Sending request: {} (seq {})", command, seq);
        self.send_message(&request)?;

        if let Some(rx) = &self.response_rx {
            let timeout = if command == "launch" {
                std::time::Duration::from_secs(120)
            } else {
                std::time::Duration::from_secs(60)
            };
            let rx = rx.lock().map_err(|e| format!("Lock error: {}", e))?;

            let mut wait_count = 0;
            loop {
                wait_count += 1;
                if wait_count % 10 == 0 {
                    println!("[DAP] Still waiting for response to '{}' (seq {})...", command, seq);
                }

                match rx.recv_timeout(timeout) {
                    Ok(DapMessage::Response(response)) => {
                        if response.request_seq == seq {
                            println!("[DAP] Received response for {} (seq {}): success={}", command, seq, response.success);
                            return Ok(response);
                        } else {
                            println!("[DAP] Received response for different request (seq {}), storing...", response.request_seq);
                            self.event_buffer.push(DapEvent {
                                event: "response".to_string(),
                                body: Some(serde_json::json!({
                                    "seq": response.seq,
                                    "request_seq": response.request_seq,
                                    "command": response.command,
                                    "success": response.success,
                                    "body": response.body
                                })),
                            });
                        }
                    }
                    Ok(DapMessage::Event(event)) => {
                        println!("[DAP] Buffering event: {}", event.event);
                        self.event_buffer.push(event);
                    }
                    Err(e) => {
                        println!("[DAP] Timeout waiting for response to '{}' (seq {}): {}", command, seq, e);
                        return Err(format!("Timeout waiting for response to '{}': {}", command, e));
                    }
                }
            }
        } else {
            Err("No response channel available".to_string())
        }
    }

    pub fn poll_events(&mut self) -> Vec<DapEvent> {
        let buffer_len = self.event_buffer.len();
        let mut events = std::mem::take(&mut self.event_buffer);
        if buffer_len > 0 {
            println!("[DAP] poll_events: took {} events from buffer", buffer_len);
        }

        if let Some(rx) = &self.response_rx {
            match rx.lock() {
                Ok(rx_guard) => {
                    let mut collected = 0;
                    while let Ok(msg) = rx_guard.try_recv() {
                        collected += 1;
                        match msg {
                            DapMessage::Event(e) => {
                                println!("[DAP] poll_events: collected event: {}", e.event);
                                events.push(e);
                            },
                            DapMessage::Response(r) => {
                                println!("[DAP] Buffered unexpected response: {}", r.command);
                            }
                        }
                    }
                    if collected > 0 {
                        println!("[DAP] poll_events: collected {} events from channel", collected);
                    }
                },
                Err(e) => {
                    println!("[DAP] poll_events: failed to lock rx: {}", e);
                }
            }
        } else {
            println!("[DAP] poll_events: no response_rx available");
        }

        if !events.is_empty() {
            println!("[DAP] poll_events: returning {} events", events.len());
        }
        events
    }

    pub fn set_breakpoints(&mut self, args: &SetBreakpointsArgs) -> Result<Vec<Breakpoint>, String> {
        let json_args = serde_json::to_value(args).map_err(|e| e.to_string())?;
        println!("[DAP] Sending setBreakpoints request:");
        println!("[DAP]   Source path: {:?}", args.source.path);
        println!("[DAP]   Breakpoints: {:?}", json_args.get("breakpoints"));
        let response = self.send_request("setBreakpoints", Some(json_args))?;
        println!("[DAP] setBreakpoints response:");
        println!("[DAP]   success={}", response.success);
        println!("[DAP]   message={:?}", response.message);
        println!("[DAP]   body={}", response.body.as_ref().unwrap_or(&serde_json::Value::Null));
        let body = response.body.ok_or("No body in response")?;
        let breakpoints: Vec<Breakpoint> = serde_json::from_value(
            body.get("breakpoints").ok_or("No breakpoints in body")?.clone()
        ).map_err(|e| format!("Failed to parse breakpoints: {}", e))?;
        println!("[DAP] Parsed {} breakpoints:", breakpoints.len());
        for (i, bp) in breakpoints.iter().enumerate() {
            println!("[DAP]   [{}] verified={}, line={:?}, source={:?}", i, bp.verified, bp.line, bp.source.as_ref().map(|s| &s.path));
        }
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
        println!("[DAP] Sending stackTrace request for thread {}", thread_id);
        let response = self.send_request("stackTrace", Some(serde_json::json!({
            "threadId": thread_id
        })))?;
        println!("[DAP] stackTrace response: success={}", response.success);
        let body = response.body.ok_or("No body in response")?;
        let stack_frames: Vec<StackFrame> = serde_json::from_value(
            body.get("stackFrames").ok_or("No stackFrames in body")?.clone()
        ).map_err(|e| format!("Failed to parse stack frames: {}", e))?;
        println!("[DAP] Parsed {} stack frames", stack_frames.len());
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
        println!("[DAP] Sending threads request");
        let response = self.send_request("threads", None)?;
        println!("[DAP] threads response: success={}", response.success);
        let body = response.body.ok_or("No body in response")?;
        let threads: Vec<Thread> = serde_json::from_value(
            body.get("threads").ok_or("No threads in body")?.clone()
        ).map_err(|e| format!("Failed to parse threads: {}", e))?;
        println!("[DAP] Parsed {} threads", threads.len());
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
