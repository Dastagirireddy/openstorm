use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Content blocks within messages — structured content
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentBlock {
    /// Plain text
    #[serde(rename = "text")]
    Text { text: String },

    /// Model reasoning (hidden from user by default)
    #[serde(rename = "reasoning")]
    Reasoning {
        reasoning: String,
        signature: Option<String>,
    },

    /// Code block with language
    #[serde(rename = "code")]
    Code { language: String, code: String },

    /// File reference
    #[serde(rename = "file_reference")]
    FileReference {
        path: String,
        line_range: Option<(u32, u32)>,
    },

    /// Tool call within AI message
    #[serde(rename = "tool_call")]
    ToolCallBlock { tool_call: ToolCall },

    /// Tool result within Tool message
    #[serde(rename = "tool_result")]
    ToolResultBlock { result: String, is_error: bool },

    /// Diff for code changes
    #[serde(rename = "diff")]
    Diff {
        file_path: String,
        hunks: Vec<DiffHunk>,
    },

    /// Error
    #[serde(rename = "error")]
    Error {
        message: String,
        code: Option<String>,
    },
}

impl ContentBlock {
    /// Create a text block
    pub fn text(text: impl Into<String>) -> Self {
        Self::Text { text: text.into() }
    }

    /// Create a code block
    pub fn code(language: impl Into<String>, code: impl Into<String>) -> Self {
        Self::Code {
            language: language.into(),
            code: code.into(),
        }
    }

    /// Create a file reference block
    pub fn file_ref(path: impl Into<String>) -> Self {
        Self::FileReference {
            path: path.into(),
            line_range: None,
        }
    }

    /// Create a file reference with line range
    pub fn file_ref_with_lines(path: impl Into<String>, start: u32, end: u32) -> Self {
        Self::FileReference {
            path: path.into(),
            line_range: Some((start, end)),
        }
    }

    /// Create an error block
    pub fn error(message: impl Into<String>) -> Self {
        Self::Error {
            message: message.into(),
            code: None,
        }
    }

    /// Check if this is a text block
    pub fn is_text(&self) -> bool {
        matches!(self, Self::Text { .. })
    }

    /// Extract text content if this is a text block
    pub fn as_text(&self) -> Option<&str> {
        match self {
            Self::Text { text } => Some(text),
            _ => None,
        }
    }

    /// Get the string representation of any block
    pub fn to_plain_text(&self) -> String {
        match self {
            Self::Text { text } => text.clone(),
            Self::Reasoning { reasoning, .. } => reasoning.clone(),
            Self::Code { code, .. } => code.clone(),
            Self::FileReference { path, line_range } => {
                match line_range {
                    Some((start, end)) => format!("{}:{}-{}", path, start, end),
                    None => path.clone(),
                }
            }
            Self::ToolCallBlock { tool_call } => {
                format!("[Tool: {}]", tool_call.name)
            }
            Self::ToolResultBlock { result, .. } => result.clone(),
            Self::Diff { file_path, .. } => format!("[Diff: {}]", file_path),
            Self::Error { message, .. } => message.clone(),
        }
    }
}

/// Tool call the model wants to execute
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    /// Unique ID for this call
    pub id: String,
    /// Tool name
    pub name: String,
    /// JSON arguments
    pub args: Value,
}

impl ToolCall {
    /// Create a new tool call
    pub fn new(id: impl Into<String>, name: impl Into<String>, args: Value) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            args,
        }
    }

    /// Get argument as string
    pub fn arg_str(&self, key: &str) -> Option<&str> {
        self.args.get(key)?.as_str()
    }

    /// Get argument as i64
    pub fn arg_i64(&self, key: &str) -> Option<i64> {
        self.args.get(key)?.as_i64()
    }

    /// Get argument as bool
    pub fn arg_bool(&self, key: &str) -> Option<bool> {
        self.args.get(key)?.as_bool()
    }

    /// Get argument as Value
    pub fn arg_value(&self, key: &str) -> Option<&Value> {
        self.args.get(key)
    }
}

/// Usage metadata for tracking token consumption
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageMetadata {
    pub input_tokens: usize,
    pub output_tokens: usize,
    pub total_tokens: usize,
    pub cache_read_tokens: Option<usize>,
    pub estimated_cost: Option<f64>,
}

impl UsageMetadata {
    /// Create new usage metadata
    pub fn new(input: usize, output: usize) -> Self {
        let total = input + output;
        Self {
            input_tokens: input,
            output_tokens: output,
            total_tokens: total,
            cache_read_tokens: None,
            estimated_cost: None,
        }
    }

    /// Set cache read tokens
    pub fn with_cache_read(mut self, tokens: usize) -> Self {
        self.cache_read_tokens = Some(tokens);
        self
    }

    /// Set estimated cost
    pub fn with_cost(mut self, cost: f64) -> Self {
        self.estimated_cost = Some(cost);
        self
    }

    /// Add another usage to this one
    pub fn add(&mut self, other: &UsageMetadata) {
        self.input_tokens += other.input_tokens;
        self.output_tokens += other.output_tokens;
        self.total_tokens += other.total_tokens;
        if let Some(other_cache) = other.cache_read_tokens {
            self.cache_read_tokens = Some(self.cache_read_tokens.unwrap_or(0) + other_cache);
        }
    }
}

/// A hunk in a diff
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub content: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_content_block_text() {
        let block = ContentBlock::text("Hello, world!");
        assert!(block.is_text());
        assert_eq!(block.as_text(), Some("Hello, world!"));
        assert_eq!(block.to_plain_text(), "Hello, world!");
    }

    #[test]
    fn test_content_block_code() {
        let block = ContentBlock::code("rust", "fn main() {}");
        assert!(!block.is_text());
        assert_eq!(block.to_plain_text(), "fn main() {}");
    }

    #[test]
    fn test_content_block_file_ref() {
        let block = ContentBlock::file_ref("src/main.rs");
        assert_eq!(block.to_plain_text(), "src/main.rs");
    }

    #[test]
    fn test_content_block_file_ref_with_lines() {
        let block = ContentBlock::file_ref_with_lines("src/main.rs", 10, 20);
        assert_eq!(block.to_plain_text(), "src/main.rs:10-20");
    }

    #[test]
    fn test_content_block_error() {
        let block = ContentBlock::error("Something went wrong");
        assert_eq!(block.to_plain_text(), "Something went wrong");
    }

    #[test]
    fn test_tool_call() {
        let tc = ToolCall::new("call-1", "read_file", json!({"path": "test.rs"}));
        assert_eq!(tc.id, "call-1");
        assert_eq!(tc.name, "read_file");
        assert_eq!(tc.arg_str("path"), Some("test.rs"));
    }

    #[test]
    fn test_tool_call_args() {
        let tc = ToolCall::new("call-1", "write_file", json!({
            "path": "test.rs",
            "line": 42,
            "append": true
        }));
        assert_eq!(tc.arg_str("path"), Some("test.rs"));
        assert_eq!(tc.arg_i64("line"), Some(42));
        assert_eq!(tc.arg_bool("append"), Some(true));
    }

    #[test]
    fn test_usage_metadata() {
        let usage = UsageMetadata::new(100, 50);
        assert_eq!(usage.input_tokens, 100);
        assert_eq!(usage.output_tokens, 50);
        assert_eq!(usage.total_tokens, 150);
    }

    #[test]
    fn test_usage_metadata_add() {
        let mut usage1 = UsageMetadata::new(100, 50);
        let usage2 = UsageMetadata::new(200, 75);
        usage1.add(&usage2);
        assert_eq!(usage1.input_tokens, 300);
        assert_eq!(usage1.output_tokens, 125);
        assert_eq!(usage1.total_tokens, 425);
    }

    #[test]
    fn test_content_block_serialization() {
        let block = ContentBlock::text("test content");
        let json = serde_json::to_string(&block).unwrap();
        let deserialized: ContentBlock = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.as_text(), Some("test content"));
    }

    #[test]
    fn test_tool_call_serialization() {
        let tc = ToolCall::new("id-1", "test_tool", json!({"key": "value"}));
        let json = serde_json::to_string(&tc).unwrap();
        let deserialized: ToolCall = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "test_tool");
    }
}
