use rusqlite::params;

use crate::graph::errors::GraphResult;
use crate::graph::types::{GraphData, GraphEdge, GraphNode, NodeKind};

use super::GraphStore;

impl GraphStore {
    pub fn get_all_nodes(&self) -> GraphResult<Vec<GraphNode>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, kind, name, file_path, start_line, end_line, language FROM nodes",
        )?;

        let nodes = stmt
            .query_map([], |row| {
                Ok(GraphNode {
                    id: row.get(0)?,
                    kind: parse_node_kind(row.get::<_, String>(1)?),
                    name: row.get(2)?,
                    file_path: row.get(3)?,
                    start_line: row.get(4)?,
                    end_line: row.get(5)?,
                    language: row.get(6)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(nodes)
    }

    pub fn get_all_edges(&self) -> GraphResult<Vec<GraphEdge>> {
        let mut stmt = self.conn.prepare(
            "SELECT source, target, kind, file_path, line FROM edges",
        )?;

        let edges = stmt
            .query_map([], |row| {
                Ok(GraphEdge {
                    source: row.get(0)?,
                    target: row.get(1)?,
                    kind: parse_edge_kind(row.get::<_, String>(2)?),
                    file_path: row.get(3)?,
                    line: row.get(4)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(edges)
    }

    pub fn get_full_graph(&self) -> GraphResult<GraphData> {
        let nodes = self.get_all_nodes()?;
        let edges = self.get_all_edges()?;
        Ok(GraphData { nodes, edges })
    }
}

fn parse_node_kind(s: String) -> NodeKind {
    match s.as_str() {
        "File" => NodeKind::File,
        "Module" => NodeKind::Module,
        "Function" => NodeKind::Function,
        "Struct" => NodeKind::Struct,
        "Enum" => NodeKind::Enum,
        "Trait" => NodeKind::Trait,
        "Impl" => NodeKind::Impl,
        "Import" => NodeKind::Import,
        "Constant" => NodeKind::Constant,
        "Type" => NodeKind::Type,
        _ => NodeKind::Function,
    }
}

fn parse_edge_kind(s: String) -> crate::graph::types::EdgeKind {
    match s.as_str() {
        "Calls" => crate::graph::types::EdgeKind::Calls,
        "Imports" => crate::graph::types::EdgeKind::Imports,
        "Implements" => crate::graph::types::EdgeKind::Implements,
        "Extends" => crate::graph::types::EdgeKind::Extends,
        "Uses" => crate::graph::types::EdgeKind::Uses,
        "Contains" => crate::graph::types::EdgeKind::Contains,
        "References" => crate::graph::types::EdgeKind::References,
        _ => crate::graph::types::EdgeKind::Uses,
    }
}
