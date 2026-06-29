use rusqlite::params;

use crate::graph::errors::GraphResult;
use crate::graph::types::{GraphData, GraphEdge, GraphNode};

use super::GraphStore;

const BATCH_SIZE: usize = 500;

impl GraphStore {
    pub fn insert_nodes(&self, nodes: &[GraphNode]) -> GraphResult<usize> {
        let mut total = 0;
        for chunk in nodes.chunks(BATCH_SIZE) {
            let tx = self.conn.unchecked_transaction()?;
            let count = Self::insert_nodes_batch(&tx, chunk)?;
            tx.commit()?;
            total += count;
        }
        Ok(total)
    }

    pub fn insert_edges(&self, edges: &[GraphEdge]) -> GraphResult<usize> {
        let mut total = 0;
        for chunk in edges.chunks(BATCH_SIZE) {
            let tx = self.conn.unchecked_transaction()?;
            let count = Self::insert_edges_batch(&tx, chunk)?;
            tx.commit()?;
            total += count;
        }
        Ok(total)
    }

    pub fn insert_graph(&self, data: &GraphData) -> GraphResult<(usize, usize)> {
        let node_count = self.insert_nodes(&data.nodes)?;
        let edge_count = self.insert_edges(&data.edges)?;
        Ok((node_count, edge_count))
    }

    pub fn clear(&self) -> GraphResult<()> {
        self.conn.execute("DELETE FROM edges", [])?;
        self.conn.execute("DELETE FROM nodes", [])?;
        Ok(())
    }

    pub fn node_count(&self) -> GraphResult<usize> {
        let count: usize = self.conn.query_row("SELECT COUNT(*) FROM nodes", [], |row| row.get(0))?;
        Ok(count)
    }

    fn insert_nodes_batch(tx: &rusqlite::Transaction, nodes: &[GraphNode]) -> GraphResult<usize> {
        let mut stmt = tx.prepare(
            "INSERT OR REPLACE INTO nodes (id, kind, name, file_path, start_line, end_line, language)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )?;
        let mut count = 0;
        for node in nodes {
            stmt.execute(params![
                node.id,
                format!("{:?}", node.kind),
                node.name,
                node.file_path,
                node.start_line,
                node.end_line,
                node.language,
            ])?;
            count += 1;
        }
        Ok(count)
    }

    fn insert_edges_batch(tx: &rusqlite::Transaction, edges: &[GraphEdge]) -> GraphResult<usize> {
        let mut stmt = tx.prepare(
            "INSERT INTO edges (source, target, kind, file_path, line)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )?;
        let mut count = 0;
        for edge in edges {
            stmt.execute(params![
                edge.source,
                edge.target,
                format!("{:?}", edge.kind),
                edge.file_path,
                edge.line,
            ])?;
            count += 1;
        }
        Ok(count)
    }
}
