use std::path::Path;

use crate::graph::errors::GraphResult;
use crate::graph::extractor::registry::ExtractorRegistry;
use crate::graph::store::GraphStore;
use crate::graph::types::GraphData;

pub fn handle_change(
    store: &GraphStore,
    registry: &ExtractorRegistry,
    path: &Path,
    content: &str,
) -> GraphResult<()> {
    let file_path = path.to_string_lossy().to_string();

    remove_old_nodes(store, &file_path)?;

    let result = registry.extract(&file_path, content);
    let node_count = result.nodes.len();
    let edge_count = result.edges.len();

    store.insert_graph(&GraphData {
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

pub fn handle_deletion(store: &GraphStore, path: &Path) -> GraphResult<()> {
    let file_path = path.to_string_lossy().to_string();
    remove_old_nodes(store, &file_path)?;
    crate::log_debug!("Graph nodes removed for deleted file: {}", file_path);
    Ok(())
}

fn remove_old_nodes(store: &GraphStore, file_path: &str) -> GraphResult<()> {
    let conn = store.conn();
    conn.execute("DELETE FROM edges WHERE file_path = ?1", [file_path])?;
    conn.execute("DELETE FROM nodes WHERE file_path = ?1", [file_path])?;
    Ok(())
}
