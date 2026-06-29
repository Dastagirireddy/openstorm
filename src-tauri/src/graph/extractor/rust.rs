mod rust_calls;
mod rust_helpers;
mod rust_impl;

use std::sync::{Arc, Mutex};

use tree_sitter::{Node, Parser};

use super::{ExtractResult, LanguageExtractor};

pub struct RustExtractor {
    parser: Mutex<Parser>,
}

impl RustExtractor {
    pub fn new() -> Self {
        let mut parser = Parser::new();
        parser.set_language(&tree_sitter_rust::LANGUAGE.into()).unwrap();
        Self {
            parser: Mutex::new(parser),
        }
    }

    pub fn create() -> Arc<dyn LanguageExtractor> {
        Arc::new(Self::new())
    }

    fn walk_file(
        &self,
        node: Node,
        file_path: &str,
        content: &str,
        nodes: &mut Vec<crate::graph::types::GraphNode>,
        edges: &mut Vec<crate::graph::types::GraphEdge>,
    ) {
        match node.kind() {
            "function_item" => self.extract_function(node, file_path, content, nodes, edges),
            "struct_item" => self.extract_struct(node, file_path, content, nodes),
            "enum_item" => self.extract_enum(node, file_path, content, nodes),
            "trait_item" => self.extract_trait(node, file_path, content, nodes),
            "impl_item" => self.extract_impl(node, file_path, content, nodes, edges),
            "use_declaration" => self.extract_use(node, file_path, content, nodes, edges),
            "mod_item" => self.extract_module(node, file_path, content, nodes),
            _ => {}
        }

        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            self.walk_file(child, file_path, content, nodes, edges);
        }
    }
}

impl LanguageExtractor for RustExtractor {
    fn language(&self) -> &str {
        "rust"
    }

    fn extensions(&self) -> &[&str] {
        &["rs"]
    }

    fn extract(&self, file_path: &str, content: &str) -> ExtractResult {
        let tree = self.parser.lock().unwrap().parse(content, None).unwrap();
        let mut nodes = Vec::new();
        let mut edges = Vec::new();

        let file_name = file_path.rsplit('/').next().unwrap_or(file_path);
        nodes.push(crate::graph::extractor::create_node(
            crate::graph::types::NodeKind::File,
            file_name,
            file_path,
            0,
            0,
            "rust",
        ));

        self.walk_file(tree.root_node(), file_path, content, &mut nodes, &mut edges);
        ExtractResult { nodes, edges }
    }
}

impl Default for RustExtractor {
    fn default() -> Self {
        Self::new()
    }
}
