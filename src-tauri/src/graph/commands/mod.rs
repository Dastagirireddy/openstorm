pub mod build_project;
pub mod get_graph;
pub mod get_neighbors;
pub mod search;
pub mod navigate;

use tauri::State;
use std::sync::Mutex;

use crate::graph::store::GraphStore;

pub struct GraphState {
    pub store: Mutex<Option<GraphStore>>,
}

impl GraphState {
    pub fn new() -> Self {
        Self {
            store: Mutex::new(None),
        }
    }
}

impl Default for GraphState {
    fn default() -> Self {
        Self::new()
    }
}
