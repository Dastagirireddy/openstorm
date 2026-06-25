use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use super::{ChatCompletionRequest, Message, ToolCall, ToolDefinition, Usage};

/// AI Session Logger - writes complete flow to .openstorm/ai-sessions/latest.log
/// File is overwritten each session, providing full context of the most recent AI interaction.
pub struct AiSessionLog {
    file: BufWriter<File>,
    start_time: Instant,
    session_id: String,
    model: String,
}

impl AiSessionLog {
    /// Create a new session log, overwriting the previous one
    pub fn start(user_message: &str, model: &str, project_path: &str) -> Self {
        let session_dir = PathBuf::from(project_path).join(".openstorm").join("ai-sessions");
        fs::create_dir_all(&session_dir).ok();

        let log_path = session_dir.join("latest.log");
        let file = File::create(&log_path).expect("Failed to create AI session log");
        let file = BufWriter::new(file);

        let session_id = format!(
            "{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        );

        let start_time = Instant::now();

        let mut log = AiSessionLog {
            file,
            start_time,
            session_id,
            model: model.to_string(),
        };

        let divider = "═".repeat(64);
        log.write_line(&divider);
        log.write_line(&format!(
            "SESSION: {} | Model: {} | ID: {}",
            log.timestamp(),
            model,
            log.session_id
        ));
        log.write_line(&format!("User: \"{}\"", user_message));
        log.write_line(&divider);
        log.write_line("");

        log.flush();
        log
    }

    /// Log RAG indexing
    pub fn log_rag_index(&mut self, chunks: usize, files: usize, time_ms: f64, keywords: usize) {
        self.write_line("── RAG ──────────────────────────────────────────────────────");
        self.write_line(&format!(
            "[{}] Indexing project...",
            self.timestamp()
        ));
        self.write_line(&format!(
            "[{}] Indexed {} chunks from {} files in {:.1?} ({} keywords)",
            self.timestamp(),
            chunks,
            files,
            std::time::Duration::from_secs_f64(time_ms / 1000.0),
            keywords
        ));
        self.flush();
    }

    /// Log RAG context injection
    pub fn log_rag_inject(
        &mut self,
        chunks: usize,
        tokens: u64,
        query: &str,
        chunk_details: &[(String, u32, u32, f64, usize)],
    ) {
        self.write_line(&format!(
            "[{}] Injecting {} chunks (~{} tokens) for: \"{}\"",
            self.timestamp(),
            chunks,
            tokens,
            query
        ));
        for (i, (file, start, end, score, chars)) in chunk_details.iter().enumerate() {
            self.write_line(&format!(
                "  chunk {}: {}:{}-{} (score: {:.1}, {} chars)",
                i + 1,
                file,
                start,
                end,
                score,
                chars
            ));
        }
        self.write_line("");
        self.flush();
    }

    /// Log full LLM request with complete JSON
    pub fn log_llm_request(
        &mut self,
        iteration: u32,
        request: &ChatCompletionRequest,
        tools: &[ToolDefinition],
    ) {
        let msg_count = request.messages.len();
        let tool_count = tools.len();
        let total_chars: usize = request
            .messages
            .iter()
            .map(|m| match m {
                Message::System { content } => content.len(),
                Message::User { content } => content.len(),
                Message::Assistant {
                    content,
                    tool_calls,
                } => {
                    content.as_deref().unwrap_or("").len()
                        + tool_calls
                            .as_ref()
                            .map(|tc| tc.iter().map(|t| t.function.arguments.len()).sum::<usize>())
                            .unwrap_or(0)
                }
                Message::Tool { content, .. } => content.len(),
            })
            .sum();

        self.write_line(&format!(
            "── ITERATION {} ─────────────────────────────────────────────",
            iteration
        ));
        self.write_line(&format!(
            "[{}] → LLM REQUEST (model={}, msgs={}, tools={}, ~{}k chars)",
            self.timestamp(),
            request.model,
            msg_count,
            tool_count,
            total_chars / 1000
        ));

        // Log complete JSON for each message
        for (i, msg) in request.messages.iter().enumerate() {
            match msg {
                Message::System { content } => {
                    self.write_line(&format!("  msg[{}] role=system", i));
                    self.write_line("  ```json");
                    // Indent the content for readability
                    for line in content.lines() {
                        self.write_line(&format!("  {}", line));
                    }
                    self.write_line("  ```");
                }
                Message::User { content } => {
                    self.write_line(&format!("  msg[{}] role=user", i));
                    self.write_line("  ```json");
                    for line in content.lines() {
                        self.write_line(&format!("  {}", line));
                    }
                    self.write_line("  ```");
                }
                Message::Assistant {
                    content,
                    tool_calls,
                } => {
                    let tc_count = tool_calls.as_ref().map_or(0, |tc| tc.len());
                    self.write_line(&format!("  msg[{}] role=assistant tools={}", i, tc_count));
                    if let Some(calls) = tool_calls {
                        self.write_line("  tool_calls:");
                        self.write_line("  [");
                        for (j, call) in calls.iter().enumerate() {
                            let comma = if j < calls.len() - 1 { "," } else { "" };
                            self.write_line(&format!("    {{"));
                            self.write_line(&format!("      \"id\": \"{}\",", call.id));
                            self.write_line(&format!("      \"type\": \"function\","));
                            self.write_line(&format!("      \"function\": {{"));
                            self.write_line(&format!("        \"name\": \"{}\",", call.function.name));
                            self.write_line(&format!("        \"arguments\": {}", call.function.arguments));
                            self.write_line(&format!("      }}"));
                            self.write_line(&format!("    }}{}", comma));
                        }
                        self.write_line("  ]");
                    }
                }
                Message::Tool {
                    tool_call_id,
                    content,
                } => {
                    self.write_line(&format!("  msg[{}] role=tool", i));
                    self.write_line(&format!("  tool_call_id: \"{}\"", tool_call_id));
                    self.write_line("  content:");
                    self.write_line("  ```");
                    for line in content.lines() {
                        self.write_line(&format!("  {}", line));
                    }
                    self.write_line("  ```");
                }
            }
        }

        // Log tool definitions as JSON
        if !tools.is_empty() {
            self.write_line("  tools: [");
            for (i, tool) in tools.iter().enumerate() {
                let comma = if i < tools.len() - 1 { "," } else { "" };
                self.write_line(&format!("    {{"));
                self.write_line(&format!("      \"type\": \"function\","));
                self.write_line(&format!("      \"function\": {{"));
                self.write_line(&format!("        \"name\": \"{}\",", tool.function.name));
                self.write_line(&format!("        \"description\": \"{}\",", tool.function.description));
                self.write_line(&format!("        \"parameters\": {}", tool.function.parameters));
                self.write_line(&format!("      }}"));
                self.write_line(&format!("    }}{}", comma));
            }
            self.write_line("  ]");
        }

        self.write_line("");
        self.flush();
    }

    /// Log full LLM response with complete JSON
    pub fn log_llm_response(
        &mut self,
        iteration: u32,
        content: &str,
        thinking: &str,
        tool_calls: &[ToolCall],
        usage: &Option<Usage>,
        duration_ms: u64,
    ) {
        let usage_str = usage
            .as_ref()
            .map(|u| {
                format!(
                    ", prompt={}tok, completion={}tok",
                    u.prompt_tokens, u.completion_tokens
                )
            })
            .unwrap_or_default();

        self.write_line(&format!(
            "[{}] ← LLM RESPONSE ({}ms, {} thinking chars{})",
            self.timestamp(),
            duration_ms,
            thinking.len(),
            usage_str
        ));

        if !thinking.is_empty() {
            self.write_line("  thinking:");
            self.write_line("  ```");
            for line in thinking.lines() {
                self.write_line(&format!("  {}", line));
            }
            self.write_line("  ```");
        }

        if !content.is_empty() {
            self.write_line("  content:");
            self.write_line("  ```");
            for line in content.lines() {
                self.write_line(&format!("  {}", line));
            }
            self.write_line("  ```");
        }

        if !tool_calls.is_empty() {
            self.write_line("  tool_calls: [");
            for (i, tc) in tool_calls.iter().enumerate() {
                let comma = if i < tool_calls.len() - 1 { "," } else { "" };
                self.write_line(&format!("    {{"));
                self.write_line(&format!("      \"id\": \"{}\",", tc.id));
                self.write_line(&format!("      \"type\": \"function\","));
                self.write_line(&format!("      \"function\": {{"));
                self.write_line(&format!("        \"name\": \"{}\",", tc.function.name));
                self.write_line(&format!("        \"arguments\": {}", tc.function.arguments));
                self.write_line(&format!("      }}"));
                self.write_line(&format!("    }}{}", comma));
            }
            self.write_line("  ]");
        }

        self.write_line("");
        self.flush();
    }

    /// Log tool execution start
    pub fn log_tool_start(&mut self, name: &str, args: &str) {
        self.write_line(&format!(
            "[{}] ⚙ EXECUTING: {}({})",
            self.timestamp(),
            name,
            args
        ));
        self.flush();
    }

    /// Log tool execution result
    pub fn log_tool_end(&mut self, name: &str, result: &str, duration_ms: u64) {
        self.write_line(&format!(
            "[{}] ✓ RESULT: {} ({} chars, {}ms)",
            self.timestamp(),
            name,
            result.len(),
            duration_ms
        ));

        // Log complete result for all tools
        self.write_line(&format!("  result: {}", result));

        self.write_line("");
        self.flush();
    }

    /// Log todo update
    pub fn log_todo_update(&mut self, todos: &[super::agent::TodoItem]) {
        self.write_line(&format!(
            "[{}] TODO UPDATE ({} items):",
            self.timestamp(),
            todos.len()
        ));
        for todo in todos {
            self.write_line(&format!(
                "  [{}] {} ({})",
                todo.status_str(),
                todo.content,
                todo.priority_str()
            ));
        }
        self.write_line("");
        self.flush();
    }

    /// Log a general flow message
    pub fn log_flow(&mut self, message: &str) {
        self.write_line(&format!("[{}] {}", self.timestamp(), message));
        self.flush();
    }

    /// Log error
    pub fn log_error(&mut self, message: &str) {
        self.write_line(&format!("[{}] ERROR: {}", self.timestamp(), message));
        self.flush();
    }

    /// End session and write summary
    pub fn end(
        &mut self,
        total_iterations: u32,
        total_tool_calls: u32,
        total_tokens: u64,
    ) {
        let duration = self.start_time.elapsed();
        let divider = "═".repeat(64);

        self.write_line(&divider);
        self.write_line(&format!(
            "SESSION END: {} iterations, {} tool calls, ~{} tokens, {:.1}s",
            total_iterations,
            total_tool_calls,
            total_tokens,
            duration.as_secs_f64()
        ));
        self.write_line(&divider);

        self.flush();
    }

    fn write_line(&mut self, line: &str) {
        writeln!(self.file, "{}", line).ok();
    }

    fn flush(&mut self) {
        self.file.flush().ok();
    }

    fn timestamp(&self) -> String {
        let elapsed = self.start_time.elapsed();
        format!("{:.3}", elapsed.as_secs_f64())
    }
}
