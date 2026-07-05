/// Reusable SSE (Server-Sent Events) line parser for streaming LLM responses.
///
/// Handles the common pattern across OpenAI-compatible providers:
/// - Lines prefixed with `data: `
/// - `[DONE]` sentinel marking end of stream
/// - JSON Lines format (Ollama-style, no `data: ` prefix)
pub struct SseLineParser {
    buffer: String,
}

impl SseLineParser {
    pub fn new() -> Self {
        Self {
            buffer: String::new(),
        }
    }

    /// Feed raw bytes from the stream and return complete, trimmed lines.
    ///
    /// Handles both SSE format (`data: {...}`) and JSON Lines format (`{...}`).
    pub fn feed(&mut self, bytes: &[u8]) -> Vec<String> {
        self.buffer.push_str(&String::from_utf8_lossy(bytes));

        let mut lines = Vec::new();

        while let Some(pos) = self.buffer.find('\n') {
            let line = self.buffer[..pos].trim().to_string();
            self.buffer = self.buffer[pos + 1..].to_string();

            if line.is_empty() {
                continue;
            }

            // Strip SSE "data: " prefix if present
            let line = if let Some(rest) = line.strip_prefix("data: ") {
                rest.to_string()
            } else {
                line
            };

            lines.push(line);
        }

        lines
    }

    /// Check if a line is the stream termination sentinel.
    pub fn is_done(line: &str) -> bool {
        line == "[DONE]"
    }
}

impl Default for SseLineParser {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sse_format() {
        let mut parser = SseLineParser::new();
        let lines = parser.feed(b"data: {\"id\":\"1\"}\n\n");
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0], "{\"id\":\"1\"}");
    }

    #[test]
    fn test_json_lines_format() {
        let mut parser = SseLineParser::new();
        let lines = parser.feed(b"{\"id\":\"1\"}\n");
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0], "{\"id\":\"1\"}");
    }

    #[test]
    fn test_done_sentinel() {
        let mut parser = SseLineParser::new();
        let lines = parser.feed(b"data: [DONE]\n\n");
        assert_eq!(lines.len(), 1);
        assert!(SseLineParser::is_done(&lines[0]));
    }

    #[test]
    fn test_partial_lines() {
        let mut parser = SseLineParser::new();
        let lines1 = parser.feed(b"data: {\"id\":");
        assert!(lines1.is_empty());
        let lines2 = parser.feed(b"\"1\"}\n\n");
        assert_eq!(lines2.len(), 1);
    }
}
