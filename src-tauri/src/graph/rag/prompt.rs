use crate::graph::types::GraphNode;

pub fn build_prompt(query: &str, nodes: &[GraphNode]) -> String {
    let mut prompt = String::new();
    prompt.push_str("## Relevant Code Context\n\n");
    prompt.push_str(&format!("Query: {}\n\n", query));
    prompt.push_str("The following code entities are relevant:\n\n");

    for node in nodes {
        prompt.push_str(&format!(
            "- **{}** ({}) in `{}` (lines {}-{})\n",
            node.name,
            format!("{:?}", node.kind),
            node.file_path,
            node.start_line,
            node.end_line
        ));
    }

    prompt.push_str("\nUse this context to answer the query accurately.\n");
    prompt
}
