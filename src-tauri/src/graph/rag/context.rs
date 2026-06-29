use std::collections::{HashMap, HashSet, VecDeque};

use rusqlite::params;

use crate::graph::errors::GraphResult;
use crate::graph::query::search::search_nodes;
use crate::graph::rag::{GraphContext, GraphEdge, GraphNode};
use crate::graph::store::GraphStore;
use crate::graph::types::NodeKind;

const TOKENS_PER_NODE: usize = 50;
const TOKENS_PER_EDGE: usize = 20;

pub fn build_context(
    store: &GraphStore,
    query: &str,
    max_tokens: usize,
) -> GraphResult<GraphContext> {
    let max_nodes = max_tokens / TOKENS_PER_NODE;

    // Step 1: Find direct matches
    let matches = search_nodes(store, query, max_nodes.min(10))?;

    if matches.is_empty() {
        return Ok(GraphContext {
            matches: Vec::new(),
            neighbors: Vec::new(),
            edges: Vec::new(),
            token_estimate: 0,
        });
    }

    // Step 2: Traverse neighbors (BFS up to depth 2)
    let match_ids: HashSet<String> = matches.iter().map(|n| n.id.clone()).collect();
    let mut neighbor_scores: HashMap<String, (GraphNode, u32)> = HashMap::new();

    for m in &matches {
        traverse_neighbors(store, &m.id, 2, &match_ids, &mut neighbor_scores)?;
    }

    // Step 3: Rank neighbors by score (higher = more connected to matches)
    let mut ranked_neighbors: Vec<(GraphNode, u32)> = neighbor_scores.into_iter().map(|(_, v)| v).collect();
    ranked_neighbors.sort_by(|a, b| b.1.cmp(&a.1));

    // Step 4: Select neighbors within token budget
    let match_tokens: usize = matches.iter().map(|n| estimate_tokens(n)).sum();
    let remaining_tokens = max_tokens.saturating_sub(match_tokens);

    let mut selected_neighbors = Vec::new();
    let mut used_tokens = 0;
    for (node, _score) in ranked_neighbors {
        let node_tokens = estimate_tokens(&node);
        if used_tokens + node_tokens > remaining_tokens {
            break;
        }
        used_tokens += node_tokens;
        selected_neighbors.push(node);
    }

    // Step 5: Collect all edges between selected nodes
    let all_ids: HashSet<String> = matches
        .iter()
        .chain(selected_neighbors.iter())
        .map(|n| n.id.clone())
        .collect();
    let edges = get_edges_between(store, &all_ids)?;

    let token_estimate = match_tokens + used_tokens + edges.len() * TOKENS_PER_EDGE;

    Ok(GraphContext {
        matches,
        neighbors: selected_neighbors,
        edges,
        token_estimate,
    })
}

/// BFS traversal to find neighbors up to a given depth
fn traverse_neighbors(
    store: &GraphStore,
    start_id: &str,
    max_depth: u32,
    exclude: &HashSet<String>,
    results: &mut HashMap<String, (GraphNode, u32)>,
) -> GraphResult<()> {
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();

    queue.push_back((start_id.to_string(), 0));
    visited.insert(start_id.to_string());

    while let Some((current, depth)) = queue.pop_front() {
        if depth > max_depth {
            continue;
        }

        // Get the node data
        if let Some(node) = get_node_by_id(store, &current)? {
            let score = max_depth.saturating_sub(depth) + 1;
            results
                .entry(current.clone())
                .and_modify(|existing| {
                    existing.1 = existing.1.max(score);
                })
                .or_insert((node, score));
        }

        // Traverse edges
        if depth < max_depth {
            let neighbors = get_direct_neighbors(store, &current)?;
            for neighbor_id in neighbors {
                if !visited.contains(&neighbor_id) && !exclude.contains(&neighbor_id) {
                    visited.insert(neighbor_id.clone());
                    queue.push_back((neighbor_id, depth + 1));
                }
            }
        }
    }

    Ok(())
}

fn get_node_by_id(store: &GraphStore, node_id: &str) -> GraphResult<Option<GraphNode>> {
    let mut stmt = store.conn().prepare(
        "SELECT id, kind, name, file_path, start_line, end_line, language
         FROM nodes WHERE id = ?1",
    )?;

    let mut rows = stmt.query_map(params![node_id], |row| {
        Ok(GraphNode {
            id: row.get(0)?,
            kind: parse_node_kind(row.get::<_, String>(1)?),
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

fn get_edges_between(store: &GraphStore, node_ids: &HashSet<String>) -> GraphResult<Vec<GraphEdge>> {
    if node_ids.is_empty() {
        return Ok(Vec::new());
    }

    let ids: Vec<&str> = node_ids.iter().map(|s| s.as_str()).collect();
    let n = ids.len();

    // Source placeholders: ?1, ?2, ..., ?N
    let source_placeholders: Vec<String> = (1..=n).map(|i| format!("?{}", i)).collect();
    // Target placeholders: ?N+1, ?N+2, ..., ?2N
    let target_placeholders: Vec<String> = (n + 1..=2 * n).map(|i| format!("?{}", i)).collect();

    let sql = format!(
        "SELECT source, target, kind, file_path, line
         FROM edges
         WHERE source IN ({}) AND target IN ({})",
        source_placeholders.join(", "),
        target_placeholders.join(", ")
    );

    let mut stmt = store.conn().prepare(&sql)?;
    // params: source IDs + target IDs (2N total)
    let params: Vec<&dyn rusqlite::types::ToSql> = ids
        .iter()
        .chain(ids.iter())
        .map(|s| s as &dyn rusqlite::types::ToSql)
        .collect();

    let edges = stmt
        .query_map(params.as_slice(), |row| {
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
        _ => crate::graph::types::EdgeKind::References,
    }
}

fn estimate_tokens(node: &GraphNode) -> usize {
    let name_tokens = node.name.len() / 4;
    let path_tokens = node.file_path.len() / 4;
    name_tokens + path_tokens + TOKENS_PER_NODE
}
