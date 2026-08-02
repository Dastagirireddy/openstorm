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
        let cache_dir = crate::config::get_paths().adapter_dir.clone();
        let debug_server = cache_dir.join("js-debug").join("src").join("dapDebugServer.js");

        if debug_server.exists() {
            return Some(debug_server.to_str()?.to_string());
        }

        None
    }

    fn kill_existing_debug_servers() {
        let port = crate::config::get_ports().js_debug_port;
        let output = std::process::Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output();

        if let Ok(output) = output {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid in pids.lines() {
                if let Ok(pid_num) = pid.parse::<i32>() {
                    let _ = std::process::Command::new("kill")
                        .args(["-9", &pid_num.to_string()])
                        .output();
                }
            }
        }
    }
}

impl JsDebugAdapter {
    /// Connect to an existing js-debug server (for child sessions)
    pub fn connect_only(&mut self) -> Result<(), String> {
        let port = crate::config::get_ports().js_debug_port;
        self.connection.connect_tcp(port)?;
        Ok(())
    }

    pub fn send_request_no_wait(&mut self, command: &str, arguments: Option<serde_json::Value>) -> Result<u32, String> {
        self.connection.send_request_no_wait(command, arguments)
    }
}

impl DebugAdapter for JsDebugAdapter {
    fn name(&self) -> &'static str {
        "js-debug"
    }

    fn start(&mut self, _args: &LaunchRequestArgs) -> Result<(), String> {
        let debug_server = Self::find_js_debug()
            .ok_or("js-debug debug server not found. Please install it first.")?;

        Self::kill_existing_debug_servers();

        self.connection.start_process("node", &vec![debug_server])?;

        // Give the server a moment to start listening
        std::thread::sleep(std::time::Duration::from_millis(1000));

        Ok(())
    }

    fn initialize(&mut self) -> Result<Capabilities, String> {
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

        self.initialized = true;

        let body: &serde_json::Value = response.body.as_ref()
            .ok_or("No body in initialize response")?;

        let capabilities: Capabilities = serde_json::from_value(body.clone())
            .map_err(|e| format!("Failed to parse capabilities: {}", e))?;

        Ok(capabilities)
    }

    fn launch(&mut self, args: &LaunchRequestArgs) -> Result<(), String> {
        let program = args.program.as_ref()
            .ok_or("No program specified in launch args")?;

        let launch_args = serde_json::json!({
            "type": "pwa-node",
            "request": "launch",
            "name": args.name,
            "program": program,
            "cwd": args.cwd.as_ref().cloned().unwrap_or_else(|| ".".to_string()),
            "args": args.args.clone().unwrap_or_default(),
            "env": args.env.clone(),
            "stopOnEntry": args.stop_on_entry.unwrap_or(false),
            "console": "internalConsole",
            "internalConsoleOptions": "openOnSessionStart",
            "outputCapture": "console",
            "skipFiles": ["<node_internals>/**", "**/node_modules/**"],
            "autoAttachChildProcesses": true,
            "timeout": 30000,
        });

        // js-debug handles launch asynchronously and never sends a response to "launch".
        let _launch_seq = self.connection.send_request_no_wait("launch", Some(launch_args))?;

        Ok(())
    }

    fn finalize_launch(&mut self) -> Result<(), String> {
        let _config_seq = self.connection.send_request_no_wait("configurationDone", None)?;
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
        // Fire-and-forget disconnect — js-debug closes the connection without responding
        let _ = self.connection.send_request_no_wait("disconnect", Some(serde_json::json!({
            "restart": false,
            "terminateDebuggee": true,
        })));
        // Give the debug server time to kill the child process
        std::thread::sleep(std::time::Duration::from_millis(300));
        self.connection.terminate()
    }

    fn poll_events(&mut self) -> Vec<crate::dap::adapter::DapEvent> {
        self.connection.poll_events()
    }

    fn is_process_alive(&mut self) -> bool {
        self.connection.is_process_alive()
    }

    fn get_exception_breakpoint_filters(&mut self) -> Vec<crate::dap::ExceptionBreakpointFilter> {
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
