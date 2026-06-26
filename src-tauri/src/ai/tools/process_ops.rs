use super::ToolRegistry;

impl ToolRegistry {
    pub(super) async fn run_background(&self, args: &serde_json::Value) -> String {
        let command = args["command"].as_str().unwrap_or("");
        if command.is_empty() {
            return "Error: command is required".to_string();
        }

        // Validate that command doesn't escape project directory
        if let Err(e) = self.validate_working_dir(command) {
            return e;
        }

        let mut pm = self.process_manager.lock().await;
        match pm.spawn(command, &self.project_path) {
            Ok(pid) => format!("Process started in background with PID: {}", pid),
            Err(e) => format!("Failed to start background process: {}", e),
        }
    }

    pub(super) async fn read_process_output(&self, args: &serde_json::Value) -> String {
        // Try to parse pid as u64 first, then try string extraction
        let pid = if let Some(p) = args["pid"].as_u64() {
            p as u32
        } else if let Some(s) = args["pid"].as_str() {
            // Try to extract numeric part from string (e.g., "514514?" -> 514514)
            let numeric_part: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
            match numeric_part.parse::<u32>() {
                Ok(p) => p,
                Err(_) => return format!("Error: invalid pid '{}'. Must be a number.", s),
            }
        } else {
            return "Error: pid is required and must be a number".to_string();
        };

        let mut pm = self.process_manager.lock().await;
        match pm.read_output(pid).await {
            Ok((stdout, stderr, is_running)) => {
                let mut result = String::new();
                if !stdout.is_empty() {
                    result.push_str(&stdout);
                }
                if !stderr.is_empty() {
                    if !result.is_empty() {
                        result.push_str("\n--- stderr ---\n");
                    }
                    result.push_str(&stderr);
                }
                if result.is_empty() {
                    result = "(no output yet)".to_string();
                }
                if result.len() > 4000 {
                    result.truncate(4000);
                    result.push_str("\n... (truncated)");
                }
                result.push_str(&format!("\n[Process {} is {}]", pid, if is_running { "running" } else { "stopped" }));
                result
            }
            Err(e) => format!("Error reading process output: {}", e),
        }
    }

    pub(super) async fn stop_process(&self, args: &serde_json::Value) -> String {
        // Try to parse pid as u64 first, then try string extraction
        let pid = if let Some(p) = args["pid"].as_u64() {
            p as u32
        } else if let Some(s) = args["pid"].as_str() {
            // Try to extract numeric part from string (e.g., "514514?" -> 514514)
            let numeric_part: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
            match numeric_part.parse::<u32>() {
                Ok(p) => p,
                Err(_) => return format!("Error: invalid pid '{}'. Must be a number.", s),
            }
        } else {
            return "Error: pid is required and must be a number".to_string();
        };

        let mut pm = self.process_manager.lock().await;
        match pm.stop(pid).await {
            Ok(msg) => msg,
            Err(e) => format!("Error stopping process: {}", e),
        }
    }
}
