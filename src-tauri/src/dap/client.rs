use super::adapter::{DebugAdapter, DapEvent, Breakpoint};
use super::types::*;
use crate::dap::adapters::{LldbAdapter, JsDebugAdapter, GoAdapter};
use crate::dap::watch::WatchManager;

pub type SessionId = u32;

#[derive(Debug, Clone)]
pub struct DebugSession {
    pub id: SessionId,
    pub state: DebugSessionState,
    pub adapter_name: String,
}

pub struct DapClient {
    adapter: Option<Box<dyn DebugAdapter>>,
    session: Option<DebugSession>,
    next_session_id: u32,
    watch_manager: WatchManager,
}

impl DapClient {
    pub fn new() -> Self {
        Self {
            adapter: None,
            session: None,
            next_session_id: 1,
            watch_manager: WatchManager::new(),
        }
    }

    pub fn create_adapter(&mut self, adapter_type: &str) -> Result<(), String> {
        match adapter_type {
            "lldb" | "rust" => {
                self.adapter = Some(Box::new(LldbAdapter::new()));
                Ok(())
            }
            "js-debug" | "javascript" | "typescript" => {
                self.adapter = Some(Box::new(JsDebugAdapter::new()));
                Ok(())
            }
            "delve" | "go" => {
                self.adapter = Some(Box::new(GoAdapter::new()));
                Ok(())
            }
            _ => Err(format!("Unknown adapter type: {}", adapter_type)),
        }
    }

    pub fn start_session(&mut self, args: &LaunchRequestArgs) -> Result<SessionId, String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;

        println!("[DAP] Starting debug adapter process...");
        // Start the debug adapter process
        adapter.start(args)?;

        println!("[DAP] Initializing adapter...");
        // Initialize the adapter
        let _capabilities = adapter.initialize()?;

        println!("[DAP] Launching program...");
        // Launch the program (but don't send configurationDone yet)
        adapter.launch(args)?;

        let session_id = self.next_session_id;
        self.next_session_id += 1;

        self.session = Some(DebugSession {
            id: session_id,
            state: DebugSessionState::Initializing,
            adapter_name: adapter.name().to_string(),
        });

        println!("[DAP] Session {} created successfully", session_id);
        Ok(session_id)
    }

    /// Finalize the launch by sending configurationDone - call AFTER setting breakpoints
    pub fn finalize_launch(&mut self) -> Result<(), String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;

        println!("[DAP] Finalizing launch...");
        let result = adapter.finalize_launch();

        if let Err(ref e) = result {
            println!("[DAP] Failed to finalize launch: {}", e);
        } else {
            println!("[DAP] Launch finalized successfully");

            if let Some(session) = &mut self.session {
                session.state = DebugSessionState::Running;
                println!("[DAP] Session state set to Running");
            }
        }

        result
    }

    pub fn set_breakpoints(&mut self, source_path: &str, breakpoints: Vec<SourceBreakpoint>) -> Result<Vec<Breakpoint>, String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;

        let args = SetBreakpointsArgs {
            source: Source {
                path: Some(source_path.to_string()),
                name: None,
                source_reference: None,
            },
            breakpoints,
            source_modified: None,
        };

        adapter.set_breakpoints(&args)
    }

    pub fn continue_execution(&mut self) -> Result<(), String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;

        let threads = adapter.threads()?;
        if let Some(thread) = threads.first() {
            adapter.continue_execution(thread.id)?;
            if let Some(session) = &mut self.session {
                session.state = DebugSessionState::Running;
            }
        }
        Ok(())
    }

    pub fn step_over(&mut self) -> Result<(), String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;

        let threads = adapter.threads()?;
        if let Some(thread) = threads.first() {
            adapter.step_over(thread.id)?;
        }
        Ok(())
    }

    pub fn step_into(&mut self) -> Result<(), String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;

        let threads = adapter.threads()?;
        if let Some(thread) = threads.first() {
            adapter.step_into(thread.id)?;
        }
        Ok(())
    }

    pub fn step_out(&mut self) -> Result<(), String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;

        let threads = adapter.threads()?;
        if let Some(thread) = threads.first() {
            adapter.step_out(thread.id)?;
        }
        Ok(())
    }

    pub fn pause(&mut self) -> Result<(), String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;

        let threads = adapter.threads()?;
        if let Some(thread) = threads.first() {
            adapter.pause(thread.id)?;
        }
        Ok(())
    }

    pub fn stack_trace(&mut self) -> Result<Vec<StackFrame>, String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;

        println!("[DAP] Getting threads for stack trace...");
        let threads = adapter.threads()?;
        println!("[DAP] Got {} threads", threads.len());
        if let Some(thread) = threads.first() {
            println!("[DAP] Getting stack trace for thread {}", thread.id);
            let result = adapter.stack_trace(thread.id);
            println!("[DAP] Stack trace result: {} frames", result.as_ref().map(|v| v.len()).unwrap_or(0));
            return result;
        }
        println!("[DAP] No threads available");
        Ok(Vec::new())
    }

    pub fn scopes(&mut self, frame_id: i64) -> Result<Vec<Scope>, String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;
        adapter.scopes(frame_id)
    }

    pub fn variables(&mut self, variables_reference: i64) -> Result<Vec<Variable>, String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;
        adapter.variables(variables_reference)
    }

    pub fn evaluate(&mut self, expression: &str, frame_id: Option<i64>) -> Result<Variable, String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;
        adapter.evaluate(expression, frame_id)
    }

    pub fn get_threads(&mut self) -> Result<Vec<Thread>, String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;
        adapter.threads()
    }

    pub fn poll_events(&mut self) -> Vec<DapEvent> {
        if let Some(adapter) = &mut self.adapter {
            let events = adapter.poll_events();
            if !events.is_empty() {
                println!("[DAP client] poll_events: got {} events from adapter", events.len());
            }
            for event in &events {
                self.update_state_from_event(event);
            }
            events
        } else {
            // Only log once to avoid spam
            if !self.session.is_none() {
                println!("[DAP client] poll_events: no adapter but session exists");
            }
            Vec::new()
        }
    }

    fn update_state_from_event(&mut self, event: &DapEvent) {
        if let Some(session) = &mut self.session {
            match event.event.as_str() {
                "stopped" => {
                    let reason = event.body
                        .as_ref()
                        .and_then(|b| b.get("reason").and_then(|r| r.as_str()))
                        .unwrap_or("breakpoint");
                    session.state = DebugSessionState::Stopped(match reason {
                        "breakpoint" => StoppedReason::Breakpoint,
                        "step" => StoppedReason::Step,
                        "exception" => StoppedReason::Exception,
                        "pause" => StoppedReason::Pause,
                        "entry" => StoppedReason::Entry,
                        _ => StoppedReason::Breakpoint,
                    });
                }
                "continued" => {
                    session.state = DebugSessionState::Running;
                }
                "terminated" => {
                    session.state = DebugSessionState::Terminated;
                }
                _ => {}
            }
        }
    }

    pub fn terminate_session(&mut self) -> Result<(), String> {
        println!("[DAP client] terminate_session called");
        println!("[DAP client] Session before terminate: {:?}", self.session.as_ref().map(|s| &s.state));

        // Set state to Terminated FIRST, before trying to terminate adapter
        // This ensures the poller can detect the state even if adapter.terminate() hangs
        if let Some(session) = &mut self.session {
            session.state = DebugSessionState::Terminated;
            println!("[DAP client] Session state set to Terminated");
        }

        // Try to terminate adapter, but don't block if it hangs
        if let Some(adapter) = &mut self.adapter {
            println!("[DAP client] Calling adapter.terminate()");
            let _ = adapter.terminate(); // Ignore errors, we're terminating anyway
            println!("[DAP client] adapter.terminate() completed");
        }

        println!("[DAP client] Session after terminate: {:?}", self.session.as_ref().map(|s| &s.state));
        Ok(())
    }

    pub fn get_session(&self) -> Option<&DebugSession> {
        self.session.as_ref()
    }

    pub fn get_session_mut(&mut self) -> Option<&mut DebugSession> {
        self.session.as_mut()
    }

    pub fn clear_session(&mut self) {
        self.session = None;
        self.adapter = None;
    }

    // Watch expression methods
    pub fn add_watch_expression(&mut self, expression: String) -> u32 {
        self.watch_manager.add(expression)
    }

    pub fn remove_watch_expression(&mut self, id: u32) -> bool {
        self.watch_manager.remove(id)
    }

    pub fn get_watch_expressions(&self) -> Vec<crate::dap::watch::WatchExpression> {
        self.watch_manager.get_all()
    }

    pub fn refresh_watch_expressions(&mut self, evaluations: Vec<Result<Variable, String>>) {
        self.watch_manager.refresh_with_values(evaluations);
    }

    // Exception breakpoint methods
    pub fn get_exception_breakpoint_filters(&mut self) -> Vec<crate::dap::ExceptionBreakpointFilter> {
        if let Some(adapter) = &mut self.adapter {
            adapter.get_exception_breakpoint_filters()
        } else {
            vec![]
        }
    }

    pub fn set_exception_breakpoints(&mut self, filter_ids: Vec<String>) -> Result<(), String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;
        adapter.set_exception_breakpoints(filter_ids)
    }
}

impl Default for DapClient {
    fn default() -> Self {
        Self::new()
    }
}
