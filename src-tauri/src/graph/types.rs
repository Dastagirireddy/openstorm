use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum NodeKind {
    File,
    Module,
    Function,
    Struct,
    Enum,
    Trait,
    Impl,
    Import,
    Constant,
    Type,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EdgeKind {
    Calls,
    Imports,
    Implements,
    Extends,
    Uses,
    Contains,
    References,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    pub file_path: String,
    pub start_line: u32,
    pub end_line: u32,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub kind: EdgeKind,
    pub file_path: String,
    pub line: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}
