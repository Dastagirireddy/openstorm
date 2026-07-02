use serde::{Deserialize, Serialize};

/// Individual question to ask the user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionItem {
    /// Unique ID for the answer key
    pub id: String,
    /// The question text (supports markdown)
    pub text: String,
    /// Question type determines the UI
    #[serde(default)]
    pub kind: QuestionKind,
    /// Options for choice/confirm types
    #[serde(default)]
    pub options: Vec<String>,
    /// Whether user can select multiple options
    #[serde(default)]
    pub multiple: bool,
    /// Default value if user skips
    #[serde(default)]
    pub default: Option<String>,
}

impl QuestionItem {
    /// Create a text question
    pub fn text(id: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            text: text.into(),
            kind: QuestionKind::Text,
            options: Vec::new(),
            multiple: false,
            default: None,
        }
    }

    /// Create a choice question (single select)
    pub fn choice(
        id: impl Into<String>,
        text: impl Into<String>,
        options: Vec<String>,
    ) -> Self {
        Self {
            id: id.into(),
            text: text.into(),
            kind: QuestionKind::Choice,
            options,
            multiple: false,
            default: None,
        }
    }

    /// Create a confirm question (yes/no)
    pub fn confirm(id: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            text: text.into(),
            kind: QuestionKind::Confirm,
            options: vec!["Yes".to_string(), "No".to_string()],
            multiple: false,
            default: None,
        }
    }

    /// Create a multi-select question
    pub fn multi_select(
        id: impl Into<String>,
        text: impl Into<String>,
        options: Vec<String>,
    ) -> Self {
        Self {
            id: id.into(),
            text: text.into(),
            kind: QuestionKind::MultiSelect,
            options,
            multiple: true,
            default: None,
        }
    }

    /// Set default value
    pub fn with_default(mut self, default: impl Into<String>) -> Self {
        self.default = Some(default.into());
        self
    }
}

/// Question type determines the UI rendering
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuestionKind {
    /// Text input (single line or multiline)
    Text,
    /// Choose from predefined options (single select)
    Choice,
    /// Yes/No or custom confirm
    Confirm,
    /// Multi-select from options
    MultiSelect,
}

impl Default for QuestionKind {
    fn default() -> Self {
        Self::Text
    }
}

impl QuestionKind {
    /// Get the kind name
    pub fn name(&self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Choice => "choice",
            Self::Confirm => "confirm",
            Self::MultiSelect => "multi_select",
        }
    }

    /// Parse from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "text" => Some(Self::Text),
            "choice" => Some(Self::Choice),
            "confirm" => Some(Self::Confirm),
            "multi_select" => Some(Self::MultiSelect),
            _ => None,
        }
    }
}

/// User's answer to a question
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionAnswer {
    /// Question ID
    pub id: String,
    /// Single value answer (for Text/Choice/Confirm)
    pub value: String,
    /// Multiple values (for MultiSelect)
    #[serde(default)]
    pub values: Vec<String>,
}

impl QuestionAnswer {
    /// Create a single value answer
    pub fn single(id: impl Into<String>, value: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            value: value.into(),
            values: Vec::new(),
        }
    }

    /// Create a multi-select answer
    pub fn multi(id: impl Into<String>, values: Vec<String>) -> Self {
        let value = values.first().cloned().unwrap_or_default();
        Self {
            id: id.into(),
            value,
            values,
        }
    }

    /// Check if this is a "yes" confirmation
    pub fn is_yes(&self) -> bool {
        matches!(self.value.as_str(), "Yes" | "yes" | "true" | "y")
    }

    /// Check if this is a "no" confirmation
    pub fn is_no(&self) -> bool {
        matches!(self.value.as_str(), "No" | "no" | "false" | "n")
    }
}

/// Tool definition sent to LLM
pub fn question_tool_definition() -> serde_json::Value {
    serde_json::json!({
        "name": "question",
        "description": "Ask the user a question. The user will answer before you continue. Use this when you need clarification, confirmation, or input before proceeding.",
        "parameters": {
            "type": "object",
            "properties": {
                "questions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "string",
                                "description": "Unique key for the answer"
                            },
                            "text": {
                                "type": "string",
                                "description": "Question text (markdown supported)"
                            },
                            "kind": {
                                "type": "string",
                                "enum": ["text", "choice", "confirm", "multi_select"],
                                "description": "Question type determines the UI"
                            },
                            "options": {
                                "type": "array",
                                "items": { "type": "string" },
                                "description": "Options for choice/multi_select types"
                            },
                            "multiple": {
                                "type": "boolean",
                                "description": "Whether user can select multiple options"
                            },
                            "default": {
                                "type": "string",
                                "description": "Default value if user skips"
                            }
                        },
                        "required": ["id", "text"]
                    }
                }
            },
            "required": ["questions"]
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_question_item_text() {
        let q = QuestionItem::text("name", "What is your name?");
        assert_eq!(q.id, "name");
        assert_eq!(q.text, "What is your name?");
        assert_eq!(q.kind, QuestionKind::Text);
        assert!(q.options.is_empty());
    }

    #[test]
    fn test_question_item_choice() {
        let q = QuestionItem::choice(
            "approach",
            "Which approach?",
            vec!["ToolRuntime".into(), "Direct".into()],
        );
        assert_eq!(q.kind, QuestionKind::Choice);
        assert_eq!(q.options.len(), 2);
        assert!(!q.multiple);
    }

    #[test]
    fn test_question_item_confirm() {
        let q = QuestionItem::confirm("proceed", "Proceed with changes?");
        assert_eq!(q.kind, QuestionKind::Confirm);
        assert_eq!(q.options, vec!["Yes", "No"]);
    }

    #[test]
    fn test_question_item_multi_select() {
        let q = QuestionItem::multi_select(
            "features",
            "Select features:",
            vec!["Auth".into(), "API".into(), "UI".into()],
        );
        assert!(q.multiple);
        assert_eq!(q.kind, QuestionKind::MultiSelect);
    }

    #[test]
    fn test_question_item_with_default() {
        let q = QuestionItem::text("input", "Enter value:").with_default("default_val");
        assert_eq!(q.default.as_deref(), Some("default_val"));
    }

    #[test]
    fn test_question_kind_parse() {
        assert_eq!(QuestionKind::from_str("text"), Some(QuestionKind::Text));
        assert_eq!(QuestionKind::from_str("choice"), Some(QuestionKind::Choice));
        assert_eq!(QuestionKind::from_str("confirm"), Some(QuestionKind::Confirm));
        assert_eq!(
            QuestionKind::from_str("multi_select"),
            Some(QuestionKind::MultiSelect)
        );
        assert_eq!(QuestionKind::from_str("invalid"), None);
    }

    #[test]
    fn test_question_answer_single() {
        let a = QuestionAnswer::single("approach", "ToolRuntime");
        assert_eq!(a.id, "approach");
        assert_eq!(a.value, "ToolRuntime");
        assert!(a.values.is_empty());
    }

    #[test]
    fn test_question_answer_multi() {
        let a = QuestionAnswer::multi("features", vec!["Auth".into(), "API".into()]);
        assert_eq!(a.values.len(), 2);
        assert_eq!(a.value, "Auth"); // first value
    }

    #[test]
    fn test_question_answer_is_yes() {
        assert!(QuestionAnswer::single("q", "Yes").is_yes());
        assert!(QuestionAnswer::single("q", "yes").is_yes());
        assert!(QuestionAnswer::single("q", "true").is_yes());
        assert!(QuestionAnswer::single("q", "y").is_yes());
        assert!(!QuestionAnswer::single("q", "No").is_yes());
    }

    #[test]
    fn test_question_answer_is_no() {
        assert!(QuestionAnswer::single("q", "No").is_no());
        assert!(QuestionAnswer::single("q", "no").is_no());
        assert!(QuestionAnswer::single("q", "false").is_no());
        assert!(QuestionAnswer::single("q", "n").is_no());
        assert!(!QuestionAnswer::single("q", "Yes").is_no());
    }

    #[test]
    fn test_question_tool_definition() {
        let def = question_tool_definition();
        assert_eq!(def["name"], "question");
        assert!(def["description"].is_string());
        assert!(def["parameters"]["properties"]["questions"].is_object());
    }

    #[test]
    fn test_question_item_serialization() {
        let q = QuestionItem::confirm("q1", "Proceed?");
        let json = serde_json::to_string(&q).unwrap();
        let deserialized: QuestionItem = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.kind, QuestionKind::Confirm);
    }

    #[test]
    fn test_question_answer_serialization() {
        let a = QuestionAnswer::single("q1", "yes");
        let json = serde_json::to_string(&a).unwrap();
        let deserialized: QuestionAnswer = serde_json::from_str(&json).unwrap();
        assert!(deserialized.is_yes());
    }
}
