use crate::dap::adapter::{DebugAdapter, DapConnection, LaunchRequestArgs, Capabilities, SetBreakpointsArgs, Breakpoint, StackFrame, Variable, Thread, Scope};

pub struct JsDebugAdapter {
    connection: DapConnection,
    initialized: bool,
}

impl JsDebugAdapter {
    pub fn new() -> Self {
        Self {
            connection: DapConnection::new(),
            initialized: false,
        }
    }

    fn find_js_debug() -> Option<String> {
        // Check cache directory for js-debug
        let home = dirs::home_dir()?;
        let cache_dir = home.join(".openstorm").join("adapters");
        let debug_server = cache_dir.join("js-debug").join("src").join("dapDebugServer.js");

        if debug_server.exists() {
            return Some(debug_server.to_str()?.to_string());
        }

        None
    }

    fn kill_existing_debug_servers() {
        // Use lsof to find processes listening on port 8123 (macOS syntax)
        let output = std::process::Command::new("lsof")
            .args(["-ti", ":8123"])
            .output();

        if let Ok(output) = output {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid in pids.lines() {
                if let Ok(pid_num) = pid.parse::<i32>() {
                    let _ = std::process::Command::new("kill")
                        .args(["-9", &pid_num.to_string()])
                        .output();
                    println!("[DAP] Killed stale js-debug process (PID {})", pid_num);
                }
            }
        }
    }
}

impl DebugAdapter for JsDebugAdapter {
    fn name(&self) -> &'static str {
        "js-debug"
    }

    fn start(&mut self, _args: &LaunchRequestArgs) -> Result<(), String> {
        let debug_server = Self::find_js_debug()
            .ok_or("js-debug debug server not found. Please install it first.")?;

        // Kill any existing js-debug process on port 8123
        Self::kill_existing_debug_servers();

        // Start node with the debug server
        self.connection.start_process("node", &vec![debug_server])?;

        // Give the server a moment to start listening
        println!("[DAP] Waiting for js-debug server to start...");
        std::thread::sleep(std::time::Duration::from_millis(1000));
        println!("[DAP] js-debug server should be ready");

        Ok(())
    }

    fn initialize(&mut self) -> Result<Capabilities, String> {
        println!("[DAP] Sending initialize request...");
        let response = self.connection.send_request("initialize", Some(serde_json::json!({
            "clientID": "openstorm",
            "clientName": "OpenStorm IDE",
            "adapterID": "js-debug",
            "linesStartAt1": true,
            "columnsStartAt1": true,
            "pathFormat": "path",
            "supportsVariableType": true,
            "supportsVariablePaging": false,
            "supportsRunInTerminalRequest": true,
            "supportsMemoryReferences": false,
        })))?;

        println!("[DAP] Initialize response received");
        self.initialized = true;

        // Access body field directly from Response
        let body: &serde_json::Value = response.body.as_ref()
            .ok_or("No body in initialize response")?;

        let capabilities: Capabilities = serde_json::from_value(body.clone())
            .map_err(|e| format!("Failed to parse capabilities: {}", e))?;

        Ok(capabilities)
    }

    fn launch(&mut self, args: &LaunchRequestArgs) -> Result<(), String> {
        let program = args.program.as_ref()
            .ok_or("No program specified in launch args")?;

        // Get the actual script name from args if available (e.g., ["run", "dev"] -> "dev")
        let script_name = args.args.as_ref()
            .and_then(|a| a.get(1).cloned())
            .filter(|_| program == "run" || program == "dev" || program == "start" || program == "test");

        let launch_args = if let Some(script) = script_name {
            println!("[DAP] Launching npm script: {}", script);
            // For npm scripts, run node directly with the main.js file
            let cwd = args.cwd.as_ref().cloned().unwrap_or_else(|| ".".to_string());
            serde_json::json!({
                "type": "pwa-node",
                "request": "launch",
                "name": args.name,
                "program": format!("{}/main.js", cwd),
                "cwd": cwd,
                "env": args.env.clone(),
                "stopOnEntry": args.stop_on_entry.unwrap_or(false),
                "console": "internalConsole",
                "internalConsoleOptions": "openOnSessionStart",
                "restart": true,
                "timeout": 30000,
                "outputCapture": "console",
                "skipFiles": ["<node_internals>/**", "**/node_modules/**"],
                // Critical: Enable child process attachment
                "autoAttachChildProcesses": true,
            })
        } else {
            println!("[DAP] Launching program: {}", program);
            // Direct file debugging
            serde_json::json!({
                "type": "pwa-node",
                "request": "launch",
                "name": args.name,
                "program": program,
                "cwd": args.cwd.as_ref().cloned().unwrap_or_else(|| ".".to_string()),
                "args": args.args.clone().unwrap_or_default(),
                "env": args.env.clone(),
                "stopOnEntry": args.stop_on_entry.unwrap_or(false),
                "console": "internalConsole",
                "outputCapture": "console",
                "autoAttachChildProcesses": true,
            })
        };

        println!("[DAP] Sending launch request...");
        // Send launch - DO NOT send configurationDone yet, caller will set breakpoints first
        let _launch_seq = self.connection.send_request_no_wait("launch", Some(launch_args))?;
        println!("[DAP] Launch sent, waiting for breakpoints to be set before configurationDone");

        // Don't send configurationDone here - caller will call finalize_launch() after setting breakpoints
        println!("[DAP] Launch request sent (configurationDone pending)");
        Ok(())
    }

    fn finalize_launch(&mut self) -> Result<(), String> {
        println!("[DAP] Sending configurationDone...");
        let _config_seq = self.connection.send_request_no_wait("configurationDone", None)?;
        println!("[DAP] configurationDone sent - debugging started");
        Ok(())
    }

    fn set_breakpoints(&mut self, args: &SetBreakpointsArgs) -> Result<Vec<Breakpoint>, String> {
        self.connection.set_breakpoints(args)
    }

    fn continue_execution(&mut self, thread_id: i64) -> Result<(), String> {
        self.connection.continue_execution(thread_id)
    }

    fn step_over(&mut self, thread_id: i64) -> Result<(), String> {
        self.connection.step_over(thread_id)
    }

    fn step_into(&mut self, thread_id: i64) -> Result<(), String> {
        self.connection.step_into(thread_id)
    }

    fn step_out(&mut self, thread_id: i64) -> Result<(), String> {
        self.connection.step_out(thread_id)
    }

    fn pause(&mut self, thread_id: i64) -> Result<(), String> {
        self.connection.pause(thread_id)
    }

    fn stack_trace(&mut self, thread_id: i64) -> Result<Vec<StackFrame>, String> {
        self.connection.stack_trace(thread_id)
    }

    fn variables(&mut self, variables_reference: i64) -> Result<Vec<Variable>, String> {
        self.connection.variables(variables_reference)
    }

    fn evaluate(&mut self, expression: &str, frame_id: Option<i64>) -> Result<Variable, String> {
        self.connection.evaluate(expression, frame_id)
    }

    fn threads(&mut self) -> Result<Vec<Thread>, String> {
        self.connection.threads()
    }

    fn scopes(&mut self, frame_id: i64) -> Result<Vec<Scope>, String> {
        self.connection.scopes(frame_id)
    }

    fn terminate(&mut self) -> Result<(), String> {
        self.connection.terminate()
    }

    fn poll_events(&mut self) -> Vec<crate::dap::adapter::DapEvent> {
        self.connection.poll_events()
    }

    fn get_exception_breakpoint_filters(&mut self) -> Vec<crate::dap::ExceptionBreakpointFilter> {
        // JavaScript/V8 debugger supports exception breakpoints
        vec![
            crate::dap::ExceptionBreakpointFilter {
                filter_id: "all".to_string(),
                label: "All Exceptions".to_string(),
                description: Some("Break on all thrown exceptions".to_string()),
                default: Some(false),
                condition: None,
            },
            crate::dap::ExceptionBreakpointFilter {
                filter_id: "uncaught".to_string(),
                label: "Uncaught Exceptions".to_string(),
                description: Some("Break on uncaught exceptions only".to_string()),
                default: Some(true),
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
