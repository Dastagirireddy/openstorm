use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use super::super::{ChatCompletionRequest, Message, ToolCall, ToolDefinition, Usage};

/// Logs complete AI session flow to `.openstorm/ai-sessions/latest.log`.
pub struct AiSessionLog {
    file: BufWriter<File>,
    start_time: Instant,
    session_id: String,
    model: String,
}

impl AiSessionLog {
    pub fn start(user_message: &str, model: &str, project_path: &str) -> Self {
        let dir = PathBuf::from(project_path).join(".openstorm").join("ai-sessions");
        fs::create_dir_all(&dir).ok();
        let file = BufWriter::new(File::create(dir.join("latest.log")).expect("Failed to create AI session log"));
        let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
        let mut log = AiSessionLog { file, start_time: Instant::now(), session_id: ts.to_string(), model: model.into() };
        let div = "═".repeat(64);
        log.line(&div);
        log.line(&format!("SESSION: {} | Model: {} | ID: {}", log.ts(), model, log.session_id));
        log.line(&format!("User: \"{}\"", user_message));
        log.line(&div);
        log.line("");
        log.flush();
        log
    }

    pub fn log_rag_index(&mut self, chunks: usize, files: usize, time_ms: f64, keywords: usize) {
        self.line("── RAG ──────────────────────────────────────────────────────");
        self.line(&format!("[{}] Indexed {} chunks from {} files in {:.1?} ({} keywords)",
            self.ts(), chunks, files, std::time::Duration::from_secs_f64(time_ms / 1000.0), keywords));
        self.flush();
    }

    pub fn log_rag_inject(&mut self, chunks: usize, tokens: u64, query: &str, details: &[(String, u32, u32, f64, usize)]) {
        self.line(&format!("[{}] Injecting {} chunks (~{} tokens) for: \"{}\"", self.ts(), chunks, tokens, query));
        for (i, (file, start, end, score, chars)) in details.iter().enumerate() {
            self.line(&format!("  chunk {}: {}:{}-{} (score: {:.1}, {} chars)", i + 1, file, start, end, score, chars));
        }
        self.line(""); self.flush();
    }

    pub fn log_llm_request(&mut self, iteration: u32, request: &ChatCompletionRequest, tools: &[ToolDefinition]) {
        let total_chars: usize = request.messages.iter().map(|m| match m {
            Message::System { content } | Message::User { content } | Message::Tool { content, .. } => content.len(),
            Message::Assistant { content, tool_calls } => content.as_deref().unwrap_or("").len()
                + tool_calls.as_ref().map_or(0, |tc| tc.iter().map(|t| t.function.arguments.len()).sum::<usize>()),
        }).sum();
        self.line(&format!("── ITERATION {} ─────────────────────────────────────────────", iteration));
        self.line(&format!("[{}] → LLM REQUEST (model={}, msgs={}, tools={}, ~{}k chars)",
            self.ts(), request.model, request.messages.len(), tools.len(), total_chars / 1000));
        for (i, msg) in request.messages.iter().enumerate() {
            match msg {
                Message::System { content } | Message::User { content } => {
                    let role = if matches!(msg, Message::System { .. }) { "system" } else { "user" };
                    self.line(&format!("  msg[{}] role={}", i, role));
                    self.line("  ```"); for l in content.lines() { self.line(&format!("  {}", l)); } self.line("  ```");
                }
                Message::Assistant { content, tool_calls } => {
                    let tc = tool_calls.as_ref().map_or(0, |tc| tc.len());
                    self.line(&format!("  msg[{}] role=assistant tools={}", i, tc));
                    if let Some(calls) = tool_calls {
                        self.line("  tool_calls: [");
                        for (j, c) in calls.iter().enumerate() {
                            let comma = if j < calls.len() - 1 { "," } else { "" };
                            self.line(&format!("    {{ \"id\": \"{}\", \"type\": \"function\", \"function\": {{ \"name\": \"{}\", \"arguments\": {} }} }}{}", c.id, c.function.name, c.function.arguments, comma));
                        }
                        self.line("  ]");
                    }
                }
                Message::Tool { tool_call_id, content } => {
                    self.line(&format!("  msg[{}] role=tool id=\"{}\"", i, tool_call_id));
                    self.line("  ```"); for l in content.lines() { self.line(&format!("  {}", l)); } self.line("  ```");
                }
            }
        }
        if !tools.is_empty() {
            self.line("  tools: [");
            for (i, t) in tools.iter().enumerate() {
                let comma = if i < tools.len() - 1 { "," } else { "" };
                self.line(&format!("    {{ \"type\": \"function\", \"function\": {{ \"name\": \"{}\", \"description\": \"{}\", \"parameters\": {} }} }}{}", t.function.name, t.function.description, t.function.parameters, comma));
            }
            self.line("  ]");
        }
        self.line(""); self.flush();
    }

    pub fn log_llm_response(&mut self, iteration: u32, content: &str, thinking: &str, tool_calls: &[ToolCall], usage: &Option<Usage>, duration_ms: u64) {
        let usage_str = usage.as_ref().map_or(String::new(), |u| format!(", prompt={}tok, completion={}tok", u.prompt_tokens, u.completion_tokens));
        self.line(&format!("[{}] ← LLM RESPONSE ({}ms, {} thinking chars{})", self.ts(), duration_ms, thinking.len(), usage_str));
        if !thinking.is_empty() {
            self.line("  thinking: ```"); for l in thinking.lines() { self.line(&format!("  {}", l)); } self.line("  ```");
        }
        if !content.is_empty() {
            self.line("  content: ```"); for l in content.lines() { self.line(&format!("  {}", l)); } self.line("  ```");
        }
        if !tool_calls.is_empty() {
            self.line("  tool_calls: [");
            for (i, tc) in tool_calls.iter().enumerate() {
                let comma = if i < tool_calls.len() - 1 { "," } else { "" };
                self.line(&format!("    {{ \"id\": \"{}\", \"type\": \"function\", \"function\": {{ \"name\": \"{}\", \"arguments\": {} }} }}{}", tc.id, tc.function.name, tc.function.arguments, comma));
            }
            self.line("  ]");
        }
        self.line(""); self.flush();
    }

    pub fn log_tool_start(&mut self, name: &str, args: &str) {
        self.line(&format!("[{}] ⚙ EXECUTING: {}({})", self.ts(), name, args)); self.flush();
    }

    pub fn log_tool_end(&mut self, name: &str, result: &str, duration_ms: u64) {
        self.line(&format!("[{}] ✓ RESULT: {} ({} chars, {}ms)", self.ts(), name, result.len(), duration_ms));
        self.line(&format!("  result: {}", result)); self.line(""); self.flush();
    }

    pub fn log_todo_update(&mut self, todos: &[super::super::agent::TodoItem]) {
        self.line(&format!("[{}] TODO UPDATE ({} items):", self.ts(), todos.len()));
        for t in todos { self.line(&format!("  [{}] {} ({})", t.status_str(), t.content, t.priority_str())); }
        self.line(""); self.flush();
    }

    pub fn log_flow(&mut self, msg: &str) { self.line(&format!("[{}] {}", self.ts(), msg)); self.flush(); }
    pub fn log_error(&mut self, msg: &str) { self.line(&format!("[{}] ERROR: {}", self.ts(), msg)); self.flush(); }

    pub fn end(&mut self, iterations: u32, tool_calls: u32, tokens: u64) {
        let div = "═".repeat(64);
        self.line(&div);
        self.line(&format!("SESSION END: {} iterations, {} tool calls, ~{} tokens, {:.1}s",
            iterations, tool_calls, tokens, self.start_time.elapsed().as_secs_f64()));
        self.line(&div); self.flush();
    }

    fn line(&mut self, line: &str) { writeln!(self.file, "{}", line).ok(); }
    fn flush(&mut self) { self.file.flush().ok(); }
    fn ts(&self) -> String { format!("{:.3}", self.start_time.elapsed().as_secs_f64()) }
}
