use tree_sitter::Node;

use crate::graph::extractor::create_edge;
use crate::graph::types::{EdgeKind, GraphEdge};

use super::PythonExtractor;

impl PythonExtractor {
    pub(super) fn extract_calls(
        &self,
        node: Node,
        file_path: &str,
        content: &str,
        caller_name: &str,
        edges: &mut Vec<GraphEdge>,
    ) {
        self.walk_for_calls(node, file_path, content, caller_name, edges);
    }

    fn walk_for_calls(
        &self,
        node: Node,
        file_path: &str,
        content: &str,
        caller_name: &str,
        edges: &mut Vec<GraphEdge>,
    ) {
        if node.kind() == "call" {
            if let Some(callee) = self.extract_callee_name(node, content) {
                let line = node.start_position().row as u32 + 1;
                let source = format!("{}::{}", file_path, caller_name);
                edges.push(create_edge(&source, &callee, EdgeKind::Calls, file_path, line));
            }
        }

        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            self.walk_for_calls(child, file_path, content, caller_name, edges);
        }
    }

    fn extract_callee_name(&self, node: Node, content: &str) -> Option<String> {
        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            if child.kind() == "identifier" || child.kind() == "attribute" {
                return Some(content[child.start_byte()..child.end_byte()].to_string());
            }
        }
        None
    }
}
