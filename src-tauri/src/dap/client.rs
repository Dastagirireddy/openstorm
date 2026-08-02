use super::adapter::{DebugAdapter, DapEvent, Breakpoint};
use super::types::*;
use crate::dap::watch::WatchManager;

pub type SessionId = u32;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct DebugSession {
    pub id: SessionId,
    pub state: DebugSessionState,
    pub adapter_name: String,
}

pub struct DapClient {
    adapter: Option<Box<dyn DebugAdapter>>,
    child_adapter: Option<Box<dyn DebugAdapter>>,
    session: Option<DebugSession>,
    next_session_id: u32,
    current_thread_id: Option<i64>,
    watch_manager: WatchManager,
    last_breakpoints: std::collections::HashMap<String, Vec<crate::dap::SourceBreakpoint>>,
    pending_child_session: bool,
    child_launch_config: Option<serde_json::Value>,
}

impl DapClient {
    pub fn new() -> Self {
        Self {
            adapter: None,
            child_adapter: None,
            session: None,
            next_session_id: 1,
            current_thread_id: None,
            watch_manager: WatchManager::new(),
            last_breakpoints: std::collections::HashMap::new(),
            pending_child_session: false,
            child_launch_config: None,
        }
    }

    pub fn create_adapter(&mut self, adapter_type: &str) -> Result<(), String> {
        let adapter = super::adapter_registry::create_adapter(adapter_type)
            .or_else(|| super::adapter_registry::create_adapter_for_language(adapter_type));

        match adapter {
            Some(adapter) => {
                self.adapter = Some(adapter);
                Ok(())
            }
            None => Err(format!("Unknown adapter type: {}", adapter_type)),
        }
    }

    pub fn start_session(&mut self, args: &LaunchRequestArgs) -> Result<SessionId, String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;

        adapter.start(args)?;
        let _capabilities = adapter.initialize()?;
        adapter.launch(args)?;

        let session_id = self.next_session_id;
        self.next_session_id += 1;

        self.session = Some(DebugSession {
            id: session_id,
            state: DebugSessionState::Initializing,
            adapter_name: adapter.name().to_string(),
        });

        Ok(session_id)
    }

    /// Finalize the launch by sending configurationDone - call AFTER setting breakpoints
    pub fn finalize_launch(&mut self) -> Result<(), String> {
        let adapter = self.adapter.as_mut()
            .ok_or_else(|| "No adapter initialized".to_string())?;

        let result = adapter.finalize_launch();

        if result.is_ok() {
            if let Some(session) = &mut self.session {
                session.state = DebugSessionState::Running;
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

    /// Get the active adapter: child_adapter if it exists, otherwise root adapter.
    fn active_adapter(&mut self) -> Result<&mut Box<dyn DebugAdapter>, String> {
        if self.child_adapter.is_some() {
            Ok(self.child_adapter.as_mut().unwrap())
        } else {
            self.adapter.as_mut().ok_or_else(|| "No adapter initialized".to_string())
        }
    }

    pub fn continue_execution(&mut self) -> Result<(), String> {
        let thread_id = self.get_thread_id()?;
        let adapter = self.active_adapter()?;
        adapter.continue_execution(thread_id)?;
        if let Some(session) = &mut self.session {
            session.state = DebugSessionState::Running;
        }
        Ok(())
    }

    pub fn step_over(&mut self) -> Result<(), String> {
        let thread_id = self.get_thread_id()?;
        let adapter = self.active_adapter()?;
        adapter.step_over(thread_id)?;
        Ok(())
    }

    pub fn step_into(&mut self) -> Result<(), String> {
        let thread_id = self.get_thread_id()?;
        let adapter = self.active_adapter()?;
        adapter.step_into(thread_id)?;
        Ok(())
    }

    pub fn step_out(&mut self) -> Result<(), String> {
        let thread_id = self.get_thread_id()?;
        let adapter = self.active_adapter()?;
        adapter.step_out(thread_id)?;
        Ok(())
    }

    pub fn pause(&mut self) -> Result<(), String> {
        let thread_id = self.get_thread_id()?;
        let adapter = self.active_adapter()?;
        adapter.pause(thread_id)?;
        Ok(())
    }

    pub fn stack_trace(&mut self) -> Result<Vec<StackFrame>, String> {
        let thread_id = self.get_thread_id()?;
        let adapter = self.active_adapter()?;
        adapter.stack_trace(thread_id)
    }

    pub fn scopes(&mut self, frame_id: i64) -> Result<Vec<Scope>, String> {
        let adapter = self.active_adapter()?;
        adapter.scopes(frame_id)
    }

    pub fn variables(&mut self, variables_reference: i64) -> Result<Vec<Variable>, String> {
        let adapter = self.active_adapter()?;
        adapter.variables(variables_reference)
    }

    pub fn evaluate(&mut self, expression: &str, frame_id: Option<i64>) -> Result<Variable, String> {
        let adapter = self.active_adapter()?;
        adapter.evaluate(expression, frame_id)
    }

    pub fn get_threads(&mut self) -> Result<Vec<Thread>, String> {
        let adapter = self.active_adapter()?;
        adapter.threads()
    }

    pub fn poll_events(&mut self) -> Vec<DapEvent> {
        let mut all_events = Vec::new();

        if let Some(adapter) = &mut self.adapter {
            all_events.extend(adapter.poll_events());
        }

        if let Some(child) = &mut self.child_adapter {
            all_events.extend(child.poll_events());
        }

        for event in &all_events {
            self.update_state_from_event(event);
        }

        all_events
    }

    /// Get thread_id, using cached value or falling back to adapter.threads()
    fn get_thread_id(&mut self) -> Result<i64, String> {
        if let Some(thread_id) = self.current_thread_id {
            return Ok(thread_id);
        }
        let adapter = self.active_adapter()?;
        let threads = adapter.threads()?;
        threads.first()
            .map(|t| t.id)
            .ok_or_else(|| "No threads available".to_string())
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
                    if let Some(body) = &event.body {
                        if let Some(thread_id) = body.get("threadId").and_then(|t| t.as_i64()) {
                            self.current_thread_id = Some(thread_id);
                        }
                    }
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
        if let Some(session) = &mut self.session {
            session.state = DebugSessionState::Terminated;
        }

        if let Some(adapter) = &mut self.adapter {
            let _ = adapter.terminate();
        }

        Ok(())
    }

    pub fn get_session(&self) -> Option<&DebugSession> {
        self.session.as_ref()
    }

    pub fn clear_session(&mut self) {
        self.session = None;
        self.adapter = None;
        self.child_adapter = None;
        self.current_thread_id = None;
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

    pub fn store_breakpoints(&mut self, breakpoints: std::collections::HashMap<String, Vec<crate::dap::SourceBreakpoint>>) {
        self.last_breakpoints = breakpoints;
    }

    pub fn set_pending_child_session(&mut self, pending: bool) {
        self.pending_child_session = pending;
    }

    pub fn is_pending_child_session(&self) -> bool {
        self.pending_child_session
    }

    pub fn set_child_launch_config(&mut self, config: serde_json::Value) {
        self.child_launch_config = Some(config);
    }

    pub fn initialize_child_session(&mut self) -> Result<(), String> {
        let mut child = super::adapters::js_debug::JsDebugAdapter::new();
        child.connect_only()?;

        let _capabilities = child.initialize()?;

        if let Some(config) = self.child_launch_config.take() {
            let launch_config = serde_json::json!({
                "type": config.get("type").and_then(|v| v.as_str()).unwrap_or("pwa-node"),
                "request": "launch",
                "name": config.get("name").and_then(|v| v.as_str()).unwrap_or("child"),
                "__pendingTargetId": config.get("__pendingTargetId").and_then(|v| v.as_str()),
            });
            child.send_request_no_wait("launch", Some(launch_config))?;
        }

        self.child_adapter = Some(Box::new(child));
        Ok(())
    }

    pub fn resend_breakpoints_for_child(&mut self) -> Result<(), String> {
        let child = self.child_adapter.as_mut()
            .ok_or_else(|| "No child adapter initialized".to_string())?;

        if self.last_breakpoints.is_empty() {
            self.pending_child_session = false;
            return Ok(());
        }

        let breakpoints = self.last_breakpoints.clone();
        for (path, bps) in &breakpoints {
            let args = SetBreakpointsArgs {
                source: Source {
                    path: Some(path.clone()),
                    name: None,
                    source_reference: None,
                },
                breakpoints: bps.clone(),
                source_modified: None,
            };
            if let Err(e) = child.set_breakpoints(&args) {
                eprintln!("[DAP] Failed to resend breakpoints for {}: {}", path, e);
            }
        }

        if let Err(e) = child.finalize_launch() {
            eprintln!("[DAP] Failed to send configurationDone for child session: {}", e);
        }

        self.pending_child_session = false;
        Ok(())
    }
}

impl Default for DapClient {
    fn default() -> Self {
        Self::new()
    }
}
