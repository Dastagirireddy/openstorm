pub mod registry;
pub mod rust;
pub mod typescript;
pub mod python;
pub mod go;

use crate::graph::types::{EdgeKind, GraphEdge, GraphNode, NodeKind};

pub struct ExtractResult {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

pub trait LanguageExtractor: Send + Sync {
    fn language(&self) -> &str;
    fn extensions(&self) -> &[&str];
    fn extract(&self, file_path: &str, content: &str) -> ExtractResult;
}

pub fn create_node(
    kind: NodeKind,
    name: &str,
    file_path: &str,
    start_line: u32,
    end_line: u32,
    language: &str,
) -> GraphNode {
    let id = format!("{}::{}", file_path, name);
    GraphNode {
        id,
        kind,
        name: name.to_string(),
        file_path: file_path.to_string(),
        start_line,
        end_line,
        language: language.to_string(),
    }
}

pub fn create_edge(
    source: &str,
    target: &str,
    kind: EdgeKind,
    file_path: &str,
    line: u32,
) -> GraphEdge {
    GraphEdge {
        source: source.to_string(),
        target: target.to_string(),
        kind,
        file_path: file_path.to_string(),
        line,
    }
}
