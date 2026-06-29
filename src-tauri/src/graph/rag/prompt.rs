use crate::graph::rag::GraphContext;
use crate::graph::types::{EdgeKind, NodeKind};

pub fn build_prompt(query: &str, ctx: &GraphContext) -> String {
    let mut prompt = String::new();

    prompt.push_str("## Relevant Code Context\n\n");
    prompt.push_str(&format!("Query: {}\n\n", query));

    if ctx.matches.is_empty() {
        prompt.push_str("No directly matching code entities found.\n");
        return prompt;
    }

    // Direct matches
    prompt.push_str("### Direct Matches\n\n");
    for node in &ctx.matches {
        prompt.push_str(&format!(
            "- **{}** ({}) `{}` lines {}-{}\n",
            node.name,
            kind_label(&node.kind),
            node.file_path,
            node.start_line,
            node.end_line,
        ));

        // Show immediate relationships
        let edges = ctx.edges_for_node(&node.id);
        if !edges.is_empty() {
            for edge in &edges {
                let other_id = if edge.source == node.id {
                    &edge.target
                } else {
                    &edge.source
                };
                let direction = if edge.source == node.id {
                    "calls"
                } else {
                    "called by"
                };
                if let Some(other) = ctx.nodes_by_id().get(other_id.as_str()) {
                    prompt.push_str(&format!(
                        "  → {} {} `{}`\n",
                        direction,
                        edge_label(&edge.kind),
                        other.name,
                    ));
                }
            }
        }
    }

    // Related neighbors
    if !ctx.neighbors.is_empty() {
        prompt.push_str("\n### Related Code (neighbors)\n\n");

        // Group by file
        let mut by_file: std::collections::BTreeMap<&str, Vec<&crate::graph::types::GraphNode>> =
            std::collections::BTreeMap::new();
        for n in &ctx.neighbors {
            by_file.entry(&n.file_path).or_default().push(n);
        }

        for (file, nodes) in &by_file {
            prompt.push_str(&format!("**{}**\n", file));
            for node in nodes {
                prompt.push_str(&format!(
                    "  - {} ({}) lines {}-{}\n",
                    node.name,
                    kind_label(&node.kind),
                    node.start_line,
                    node.end_line,
                ));
            }
        }
    }

    // Edge summary
    let edge_count = ctx.edges.len();
    if edge_count > 0 {
        let calls = ctx
            .edges
            .iter()
            .filter(|e| matches!(e.kind, EdgeKind::Calls))
            .count();
        let imports = ctx
            .edges
            .iter()
            .filter(|e| matches!(e.kind, EdgeKind::Imports))
            .count();
        let implements = ctx
            .edges
            .iter()
            .filter(|e| matches!(e.kind, EdgeKind::Implements))
            .count();

        prompt.push_str(&format!(
            "\n### Structure ({} relationships: {} calls, {} imports, {} implements)\n\n",
            edge_count, calls, imports, implements
        ));
    }

    prompt.push_str("Use this context to answer the query accurately.\n");
    prompt
}

fn kind_label(kind: &NodeKind) -> &'static str {
    match kind {
        NodeKind::File => "file",
        NodeKind::Module => "module",
        NodeKind::Function => "function",
        NodeKind::Struct => "struct",
        NodeKind::Enum => "enum",
        NodeKind::Trait => "trait",
        NodeKind::Impl => "impl",
        NodeKind::Import => "import",
        NodeKind::Constant => "constant",
        NodeKind::Type => "type",
    }
}

fn edge_label(kind: &EdgeKind) -> &'static str {
    match kind {
        EdgeKind::Calls => "calls",
        EdgeKind::Imports => "imports",
        EdgeKind::Implements => "implements",
        EdgeKind::Extends => "extends",
        EdgeKind::Uses => "uses",
        EdgeKind::Contains => "contains",
        EdgeKind::References => "references",
    }
}
