use tree_sitter::Node;

use crate::graph::extractor::create_node;
use crate::graph::types::{EdgeKind, GraphEdge, GraphNode, NodeKind};

use super::TypeScriptExtractor;

impl TypeScriptExtractor {
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

        nodes.push(create_node(NodeKind::Function, &name, file_path, start, end, "typescript"));
        self.extract_calls(node, file_path, content, &name, edges);
    }

    pub(super) fn extract_class(
        &self,
        node: Node,
        file_path: &str,
        content: &str,
        nodes: &mut Vec<GraphNode>,
    ) {
        let name = self.get_name(node, content);
        let start = node.start_position().row as u32 + 1;
        let end = node.end_position().row as u32 + 1;
        nodes.push(create_node(NodeKind::Struct, &name, file_path, start, end, "typescript"));
    }

    pub(super) fn extract_interface(
        &self,
        node: Node,
        file_path: &str,
        content: &str,
        nodes: &mut Vec<GraphNode>,
    ) {
        let name = self.get_name(node, content);
        let start = node.start_position().row as u32 + 1;
        let end = node.end_position().row as u32 + 1;
        nodes.push(create_node(NodeKind::Trait, &name, file_path, start, end, "typescript"));
    }

    pub(super) fn extract_import(
        &self,
        node: Node,
        file_path: &str,
        content: &str,
        nodes: &mut Vec<GraphNode>,
        edges: &mut Vec<GraphEdge>,
    ) {
        let import_path = content[node.start_byte()..node.end_byte()].to_string();
        let line = node.start_position().row as u32 + 1;
        let name = import_path.replace("import ", "").replace(";", "").trim().to_string();

        let file_name = file_path.rsplit('/').next().unwrap_or(file_path);
        let source = format!("{}::{}", file_path, file_name);

        nodes.push(create_node(NodeKind::Import, &name, file_path, line, line, "typescript"));
        edges.push(crate::graph::extractor::create_edge(
            &source,
            &name,
            EdgeKind::Imports,
            file_path,
            line,
        ));
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
