use async_trait::async_trait;
use serde_json::Value;

use super::question_types::{QuestionAnswer, QuestionItem, question_tool_definition};
use super::tool_trait::{Tool, ToolCategory, ToolResult, ToolRuntime, TrustTier};

/// Question Tool — LLM asks user for structured input
///
/// The LLM shouldn't just "ask" in plain text. A structured `question()` tool
/// forces the LLM to define options, lets the frontend render a UI, and returns
/// a clean typed answer back to the LLM.
pub struct QuestionTool;

#[async_trait]
impl Tool for QuestionTool {
    fn name(&self) -> &str {
        "question"
    }

    fn description(&self) -> &str {
        "Ask the user a question. The user will answer before you continue. Use this when you need clarification, confirmation, or input before proceeding."
    }

    fn input_schema(&self) -> Value {
        question_tool_definition()["parameters"].clone()
    }

    async fn execute(&self, args: Value, _runtime: &ToolRuntime) -> ToolResult {
        // Parse questions from args
        let questions: Vec<QuestionItem> = match args.get("questions") {
            Some(q) => serde_json::from_value(q.clone()).unwrap_or_default(),
            None => {
                return ToolResult::error(
                    "question",
                    "Missing required field: questions",
                );
            }
        };

        if questions.is_empty() {
            return ToolResult::error("question", "No questions provided");
        }

        // Validate each question
        for q in &questions {
            if q.id.is_empty() {
                return ToolResult::error("question", "Question ID cannot be empty");
            }
            if q.text.is_empty() {
                return ToolResult::error(
                    "question",
                    &format!("Question text cannot be empty for ID: {}", q.id),
                );
            }
        }

        // Return questions as structured data for frontend
        // The actual user interaction happens via IPC events
        let response = serde_json::json!({
            "status": "awaiting_user_input",
            "questions": questions.iter().map(|q| {
                serde_json::json!({
                    "id": q.id,
                    "text": q.text,
                    "kind": q.kind.name(),
                    "options": q.options,
                    "multiple": q.multiple,
                    "default": q.default,
                })
            }).collect::<Vec<_>>(),
        });

        ToolResult::success("question", response.to_string())
    }

    fn trust_tier(&self) -> TrustTier {
        TrustTier::Safe
    }

    fn auto_approvable(&self) -> bool {
        true
    }

    fn category(&self) -> ToolCategory {
        ToolCategory::Agent
    }

    fn timeout_secs(&self) -> u64 {
        300 // 5 minutes for user to answer
    }
}

/// Parse tool call args into questions
pub fn parse_questions(args: &Value) -> Result<Vec<QuestionItem>, String> {
    let questions: Vec<QuestionItem> = serde_json::from_value(
        args.get("questions")
            .cloned()
            .ok_or("Missing questions field")?,
    )
    .map_err(|e| format!("Invalid questions format: {}", e))?;
    Ok(questions)
}

/// Validate user answers against questions
pub fn validate_answers(
    questions: &[QuestionItem],
    answers: &[QuestionAnswer],
) -> Result<(), String> {
    for q in questions {
        let answer = answers.iter().find(|a| a.id == q.id);
        match answer {
            Some(a) => {
                // Validate based on question type
                match q.kind {
                    super::question_types::QuestionKind::Choice => {
                        if !q.options.is_empty() && !q.options.contains(&a.value) {
                            return Err(format!(
                                "Invalid choice '{}' for question '{}'. Options: {:?}",
                                a.value, q.id, q.options
                            ));
                        }
                    }
                    super::question_types::QuestionKind::Confirm => {
                        if !a.is_yes() && !a.is_no() {
                            return Err(format!(
                                "Invalid confirm answer '{}' for question '{}'. Expected Yes/No",
                                a.value, q.id
                            ));
                        }
                    }
                    super::question_types::QuestionKind::MultiSelect => {
                        if a.values.is_empty() {
                            return Err(format!(
                                "No selections for multi_select question '{}'",
                                q.id
                            ));
                        }
                        for v in &a.values {
                            if !q.options.contains(v) {
                                return Err(format!(
                                    "Invalid selection '{}' for question '{}'. Options: {:?}",
                                    v, q.id, q.options
                                ));
                            }
                        }
                    }
                    super::question_types::QuestionKind::Text => {
                        if a.value.is_empty() && q.default.is_none() {
                            return Err(format!(
                                "Empty answer for text question '{}' with no default",
                                q.id
                            ));
                        }
                    }
                }
            }
            None => {
                // Check if there's a default
                if q.default.is_none() {
                    return Err(format!("No answer for question '{}' and no default set", q.id));
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_question_tool_name() {
        let tool = QuestionTool;
        assert_eq!(tool.name(), "question");
    }

    #[test]
    fn test_question_tool_schema() {
        let tool = QuestionTool;
        let schema = tool.input_schema();
        assert!(schema["properties"]["questions"].is_object());
    }

    #[test]
    fn test_parse_questions() {
        let args = json!({
            "questions": [
                {"id": "q1", "text": "What?", "kind": "text"}
            ]
        });
        let questions = parse_questions(&args).unwrap();
        assert_eq!(questions.len(), 1);
        assert_eq!(questions[0].id, "q1");
    }

    #[test]
    fn test_validate_answers_valid() {
        let questions = vec![
            QuestionItem::confirm("q1", "Proceed?"),
            QuestionItem::choice("q2", "Choose:", vec!["A".into(), "B".into()]),
        ];
        let answers = vec![
            QuestionAnswer::single("q1", "Yes"),
            QuestionAnswer::single("q2", "A"),
        ];
        assert!(validate_answers(&questions, &answers).is_ok());
    }

    #[test]
    fn test_validate_answers_invalid_choice() {
        let questions = vec![QuestionItem::choice(
            "q1",
            "Choose:",
            vec!["A".into(), "B".into()],
        )];
        let answers = vec![QuestionAnswer::single("q1", "C")];
        let result = validate_answers(&questions, &answers);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid choice"));
    }

    #[test]
    fn test_validate_answers_invalid_confirm() {
        let questions = vec![QuestionItem::confirm("q1", "Proceed?")];
        let answers = vec![QuestionAnswer::single("q1", "Maybe")];
        let result = validate_answers(&questions, &answers);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid confirm"));
    }

    #[test]
    fn test_validate_answers_missing_no_default() {
        let questions = vec![QuestionItem::text("q1", "Enter:")];
        let answers = vec![];
        let result = validate_answers(&questions, &answers);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No answer"));
    }

    #[test]
    fn test_validate_answers_missing_with_default() {
        let questions = vec![QuestionItem::text("q1", "Enter:").with_default("fallback")];
        let answers = vec![];
        assert!(validate_answers(&questions, &answers).is_ok());
    }
}
