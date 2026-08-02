//! DAP Transport - Connection and transport layer management
//!
//! This module handles the transport layer for DAP communication:
//! - TCP and stdio transport layers
//! - Content-Length header parsing
//! - JSON-RPC message reader loop

use super::types::*;
use super::protocol::DapEvent;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader, Read};
use std::net::TcpStream;
use std::process::{ChildStdin, Command};
use std::sync::{Arc, Mutex};

pub struct DapConnection {
    pub(crate) process: Option<std::process::Child>,
    pub(crate) stdin: Option<ChildStdin>,
    pub(crate) tcp_stream: Option<TcpStream>,
    pub(crate) seq: u32,
    pub(crate) message_buffer: Arc<Mutex<Vec<DapMessage>>>,
    pub(crate) event_buffer: Vec<DapEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DapMessage {
    Response(Response),
    Event(DapEvent),
}

impl DapConnection {
    pub fn new() -> Self {
        Self {
            process: None,
            stdin: None,
            tcp_stream: None,
            seq: 0,
            message_buffer: Arc::new(Mutex::new(Vec::new())),
            event_buffer: Vec::new(),
        }
    }

    /// Set the TCP stream and spawn reader thread (for adapters like delve)
    pub fn set_tcp_stream(&mut self, stream: TcpStream) {
        let buffer = self.message_buffer.clone();
        let tcp_stream = stream.try_clone().expect("Failed to clone TCP stream");
        self.tcp_stream = Some(stream);
        std::thread::spawn(move || {
            Self::reader_loop(tcp_stream, buffer, "tcp");
        });
    }

    /// Connect to an existing TCP server (for child sessions in js-debug multi-session)
    pub fn connect_tcp(&mut self, port: u16) -> Result<(), String> {
        let ipv6_addr = format!("[::1]:{}", port);
        let ipv4_addr = format!("127.0.0.1:{}", port);
        let stream = TcpStream::connect(&ipv6_addr)
            .or_else(|_| TcpStream::connect(&ipv4_addr))
            .map_err(|e| format!("Failed to connect to debug server for child session: {}", e))?;
        
        let tcp_stream = stream.try_clone().map_err(|e| format!("Failed to clone TCP stream: {}", e))?;
        self.tcp_stream = Some(stream);
        
        let buffer = self.message_buffer.clone();
        std::thread::spawn(move || {
            Self::reader_loop(tcp_stream, buffer, "tcp-child");
        });
        
        Ok(())
    }

    /// Set the process (for adapters that manage their own process)
    pub fn set_process(&mut self, process: std::process::Child) {
        self.process = Some(process);
    }

    /// Get the response sender channel
    pub fn get_response_tx(&self) -> &Arc<Mutex<Vec<DapMessage>>> {
        &self.message_buffer
    }

    pub fn start_process(&mut self, command: &str, args: &[String]) -> Result<(), String> {
        let mut child = Command::new(command)
            .args(args)
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start debug adapter: {}", e))?;

        let stderr = child.stderr.take();
        let buffer = self.message_buffer.clone();
        std::thread::spawn(move || {
            if let Some(stderr) = stderr {
                let mut reader = BufReader::new(stderr);
                let mut line = String::new();
                while reader.read_line(&mut line).is_ok() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        eprintln!("[DAP stderr] {}", trimmed);
                        if trimmed.starts_with('{') {
                            if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
                                if value.get("request_seq").is_some() {
                                    if let Ok(response) = serde_json::from_value::<Response>(value.clone()) {
                                        if let Ok(mut buf) = buffer.lock() {
                                            buf.push(DapMessage::Response(response));
                                        }
                                    }
                                } else if value.get("event").is_some() {
                                    if let Ok(event) = serde_json::from_value::<DapEvent>(value.clone()) {
                                        if let Ok(mut buf) = buffer.lock() {
                                            buf.push(DapMessage::Event(event));
                                        }
                                    }
                                }
                            }
                        }
                    }
                    line.clear();
                }
            }
        });

        self.process = Some(child);
        std::thread::sleep(std::time::Duration::from_millis(500));

        let port = crate::config::get_ports().js_debug_port;
        let ipv6_addr = format!("[::1]:{}", port);
        let ipv4_addr = format!("127.0.0.1:{}", port);
        let stream = TcpStream::connect(&ipv6_addr)
            .or_else(|_| TcpStream::connect(&ipv4_addr))
            .map_err(|e| format!("Failed to connect to debug server: {}", e))?;
        self.tcp_stream = Some(stream);

        let buffer = self.message_buffer.clone();
        if let Some(tcp_stream) = self.tcp_stream.as_ref().and_then(|s| s.try_clone().ok()) {
            std::thread::spawn(move || {
                Self::reader_loop(tcp_stream, buffer, "tcp");
            });
        }

        Ok(())
    }

    pub fn start_stdio_process(&mut self, command: &str, args: &[String]) -> Result<(), String> {
        let mut child = Command::new(command)
            .args(args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start debug adapter: {}", e))?;

        self.stdin = child.stdin.take();
        let stdout = child.stdout.take().ok_or("No stdout available")?;

        let stderr = child.stderr.take();
        std::thread::spawn(move || {
            if let Some(stderr) = stderr {
                let mut reader = BufReader::new(stderr);
                let mut line = String::new();
                while reader.read_line(&mut line).is_ok() {
                    if !line.trim().is_empty() {
                        eprintln!("[DAP stderr] {}", line.trim());
                    }
                    line.clear();
                }
            }
        });

        let buffer = self.message_buffer.clone();
        std::thread::spawn(move || {
            Self::reader_loop(stdout, buffer, "stdio");
        });

        self.process = Some(child);
        Ok(())
    }

    pub(crate) fn reader_loop<R: Read>(reader: R, buffer: Arc<Mutex<Vec<DapMessage>>>, kind: &str) {
        let mut reader = BufReader::new(reader);
        let mut header_buf = Vec::new();

        loop {
            header_buf.clear();
            match reader.read_until(b'\n', &mut header_buf) {
                Ok(0) => return,
                Ok(_) => {}
                Err(e) => {
                    eprintln!("[DAP] Read error ({}): {}", kind, e);
                    return;
                }
            }

            let line = String::from_utf8_lossy(&header_buf);
            let trimmed = line.trim();

            if trimmed.is_empty() {
                continue;
            }

            if let Some(len_str) = trimmed.strip_prefix("Content-Length: ") {
                if let Ok(content_length) = len_str.trim().parse::<usize>() {
                    let mut blank = [0u8; 2];
                    if reader.read_exact(&mut blank).is_err() {
                        eprintln!("[DAP] Failed to read blank line");
                        return;
                    }

                    let mut body = vec![0u8; content_length];
                    if reader.read_exact(&mut body).is_err() {
                        eprintln!("[DAP] Failed to read body");
                        return;
                    }

                    let body_str = String::from_utf8_lossy(&body);

                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&body_str) {
                        Self::handle_message(value, &buffer);
                    }
                }
            }
        }
    }

    fn handle_message(value: serde_json::Value, buffer: &Arc<Mutex<Vec<DapMessage>>>) {
        if value.get("request_seq").is_some() {
            Self::handle_response(value, buffer);
        } else if value.get("event").is_some() {
            Self::handle_event(value, buffer);
        } else if value.get("command").is_some() && value.get("type").and_then(|t| t.as_str()) == Some("request") {
            Self::handle_request(value, buffer);
        }
    }

    fn handle_response(value: serde_json::Value, buffer: &Arc<Mutex<Vec<DapMessage>>>) {
        if let Ok(response) = serde_json::from_value::<Response>(value.clone()) {
            if let Ok(mut buf) = buffer.lock() {
                buf.push(DapMessage::Response(response));
            }
        }
    }

    fn handle_event(value: serde_json::Value, buffer: &Arc<Mutex<Vec<DapMessage>>>) {
        if let Ok(event) = serde_json::from_value::<DapEvent>(value.clone()) {
            if let Ok(mut buf) = buffer.lock() {
                buf.push(DapMessage::Event(event));
            }
        }
    }

    fn handle_request(value: serde_json::Value, buffer: &Arc<Mutex<Vec<DapMessage>>>) {
        let cmd = value["command"].as_str().unwrap_or("unknown");

        match cmd {
            "runInTerminal" => handle_run_in_terminal_request(&value, buffer),
            "startDebugging" => Self::handle_start_debugging_request(&value, buffer),
            _ => {}
        }
    }

    fn handle_start_debugging_request(value: &serde_json::Value, buffer: &Arc<Mutex<Vec<DapMessage>>>) {
        let request_seq = value.get("seq").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        let response = Response {
            seq: 100,
            message_type: "response".to_string(),
            request_seq,
            command: "startDebugging".to_string(),
            success: true,
            message: None,
            body: Some(serde_json::json!({})),
        };
        if let Ok(mut buf) = buffer.lock() {
            buf.push(DapMessage::Response(response));
        }

        let start_event = DapEvent {
            event: "startDebugging".to_string(),
            body: Some(value.clone()),
        };
        if let Ok(mut buf) = buffer.lock() {
            buf.push(DapMessage::Event(start_event));
        }
    }

    pub fn terminate(&mut self) -> Result<(), String> {
        if let Some(mut process) = self.process.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
        Ok(())
    }
}

fn handle_run_in_terminal_request(value: &Value, buffer: &Arc<Mutex<Vec<DapMessage>>>) {
    let args = match value.get("arguments").and_then(|v| v.as_object()) {
        Some(obj) => obj,
        None => {
            eprintln!("[DAP] Invalid runInTerminal arguments");
            return;
        }
    };

    let cwd: String = args.get("cwd")
        .and_then(|v| v.as_str())
        .unwrap_or(".")
        .to_string();

    let cmd_args: Vec<String> = args.get("args")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).map(String::from).collect())
        .unwrap_or_default();

    let env_obj: Option<serde_json::Map<String, serde_json::Value>> = args.get("env")
        .and_then(|v| v.as_object())
        .map(|m| m.clone());
    let request_seq = value.get("seq").and_then(|v| v.as_u64()).unwrap_or(0) as u32;

    let cmd_str = cmd_args.join(" ");

    let response = Response {
        seq: 100,
        message_type: "response".to_string(),
        request_seq,
        command: "runInTerminal".to_string(),
        success: true,
        message: None,
        body: Some(serde_json::json!({"processId": 0})),
    };
    if let Ok(mut buf) = buffer.lock() {
        buf.push(DapMessage::Response(response));
    }

    let buffer_clone = buffer.clone();
    std::thread::spawn(move || {
        let mut cmd = std::process::Command::new("sh");
        cmd.arg("-c").arg(&cmd_str).current_dir(cwd);

        if let Some(env) = env_obj {
            for (key, value) in env {
                if let Some(val_str) = value.as_str() {
                    cmd.env(key, val_str);
                }
            }
        }

        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[DAP shell] Failed to spawn: {}", e);
                let error_event = DapEvent {
                    event: "output".to_string(),
                    body: Some(serde_json::json!({
                        "category": "stderr",
                        "output": format!("Failed to spawn process: {}\n", e)
                    })),
                };
                if let Ok(mut buf) = buffer_clone.lock() {
                    buf.push(DapMessage::Event(error_event));
                }
                return;
            }
        };

        let stdout_buffer = buffer_clone.clone();
        let stdout = child.stdout.take();
        std::thread::spawn(move || {
            if let Some(mut stdout) = stdout {
                let mut buf = [0u8; 1024];
                loop {
                    match stdout.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            let output = String::from_utf8_lossy(&buf[..n]);
                            let output_event = DapEvent {
                                event: "output".to_string(),
                                body: Some(serde_json::json!({
                                    "category": "stdout",
                                    "output": output.to_string()
                                })),
                            };
                            if let Ok(mut buffer) = stdout_buffer.lock() {
                                buffer.push(DapMessage::Event(output_event));
                            }
                        }
                        Err(_) => break,
                    }
                }
            }
        });

        let stderr_buffer = buffer_clone.clone();
        let stderr = child.stderr.take();
        std::thread::spawn(move || {
            if let Some(mut stderr) = stderr {
                let mut buf = [0u8; 1024];
                loop {
                    match stderr.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            let output = String::from_utf8_lossy(&buf[..n]);
                            let output_event = DapEvent {
                                event: "output".to_string(),
                                body: Some(serde_json::json!({
                                    "category": "stderr",
                                    "output": output.to_string()
                                })),
                            };
                            if let Ok(mut buffer) = stderr_buffer.lock() {
                                buffer.push(DapMessage::Event(output_event));
                            }
                        }
                        Err(_) => break,
                    }
                }
            }
        });

        let status = child.wait();
        match status {
            Ok(status) => {
                let exit_event = DapEvent {
                    event: "output".to_string(),
                    body: Some(serde_json::json!({
                        "category": "console",
                        "output": format!("\nProcess exited with code: {}\n", status)
                    })),
                };
                if let Ok(mut buf) = buffer_clone.lock() {
                    buf.push(DapMessage::Event(exit_event));
                }
            }
            Err(e) => {
                eprintln!("[DAP shell] Failed to wait: {}", e);
            }
        }
    });
}
