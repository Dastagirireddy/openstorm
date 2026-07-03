use crate::ai_v2::response_filter::events::PlanStepData;

/// Parse a plan from LLM text output.
///
/// Looks for JSON blocks like:
/// ```json
/// {"plan": [{"step": 1, "description": "..."}]}
/// ```
///
/// Falls back to numbered list parsing if no JSON block is found.
pub fn parse_plan(text: &str) -> Vec<PlanStepData> {
    if let Some(steps) = parse_json_plan(text) {
        if !steps.is_empty() {
            return steps;
        }
    }
    parse_numbered_list(text)
}

/// Extract JSON plan from code block.
fn parse_json_plan(text: &str) -> Option<Vec<PlanStepData>> {
    let json_start = text.find("```json")?;
    let json_content = &text[json_start + 7..];
    let json_end = json_content.find("```")?;
    let json_str = &json_content[..json_end].trim();

    let parsed: serde_json::Value = serde_json::from_str(json_str).ok()?;
    let plan_array = parsed.get("plan")?.as_array()?;

    let steps: Vec<PlanStepData> = plan_array
        .iter()
        .filter_map(|item| {
            let step_num = item.get("step")?.as_u64()? as u32;
            let description = item.get("description")?.as_str()?.to_string();
            Some(PlanStepData {
                step: step_num,
                description,
                status: "pending".to_string(),
            })
        })
        .collect();

    Some(steps)
}

/// Fallback parser for numbered lists like "1. Do something" or "1) Do something".
fn parse_numbered_list(text: &str) -> Vec<PlanStepData> {
    let mut steps = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(|c: char| c.is_ascii_digit()) {
            if let Some(rest) = trimmed
                .strip_prefix(|c: char| c.is_ascii_digit())
                .and_then(|s| {
                    s.strip_prefix('.')
                        .or_else(|| s.strip_prefix(')'))
                        .or_else(|| s.strip_prefix(':'))
                })
            {
                let desc = rest.trim();
                if !desc.is_empty() && desc.len() > 5 {
                    let step_num = steps.len() as u32 + 1;
                    steps.push(PlanStepData {
                        step: step_num,
                        description: desc.to_string(),
                        status: "pending".to_string(),
                    });
                }
            }
        }
    }
    steps
}

/// Update plan step statuses based on tool results.
///
/// When a `todo_write` tool is called, sync the plan step status accordingly.
pub fn sync_plan_from_todos(
    steps: &mut [PlanStepData],
    todos: &[(String, String)], // (id, status)
) {
    for (id, status) in todos {
        if let Some(step_num) = id
            .strip_prefix("step_")
            .and_then(|s| s.parse::<u32>().ok())
        {
            if let Some(step) = steps.iter_mut().find(|s| s.step == step_num) {
                step.status = match status.as_str() {
                    "in_progress" => "in_progress".to_string(),
                    "completed" | "done" => "completed".to_string(),
                    "failed" => "failed".to_string(),
                    _ => "pending".to_string(),
                };
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_json_plan() {
        let text = r#"Here's the plan:
```json
{"plan": [{"step": 1, "description": "Read the file"}, {"step": 2, "description": "Modify the code"}]}
```
Let me execute it."#;
        let steps = parse_plan(text);
        assert_eq!(steps.len(), 2);
        assert_eq!(steps[0].description, "Read the file");
        assert_eq!(steps[1].description, "Modify the code");
        assert_eq!(steps[0].status, "pending");
    }

    #[test]
    fn test_parse_numbered_list() {
        let text = "1. Read the configuration file\n2. Update the database schema\n3. Run the tests";
        let steps = parse_plan(text);
        assert_eq!(steps.len(), 3);
        assert_eq!(steps[0].description, "Read the configuration file");
    }

    #[test]
    fn test_sync_plan_from_todos() {
        let mut steps = vec![
            PlanStepData { step: 1, description: "Step 1".into(), status: "pending".into() },
            PlanStepData { step: 2, description: "Step 2".into(), status: "pending".into() },
        ];
        let todos = vec![
            ("step_1".to_string(), "completed".to_string()),
            ("step_2".to_string(), "in_progress".to_string()),
        ];
        sync_plan_from_todos(&mut steps, &todos);
        assert_eq!(steps[0].status, "completed");
        assert_eq!(steps[1].status, "in_progress");
    }
}
