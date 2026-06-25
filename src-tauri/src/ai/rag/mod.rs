mod chunk_types;
mod rust;
mod typescript;
mod python;

pub use chunk_types::*;

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

        let ext = file_path.rsplit('.').next().unwrap_or("");

        match ext {
            "rs" => chunks = rust::chunk_rust(file_path, &lines, self.min_lines, |fp, sl, el, ls, ct, sn| self.create_chunk(fp, sl, el, ls, ct, sn)),
            "ts" | "tsx" | "js" | "jsx" => chunks = typescript::chunk_typescript(file_path, &lines, self.min_lines, |fp, sl, el, ls, ct, sn| self.create_chunk(fp, sl, el, ls, ct, sn)),
            "py" => chunks = python::chunk_python(file_path, &lines, self.min_lines, |fp, sl, el, ls, ct, sn| self.create_chunk(fp, sl, el, ls, ct, sn)),
            _ => chunks = self.chunk_generic(file_path, &lines),
        }

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

        let mut final_chunks = Vec::new();
        for chunk in chunks {
            let chunk_lines = chunk.end_line - chunk.start_line;
            if chunk_lines <= self.max_lines {
                final_chunks.push(chunk);
            } else {
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

    /// Generic chunking for unknown languages
    fn chunk_generic(&self, file_path: &str, lines: &[&str]) -> Vec<CodeChunk> {
        let mut chunks = Vec::new();
        let total_lines = lines.len() as u32;

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
