use crate::dap::adapter::{DebugAdapter, DapConnection, Breakpoint, DapEvent, DapMessage};
use crate::dap::types::*;
use std::net::{TcpStream, TcpListener};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};

fn find_free_port() -> Option<u16> {
    TcpListener::bind(("127.0.0.1", 0))
        .ok()
        .and_then(|listener| listener.local_addr().ok())
        .map(|addr| addr.port())
}

pub struct GoAdapter {
    connection: DapConnection,
    initialized: bool,
    output_path: Option<String>,
}

impl GoAdapter {
    pub fn new() -> Self {
        Self {
            connection: DapConnection::new(),
            initialized: false,
            output_path: None,
        }
    }

    fn find_delve() -> Option<String> {
        let paths = [
            "dlv",
            "/usr/local/bin/dlv",
            "/opt/homebrew/bin/dlv",
            "/Users/dasta/go/bin/dlv",
        ];

        for path in &paths {
            if std::path::Path::new(path).exists() {
                return Some(path.to_string());
            }
        }

        #[cfg(unix)]
        {
            if let Ok(output) = Command::new("which").arg("dlv").output() {
                if output.status.success() {
                    return String::from_utf8(output.stdout).ok().map(|s| s.trim().to_string());
                }
            }
        }

        None
    }
}

impl DebugAdapter for GoAdapter {
    fn name(&self) -> &'static str {
        "delve"
    }

    fn start(&mut self, args: &LaunchRequestArgs) -> Result<(), String> {
        let dlv_path = Self::find_delve()
            .ok_or("dlv (Delve) not found. Please install with: go install github.com/go-delve/delve/cmd/dlv@latest")?;

        println!("[DAP] Starting delve DAP server...");

        // Find a free port for Delve
        let port = find_free_port().ok_or("Could not find free port for Delve")?;
        println!("[DAP] Using port {}", port);

        let mut cmd = Command::new(&dlv_path);
        cmd.args(["dap", "--listen", &format!("127.0.0.1:{}", port), "--check-go-version=false"])
            .stderr(Stdio::piped())
            .stdout(Stdio::piped());

        if let Some(cwd) = &args.cwd {
            cmd.current_dir(cwd);
        }

        let mut child = cmd.spawn()
            .map_err(|e| format!("Failed to start delve: {}", e))?;

        // Capture stdout from delve (this is where the debugged program's output goes)
        let stdout = child.stdout.take()
            .ok_or("Failed to capture delve stdout")?;
        let tx = self.connection.get_response_tx().clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(output) => {
                        println!("[DAP] Delve stdout: {}", output);
                        // Emit as output event
                        let output_event = DapEvent {
                            event: "output".to_string(),
                            body: Some(serde_json::json!({
                                "category": "stdout",
                                "output": format!("{}\n", output)
                            })),
                        };
                        let _ = tx.send(DapMessage::Event(output_event));
                    }
                    Err(e) => {
                        eprintln!("[DAP] Error reading delve stdout: {}", e);
                        break;
                    }
                }
            }
        });

        // Capture stderr from delve
        let stderr = child.stderr.take()
            .ok_or("Failed to capture delve stderr")?;
        let tx_stderr = self.connection.get_response_tx().clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                match line {
                    Ok(output) => {
                        println!("[DAP] Delve stderr: {}", output);
                        // Emit as output event
                        let output_event = DapEvent {
                            event: "output".to_string(),
                            body: Some(serde_json::json!({
                                "category": "stderr",
                                "output": format!("{}\n", output)
                            })),
                        };
                        let _ = tx_stderr.send(DapMessage::Event(output_event));
                    }
                    Err(e) => {
                        eprintln!("[DAP] Error reading delve stderr: {}", e);
                        break;
                    }
                }
            }
        });

        // Give delve a moment to start
        std::thread::sleep(std::time::Duration::from_millis(500));

        // Connect to the DAP server
        println!("[DAP] Connecting to delve at 127.0.0.1:{}...", port);
        let stream = TcpStream::connect(format!("127.0.0.1:{}", port))
            .map_err(|e| format!("Failed to connect to delve: {}", e))?;

        // Set up the connection (this spawns the reader thread)
        self.connection.set_tcp_stream(stream);
        self.connection.set_process(child);

        println!("[DAP] Connected to delve DAP server");
        Ok(())
    }

    fn initialize(&mut self) -> Result<Capabilities, String> {
        let response = self.connection.send_request("initialize", Some(serde_json::json!({
            "clientID": "openstorm",
            "clientName": "OpenStorm IDE",
            "adapterID": "go",
            "linesStartAt1": true,
            "columnsStartAt1": true,
            "pathFormat": "path",
            "supportsVariableType": true,
            "supportsVariablePaging": false,
            "supportsRunInTerminalRequest": true,
            "supportsMemoryReferences": false,
            "supportsStepInTargetsRequest": true,
            "supportsConfigurationDoneRequest": true,
        })))?;

        self.initialized = true;

        // Configure Delve to skip standard library and runtime code
        let _ = self.connection.send_request_no_wait("setExceptionBreakpoints", Some(serde_json::json!({
            "filters": []
        })));

        let capabilities = response.body.unwrap_or_default();
        Ok(Capabilities {
            supports_configuration_done_request: capabilities.get("supportsConfigurationDoneRequest").and_then(|v| v.as_bool()),
            supports_function_breakpoints: capabilities.get("supportsFunctionBreakpoints").and_then(|v| v.as_bool()),
            supports_condition_on_breakpoints: capabilities.get("supportsConditionalBreakpoints").and_then(|v| v.as_bool()),
            supports_hit_conditional_breakpoints: capabilities.get("supportsHitConditionalBreakpoints").and_then(|v| v.as_bool()),
            supports_evaluate_for_hovers: capabilities.get("supportsEvaluateForHovers").and_then(|v| v.as_bool()),
            supports_step_back: capabilities.get("supportsStepBack").and_then(|v| v.as_bool()),
            supports_set_variable: capabilities.get("supportsSetVariable").and_then(|v| v.as_bool()),
            supports_restart_frame: capabilities.get("supportsRestartFrame").and_then(|v| v.as_bool()),
            supports_goto_targets_request: capabilities.get("supportsGotoTargetsRequest").and_then(|v| v.as_bool()),
        })
    }

    fn launch(&mut self, args: &LaunchRequestArgs) -> Result<(), String> {
        // For Go/delve, program is the package path (e.g., "." or "./cmd/app")
        let program = args.program.clone()
            .unwrap_or_else(|| ".".to_string());

        // Determine output path for debug binary (avoid cluttering workspace)
        let output_path = if let Some(cwd) = &args.cwd {
            format!("{}/.openstorm/debug/__debug", cwd)
        } else {
            "./.openstorm/debug/__debug".to_string()
        };

        // Store output path for cleanup on terminate
        self.output_path = Some(output_path.clone());

        // Clean up any existing debug binary from previous session
        let _ = std::fs::remove_file(&output_path);
        let _ = std::fs::remove_file(&format!("{}.exe", output_path));

        let mut launch_args = serde_json::json!({
            "program": program,
            "stopOnEntry": args.stop_on_entry.unwrap_or(false),
            "mode": "debug",
            "showLog": true,
            // Configure delve to skip stepping into standard library and runtime code
            "dlvFlags": [
                "--check-go-version=false"
            ],
            // Output debug binary to temp directory to avoid cluttering workspace
            "output": output_path
        });

        if let Some(cwd) = &args.cwd {
            launch_args["cwd"] = serde_json::json!(cwd);
        }
        if let Some(env) = &args.env {
            launch_args["env"] = serde_json::json!(env);
        }

        self.connection.send_request("launch", Some(launch_args))?;

        // Configure stepping behavior to skip standard library
        let _ = self.connection.send_request_no_wait("setSteppingGranularity", Some(serde_json::json!({
            "granularity": "statement"
        })));

        // Configure files to skip when stepping
        let _ = self.connection.send_request_no_wait("setSkipFiles", Some(serde_json::json!({
            "patterns": [
                "**/runtime/**",
                "**/internal/**",
                "**/vendor/**",
                "GOROOT/**",
                "<autogenerated>",
                "<unknown>"
            ]
        })));

        Ok(())
    }

    fn finalize_launch(&mut self) -> Result<(), String> {
        // Configure delve to skip stepping into Go standard library and runtime code
        let skip_files_patterns = vec![
            "**/runtime/**/*.go",
            "**/internal/**/*.go",
            "**/vendor/**/*.go",
            "GOROOT/**/*.go"
        ];

        let _ = self.connection.send_request_no_wait("setSkipFiles", Some(serde_json::json!({
            "patterns": skip_files_patterns
        })));

        let _ = self.connection.send_request_no_wait("configurationDone", None);
        Ok(())
    }

    fn set_breakpoints(&mut self, args: &SetBreakpointsArgs) -> Result<Vec<Breakpoint>, String> {
        let response = self.connection.send_request("setBreakpoints", Some(serde_json::json!({
            "source": args.source,
            "breakpoints": args.breakpoints,
        })))?;

        let body = response.body
            .ok_or_else(|| "No body in response".to_string())?;
        let breakpoints = body.get("breakpoints")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "No breakpoints in response".to_string())?;

        let result: Vec<Breakpoint> = breakpoints.iter().filter_map(|bp| {
            serde_json::from_value(bp.clone()).ok()
        }).collect();

        Ok(result)
    }

    fn continue_execution(&mut self, thread_id: i64) -> Result<(), String> {
        self.connection.send_request("continue", Some(serde_json::json!({
            "threadId": thread_id,
        })))?;
        Ok(())
    }

    fn step_over(&mut self, thread_id: i64) -> Result<(), String> {
        self.connection.send_request("next", Some(serde_json::json!({
            "threadId": thread_id,
        })))?;
        Ok(())
    }

    fn step_into(&mut self, thread_id: i64) -> Result<(), String> {
        // Use stepIn with filtering to avoid Go internals
        // The skipFiles configuration should prevent stepping into runtime code
        self.connection.send_request("stepIn", Some(serde_json::json!({
            "threadId": thread_id,
            "targetId": null,
            "granularity": "statement"
        })))?;
        Ok(())
    }

    fn step_out(&mut self, thread_id: i64) -> Result<(), String> {
        self.connection.send_request("stepOut", Some(serde_json::json!({
            "threadId": thread_id,
        })))?;
        Ok(())
    }

    fn pause(&mut self, thread_id: i64) -> Result<(), String> {
        self.connection.send_request("pause", Some(serde_json::json!({
            "threadId": thread_id,
        })))?;
        Ok(())
    }

    fn stack_trace(&mut self, thread_id: i64) -> Result<Vec<StackFrame>, String> {
        let response = self.connection.send_request("stackTrace", Some(serde_json::json!({
            "threadId": thread_id,
        })))?;

        let body = response.body
            .ok_or_else(|| "No body in response".to_string())?;
        let frames = body.get("stackFrames")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "No stack frames in response".to_string())?;

        let result: Vec<StackFrame> = frames.iter().filter_map(|frame| {
            serde_json::from_value(frame.clone()).ok()
        }).collect();

        Ok(result)
    }

    fn scopes(&mut self, frame_id: i64) -> Result<Vec<Scope>, String> {
        let response = self.connection.send_request("scopes", Some(serde_json::json!({
            "frameId": frame_id,
        })))?;

        let body = response.body
            .ok_or_else(|| "No body in response".to_string())?;
        let scopes = body.get("scopes")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "No scopes in response".to_string())?;

        let result: Vec<Scope> = scopes.iter().filter_map(|scope| {
            serde_json::from_value(scope.clone()).ok()
        }).collect();

        Ok(result)
    }

    fn variables(&mut self, variables_reference: i64) -> Result<Vec<Variable>, String> {
        let response = self.connection.send_request("variables", Some(serde_json::json!({
            "variablesReference": variables_reference,
        })))?;

        let body = response.body
            .ok_or_else(|| "No body in response".to_string())?;
        let variables = body.get("variables")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "No variables in response".to_string())?;

        let result: Vec<Variable> = variables.iter().filter_map(|var| {
            serde_json::from_value(var.clone()).ok()
        }).collect();

        Ok(result)
    }

    fn evaluate(&mut self, expression: &str, frame_id: Option<i64>) -> Result<Variable, String> {
        let mut args = serde_json::json!({
            "expression": expression,
            "context": "repl",
        });

        if let Some(fid) = frame_id {
            args["frameId"] = serde_json::json!(fid);
        }

        let response = self.connection.send_request("evaluate", Some(args))?;

        let body = response.body
            .ok_or_else(|| "No body in response".to_string())?;
        serde_json::from_value(body.clone())
            .map_err(|e| format!("Failed to parse evaluate result: {}", e))
    }

    fn threads(&mut self) -> Result<Vec<Thread>, String> {
        let response = self.connection.send_request("threads", None)?;

        let body = response.body
            .ok_or_else(|| "No body in response".to_string())?;
        let threads = body.get("threads")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "No threads in response".to_string())?;

        let result: Vec<Thread> = threads.iter().filter_map(|thread| {
            serde_json::from_value(thread.clone()).ok()
        }).collect();

        Ok(result)
    }

    fn terminate(&mut self) -> Result<(), String> {
        // Send terminate request
        let _ = self.connection.send_request("terminate", None);

        // Send disconnect request with proper cleanup
        let _ = self.connection.send_request("disconnect", Some(serde_json::json!({
            "restart": false,
            "terminateDebuggee": true,
        })));

        // Properly terminate the connection and process
        self.connection.terminate()?;

        // Clean up the debug binary
        if let Some(ref path) = self.output_path {
            let _ = cleanup_debug_binary(path);
        }

        self.initialized = false;
        Ok(())
    }

    fn poll_events(&mut self) -> Vec<DapEvent> {
        self.connection.poll_events()
    }

    fn get_exception_breakpoint_filters(&mut self) -> Vec<crate::dap::ExceptionBreakpointFilter> {
        // Go debugger supports panic breakpoints
        vec![
            crate::dap::ExceptionBreakpointFilter {
                filter_id: "panic".to_string(),
                label: "Go Panic".to_string(),
                description: Some("Break when panic occurs".to_string()),
                default: Some(false),
                condition: None,
            },
        ]
    }

    fn set_exception_breakpoints(&mut self, filter_ids: Vec<String>) -> Result<(), String> {
        let filters: Vec<serde_json::Value> = filter_ids.iter().map(|id| {
            serde_json::json!({
                "filterId": id,
            })
        }).collect();

        let _response = self.connection.send_request("setExceptionBreakpoints", Some(serde_json::json!({
            "filters": filters
        })))?;
        Ok(())
    }
}

fn cleanup_debug_binary(output_path: &str) -> Result<(), String> {
    // Clean up the debug binary
    if std::path::Path::new(&output_path).exists() {
        let _ = std::fs::remove_file(&output_path);
        println!("[DAP] Cleaned up debug binary: {}", output_path);
    }

    // Also try with .exe extension (for Windows)
    let exe_path = format!("{}.exe", output_path);
    if std::path::Path::new(&exe_path).exists() {
        let _ = std::fs::remove_file(&exe_path);
        println!("[DAP] Cleaned up debug binary: {}", exe_path);
    }

    Ok(())
}
