use std::collections::{HashMap, VecDeque};

use rusqlite::params;

use crate::graph::errors::GraphResult;
use crate::graph::store::GraphStore;

pub fn shortest_path(store: &GraphStore, from: &str, to: &str) -> GraphResult<Vec<String>> {
    if from == to {
        return Ok(vec![from.to_string()]);
    }

    let mut visited = HashMap::new();
    let mut queue = VecDeque::new();

    queue.push_back(from.to_string());
    visited.insert(from.to_string(), None);

    while let Some(current) = queue.pop_front() {
        if current == to {
            return reconstruct_path(&visited, to);
        }

        let neighbors = get_edge_neighbors(store, &current)?;
        for neighbor in neighbors {
            if !visited.contains_key(&neighbor) {
                visited.insert(neighbor.clone(), Some(current.clone()));
                queue.push_back(neighbor);
            }
        }
    }

    Ok(vec![])
}

fn get_edge_neighbors(store: &GraphStore, node_id: &str) -> GraphResult<Vec<String>> {
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

fn reconstruct_path(visited: &HashMap<String, Option<String>>, target: &str) -> GraphResult<Vec<String>> {
    let mut path = vec![target.to_string()];
    let mut current = target;

    while let Some(Some(prev)) = visited.get(current) {
        path.push(prev.clone());
        current = prev;
    }

    path.reverse();
    Ok(path)
}
