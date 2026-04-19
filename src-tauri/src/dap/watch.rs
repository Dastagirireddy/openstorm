use crate::dap::types::Variable;
use serde::{Serialize, Deserialize};

/// Represents a watch expression
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchExpression {
    pub id: u32,
    pub expression: String,
    pub value: Option<String>,
    pub type_hint: Option<String>,
    pub error: Option<String>,
}

/// Manages watch expressions for a debug session
pub struct WatchManager {
    expressions: Vec<WatchExpression>,
    next_id: u32,
}

impl WatchManager {
    pub fn new() -> Self {
        Self {
            expressions: Vec::new(),
            next_id: 1,
        }
    }

    /// Add a new watch expression
    pub fn add(&mut self, expression: String) -> u32 {
        let id = self.next_id;
        self.next_id += 1;

        let watch = WatchExpression {
            id,
            expression: expression.clone(),
            value: None,
            type_hint: None,
            error: None,
        };

        self.expressions.push(watch);
        id
    }

    /// Remove a watch expression by ID
    pub fn remove(&mut self, id: u32) -> bool {
        if let Some(pos) = self.expressions.iter().position(|w| w.id == id) {
            self.expressions.remove(pos);
            true
        } else {
            false
        }
    }

    /// Get all watch expressions (without evaluated values)
    pub fn get_all(&self) -> Vec<WatchExpression> {
        self.expressions.clone()
    }

    /// Refresh watch expressions with evaluated values
    pub fn refresh_with_values(&mut self, evaluations: Vec<Result<Variable, String>>) {
        for (i, watch) in self.expressions.iter_mut().enumerate() {
            if let Some(eval_result) = evaluations.get(i) {
                match eval_result {
                    Ok(var) => {
                        watch.value = Some(var.value.clone());
                        watch.type_hint = var.variable_type.clone();
                        watch.error = None;
                    }
                    Err(e) => {
                        watch.error = Some(e.clone());
                        watch.value = None;
                        watch.type_hint = None;
                    }
                }
            }
        }
    }
}

impl Default for WatchManager {
    fn default() -> Self {
        Self::new()
    }
}
