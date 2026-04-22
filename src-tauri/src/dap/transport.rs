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
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};

pub struct DapConnection {
    pub(crate) process: Option<std::process::Child>,
    pub(crate) stdin: Option<ChildStdin>,
    pub(crate) tcp_stream: Option<TcpStream>,
    pub(crate) seq: u32,
    pub(crate) response_tx: Sender<DapMessage>,
    pub(crate) response_rx: Option<Arc<Mutex<mpsc::Receiver<DapMessage>>>>,
    pub(crate) event_buffer: Vec<DapEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DapMessage {
    Response(Response),
    Event(DapEvent),
}

impl DapConnection {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel();
        Self {
            process: None,
            stdin: None,
            tcp_stream: None,
            seq: 0,
            response_tx: tx,
            response_rx: Some(Arc::new(Mutex::new(rx))),
            event_buffer: Vec::new(),
        }
    }

    /// Set the TCP stream and spawn reader thread (for adapters like delve)
    pub fn set_tcp_stream(&mut self, stream: TcpStream) {
        let tx = self.response_tx.clone();
        let tcp_stream = stream.try_clone().expect("Failed to clone TCP stream");
        self.tcp_stream = Some(stream);
        std::thread::spawn(move || {
            Self::reader_loop(tcp_stream, tx, "tcp");
        });
    }

    /// Set the process (for adapters that manage their own process)
    pub fn set_process(&mut self, process: std::process::Child) {
        self.process = Some(process);
    }

    /// Get the response sender channel
    pub fn get_response_tx(&self) -> &Sender<DapMessage> {
        &self.response_tx
    }

    pub fn start_process(&mut self, command: &str, args: &[String]) -> Result<(), String> {
        let mut child = Command::new(command)
            .args(args)
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start debug adapter: {}", e))?;

        let stderr = child.stderr.take();
        let tx_clone = self.response_tx.clone();
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
                                        println!("[DAP] Received response from stderr: {} (request_seq {})", response.command, response.request_seq);
                                        let _ = tx_clone.send(DapMessage::Response(response));
                                    }
                                } else if value.get("event").is_some() {
                                    if let Ok(event) = serde_json::from_value::<DapEvent>(value.clone()) {
                                        println!("[DAP] Received event from stderr: {}", event.event);
                                        let _ = tx_clone.send(DapMessage::Event(event));
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
        println!("[DAP] Connecting to TCP server at {}...", ipv6_addr);
        let stream = TcpStream::connect(&ipv6_addr)
            .or_else(|_| TcpStream::connect(&ipv4_addr))
            .map_err(|e| format!("Failed to connect to debug server: {}", e))?;
        self.tcp_stream = Some(stream);
        println!("[DAP] Connected to debug server");

        let tx = self.response_tx.clone();
        if let Some(tcp_stream) = self.tcp_stream.as_ref().and_then(|s| s.try_clone().ok()) {
            std::thread::spawn(move || {
                Self::reader_loop(tcp_stream, tx, "tcp");
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

        let tx = self.response_tx.clone();
        std::thread::spawn(move || {
            Self::reader_loop(stdout, tx, "stdio");
        });

        self.process = Some(child);
        Ok(())
    }

    pub(crate) fn reader_loop<R: Read>(reader: R, tx: Sender<DapMessage>, kind: &str) {
        let mut reader = BufReader::new(reader);
        let mut header_buf = Vec::new();

        loop {
            header_buf.clear();
            match reader.read_until(b'\n', &mut header_buf) {
                Ok(0) => {
                    println!("[DAP] EOF from debug adapter ({})", kind);
                    return;
                }
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
                    println!("[DAP] Found Content-Length: {} ({})", content_length, kind);

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
                    println!("[DAP] Received: {} ({})", body_str, kind);

                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&body_str) {
                        Self::handle_message(value, &tx);
                    } else {
                        println!("[DAP] Failed to parse JSON: {}", body_str);
                    }
                } else {
                    println!("[DAP] Invalid content length: {}", len_str);
                }
            } else {
                println!("[DAP] Skipping non-DAP output: {} ({})", trimmed, kind);
            }
        }
    }

    fn handle_message(value: serde_json::Value, tx: &Sender<DapMessage>) {
        if value.get("request_seq").is_some() {
            Self::handle_response(value, tx);
        } else if value.get("event").is_some() {
            Self::handle_event(value, tx);
        } else if value.get("command").is_some() && value.get("type").and_then(|t| t.as_str()) == Some("request") {
            Self::handle_request(value, tx);
        } else {
            println!("[DAP] Unknown message type: {}", value);
        }
    }

    fn handle_response(value: serde_json::Value, tx: &Sender<DapMessage>) {
        match serde_json::from_value::<Response>(value.clone()) {
            Ok(response) => {
                println!("[DAP] Sending response to channel: {} (request_seq {})", response.command, response.request_seq);
                let _ = tx.send(DapMessage::Response(response));
            }
            Err(_) => println!("[DAP] Failed to parse response from: {}", value),
        }
    }

    fn handle_event(value: serde_json::Value, tx: &Sender<DapMessage>) {
        match serde_json::from_value::<DapEvent>(value.clone()) {
            Ok(event) => {
                println!("[DAP] Event: {}, sending to channel", event.event);
                let _ = tx.send(DapMessage::Event(event));
            }
            Err(_) => println!("[DAP] Failed to parse event from: {}", value),
        }
    }

    fn handle_request(value: serde_json::Value, tx: &Sender<DapMessage>) {
        let cmd = value["command"].as_str().unwrap_or("unknown");
        println!("[DAP] Received request from adapter: {}", cmd);

        match cmd {
            "runInTerminal" => handle_run_in_terminal_request(&value, tx),
            "startDebugging" => Self::handle_start_debugging_request(&value, tx),
            _ => println!("[DAP] Unhandled request: {}", cmd),
        }
    }

    fn handle_start_debugging_request(value: &serde_json::Value, tx: &Sender<DapMessage>) {
        let args = value.get("arguments").and_then(|v| v.as_object());
        let config = args.and_then(|a| a.get("configuration")).and_then(|v| v.as_object());

        if let Some(cfg) = config {
            let pending_target_id = cfg.get("__pendingTargetId").and_then(|v| v.as_str());
            let name = cfg.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
            println!("[DAP] startDebugging: name={}, pendingTargetId={:?}", name, pending_target_id);
        }

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
        let _ = tx.send(DapMessage::Response(response));
        println!("[DAP] startDebugging acknowledged - child session events will flow through");
    }

    pub fn terminate(&mut self) -> Result<(), String> {
        if let Some(mut process) = self.process.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
        Ok(())
    }
}

fn handle_run_in_terminal_request(value: &Value, tx: &Sender<DapMessage>) {
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

    println!("[DAP] runInTerminal: cwd={}, args={:?}", cwd, cmd_args);

    let cmd_str = cmd_args.join(" ");
    println!("[DAP] Running via shell: {}", cmd_str);

    let response = Response {
        seq: 100,
        message_type: "response".to_string(),
        request_seq,
        command: "runInTerminal".to_string(),
        success: true,
        message: None,
        body: Some(serde_json::json!({"processId": 0})),
    };
    let _ = tx.send(DapMessage::Response(response));

    let tx_clone = tx.clone();
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
                let _ = tx_clone.send(DapMessage::Event(error_event));
                return;
            }
        };

        let stdout_tx = tx_clone.clone();
        let stdout = child.stdout.take();
        std::thread::spawn(move || {
            if let Some(mut stdout) = stdout {
                let mut buf = [0u8; 1024];
                loop {
                    match stdout.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            let output = String::from_utf8_lossy(&buf[..n]);
                            println!("[DAP shell] STDOUT: {}", output);
                            let output_event = DapEvent {
                                event: "output".to_string(),
                                body: Some(serde_json::json!({
                                    "category": "stdout",
                                    "output": output.to_string()
                                })),
                            };
                            let _ = stdout_tx.send(DapMessage::Event(output_event));
                        }
                        Err(_) => break,
                    }
                }
            }
        });

        let stderr_tx = tx_clone.clone();
        let stderr = child.stderr.take();
        std::thread::spawn(move || {
            if let Some(mut stderr) = stderr {
                let mut buf = [0u8; 1024];
                loop {
                    match stderr.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            let output = String::from_utf8_lossy(&buf[..n]);
                            eprintln!("[DAP shell] STDERR: {}", output);
                            let output_event = DapEvent {
                                event: "output".to_string(),
                                body: Some(serde_json::json!({
                                    "category": "stderr",
                                    "output": output.to_string()
                                })),
                            };
                            let _ = stderr_tx.send(DapMessage::Event(output_event));
                        }
                        Err(_) => break,
                    }
                }
            }
        });

        let status = child.wait();
        match status {
            Ok(status) => {
                println!("[DAP shell] Process exited with status: {}", status);
                let exit_event = DapEvent {
                    event: "output".to_string(),
                    body: Some(serde_json::json!({
                        "category": "console",
                        "output": format!("\nProcess exited with code: {}\n", status)
                    })),
                };
                let _ = tx_clone.send(DapMessage::Event(exit_event));
            }
            Err(e) => {
                eprintln!("[DAP shell] Failed to wait: {}", e);
                let error_event = DapEvent {
                    event: "output".to_string(),
                    body: Some(serde_json::json!({
                        "category": "stderr",
                        "output": format!("Process error: {}\n", e)
                    })),
                };
                let _ = tx_clone.send(DapMessage::Event(error_event));
            }
        }
    });
}
