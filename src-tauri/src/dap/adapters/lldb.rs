use crate::dap::adapter::{DebugAdapter, DapConnection, Breakpoint, DapEvent};
use crate::dap::types::*;
use std::path::Path;

pub struct LldbAdapter {
    connection: DapConnection,
    initialized: bool,
}

impl LldbAdapter {
    pub fn new() -> Self {
        Self {
            connection: DapConnection::new(),
            initialized: false,
        }
    }

    fn find_lldb_dap() -> Option<String> {
        let config = crate::config::get_adapters();
        let lldb_config = &config.lldb;

        // Check search paths
        for path in &lldb_config.search_paths {
            if Path::new(path).exists() {
                return Some(path.to_string());
            }
        }

        // Check Xcode CommandLineTools path (macOS)
        for path in &lldb_config.xcode_paths {
            if Path::new(path).exists() {
                println!("[DAP] Found lldb-dap at Xcode path: {}", path);
                return Some(path.to_string());
            }
        }

        // Try to find via which/where
        #[cfg(unix)]
        {
            if let Ok(output) = std::process::Command::new("which").arg(lldb_config.binary_name).output() {
                if output.status.success() {
                    return String::from_utf8(output.stdout).ok().map(|s| s.trim().to_string());
                }
            }
        }

        None
    }
}

impl DebugAdapter for LldbAdapter {
    fn name(&self) -> &'static str {
        "lldb"
    }

    fn start(&mut self, _args: &LaunchRequestArgs) -> Result<(), String> {
        let adapter_path = Self::find_lldb_dap()
            .ok_or("lldb-dap not found. Please install Xcode or lldb.")?;

        let lldb_config = crate::config::get_adapters().lldb.clone();
        println!("[DAP] Starting lldb-dap at: {} with args: {:?}", adapter_path, lldb_config.args);
        let args: Vec<String> = lldb_config.args.iter().map(|s| s.to_string()).collect();
        self.connection.start_stdio_process(&adapter_path, &args)?;
        Ok(())
    }

    fn initialize(&mut self) -> Result<Capabilities, String> {
        let response = self.connection.send_request("initialize", Some(serde_json::json!({
            "clientID": "openstorm",
            "clientName": "OpenStorm IDE",
            "adapterID": "lldb",
            "linesStartAt1": true,
            "columnsStartAt1": true,
            "pathFormat": "path",
            "supportsVariableType": true,
            "supportsVariablePaging": false,
            "supportsRunInTerminalRequest": true,
            "supportsMemoryReferences": true,
        })))?;

        self.initialized = true;

        // Parse capabilities from response body
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
        let program = args.program.clone()
            .ok_or_else(|| "Program path is required".to_string())?;

        let mut launch_args = serde_json::json!({
            "program": program,
            "stopOnEntry": args.stop_on_entry.unwrap_or(false),
            "runInTerminal": false,
        });

        if let Some(cwd) = &args.cwd {
            launch_args["cwd"] = serde_json::json!(cwd);
        }
        if let Some(program_args) = &args.args {
            launch_args["args"] = serde_json::json!(program_args);
        }
        if let Some(env) = &args.env {
            launch_args["env"] = serde_json::json!(env);
        }

        self.connection.send_request("launch", Some(launch_args))?;
        Ok(())
    }

    fn finalize_launch(&mut self) -> Result<(), String> {
        // LLDB doesn't require configurationDone, but send it for consistency
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
        self.connection.send_request("stepIn", Some(serde_json::json!({
            "threadId": thread_id,
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

    fn terminate(&mut self) -> Result<(), String> {
        println!("[DAP lldb] terminate() called");

        // Send terminate and disconnect as fire-and-forget (don't wait for responses)
        // The adapter process may already be exiting, so waiting would deadlock
        let _ = self.connection.send_request_no_wait("terminate", Some(serde_json::json!({
            "restart": false
        })));
        println!("[DAP lldb] Sent terminate request (no wait)");

        let _ = self.connection.send_request_no_wait("disconnect", Some(serde_json::json!({
            "restart": false,
            "terminateDebuggee": true
        })));
        println!("[DAP lldb] Sent disconnect request (no wait)");

        // Force kill the connection immediately
        println!("[DAP lldb] Calling connection.terminate()");
        self.connection.terminate()?;
        self.initialized = false;
        println!("[DAP lldb] terminate() completed");
        Ok(())
    }

    fn get_exception_breakpoint_filters(&mut self) -> Vec<crate::dap::ExceptionBreakpointFilter> {
        // LLDB supports panic breakpoints for Rust
        vec![
            crate::dap::ExceptionBreakpointFilter {
                filter_id: "panic".to_string(),
                label: "Rust Panic".to_string(),
                description: Some("Break when panic! is called".to_string()),
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

    fn poll_events(&mut self) -> Vec<DapEvent> {
        self.connection.poll_events()
    }
}
