use super::provider::Message;
use std::collections::VecDeque;

/// Token encoder - heuristic-based approximation
///
/// Uses ~4 chars per token as a rough estimate (works well for English code).
/// For production, swap with tiktoken-rs when build issues are resolved.
pub struct TokenEncoder {
    /// Chars per token ratio (approximate)
    chars_per_token: f64,
}

impl TokenEncoder {
    pub fn new() -> Self {
        Self {
            chars_per_token: 4.0,
        }
    }

    /// Estimate token count for a string
    pub fn count(&self, text: &str) -> usize {
        // Heuristic: ~4 chars per token for code/English
        // Add overhead for special tokens (role markers, etc.)
        let char_count = text.len();
        let base_tokens = (char_count as f64 / self.chars_per_token) as usize;

        // Account for JSON serialization overhead (~2 tokens per message)
        base_tokens + 4
    }

    /// Count tokens in a message
    pub fn count_message(&self, msg: &Message) -> usize {
        match msg {
            Message::System { content } => self.count(content) + 2,
            Message::User { content } => self.count(content) + 2,
            Message::Assistant { content, tool_calls } => {
                let content_tokens = content.as_ref().map(|c| self.count(c)).unwrap_or(0);
                let tool_tokens = tool_calls
                    .as_ref()
                    .map(|calls| {
                        calls
                            .iter()
                            .map(|c| {
                                self.count(&c.function.name)
                                    + self.count(&c.function.arguments)
                                    + 4
                            })
                            .sum::<usize>()
                    })
                    .unwrap_or(0);
                content_tokens + tool_tokens + 2
            }
            Message::Tool {
                tool_call_id,
                content,
            } => self.count(tool_call_id) + self.count(content) + 2,
        }
    }
}

/// Summary of evicted messages
#[derive(Debug, Clone)]
pub struct MessageSummary {
    pub original_count: usize,
    pub summary: String,
    pub key_facts: Vec<String>,
}

/// Context window manager - handles token-aware message management
pub struct ContextManager {
    /// Maximum tokens for the entire context window
    max_tokens: usize,
    /// Token encoder for counting
    encoder: TokenEncoder,
    /// System prompt (always included, never evicted)
    system_prompt: String,
    /// Compressed summaries of evicted messages
    summaries: Vec<MessageSummary>,
    /// Working set - recent messages that stay in context
    working_set: VecDeque<Message>,
    /// Total tokens currently in working set
    working_tokens: usize,
    /// Maximum messages to keep in working set
    max_working_messages: usize,
}

impl ContextManager {
    /// Create a new context manager
    pub fn new(max_tokens: usize) -> Self {
        Self {
            max_tokens,
            encoder: TokenEncoder::new(),
            system_prompt: String::new(),
            summaries: Vec::new(),
            working_set: VecDeque::new(),
            working_tokens: 0,
            max_working_messages: 50,
        }
    }

    /// Set the system prompt (always included, never evicted)
    pub fn set_system_prompt(&mut self, prompt: String) {
        self.system_prompt = prompt;
    }

    /// Get available tokens after accounting for system prompt and summaries
    fn available_tokens(&self) -> usize {
        let system_tokens = self.encoder.count(&self.system_prompt);
        let summary_tokens: usize = self
            .summaries
            .iter()
            .map(|s| self.encoder.count(&s.summary))
            .sum();
        self.max_tokens
            .saturating_sub(system_tokens)
            .saturating_sub(summary_tokens)
            .saturating_sub(100) // Safety buffer
    }

    /// Add a message to the context
    pub fn push(&mut self, msg: Message) {
        let msg_tokens = self.encoder.count_message(&msg);

        // If adding this message would exceed budget, trim first
        if self.working_tokens + msg_tokens > self.available_tokens() {
            self.trim_to_budget();
        }

        self.working_tokens += msg_tokens;
        self.working_set.push_back(msg);

        // Hard limit on working set size
        while self.working_set.len() > self.max_working_messages {
            if let Some(evicted) = self.working_set.pop_front() {
                self.working_tokens = self
                    .working_tokens
                    .saturating_sub(self.encoder.count_message(&evicted));
                self.summarize_message(&evicted);
            }
        }
    }

    /// Extend with multiple messages
    pub fn extend(&mut self, msgs: Vec<Message>) {
        for msg in msgs {
            self.push(msg);
        }
    }

    /// Trim working set until within budget by evicting oldest messages
    fn trim_to_budget(&mut self) {
        let budget = self.available_tokens();

        while self.working_tokens > budget && self.working_set.len() > 2 {
            if let Some(evicted) = self.working_set.pop_front() {
                self.working_tokens = self
                    .working_tokens
                    .saturating_sub(self.encoder.count_message(&evicted));
                self.summarize_message(&evicted);
            }
        }

        // If still over budget, compress summaries
        if self.working_tokens > budget {
            self.compress_summaries();
        }
    }

    /// Summarize an evicted message and add to summaries
    fn summarize_message(&mut self, msg: &Message) {
        let summary = match msg {
            Message::User { content } => {
                let truncated = truncate_str(content, 200);
                format!("User: {}", truncated)
            }
            Message::Assistant {
                content,
                tool_calls,
            } => {
                let text = content.as_ref().map(|c| truncate_str(c, 200)).unwrap_or_default();
                let tools = tool_calls
                    .as_ref()
                    .map(|calls| {
                        calls
                            .iter()
                            .map(|c| format!("{}()", c.function.name))
                            .collect::<Vec<_>>()
                            .join(", ")
                    })
                    .unwrap_or_default();
                if tools.is_empty() {
                    format!("Assistant: {}", text)
                } else {
                    format!("Assistant called: {} | {}", tools, text)
                }
            }
            Message::Tool {
                tool_call_id: _,
                content,
            } => {
                let truncated = truncate_str(content, 150);
                format!("Tool result: {}", truncated)
            }
            Message::System { content } => {
                let truncated = truncate_str(content, 200);
                format!("System: {}", truncated)
            }
        };

        // Extract key facts (simple heuristic)
        let key_facts = extract_key_facts(msg);

        // Add to summaries or merge with last summary
        if let Some(last) = self.summaries.last_mut() {
            if last.original_count < 5 {
                last.summary.push_str(&format!("\n{}", summary));
                last.original_count += 1;
                last.key_facts.extend(key_facts);
                return;
            }
        }

        self.summaries.push(MessageSummary {
            original_count: 1,
            summary,
            key_facts,
        });
    }

    /// Compress summaries when they take too much space
    fn compress_summaries(&mut self) {
        if self.summaries.len() <= 1 {
            return;
        }

        // Merge all summaries into one
        let all_summaries: Vec<String> = self.summaries.iter().map(|s| s.summary.clone()).collect();
        let all_facts: Vec<String> = self
            .summaries
            .iter()
            .flat_map(|s| s.key_facts.clone())
            .collect();

        let compressed_summary = MessageSummary {
            original_count: self.summaries.iter().map(|s| s.original_count).sum(),
            summary: format!(
                "Earlier conversation ({} messages):\n{}",
                self.summaries.iter().map(|s| s.original_count).sum::<usize>(),
                truncate_str(&all_summaries.join("\n"), 500)
            ),
            key_facts: all_facts,
        };

        self.summaries = vec![compressed_summary];
    }

    /// Build the final message list for the LLM
    pub fn build_messages(&self) -> Vec<Message> {
        let mut msgs = Vec::new();

        // System prompt is always first
        msgs.push(Message::System {
            content: self.system_prompt.clone(),
        });

        // Add compressed summaries as system context if available
        if !self.summaries.is_empty() {
            let summary_text: String = self
                .summaries
                .iter()
                .map(|s| s.summary.as_str())
                .collect::<Vec<_>>()
                .join("\n\n");

            let facts: Vec<&str> = self
                .summaries
                .iter()
                .flat_map(|s| s.key_facts.iter().map(|f| f.as_str()))
                .collect::<std::collections::HashSet<_>>()
                .into_iter()
                .collect();

            let mut context = format!("Previous context:\n{}", summary_text);
            if !facts.is_empty() {
                context.push_str(&format!("\n\nKey facts:\n- {}", facts.join("\n- ")));
            }

            msgs.push(Message::System { content: context });
        }

        // Add working set
        msgs.extend(self.working_set.iter().cloned());

        msgs
    }

    /// Get current token usage stats
    pub fn stats(&self) -> ContextStats {
        let system_tokens = self.encoder.count(&self.system_prompt);
        let summary_tokens: usize = self
            .summaries
            .iter()
            .map(|s| self.encoder.count(&s.summary))
            .sum();
        let working_tokens = self.working_tokens;
        let total = system_tokens + summary_tokens + working_tokens;

        ContextStats {
            max_tokens: self.max_tokens,
            system_tokens,
            summary_tokens,
            working_tokens,
            total_tokens: total,
            working_messages: self.working_set.len(),
            summaries_count: self.summaries.len(),
            utilization: total as f64 / self.max_tokens as f64,
        }
    }

    /// Get the number of messages in the working set
    pub fn len(&self) -> usize {
        self.working_set.len()
    }

    /// Check if the context is nearly full (>80% utilization)
    pub fn is_nearly_full(&self) -> bool {
        self.stats().utilization > 0.8
    }
}

/// Context window statistics
#[derive(Debug, Clone)]
pub struct ContextStats {
    pub max_tokens: usize,
    pub system_tokens: usize,
    pub summary_tokens: usize,
    pub working_tokens: usize,
    pub total_tokens: usize,
    pub working_messages: usize,
    pub summaries_count: usize,
    pub utilization: f64,
}

impl std::fmt::Display for ContextStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}/{} tokens ({:.0}%) | {} messages, {} summaries",
            self.total_tokens,
            self.max_tokens,
            self.utilization * 100.0,
            self.working_messages,
            self.summaries_count
        )
    }
}

/// Truncate a string to max_len characters
fn truncate_str(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}

/// Extract key facts from a message (simple heuristic)
fn extract_key_facts(msg: &Message) -> Vec<String> {
    let mut facts = Vec::new();

    let content = match msg {
        Message::User { content } => content,
        Message::Assistant { content, .. } => {
            if let Some(c) = content {
                c
            } else {
                return facts;
            }
        }
        Message::Tool { content, .. } => content,
        Message::System { content } => content,
    };

    // Look for file paths
    for line in content.lines() {
        // Detect file paths (simple heuristic)
        if line.contains('/') && (line.ends_with(".rs") || line.ends_with(".ts") || line.ends_with(".js") || line.ends_with(".py")) {
            let path = line.split_whitespace().find(|s| s.contains('/')).unwrap_or(line);
            facts.push(format!("File: {}", truncate_str(path, 100)));
        }

        // Detect function definitions
        if line.contains("fn ") || line.contains("function ") || line.contains("def ") {
            facts.push(format!("Function: {}", truncate_str(line.trim(), 100)));
        }

        // Detect errors
        if line.to_lowercase().contains("error") || line.to_lowercase().contains("failed") {
            facts.push(format!("Issue: {}", truncate_str(line.trim(), 100)));
        }
    }

    // Limit facts
    facts.truncate(5);
    facts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_counting() {
        let encoder = TokenEncoder::new();
        assert!(encoder.count("hello") > 0);
        assert!(encoder.count("hello world") > encoder.count("hello"));
    }

    #[test]
    fn test_context_manager_basic() {
        let mut ctx = ContextManager::new(10000);
        ctx.set_system_prompt("You are a helpful assistant.".to_string());

        ctx.push(Message::User {
            content: "Hello!".to_string(),
        });

        let msgs = ctx.build_messages();
        assert_eq!(msgs.len(), 2); // system + user
    }

    #[test]
    fn test_context_manager_trimming() {
        let mut ctx = ContextManager::new(200); // Very small context
        ctx.set_system_prompt("System prompt.".to_string());

        // Add many messages - should trigger trimming
        for i in 0..20 {
            ctx.push(Message::User {
                content: format!("Message {} with some content to fill tokens", i),
            });
        }

        let stats = ctx.stats();
        assert!(stats.total_tokens <= 200 || stats.summaries_count > 0);
    }

    #[test]
    fn test_truncate_str() {
        assert_eq!(truncate_str("hello", 10), "hello");
        assert_eq!(truncate_str("hello world", 5), "hello...");
    }
}
