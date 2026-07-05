use std::collections::HashMap;

use crate::graph::extractor::ExtractResult;
use crate::graph::types::{GraphData, GraphEdge, GraphNode};

pub struct GraphBuilder {
    nodes: HashMap<String, GraphNode>,
    name_index: HashMap<String, Vec<String>>,
    edges: Vec<GraphEdge>,
}

impl GraphBuilder {
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            name_index: HashMap::new(),
            edges: Vec::new(),
        }
    }

    pub fn add_extracted(&mut self, result: ExtractResult) {
        for node in result.nodes {
            self.name_index
                .entry(node.name.clone())
                .or_default()
                .push(node.id.clone());
            self.nodes.insert(node.id.clone(), node);
        }
        self.edges.extend(result.edges);
    }

    pub fn build(self) -> GraphData {
        let name_index = self.name_index.clone();
        let resolved: Vec<GraphEdge> = self
            .edges
            .into_iter()
            .filter_map(|mut edge| {
                edge.source = resolve_ref(&edge.source, &self.nodes, &name_index);
                edge.target = resolve_ref(&edge.target, &self.nodes, &name_index);
                if self.nodes.contains_key(&edge.source) && self.nodes.contains_key(&edge.target) {
                    Some(edge)
                } else {
                    None
                }
            })
            .collect();

        GraphData {
            nodes: self.nodes.into_values().collect(),
            edges: resolved,
        }
    }

    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    pub fn edge_count(&self) -> usize {
        self.edges.len()
    }
}

fn resolve_ref(raw: &str, nodes: &HashMap<String, GraphNode>, name_index: &HashMap<String, Vec<String>>) -> String {
    if nodes.contains_key(raw) {
        return raw.to_string();
    }
    if let Some(ids) = name_index.get(raw) {
        if ids.len() == 1 {
            return ids[0].clone();
        }
    }
    if let Some(name) = raw.rsplit("::").next() {
        if let Some(ids) = name_index.get(name) {
            if ids.len() == 1 {
                return ids[0].clone();
            }
        }
    }
    raw.to_string()
}

impl Default for GraphBuilder {
    fn default() -> Self {
        Self::new()
    }
}
