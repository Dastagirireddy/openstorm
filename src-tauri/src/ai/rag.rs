use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A chunk of code for RAG retrieval
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeChunk {
    /// Unique chunk ID
    pub id: String,
    /// File path
    pub file_path: String,
    /// Start line (1-indexed)
    pub start_line: u32,
    /// End line (1-indexed)
    pub end_line: u32,
    /// Chunk content
    pub content: String,
    /// Chunk type (function, struct, impl, module, etc.)
    pub chunk_type: ChunkType,
    /// Symbol name (if applicable)
    pub symbol_name: Option<String>,
    /// Keywords extracted from content
    pub keywords: Vec<String>,
}

/// Type of code chunk
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ChunkType {
    Function,
    Struct,
    Impl,
    Trait,
    Enum,
    Module,
    Type,
    Constant,
    Comment,
    Import,
    Other,
}

impl ChunkType {
    pub fn chunk_type_to_str(&self) -> &str {
        match self {
            ChunkType::Function => "fn",
            ChunkType::Struct => "struct",
            ChunkType::Impl => "impl",
            ChunkType::Trait => "trait",
            ChunkType::Enum => "enum",
            ChunkType::Module => "mod",
            ChunkType::Type => "type",
            ChunkType::Constant => "const",
            ChunkType::Comment => "comment",
            ChunkType::Import => "import",
            ChunkType::Other => "other",
        }
    }
}

/// Code chunker that splits files into meaningful chunks
pub struct CodeChunker {
    /// Maximum lines per chunk
    pub max_lines: u32,
    /// Minimum lines for a chunk to be kept
    pub min_lines: u32,
}

impl Default for CodeChunker {
    fn default() -> Self {
        Self {
            max_lines: 100,
            min_lines: 3,
        }
    }
}

impl CodeChunker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Chunk a file into meaningful code segments
    pub fn chunk_file(&self, file_path: &str, content: &str) -> Vec<CodeChunk> {
        let mut chunks = Vec::new();
        let lines: Vec<&str> = content.lines().collect();
        let total_lines = lines.len() as u32;

        // Detect file extension for language-specific chunking
        let ext = file_path.rsplit('.').next().unwrap_or("");

        match ext {
            "rs" => chunks = self.chunk_rust(file_path, &lines),
            "ts" | "tsx" | "js" | "jsx" => chunks = self.chunk_typescript(file_path, &lines),
            "py" => chunks = self.chunk_python(file_path, &lines),
            _ => chunks = self.chunk_generic(file_path, &lines),
        }

        // If no chunks found or file is small, return as single chunk
        if chunks.is_empty() && total_lines > 0 {
            chunks.push(self.create_chunk(
                file_path,
                1,
                total_lines,
                &lines,
                ChunkType::Other,
                None,
            ));
        }

        // Post-process: split any chunks that exceed max_lines
        let mut final_chunks = Vec::new();
        for chunk in chunks {
            let chunk_lines = chunk.end_line - chunk.start_line;
            if chunk_lines <= self.max_lines {
                final_chunks.push(chunk);
            } else {
                // Split oversized chunk into smaller pieces
                let mut start = chunk.start_line;
                while start < chunk.end_line {
                    let end = (start + self.max_lines).min(chunk.end_line);
                    let line_slice: Vec<&str> = lines[(start as usize)..(end as usize)]
                        .iter()
                        .copied()
                        .collect();
                    final_chunks.push(self.create_chunk(
                        file_path,
                        start + 1,
                        end,
                        &line_slice,
                        chunk.chunk_type.clone(),
                        chunk.symbol_name.clone(),
                    ));
                    start = end;
                }
            }
        }

        final_chunks
    }

    /// Chunk Rust code by functions, structs, impls, etc.
    fn chunk_rust(&self, file_path: &str, lines: &[&str]) -> Vec<CodeChunk> {
        let mut chunks = Vec::new();
        let mut current_start = None;
        let mut current_type = ChunkType::Other;
        let mut brace_depth = 0;
        let mut symbol_name = None;
        let mut in_body = false;

        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();

            // Detect function definitions
            if trimmed.starts_with("pub fn ") || trimmed.starts_with("fn ") {
                if current_start.is_none() {
                    current_start = Some(i as u32);
                    current_type = ChunkType::Function;
                    symbol_name = extract_rust_fn_name(trimmed);
                    in_body = false;
                    brace_depth = 0;
                }
            }
            // Detect struct definitions
            else if trimmed.starts_with("pub struct ") || trimmed.starts_with("struct ") {
                if current_start.is_none() {
                    current_start = Some(i as u32);
                    current_type = ChunkType::Struct;
                    symbol_name = extract_rust_struct_name(trimmed);
                    in_body = false;
                    brace_depth = 0;
                }
            }
            // Detect impl blocks
            else if trimmed.starts_with("impl ") {
                if current_start.is_none() {
                    current_start = Some(i as u32);
                    current_type = ChunkType::Impl;
                    symbol_name = extract_rust_impl_name(trimmed);
                    in_body = false;
                    brace_depth = 0;
                }
            }
            // Detect trait definitions
            else if trimmed.starts_with("pub trait ") || trimmed.starts_with("trait ") {
                if current_start.is_none() {
                    current_start = Some(i as u32);
                    current_type = ChunkType::Trait;
                    symbol_name = extract_rust_trait_name(trimmed);
                    in_body = false;
                    brace_depth = 0;
                }
            }
            // Detect enum definitions
            else if trimmed.starts_with("pub enum ") || trimmed.starts_with("enum ") {
                if current_start.is_none() {
                    current_start = Some(i as u32);
                    current_type = ChunkType::Enum;
                    symbol_name = extract_rust_enum_name(trimmed);
                    in_body = false;
                    brace_depth = 0;
                }
            }
            // Detect module definitions
            else if trimmed.starts_with("pub mod ") || trimmed.starts_with("mod ") {
                if current_start.is_none() {
                    current_start = Some(i as u32);
                    current_type = ChunkType::Module;
                    symbol_name = trimmed.split_whitespace().nth(1).map(|s| s.trim_end_matches('{').to_string());
                    in_body = false;
                    brace_depth = 0;
                }
            }
            // Detect type aliases
            else if trimmed.starts_with("pub type ") || trimmed.starts_with("type ") {
                if current_start.is_none() {
                    current_start = Some(i as u32);
                    current_type = ChunkType::Type;
                    symbol_name = trimmed.split_whitespace().nth(2).map(|s| s.trim_end_matches(';').to_string());
                    in_body = false;
                    brace_depth = 0;
                }
            }
            // Detect constants
            else if trimmed.starts_with("pub const ") || trimmed.starts_with("const ") {
                if current_start.is_none() {
                    current_start = Some(i as u32);
                    current_type = ChunkType::Constant;
                    symbol_name = trimmed.split_whitespace().nth(2).map(|s| s.to_string());
                    in_body = false;
                    brace_depth = 0;
                }
            }

            // Track braces for body
            if current_start.is_some() {
                for ch in trimmed.chars() {
                    match ch {
                        '{' => {
                            brace_depth += 1;
                            in_body = true;
                        }
                        '}' => {
                            brace_depth -= 1;
                            if brace_depth == 0 && in_body {
                                if let Some(start) = current_start {
                                    let end_line = (i + 1) as u32;
                                    if end_line - start >= self.min_lines {
                                        chunks.push(self.create_chunk(
                                            file_path,
                                            start + 1,
                                            end_line,
                                            &lines[start as usize..=i],
                                            current_type.clone(),
                                            symbol_name.clone(),
                                        ));
                                    }
                                }
                                current_start = None;
                                in_body = false;
                            }
                        }
                        _ => {}
                    }
                }
            }
        }

        // Handle any remaining chunk
        if let Some(start) = current_start {
            let end_line = lines.len() as u32;
            if end_line - start >= self.min_lines {
                chunks.push(self.create_chunk(
                    file_path,
                    start + 1,
                    end_line,
                    &lines[start as usize..],
                    current_type,
                    symbol_name,
                ));
            }
        }

        chunks
    }

    /// Chunk TypeScript/JavaScript code
    fn chunk_typescript(&self, file_path: &str, lines: &[&str]) -> Vec<CodeChunk> {
        let mut chunks = Vec::new();
        let mut current_start = None;
        let mut current_type = ChunkType::Other;
        let mut brace_depth = 0;
        let mut symbol_name = None;
        let mut in_body = false;

        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();

            // Detect function definitions
            if trimmed.starts_with("export function ")
                || trimmed.starts_with("function ")
                || trimmed.starts_with("export async function ")
                || trimmed.starts_with("async function ")
            {
                if current_start.is_none() {
                    current_start = Some(i as u32);
                    current_type = ChunkType::Function;
                    symbol_name = extract_ts_fn_name(trimmed);
                    in_body = false;
                    brace_depth = 0;
                }
            }
            // Detect class definitions
            else if trimmed.starts_with("export class ") || trimmed.starts_with("class ") {
                if current_start.is_none() {
                    current_start = Some(i as u32);
                    current_type = ChunkType::Struct; // Reuse Struct for classes
                    symbol_name = trimmed.split_whitespace().nth(2).map(|s| s.trim_end_matches('{').to_string());
                    in_body = false;
                    brace_depth = 0;
                }
            }
            // Detect interface definitions
            else if trimmed.starts_with("export interface ") || trimmed.starts_with("interface ") {
                if current_start.is_none() {
                    current_start = Some(i as u32);
                    current_type = ChunkType::Trait; // Reuse Trait for interfaces
                    symbol_name = trimmed.split_whitespace().nth(2).map(|s| s.trim_end_matches('{').to_string());
                    in_body = false;
                    brace_depth = 0;
                }
            }
            // Detect type definitions
            else if trimmed.starts_with("export type ") || trimmed.starts_with("type ") {
                if current_start.is_none() {
                    current_start = Some(i as u32);
                    current_type = ChunkType::Type;
                    symbol_name = trimmed.split_whitespace().nth(2).map(|s| s.trim_end_matches('=').to_string());
                    in_body = false;
                    brace_depth = 0;
                }
            }
            // Detect const definitions
            else if trimmed.starts_with("export const ") || trimmed.starts_with("const ") {
                if current_start.is_none() {
                    current_start = Some(i as u32);
                    current_type = ChunkType::Constant;
                    symbol_name = trimmed.split_whitespace().nth(2).map(|s| s.to_string());
                    in_body = false;
                    brace_depth = 0;
                }
            }

            // Track braces
            if current_start.is_some() {
                for ch in trimmed.chars() {
                    match ch {
                        '{' => {
                            brace_depth += 1;
                            in_body = true;
                        }
                        '}' => {
                            brace_depth -= 1;
                            if brace_depth == 0 && in_body {
                                if let Some(start) = current_start {
                                    let end_line = (i + 1) as u32;
                                    if end_line - start >= self.min_lines {
                                        chunks.push(self.create_chunk(
                                            file_path,
                                            start + 1,
                                            end_line,
                                            &lines[start as usize..=i],
                                            current_type.clone(),
                                            symbol_name.clone(),
                                        ));
                                    }
                                }
                                current_start = None;
                                in_body = false;
                            }
                        }
                        _ => {}
                    }
                }
            }
        }

        if let Some(start) = current_start {
            let end_line = lines.len() as u32;
            if end_line - start >= self.min_lines {
                chunks.push(self.create_chunk(
                    file_path,
                    start + 1,
                    end_line,
                    &lines[start as usize..],
                    current_type,
                    symbol_name,
                ));
            }
        }

        chunks
    }

    /// Chunk Python code
    fn chunk_python(&self, file_path: &str, lines: &[&str]) -> Vec<CodeChunk> {
        let mut chunks = Vec::new();
        let mut current_start = None;
        let mut current_type = ChunkType::Other;
        let mut symbol_name = None;
        let mut expected_indent = 0;

        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();
            let indent = line.len() - line.trim_start().len();

            // Check if this is a new definition (function or class)
            let is_new_def = trimmed.starts_with("def ") 
                || trimmed.starts_with("async def ") 
                || trimmed.starts_with("class ");

            // If we're in a block and hit a new definition, close the previous block
            if is_new_def {
                if let Some(start) = current_start {
                    let end_line = i as u32;
                    if end_line - start >= self.min_lines {
                        chunks.push(self.create_chunk(
                            file_path,
                            start + 1,
                            end_line,
                            &lines[start as usize..i],
                            current_type.clone(),
                            symbol_name.clone(),
                        ));
                    }
                    current_start = None;
                }
            }

            // Detect function definitions
            if trimmed.starts_with("def ") || trimmed.starts_with("async def ") {
                if current_start.is_none() {
                    current_start = Some(i as u32);
                    current_type = ChunkType::Function;
                    symbol_name = extract_python_fn_name(trimmed);
                    expected_indent = indent + 4; // Expected body indent
                }
            }
            // Detect class definitions
            else if trimmed.starts_with("class ") {
                if current_start.is_none() {
                    current_start = Some(i as u32);
                    current_type = ChunkType::Struct;
                    symbol_name = trimmed.split_whitespace().nth(1).map(|s| s.trim_end_matches('(').trim_end_matches(':').to_string());
                    expected_indent = indent + 4;
                }
            }

            // Check for dedent (end of block) - only for non-definition lines
            if current_start.is_some() && !is_new_def && i > 0 {
                let is_blank = trimmed.is_empty();
                let is_comment = trimmed.starts_with('#');
                let is_dedented = !is_blank && !is_comment && indent < expected_indent;

                if is_dedented {
                    if let Some(start) = current_start {
                        let end_line = i as u32;
                        if end_line - start >= self.min_lines {
                            chunks.push(self.create_chunk(
                                file_path,
                                start + 1,
                                end_line,
                                &lines[start as usize..i],
                                current_type.clone(),
                                symbol_name.clone(),
                            ));
                        }
                        current_start = None;
                    }
                }
            }
        }

        if let Some(start) = current_start {
            let end_line = lines.len() as u32;
            if end_line - start >= self.min_lines {
                chunks.push(self.create_chunk(
                    file_path,
                    start + 1,
                    end_line,
                    &lines[start as usize..],
                    current_type,
                    symbol_name,
                ));
            }
        }

        chunks
    }

    /// Generic chunking for unknown languages
    fn chunk_generic(&self, file_path: &str, lines: &[&str]) -> Vec<CodeChunk> {
        let mut chunks = Vec::new();
        let total_lines = lines.len() as u32;

        // Split into chunks of max_lines
        let mut start = 0;
        while start < total_lines {
            let end = (start + self.max_lines).min(total_lines);
            chunks.push(self.create_chunk(
                file_path,
                start + 1,
                end,
                &lines[start as usize..end as usize],
                ChunkType::Other,
                None,
            ));
            start = end;
        }

        chunks
    }

    /// Create a CodeChunk from lines
    fn create_chunk(
        &self,
        file_path: &str,
        start_line: u32,
        end_line: u32,
        lines: &[&str],
        chunk_type: ChunkType,
        symbol_name: Option<String>,
    ) -> CodeChunk {
        let content = lines.join("\n");
        let keywords = extract_keywords(&content);

        CodeChunk {
            id: format!("{}:{}-{}", file_path, start_line, end_line),
            file_path: file_path.to_string(),
            start_line,
            end_line,
            content,
            chunk_type,
            symbol_name,
            keywords,
        }
    }
}

/// Create a chunk with all fields
fn create_chunk_with_id(
    id: &str,
    file_path: &str,
    start_line: u32,
    end_line: u32,
    content: &str,
    chunk_type: ChunkType,
    symbol_name: Option<String>,
    keywords: Vec<String>,
) -> CodeChunk {
    CodeChunk {
        id: id.to_string(),
        file_path: file_path.to_string(),
        start_line,
        end_line,
        content: content.to_string(),
        chunk_type,
        symbol_name,
        keywords,
    }
}

// ── Keyword extraction ──────────────────────────────────────────

/// Extract keywords from code content
fn extract_keywords(content: &str) -> Vec<String> {
    let mut keywords = Vec::new();
    let words: Vec<&str> = content
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|w| w.len() > 2)
        .collect();

    for word in words {
        if !keywords.contains(&word.to_string()) {
            keywords.push(word.to_string());
        }
    }

    keywords.truncate(20);
    keywords
}

// ── Rust name extractors ────────────────────────────────────────

fn extract_rust_fn_name(line: &str) -> Option<String> {
    line.split_whitespace()
        .find(|w| w.ends_with('(') && !w.contains("fn"))
        .map(|w| w.trim_end_matches('(').to_string())
}

fn extract_rust_struct_name(line: &str) -> Option<String> {
    line.split_whitespace()
        .nth(2)
        .map(|s| s.trim_end_matches('{').to_string())
}

fn extract_rust_impl_name(line: &str) -> Option<String> {
    // impl<...> Type { ... } or impl Type { ... }
    let without_impl = line.strip_prefix("impl")?.trim();
    if let Some(angle_pos) = without_impl.find('<') {
        let after_generics = &without_impl[angle_pos..];
        if let Some(close_pos) = after_generics.find('>') {
            let type_name = after_generics[close_pos + 1..].trim();
            return type_name.split_whitespace().next().map(|s| s.to_string());
        }
    }
    without_impl.split_whitespace().next().map(|s| s.trim_end_matches('{').to_string())
}

fn extract_rust_trait_name(line: &str) -> Option<String> {
    line.split_whitespace().nth(2).map(|s| s.trim_end_matches('{').to_string())
}

fn extract_rust_enum_name(line: &str) -> Option<String> {
    line.split_whitespace().nth(2).map(|s| s.trim_end_matches('{').to_string())
}

// ── TypeScript name extractors ──────────────────────────────────

fn extract_ts_fn_name(line: &str) -> Option<String> {
    // Handle: export function foo() / async function foo()
    let words: Vec<&str> = line.split_whitespace().collect();
    for (i, word) in words.iter().enumerate() {
        if *word == "function" && i + 1 < words.len() {
            return Some(words[i + 1].trim_end_matches('(').to_string());
        }
    }
    None
}

// ── Python name extractors ──────────────────────────────────────

fn extract_python_fn_name(line: &str) -> Option<String> {
    // Handle: def foo() / async def foo()
    let words: Vec<&str> = line.split_whitespace().collect();
    for (i, word) in words.iter().enumerate() {
        if *word == "def" && i + 1 < words.len() {
            return Some(words[i + 1].trim_end_matches('(').to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_rust_function() {
        let code = r#"
pub fn hello() {
    println!("hello");
}

pub fn world() {
    println!("world");
}
"#;
        let chunker = CodeChunker::new();
        let chunks = chunker.chunk_file("test.rs", code);
        assert!(chunks.len() >= 2);
        assert_eq!(chunks[0].chunk_type, ChunkType::Function);
    }

    #[test]
    fn test_chunk_typescript_function() {
        let code = r#"
export function hello() {
    console.log("hello");
}

function world() {
    console.log("world");
}
"#;
        let chunker = CodeChunker::new();
        let chunks = chunker.chunk_file("test.ts", code);
        assert!(chunks.len() >= 2);
    }

    #[test]
    fn test_chunk_python_function() {
        let code = r#"
def hello():
    print("hello")
    return True

def world():
    print("world")
    return False
"#;
        let chunker = CodeChunker::new();
        let chunks = chunker.chunk_file("test.py", code);
        assert!(chunks.len() >= 2);
    }
}
