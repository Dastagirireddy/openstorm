pub mod context;
pub mod prompt;

use crate::graph::errors::GraphResult;
use crate::graph::store::GraphStore;
use crate::graph::types::{GraphEdge, GraphNode};

pub struct GraphRag<'a> {
    store: &'a GraphStore,
}

impl<'a> GraphRag<'a> {
    pub fn new(store: &'a GraphStore) -> Self {
        Self { store }
    }

    pub fn get_context_for_query(
        &self,
        query: &str,
        max_tokens: usize,
    ) -> GraphResult<GraphContext> {
        context::build_context(self.store, query, max_tokens)
    }

    pub fn build_llm_prompt(&self, query: &str, ctx: &GraphContext) -> String {
        prompt::build_prompt(query, ctx)
    }
}

/// Rich context returned by graph-aware RAG
pub struct GraphContext {
    /// Direct matches for the query
    pub matches: Vec<GraphNode>,
    /// Neighbors of matches (depth 1-2)
    pub neighbors: Vec<GraphNode>,
    /// Edges connecting all nodes in context
    pub edges: Vec<GraphEdge>,
    /// Estimated token count
    pub token_estimate: usize,
}

impl GraphContext {
    pub fn all_node_ids(&self) -> Vec<&str> {
        let mut ids: Vec<&str> = self
            .matches
            .iter()
            .chain(self.neighbors.iter())
            .map(|n| n.id.as_str())
            .collect();
        ids.sort();
        ids.dedup();
        ids
    }

    pub fn nodes_by_id(&self) -> std::collections::HashMap<&str, &GraphNode> {
        let mut map = std::collections::HashMap::new();
        for n in &self.matches {
            map.insert(n.id.as_str(), n);
        }
        for n in &self.neighbors {
            map.entry(n.id.as_str()).or_insert(n);
        }
        map
    }

    pub fn edges_for_node(&self, node_id: &str) -> Vec<&GraphEdge> {
        self.edges
            .iter()
            .filter(|e| e.source == node_id || e.target == node_id)
            .collect()
    }
}
