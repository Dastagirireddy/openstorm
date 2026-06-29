use rusqlite::params;

use crate::graph::errors::GraphResult;
use crate::graph::store::GraphStore;
use crate::graph::types::{GraphNode, NodeKind};

pub fn search_nodes(store: &GraphStore, query: &str, limit: usize) -> GraphResult<Vec<GraphNode>> {
    let pattern = format!("%{}%", query);
    let mut stmt = store.conn().prepare(
        "SELECT id, kind, name, file_path, start_line, end_line, language
         FROM nodes
         WHERE name LIKE ?1
         ORDER BY
           CASE WHEN name = ?2 THEN 0
                WHEN name LIKE ?3 THEN 1
                ELSE 2
           END
         LIMIT ?4",
    )?;

    let nodes = stmt
        .query_map(params![pattern, query, pattern, limit as i64], |row| {
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

pub fn parse_node_kind(s: String) -> NodeKind {
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
