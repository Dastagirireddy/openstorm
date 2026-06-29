pub mod context;
pub mod prompt;

use crate::graph::errors::GraphResult;
use crate::graph::store::GraphStore;
use crate::graph::types::GraphNode;

pub struct GraphRag<'a> {
    store: &'a GraphStore,
}

impl<'a> GraphRag<'a> {
    pub fn new(store: &'a GraphStore) -> Self {
        Self { store }
    }

    pub fn get_context_for_query(&self, query: &str, max_tokens: usize) -> GraphResult<Vec<GraphNode>> {
        context::build_context(self.store, query, max_tokens)
    }

    pub fn build_llm_prompt(&self, query: &str, nodes: &[GraphNode]) -> String {
        prompt::build_prompt(query, nodes)
    }
}
