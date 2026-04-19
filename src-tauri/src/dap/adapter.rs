use super::types::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{ChildStdin, Command};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::net::TcpStream;

// Re-export types for adapters
pub use super::types::{LaunchRequestArgs, Capabilities, SetBreakpointsArgs, StackFrame, Variable, Thread, Response, Scope};

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Breakpoint {
    pub id: Option<i32>,
    pub verified: bool,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub source: Option<Source>,
    pub message: Option<String>,
}

#[derive(Debug)]
pub enum DapMessage {
    Response(Response),
    Event(DapEvent),
}

pub struct DapConnection {
    process: Option<std::process::Child>,
    stdin: Option<ChildStdin>,
    tcp_stream: Option<TcpStream>,
    seq: u32,
    response_tx: Sender<DapMessage>,
    response_rx: Option<Arc<Mutex<mpsc::Receiver<DapMessage>>>>,
    event_buffer: Vec<DapEvent>,
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
        // Spawn reader thread
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
        // For TCP-based adapters like js-debug, we don't use stdin/stdout
        // The adapter will connect to the TCP server
        let mut child = Command::new(command)
            .args(args)
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start debug adapter: {}", e))?;

        // Spawn a thread to read stderr and parse DAP messages
        let stderr = child.stderr.take();
        let tx_clone = self.response_tx.clone();
        std::thread::spawn(move || {
            if let Some(mut stderr) = stderr {
                let mut reader = BufReader::new(stderr);
                let mut line = String::new();
                while reader.read_line(&mut line).is_ok() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        eprintln!("[DAP stderr] {}", trimmed);
                        // Try to parse as DAP message
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

        // Give server time to start
        std::thread::sleep(std::time::Duration::from_millis(500));

        // Connect to the TCP server (try IPv6 first, then IPv4)
        println!("[DAP] Connecting to TCP server at ::1:8123...");
        let mut stream = TcpStream::connect("[::1]:8123")
            .or_else(|_| TcpStream::connect("127.0.0.1:8123"))
            .map_err(|e| format!("Failed to connect to debug server: {}", e))?;
        // Don't set a read timeout - the reader thread should block waiting for messages
        // stream.set_read_timeout(Some(std::time::Duration::from_secs(120)))
        //     .map_err(|e| format!("Failed to set read timeout: {}", e))?;
        self.tcp_stream = Some(stream);
        println!("[DAP] Connected to debug server");

        // Spawn the DAP reader thread for TCP
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

        // Spawn a thread to read stderr
        let stderr = child.stderr.take();
        std::thread::spawn(move || {
            if let Some(mut stderr) = stderr {
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

        // Spawn the DAP reader thread for stdio
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
            // Read Content-Length header line
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

            // Skip empty lines
            if trimmed.is_empty() {
                continue;
            }

            // Check for Content-Length header
            if let Some(len_str) = trimmed.strip_prefix("Content-Length: ") {
                if let Ok(content_length) = len_str.trim().parse::<usize>() {
                    println!("[DAP] Found Content-Length: {} ({})", content_length, kind);

                    // Read the blank line (\r\n) after header - we already consumed \n, need \r\n
                    let mut blank = [0u8; 2];
                    if reader.read_exact(&mut blank).is_err() {
                        eprintln!("[DAP] Failed to read blank line");
                        return;
                    }

                    // Now read the body
                    let mut body = vec![0u8; content_length];
                    if reader.read_exact(&mut body).is_err() {
                        eprintln!("[DAP] Failed to read body");
                        return;
                    }

                    let body_str = String::from_utf8_lossy(&body);
                    println!("[DAP] Received: {} ({})", body_str, kind);

                    // Parse message
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&body_str) {
                        if value.get("request_seq").is_some() {
                            if let Ok(response) = serde_json::from_value::<Response>(value.clone()) {
                                println!("[DAP] Sending response to channel: {} (request_seq {})", response.command, response.request_seq);
                                let _ = tx.send(DapMessage::Response(response));
                            } else {
                                println!("[DAP] Failed to parse response from: {}", body_str);
                            }
                        } else if value.get("event").is_some() {
                            if let Ok(event) = serde_json::from_value::<DapEvent>(value.clone()) {
                                println!("[DAP] Event: {}, sending to channel", event.event);
                                let _ = tx.send(DapMessage::Event(event));
                            } else {
                                println!("[DAP] Failed to parse event from: {}", body_str);
                            }
                        } else if value.get("command").is_some() && value.get("type").and_then(|t| t.as_str()) == Some("request") {
                            // This is a request FROM the adapter TO the client (e.g., runInTerminal)
                            let cmd = value["command"].as_str().unwrap_or("unknown");
                            println!("[DAP] Received request from adapter: {}", cmd);
                            match cmd {
                                "runInTerminal" => handle_run_in_terminal_request(&value, &tx),
                                "startDebugging" => {
                                    // js-debug requests a new child debug session for the actual Node.js process
                                    let args = value.get("arguments").and_then(|v| v.as_object());
                                    let config = args.and_then(|a| a.get("configuration")).and_then(|v| v.as_object());

                                    if let Some(cfg) = config {
                                        let pending_target_id = cfg.get("__pendingTargetId").and_then(|v| v.as_str());
                                        let name = cfg.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                                        println!("[DAP] startDebugging: name={}, pendingTargetId={:?}", name, pending_target_id);

                                        // The child session will use the same TCP connection - js-debug multiplexes events
                                        // We just need to acknowledge and events will flow through
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
                                _ => println!("[DAP] Unhandled request: {}", cmd),
                            }
                        } else {
                            println!("[DAP] Unknown message type: {}", body_str);
                        }
                    } else {
                        println!("[DAP] Failed to parse JSON: {}", body_str);
                    }
                    // Continue to next message (don't break, just loop)
                } else {
                    println!("[DAP] Invalid content length: {}", len_str);
                }
            } else {
                println!("[DAP] Skipping non-DAP output: {} ({})", trimmed, kind);
            }
        }
    }
}

/// Handle runInTerminal request from the debug adapter
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

    // Clone env data to avoid lifetime issues
    let env_obj: Option<serde_json::Map<String, serde_json::Value>> = args.get("env")
        .and_then(|v| v.as_object())
        .map(|m| m.clone());
    let request_seq = value.get("seq").and_then(|v| v.as_u64()).unwrap_or(0) as u32;

    println!("[DAP] runInTerminal: cwd={}, args={:?}", cwd, cmd_args);

    // Build command string for shell execution
    let cmd_str = cmd_args.join(" ");
    println!("[DAP] Running via shell: {}", cmd_str);

    // Send response immediately
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

    // Use shell to run - this properly handles npm -> node child process tree
    let tx_clone = tx.clone();
    std::thread::spawn(move || {
        let mut cmd = std::process::Command::new("sh");
        cmd.arg("-c").arg(&cmd_str).current_dir(cwd);

        // Add environment variables
        if let Some(env) = env_obj {
            for (key, value) in env {
                if let Some(val_str) = value.as_str() {
                    cmd.env(key, val_str);
                }
            }
        }

        // Use piped stdout/stderr to capture output
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[DAP shell] Failed to spawn: {}", e);
                // Emit error output event
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

        // Read stdout in a thread and emit as output events
        let stdout_tx = tx_clone.clone();
        let mut stdout = child.stdout.take();
        std::thread::spawn(move || {
            if let Some(mut stdout) = stdout {
                let mut buf = [0u8; 1024];
                loop {
                    match stdout.read(&mut buf) {
                        Ok(0) => break, // EOF
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

        // Read stderr in a thread and emit as output events
        let stderr_tx = tx_clone.clone();
        let mut stderr = child.stderr.take();
        std::thread::spawn(move || {
            if let Some(mut stderr) = stderr {
                let mut buf = [0u8; 1024];
                loop {
                    match stderr.read(&mut buf) {
                        Ok(0) => break, // EOF
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

        // Wait for process to complete
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

impl DapConnection {
    fn next_seq(&mut self) -> u32 {
        self.seq += 1;
        self.seq
    }

    /// Send a request without waiting for response (fire-and-forget)
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

    /// Wait for a specific response by sequence number
    pub fn wait_for_response(&mut self, expected_seq: u32, timeout_secs: u64) -> Result<Response, String> {
        if let Some(rx) = &self.response_rx {
            let timeout = std::time::Duration::from_secs(timeout_secs);
            let rx = rx.lock().map_err(|e| format!("Lock error: {}", e))?;

            loop {
                match rx.recv_timeout(timeout) {
                    Ok(DapMessage::Response(response)) => {
                        if response.request_seq == expected_seq {
                            println!("[DAP] Received response (seq {}): success={}", expected_seq, response.success);
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
                        println!("[DAP] Buffering event while waiting: {}", event.event);
                        self.event_buffer.push(event);
                    }
                    Err(e) => {
                        return Err(format!("Timeout waiting for seq {}: {}", expected_seq, e));
                    }
                }
            }
        } else {
            Err("No response channel available".to_string())
        }
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

        // Wait for response with timeout - longer timeout for launch
        if let Some(rx) = &self.response_rx {
            let timeout = if command == "launch" {
                std::time::Duration::from_secs(120)
            } else {
                std::time::Duration::from_secs(60)
            };
            let rx = rx.lock().map_err(|e| format!("Lock error: {}", e))?;

            // Keep trying until we get the matching response or timeout
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
                            // Store unexpected response in event buffer for later retrieval
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
                        // Store event for later polling - DO NOT retry
                        println!("[DAP] Buffering event: {}", event.event);
                        self.event_buffer.push(event);
                        // Continue waiting for the response
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

    fn send_message<T: Serialize>(&mut self, message: &T) -> Result<(), String> {
        let json = serde_json::to_string(message).map_err(|e| format!("Failed to serialize: {}", e))?;
        let content = format!("Content-Length: {}\r\n\r\n{}", json.len(), json);

        // Try TCP first, then stdin
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

    pub fn poll_events(&mut self) -> Vec<DapEvent> {
        // Drain buffered events
        let mut events = Vec::new();

        // Also check channel for new events
        if let Some(rx) = &self.response_rx {
            if let Ok(rx) = rx.lock() {
                while let Ok(msg) = rx.try_recv() {
                    match msg {
                        DapMessage::Event(e) => events.push(e),
                        DapMessage::Response(r) => {
                            println!("[DAP] Buffered unexpected response: {}", r.command);
                        }
                    }
                }
            }
        }

        // Add buffered events
        events.append(&mut self.event_buffer);
        events
    }

    pub fn terminate(&mut self) -> Result<(), String> {
        if let Some(mut process) = self.process.take() {
            let _ = process.kill();
        }
        Ok(())
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
            .map_err(|e| format!("Failed to parse evaluate result: {}", e))?;
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DapEvent {
    #[serde(rename = "event")]
    pub event: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<serde_json::Value>,
}
