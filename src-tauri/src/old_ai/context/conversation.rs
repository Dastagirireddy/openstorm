use super::super::Message;
use std::collections::{HashSet, VecDeque};

/// Heuristic token encoder (~4 chars per token).
pub struct TokenEncoder {
    chars_per_token: f64,
}

impl TokenEncoder {
    pub fn new() -> Self {
        Self { chars_per_token: 4.0 }
    }

    pub fn count(&self, text: &str) -> usize {
        (text.len() as f64 / self.chars_per_token) as usize + 4
    }

    pub fn count_message(&self, msg: &Message) -> usize {
        let body = match msg {
            Message::System { content } => content.len(),
            Message::User { content } => content.len(),
            Message::Assistant { content, tool_calls } => {
                content.as_ref().map_or(0, |c| c.len())
                    + tool_calls.as_ref().map_or(0, |tc| {
                        tc.iter().map(|c| c.function.name.len() + c.function.arguments.len()).sum::<usize>()
                    })
            }
            Message::Tool { tool_call_id, content } => tool_call_id.len() + content.len(),
        };
        self.count(&"x".repeat(body)) + 2
    }
}

#[derive(Debug, Clone)]
pub struct MessageSummary {
    pub original_count: usize,
    pub summary: String,
    pub key_facts: Vec<String>,
}

/// Token-aware conversation context manager.
pub struct ContextManager {
    max_tokens: usize,
    encoder: TokenEncoder,
    system_prompt: String,
    summaries: Vec<MessageSummary>,
    working_set: VecDeque<Message>,
    working_tokens: usize,
    max_working_messages: usize,
}

impl ContextManager {
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

    pub fn set_system_prompt(&mut self, prompt: String) {
        self.system_prompt = prompt;
    }

    fn available_tokens(&self) -> usize {
        let system = self.encoder.count(&self.system_prompt);
        let summary: usize = self.summaries.iter().map(|s| self.encoder.count(&s.summary)).sum();
        self.max_tokens.saturating_sub(system).saturating_sub(summary).saturating_sub(100)
    }

    pub fn push(&mut self, msg: Message) {
        let tokens = self.encoder.count_message(&msg);
        if self.working_tokens + tokens > self.available_tokens() {
            self.trim_to_budget();
        }
        self.working_tokens += tokens;
        self.working_set.push_back(msg);
        while self.working_set.len() > self.max_working_messages {
            if let Some(evicted) = self.working_set.pop_front() {
                self.working_tokens = self.working_tokens.saturating_sub(self.encoder.count_message(&evicted));
                self.summarize(&evicted);
            }
        }
    }

    pub fn extend(&mut self, msgs: Vec<Message>) {
        for msg in msgs { self.push(msg); }
    }

    pub fn update_progress_context(&mut self, new_progress: String) {
        let idx = self.working_set.iter().rposition(|m| matches!(m, Message::System { .. }));
        if let Some(i) = idx {
            let old = self.working_tokens.saturating_sub(self.encoder.count_message(&self.working_set[i]));
            self.working_set[i] = Message::System { content: new_progress };
            self.working_tokens = old + self.encoder.count_message(&self.working_set[i]);
        } else {
            self.push(Message::System { content: new_progress });
        }
    }

    fn trim_to_budget(&mut self) {
        let budget = self.available_tokens();
        while self.working_tokens > budget && self.working_set.len() > 2 {
            if let Some(evicted) = self.working_set.pop_front() {
                self.working_tokens = self.working_tokens.saturating_sub(self.encoder.count_message(&evicted));
                self.summarize(&evicted);
            }
        }
        if self.working_tokens > budget { self.compress_summaries(); }
    }

    fn summarize(&mut self, msg: &Message) {
        let text = match msg {
            Message::User { content } => format!("User: {}", truncate(content, 200)),
            Message::Assistant { content, tool_calls } => {
                let t = content.as_ref().map(|c| truncate(c, 200)).unwrap_or_default();
                let fns = tool_calls.as_ref().map_or(String::new(), |tc| {
                    tc.iter().map(|c| format!("{}()", c.function.name)).collect::<Vec<_>>().join(", ")
                });
                if fns.is_empty() { format!("Assistant: {}", t) } else { format!("Assistant called: {} | {}", fns, t) }
            }
            Message::Tool { content, .. } => format!("Tool result: {}", truncate(content, 150)),
            Message::System { content } => format!("System: {}", truncate(content, 200)),
        };
        let facts = extract_key_facts(msg);
        if let Some(last) = self.summaries.last_mut() {
            if last.original_count < 5 {
                last.summary.push_str(&format!("\n{}", text));
                last.original_count += 1;
                last.key_facts.extend(facts);
                return;
            }
        }
        self.summaries.push(MessageSummary { original_count: 1, summary: text, key_facts: facts });
    }

    fn compress_summaries(&mut self) {
        if self.summaries.len() <= 1 { return; }
        let all: Vec<String> = self.summaries.iter().map(|s| s.summary.clone()).collect();
        let facts: Vec<String> = self.summaries.iter().flat_map(|s| s.key_facts.clone()).collect();
        let count: usize = self.summaries.iter().map(|s| s.original_count).sum();
        self.summaries = vec![MessageSummary {
            original_count: count,
            summary: format!("Earlier conversation ({} messages):\n{}", count, truncate(&all.join("\n"), 500)),
            key_facts: facts,
        }];
    }

    pub fn build_messages(&self) -> Vec<Message> {
        let mut msgs = vec![Message::System { content: self.system_prompt.clone() }];
        if !self.summaries.is_empty() {
            let text: String = self.summaries.iter().map(|s| s.summary.as_str()).collect::<Vec<_>>().join("\n\n");
            let facts: Vec<&str> = self.summaries.iter().flat_map(|s| s.key_facts.iter().map(|f| f.as_str()))
                .collect::<HashSet<_>>().into_iter().collect();
            let mut ctx = format!("Previous context:\n{}", text);
            if !facts.is_empty() { ctx.push_str(&format!("\n\nKey facts:\n- {}", facts.join("\n- "))); }
            msgs.push(Message::System { content: ctx });
        }
        msgs.extend(self.working_set.iter().cloned());
        msgs
    }

    pub fn stats(&self) -> ContextStats {
        let system = self.encoder.count(&self.system_prompt);
        let summary: usize = self.summaries.iter().map(|s| self.encoder.count(&s.summary)).sum();
        let total = system + summary + self.working_tokens;
        ContextStats {
            max_tokens: self.max_tokens, system_tokens: system, summary_tokens: summary,
            working_tokens: self.working_tokens, total_tokens: total,
            working_messages: self.working_set.len(), summaries_count: self.summaries.len(),
            utilization: total as f64 / self.max_tokens as f64,
        }
    }

    pub fn len(&self) -> usize { self.working_set.len() }
    pub fn is_nearly_full(&self) -> bool { self.stats().utilization > 0.8 }
}

#[derive(Debug, Clone)]
pub struct ContextStats {
    pub max_tokens: usize, pub system_tokens: usize, pub summary_tokens: usize,
    pub working_tokens: usize, pub total_tokens: usize,
    pub working_messages: usize, pub summaries_count: usize, pub utilization: f64,
}

impl std::fmt::Display for ContextStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}/{} tokens ({:.0}%) | {} messages, {} summaries",
            self.total_tokens, self.max_tokens, self.utilization * 100.0, self.working_messages, self.summaries_count)
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max { return s.to_string(); }
    let end = s.char_indices().take_while(|&(i, c)| i + c.len_utf8() <= max).last().map_or(0, |(i, c)| i + c.len_utf8());
    format!("{}...", &s[..end])
}

fn extract_key_facts(msg: &Message) -> Vec<String> {
    let content = match msg {
        Message::User { content } | Message::Tool { content, .. } | Message::System { content } => content.as_str(),
        Message::Assistant { content, .. } => match content { Some(c) => c.as_str(), None => return vec![] },
    };
    let mut facts = Vec::new();
    for line in content.lines() {
        if line.contains('/') && (line.ends_with(".rs") || line.ends_with(".ts") || line.ends_with(".py")) {
            facts.push(format!("File: {}", truncate(line.split_whitespace().find(|s| s.contains('/')).unwrap_or(line), 100)));
        }
        if line.contains("fn ") || line.contains("function ") || line.contains("def ") {
            facts.push(format!("Function: {}", truncate(line.trim(), 100)));
        }
        if line.to_lowercase().contains("error") || line.to_lowercase().contains("failed") {
            facts.push(format!("Issue: {}", truncate(line.trim(), 100)));
        }
    }
    facts.truncate(5);
    facts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_counting() {
        let e = TokenEncoder::new();
        assert!(e.count("hello") > 0);
        assert!(e.count("hello world") > e.count("hello"));
    }

    #[test]
    fn test_context_manager_basic() {
        let mut ctx = ContextManager::new(10000);
        ctx.set_system_prompt("You are a helpful assistant.".to_string());
        ctx.push(Message::User { content: "Hello!".to_string() });
        assert_eq!(ctx.build_messages().len(), 2);
    }

    #[test]
    fn test_truncate() {
        assert_eq!(truncate("hello", 10), "hello");
        assert_eq!(truncate("hello world", 5), "hello...");
    }
}
