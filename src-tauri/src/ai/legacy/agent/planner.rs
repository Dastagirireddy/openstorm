use super::types::{PlanStep, PlanStepStatus};

/// Parse a plan from a JSON code block in the LLM's response.
///
/// Looks for JSON blocks like:
/// ```json
/// {"plan": [{"step": 1, "description": "..."}]}
/// ```
///
/// Falls back to regex parsing if no JSON block is found.
///
/// # Arguments
/// * `text` - The LLM's text response to parse.
pub fn parse_plan(text: &str) -> Vec<PlanStep> {
    // First try to find JSON plan block
    if let Some(steps) = parse_json_plan(text) {
        if !steps.is_empty() {
            return steps;
        }
    }
    // Fallback to regex parsing for backwards compatibility
    parse_plan_regex(text)
}

/// Extract JSON plan from code block.
fn parse_json_plan(text: &str) -> Option<Vec<PlanStep>> {
    // Find ```json ... ``` blocks
    let json_start = text.find("```json")?;
    let json_content = &text[json_start + 7..];
    let json_end = json_content.find("```")?;
    let json_str = &json_content[..json_end].trim();

    // Parse JSON
    let parsed: serde_json::Value = serde_json::from_str(json_str).ok()?;
    let plan_array = parsed.get("plan")?.as_array()?;

    let steps: Vec<PlanStep> = plan_array
        .iter()
        .enumerate()
        .filter_map(|(i, item)| {
            let step_num = item.get("step")?.as_u64()? as u32;
            let description = item.get("description")?.as_str()?.to_string();
            Some(PlanStep {
                step: step_num,
                description,
                status: PlanStepStatus::Pending,
            })
        })
        .collect();

    Some(steps)
}

/// Fallback regex parser for backwards compatibility.
fn parse_plan_regex(text: &str) -> Vec<PlanStep> {
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
                    steps.push(PlanStep {
                        step: step_num,
                        description: desc.to_string(),
                        status: PlanStepStatus::Pending,
                    });
                }
            }
        }
    }
    steps
}

/// Build progress context message that tells the LLM whether planning is done.
///
/// This prevents re-planning by explicitly stating the current state.
///
/// # Arguments
/// * `has_plan` - Whether a plan has been established for this request.
/// * `last_completed_step` - The step number of the last completed step, if any.
pub fn build_progress_context(has_plan: &bool, last_completed_step: &Option<u32>) -> String {
    if *has_plan {
        let step_info = match last_completed_step {
            Some(step) => format!("Step {} is done.", step),
            None => "No step completed yet.".to_string(),
        };
        format!(
            "## Progress Status\n\
             A plan has already been created for this request. {} \
             Do NOT create another plan. Instead:\n\
             - Update the TODO item for the next step to 'in_progress' using `todo_write`\n\
             - Execute that step\n\
             - When done, mark it as 'completed' and move to the next step\n\
             - When all steps are done, provide a final summary to the user",
            step_info
        )
    } else {
        "## Progress Status\n\
         No plan exists yet. Create a plan and TODO items first, then execute step by step.\n\n\
         IMPORTANT: The project identity (name, path, language) is ALREADY provided in the system prompt. \
         Do NOT include 'Identify the project' or 'Inspect project' as a plan step — you already know what this project is."
            .to_string()
    }
}
