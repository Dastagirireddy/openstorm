use std::path::Path;

use crate::graph::errors::GraphResult;
use crate::graph::store::GraphStore;
use crate::graph::watcher::GraphWatcher;

pub fn handle_change(watcher: &GraphWatcher, path: &Path, content: &str) -> GraphResult<()> {
    let file_path = path.to_string_lossy().to_string();

    remove_old_nodes(watcher.store(), &file_path)?;

    let result = watcher.extract_file(&file_path, content);
    let node_count = result.nodes.len();
    let edge_count = result.edges.len();

    watcher.store().insert_graph(&crate::graph::types::GraphData {
        nodes: result.nodes,
        edges: result.edges,
    })?;

    crate::log_debug!(
        "Graph updated for {}: {} nodes, {} edges",
        file_path,
        node_count,
        edge_count
    );

    Ok(())
}

fn remove_old_nodes(store: &GraphStore, file_path: &str) -> GraphResult<()> {
    let conn = store.conn();
    conn.execute("DELETE FROM edges WHERE file_path = ?1", [file_path])?;
    conn.execute("DELETE FROM nodes WHERE file_path = ?1", [file_path])?;
    Ok(())
}
