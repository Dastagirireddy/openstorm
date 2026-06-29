pub mod neighbors;
pub mod path;
pub mod search;

use crate::graph::errors::GraphResult;
use crate::graph::store::GraphStore;
use crate::graph::types::{GraphEdge, GraphNode};

pub struct GraphQuery<'a> {
    store: &'a GraphStore,
}

impl<'a> GraphQuery<'a> {
    pub fn new(store: &'a GraphStore) -> Self {
        Self { store }
    }

    pub fn get_neighbors(&self, node_id: &str, depth: u32) -> GraphResult<Vec<GraphNode>> {
        neighbors::get_neighbors(self.store, node_id, depth)
    }

    pub fn shortest_path(&self, from: &str, to: &str) -> GraphResult<Vec<String>> {
        path::shortest_path(self.store, from, to)
    }

    pub fn search_nodes(&self, query: &str, limit: usize) -> GraphResult<Vec<GraphNode>> {
        search::search_nodes(self.store, query, limit)
    }
}
