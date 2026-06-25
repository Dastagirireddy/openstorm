use serde::{Deserialize, Serialize};

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

/// Create a chunk with all fields
pub fn create_chunk_with_id(
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
