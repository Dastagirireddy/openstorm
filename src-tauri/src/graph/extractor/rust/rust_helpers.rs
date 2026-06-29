use tree_sitter::Node;

use crate::graph::extractor::create_node;
use crate::graph::types::{EdgeKind, GraphEdge, GraphNode, NodeKind};

use super::RustExtractor;

impl RustExtractor {
    pub(super) fn extract_function(
        &self,
        node: Node,
        file_path: &str,
        content: &str,
        nodes: &mut Vec<GraphNode>,
        edges: &mut Vec<GraphEdge>,
    ) {
        let name = self.get_name(node, content);
        let start = node.start_position().row as u32 + 1;
        let end = node.end_position().row as u32 + 1;

        let graph_node = create_node(NodeKind::Function, &name, file_path, start, end, "rust");
        nodes.push(graph_node);

        self.extract_calls(node, file_path, content, &name, edges);
    }

    pub(super) fn extract_struct(
        &self,
        node: Node,
        file_path: &str,
        content: &str,
        nodes: &mut Vec<GraphNode>,
    ) {
        let name = self.get_name(node, content);
        let start = node.start_position().row as u32 + 1;
        let end = node.end_position().row as u32 + 1;
        nodes.push(create_node(NodeKind::Struct, &name, file_path, start, end, "rust"));
    }

    pub(super) fn extract_enum(
        &self,
        node: Node,
        file_path: &str,
        content: &str,
        nodes: &mut Vec<GraphNode>,
    ) {
        let name = self.get_name(node, content);
        let start = node.start_position().row as u32 + 1;
        let end = node.end_position().row as u32 + 1;
        nodes.push(create_node(NodeKind::Enum, &name, file_path, start, end, "rust"));
    }

    pub(super) fn extract_trait(
        &self,
        node: Node,
        file_path: &str,
        content: &str,
        nodes: &mut Vec<GraphNode>,
    ) {
        let name = self.get_name(node, content);
        let start = node.start_position().row as u32 + 1;
        let end = node.end_position().row as u32 + 1;
        nodes.push(create_node(NodeKind::Trait, &name, file_path, start, end, "rust"));
    }

    pub(super) fn get_name(&self, node: Node, content: &str) -> String {
        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            if child.kind() == "identifier" || child.kind() == "type_identifier" {
                return content[child.start_byte()..child.end_byte()].to_string();
            }
        }
        "anonymous".to_string()
    }
}
