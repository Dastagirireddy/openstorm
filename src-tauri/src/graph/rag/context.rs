use crate::graph::errors::GraphResult;
use crate::graph::query::GraphQuery;
use crate::graph::store::GraphStore;
use crate::graph::types::GraphNode;

const TOKENS_PER_NODE: usize = 50;

pub fn build_context(
    store: &GraphStore,
    query: &str,
    max_tokens: usize,
) -> GraphResult<Vec<GraphNode>> {
    let query_engine = GraphQuery::new(store);
    let max_nodes = max_tokens / TOKENS_PER_NODE;

    let mut candidates = query_engine.search_nodes(query, max_nodes * 2)?;

    let mut result = Vec::new();
    let mut current_tokens = 0;

    for node in candidates.drain(..) {
        let node_tokens = estimate_tokens(&node);
        if current_tokens + node_tokens > max_tokens {
            break;
        }
        current_tokens += node_tokens;
        result.push(node);
    }

    Ok(result)
}

fn estimate_tokens(node: &GraphNode) -> usize {
    let name_tokens = node.name.len() / 4;
    let path_tokens = node.file_path.len() / 4;
    name_tokens + path_tokens + TOKENS_PER_NODE
}
