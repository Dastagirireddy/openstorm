mod typescript_calls;
mod typescript_helpers;

use std::sync::{Arc, Mutex};

use tree_sitter::{Node, Parser};

use super::{ExtractResult, LanguageExtractor};

pub struct TypeScriptExtractor {
    parser: Mutex<Parser>,
}

impl TypeScriptExtractor {
    pub fn new() -> Self {
        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into())
            .unwrap();
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
            "function_declaration" | "arrow_function" | "method_definition" => {
                self.extract_function(node, file_path, content, nodes, edges);
            }
            "class_declaration" => self.extract_class(node, file_path, content, nodes),
            "interface_declaration" => self.extract_interface(node, file_path, content, nodes),
            "import_statement" => self.extract_import(node, file_path, content, nodes, edges),
            _ => {}
        }

        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            self.walk_file(child, file_path, content, nodes, edges);
        }
    }
}

impl LanguageExtractor for TypeScriptExtractor {
    fn language(&self) -> &str {
        "typescript"
    }

    fn extensions(&self) -> &[&str] {
        &["ts", "tsx", "js", "jsx"]
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
            "typescript",
        ));

        self.walk_file(tree.root_node(), file_path, content, &mut nodes, &mut edges);
        ExtractResult { nodes, edges }
    }
}

impl Default for TypeScriptExtractor {
    fn default() -> Self {
        Self::new()
    }
}
