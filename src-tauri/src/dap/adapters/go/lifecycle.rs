//! Go Adapter - Lifecycle Management
//!
//! Handles debug session lifecycle: start, initialize, launch, finalize, terminate

use crate::dap::adapter::{DapConnection, DapEvent, DapMessage};
use crate::dap::types::{Capabilities, LaunchRequestArgs};
use std::net::{TcpStream, TcpListener};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};

fn find_free_port() -> Option<u16> {
    TcpListener::bind(("127.0.0.1", 0))
        .ok()
        .and_then(|listener| listener.local_addr().ok())
        .map(|addr| addr.port())
}

pub(super) fn cleanup_debug_binary(output_path: &str) -> Result<(), String> {
    if std::path::Path::new(&output_path).exists() {
        let _ = std::fs::remove_file(&output_path);
        println!("[DAP] Cleaned up debug binary: {}", output_path);
    }

    let exe_path = format!("{}.exe", output_path);
    if std::path::Path::new(&exe_path).exists() {
        let _ = std::fs::remove_file(&exe_path);
        println!("[DAP] Cleaned up debug binary: {}", exe_path);
    }

    Ok(())
}

pub(super) struct GoLifecycle {
    connection: DapConnection,
    output_path: Option<String>,
}

impl GoLifecycle {
    pub(super) fn new() -> Self {
        Self {
            connection: DapConnection::new(),
            output_path: None,
        }
    }

    pub(super) fn find_delve() -> Option<String> {
        let paths = crate::config::get_adapters().delve.search_paths.clone();

        for path in &paths {
            let expanded = if path.starts_with("~/") {
                dirs::home_dir()?.join(path.trim_start_matches("~/")).to_string_lossy().to_string()
            } else {
                path.to_string()
            };
            if std::path::Path::new(&expanded).exists() {
                return Some(expanded);
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

    pub(super) fn start(&mut self, args: &LaunchRequestArgs) -> Result<(), String> {
        let dlv_path = Self::find_delve()
            .ok_or("dlv (Delve) not found. Please install with: go install github.com/go-delve/delve/cmd/dlv@latest")?;

        println!("[DAP] Starting delve DAP server...");

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

        let stdout = child.stdout.take().ok_or("Failed to capture delve stdout")?;
        let tx = self.connection.get_response_tx().clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(output) => {
                        println!("[DAP] Delve stdout: {}", output);
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

        let stderr = child.stderr.take().ok_or("Failed to capture delve stderr")?;
        let tx_stderr = self.connection.get_response_tx().clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                match line {
                    Ok(output) => {
                        println!("[DAP] Delve stderr: {}", output);
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

        std::thread::sleep(std::time::Duration::from_millis(500));

        println!("[DAP] Connecting to delve at 127.0.0.1:{}...", port);
        let stream = TcpStream::connect(format!("127.0.0.1:{}", port))
            .map_err(|e| format!("Failed to connect to delve: {}", e))?;

        self.connection.set_tcp_stream(stream);
        self.connection.set_process(child);

        println!("[DAP] Connected to delve DAP server");
        Ok(())
    }

    pub(super) fn initialize(&mut self) -> Result<Capabilities, String> {
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

    pub(super) fn launch(&mut self, args: &LaunchRequestArgs) -> Result<(), String> {
        let program = args.program.clone().unwrap_or_else(|| ".".to_string());

        let config_paths = crate::config::get_paths();
        let workspace_debug_dir = if let Some(cwd) = &args.cwd {
            PathBuf::from(cwd).join(&config_paths.debug_output_dir)
        } else {
            config_paths.debug_output_dir.clone()
        };
        let output_path = workspace_debug_dir.join(&crate::config::get_adapters().delve.debug_output_name);

        self.output_path = Some(output_path.to_string_lossy().to_string());

        let _ = std::fs::remove_file(&output_path);
        let _ = std::fs::remove_file(format!("{}.exe", output_path.display()));

        let mut launch_args = serde_json::json!({
            "program": program,
            "stopOnEntry": args.stop_on_entry.unwrap_or(false),
            "mode": "debug",
            "showLog": true,
            "dlvFlags": ["--check-go-version=false"],
            "output": output_path
        });

        if let Some(cwd) = &args.cwd {
            launch_args["cwd"] = serde_json::json!(cwd);
        }
        if let Some(env) = &args.env {
            launch_args["env"] = serde_json::json!(env);
        }

        self.connection.send_request("launch", Some(launch_args))?;

        let _ = self.connection.send_request_no_wait("setSteppingGranularity", Some(serde_json::json!({
            "granularity": "statement"
        })));

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

    pub(super) fn finalize_launch(&mut self) -> Result<(), String> {
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

    pub(super) fn terminate(&mut self) -> Result<(), String> {
        let _ = self.connection.send_request("terminate", None);

        let _ = self.connection.send_request("disconnect", Some(serde_json::json!({
            "restart": false,
            "terminateDebuggee": true,
        })));

        self.connection.terminate()?;

        if let Some(ref path) = self.output_path {
            let _ = cleanup_debug_binary(path);
        }

        Ok(())
    }

    pub(super) fn get_connection(&self) -> &DapConnection {
        &self.connection
    }

    pub(super) fn get_connection_mut(&mut self) -> &mut DapConnection {
        &mut self.connection
    }
}
