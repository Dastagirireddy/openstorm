use rmcp::model::{CallToolRequestParams, Tool};
use rmcp::service::RunningService;
use rmcp::ServiceExt;
use tokio::process::Command;

use super::types::McpServerConfig;

pub struct McpServerConnection {
    pub config: McpServerConfig,
    pub service: Option<RunningService<rmcp::RoleClient, ()>>,
    pub tools: Vec<Tool>,
    #[allow(dead_code)]
    child_pid: Option<u32>,
}

impl McpServerConnection {
    pub async fn connect(config: &McpServerConfig) -> Result<Self, String> {
        let mut cmd = Command::new(&config.command);
        for arg in &config.args {
            cmd.arg(arg);
        }
        for (key, value) in &config.env {
            cmd.env(key, value);
        }

        // Create process group on Unix for clean tree killing
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }

        let service = ()
            .serve(rmcp::transport::TokioChildProcess::new(cmd)
                .map_err(|e| format!("Failed to spawn MCP server '{}': {}", config.name, e))?)
            .await
            .map_err(|e| format!("MCP handshake failed for '{}': {}", config.name, e))?;

        let tools = service
            .list_all_tools()
            .await
            .map_err(|e| format!("Failed to list tools from '{}': {}", config.name, e))?;

        // Try to find the child PID by looking for the process
        let child_pid = Self::find_child_pid(config);

        Ok(Self {
            config: config.clone(),
            service: Some(service),
            tools,
            child_pid,
        })
    }

    /// Find child process PID by command name
    fn find_child_pid(config: &McpServerConfig) -> Option<u32> {
        #[cfg(unix)]
        {
            use std::process::Command as StdCommand;
            let output = StdCommand::new("pgrep")
                .args(["-f", &config.command])
                .output()
                .ok()?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            stdout.lines().next()?.parse().ok()
        }
        #[cfg(not(unix))]
        {
            None
        }
    }

    pub async fn call_tool(&self, tool_name: &str, arguments: serde_json::Value) -> Result<String, String> {
        let args_map = match arguments {
            serde_json::Value::Object(m) => Some(m),
            _ => None,
        };

        let params = CallToolRequestParams {
            meta: None,
            name: tool_name.to_string().into(),
            arguments: args_map,
            task: None,
        };

        let service = self.service.as_ref().ok_or("MCP service not connected")?;
        let result = service
            .call_tool(params)
            .await
            .map_err(|e| format!("MCP tool call failed: {}", e))?;

        let mut output = Vec::new();
        for content in &result.content {
            if let Some(text_content) = content.as_text() {
                output.push(text_content.text.clone());
            } else {
                output.push("[Non-text content]".to_string());
            }
        }

        if result.is_error.unwrap_or(false) {
            Err(output.join("\n"))
        } else {
            Ok(output.join("\n"))
        }
    }

    /// Kill the MCP server and its entire process tree
    pub async fn kill_tree(&mut self) {
        // First try to cancel the service gracefully
        if let Some(service) = self.service.take() {
            let _ = service.cancel().await;
        }

        // On Unix, kill the process group if we have the PID
        #[cfg(unix)]
        {
            if let Some(pid) = self.child_pid {
                unsafe {
                    // Kill the entire process group (negative PID)
                    libc::kill(-(pid as i32), libc::SIGTERM);
                }
                // Give processes time to cleanup
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                // Force kill if still alive
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGKILL);
                }
            }
        }
    }
}
