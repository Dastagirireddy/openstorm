use uuid::Uuid;

use super::types::{Priority, Strategy, Task, TaskContext, TaskKind};

pub fn decompose(msg: &str, context: &TaskContext) -> Vec<Task> {
    let steps: Vec<&str> = msg.split('\n').filter(|l| !l.trim().is_empty()).collect();

    let mut sub_tasks: Vec<Task> = steps
        .iter()
        .enumerate()
        .filter_map(|(i, step)| {
            let trimmed = step.trim().to_string();
            if !trimmed.is_empty() && trimmed.len() > 5 {
                Some(Task {
                    id: format!("sub-{}-{}", i, Uuid::new_v4()),
                    kind: TaskKind::SubTask {
                        parent_id: "root".to_string(),
                        description: trimmed,
                        strategy: Strategy::Simple,
                    },
                    priority: Priority::Normal,
                    context: context.clone(),
                    created_at: std::time::Instant::now(),
                })
            } else {
                None
            }
        })
        .collect();

    if sub_tasks.is_empty() {
        sub_tasks.push(Task {
            id: format!("sub-0-{}", Uuid::new_v4()),
            kind: TaskKind::SubTask {
                parent_id: "root".to_string(),
                description: msg.to_string(),
                strategy: Strategy::Simple,
            },
            priority: Priority::Normal,
            context: context.clone(),
            created_at: std::time::Instant::now(),
        });
    }

    sub_tasks
}
