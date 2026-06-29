use tree_sitter::Node;

use crate::graph::extractor::{create_edge, create_node};
use crate::graph::types::{EdgeKind, GraphEdge, GraphNode, NodeKind};

use super::RustExtractor;

impl RustExtractor {
    pub(super) fn extract_impl(
        &self,
        node: Node,
        file_path: &str,
        content: &str,
        nodes: &mut Vec<GraphNode>,
        edges: &mut Vec<GraphEdge>,
    ) {
        let trait_name = self.extract_impl_trait(node, content);
        let struct_name = self.extract_impl_struct(node, content);
        let start = node.start_position().row as u32 + 1;
        let end = node.end_position().row as u32 + 1;

        if let Some(name) = &struct_name {
            nodes.push(create_node(NodeKind::Impl, name, file_path, start, end, "rust"));
        }

        if let (Some(trait_name), Some(struct_name)) = (&trait_name, &struct_name) {
            let source = format!("{}::{}", file_path, struct_name);
            edges.push(create_edge(&source, trait_name, EdgeKind::Implements, file_path, start));
        }
    }

    pub(super) fn extract_use(
        &self,
        node: Node,
        file_path: &str,
        content: &str,
        nodes: &mut Vec<GraphNode>,
        edges: &mut Vec<GraphEdge>,
    ) {
        let import_path = content[node.start_byte()..node.end_byte()].to_string();
        let line = node.start_position().row as u32 + 1;
        let name = import_path.replace("use ", "").replace(";", "").trim().to_string();

        let file_name = file_path.rsplit('/').next().unwrap_or(file_path);
        let source = format!("{}::{}", file_path, file_name);

        nodes.push(create_node(NodeKind::Import, &name, file_path, line, line, "rust"));
        edges.push(create_edge(&source, &name, EdgeKind::Imports, file_path, line));
    }

    pub(super) fn extract_module(
        &self,
        node: Node,
        file_path: &str,
        content: &str,
        nodes: &mut Vec<GraphNode>,
    ) {
        let name = self.get_name(node, content);
        let start = node.start_position().row as u32 + 1;
        let end = node.end_position().row as u32 + 1;
        nodes.push(create_node(NodeKind::Module, &name, file_path, start, end, "rust"));
    }

    fn extract_impl_trait(&self, node: Node, content: &str) -> Option<String> {
        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            if child.kind() == "type_identifier" {
                return Some(content[child.start_byte()..child.end_byte()].to_string());
            }
        }
        None
    }

    fn extract_impl_struct(&self, node: Node, content: &str) -> Option<String> {
        let mut cursor = node.walk();
        let mut found_trait = false;
        for child in node.named_children(&mut cursor) {
            if child.kind() == "for" {
                found_trait = true;
                continue;
            }
            if found_trait && child.kind() == "type_identifier" {
                return Some(content[child.start_byte()..child.end_byte()].to_string());
            }
        }
        None
    }
}
