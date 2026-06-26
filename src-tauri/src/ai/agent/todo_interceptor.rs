use super::types::{PlanStep, PlanStepStatus, TodoItem, TodoPriority, TodoStatus};
use super::Agent;

/// Try to detect and process todo_write JSON output as text.
///
/// Some models output the todo_write arguments as plain text instead of a tool call.
/// This function detects that pattern and processes the todos.
///
/// # Arguments
/// * `agent` - Reference to the agent (for todo/plan state).
/// * `text` - The model's text output to inspect.
///
/// # Returns
/// `true` if todos were successfully intercepted and processed.
pub async fn try_intercept_todo_write_text(agent: &Agent, text: &str) -> bool {
    let trimmed = text.trim();

    if let Some(json_str) = extract_todos_json(trimmed) {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str) {
            if let Some(todos_arg) = parsed.get("todos").and_then(|v| v.as_array()) {
                let mut new_todos = Vec::new();
                for (idx, todo_args) in todos_arg.iter().enumerate() {
                    let id = todo_args["id"].as_str().unwrap_or("");
                    let content = todo_args["content"].as_str().unwrap_or("");
                    let priority_str = todo_args["priority"].as_str().unwrap_or("medium");

                    if id.is_empty() || content.is_empty() {
                        continue;
                    }

                    let status = if idx == 0 {
                        TodoStatus::InProgress
                    } else {
                        TodoStatus::Pending
                    };
                    let priority = match priority_str {
                        "high" => TodoPriority::High,
                        "low" => TodoPriority::Low,
                        _ => TodoPriority::Medium,
                    };

                    new_todos.push(TodoItem {
                        id: id.to_string(),
                        content: content.to_string(),
                        status,
                        priority,
                    });
                }

                if !new_todos.is_empty() {
                    update_agent_todos(agent, &new_todos).await;
                    return true;
                }
            }
        }
    }
    false
}

/// Update the agent's internal todo and plan state from intercepted todos.
async fn update_agent_todos(agent: &Agent, new_todos: &[TodoItem]) {
    {
        let mut todo_store = agent.todo_items.lock().await;
        *todo_store = new_todos.to_vec();
    }
    {
        let mut steps = agent.plan_steps.lock().await;
        if steps.is_empty() {
            *steps = new_todos
                .iter()
                .enumerate()
                .map(|(i, t)| PlanStep {
                    step: (i + 1) as u32,
                    description: t.content.clone(),
                    status: match t.status {
                        TodoStatus::Pending => PlanStepStatus::Pending,
                        TodoStatus::InProgress => PlanStepStatus::InProgress,
                        TodoStatus::Completed => PlanStepStatus::Done,
                        TodoStatus::Failed => PlanStepStatus::Failed,
                    },
                })
                .collect();
        }
    }
}

/// Extract JSON containing "todos" from text.
///
/// Handles text that has plan content before/after the JSON block.
/// Finds the first `{` and tries to find a matching `}` that contains "todos".
///
/// # Arguments
/// * `text` - The full text output from the model.
///
/// # Returns
/// The extracted JSON string, or `None` if not found.
pub fn extract_todos_json(text: &str) -> Option<String> {
    if let Some(start) = text.find('{') {
        let mut depth = 0;
        let mut in_string = false;
        let mut escape_next = false;

        for (i, c) in text[start..].char_indices() {
            if escape_next {
                escape_next = false;
                continue;
            }
            if c == '\\' && in_string {
                escape_next = true;
                continue;
            }
            if c == '"' {
                in_string = !in_string;
                continue;
            }
            if in_string {
                continue;
            }
            match c {
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        let json_str = &text[start..=start + i];
                        if json_str.contains("\"todos\"") {
                            return Some(json_str.to_string());
                        }
                    }
                }
                _ => {}
            }
        }
    }
    None
}
