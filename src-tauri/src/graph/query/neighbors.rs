use std::collections::{HashSet, VecDeque};

use rusqlite::params;

use crate::graph::errors::GraphResult;
use crate::graph::store::GraphStore;
use crate::graph::types::GraphNode;

pub fn get_neighbors(store: &GraphStore, node_id: &str, depth: u32) -> GraphResult<Vec<GraphNode>> {
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    let mut result = Vec::new();

    queue.push_back((node_id.to_string(), 0));
    visited.insert(node_id.to_string());

    while let Some((current, current_depth)) = queue.pop_front() {
        if current_depth > depth {
            continue;
        }

        if let Some(node) = get_node_by_id(store, &current)? {
            result.push(node);
        }

        if current_depth < depth {
            let neighbors = get_direct_neighbors(store, &current)?;
            for neighbor_id in neighbors {
                if !visited.contains(&neighbor_id) {
                    visited.insert(neighbor_id.clone());
                    queue.push_back((neighbor_id, current_depth + 1));
                }
            }
        }
    }

    Ok(result)
}

fn get_node_by_id(store: &GraphStore, node_id: &str) -> GraphResult<Option<GraphNode>> {
    let mut stmt = store.conn().prepare(
        "SELECT id, kind, name, file_path, start_line, end_line, language
         FROM nodes WHERE id = ?1",
    )?;

    let mut rows = stmt.query_map(params![node_id], |row| {
        Ok(GraphNode {
            id: row.get(0)?,
            kind: super::search::parse_node_kind(row.get::<_, String>(1)?),
            name: row.get(2)?,
            file_path: row.get(3)?,
            start_line: row.get(4)?,
            end_line: row.get(5)?,
            language: row.get(6)?,
        })
    })?;

    match rows.next() {
        Some(Ok(node)) => Ok(Some(node)),
        _ => Ok(None),
    }
}

fn get_direct_neighbors(store: &GraphStore, node_id: &str) -> GraphResult<Vec<String>> {
    let mut stmt = store.conn().prepare(
        "SELECT target FROM edges WHERE source = ?1
         UNION
         SELECT source FROM edges WHERE target = ?1",
    )?;

    let neighbors = stmt
        .query_map(params![node_id], |row| row.get::<_, String>(0))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(neighbors)
}
