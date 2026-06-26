use super::chunk_types::{ChunkType, CodeChunk};

/// Chunk Rust code by functions, structs, impls, etc.
pub fn chunk_rust(
    file_path: &str,
    lines: &[&str],
    min_lines: u32,
    create_chunk: impl Fn(&str, u32, u32, &[&str], ChunkType, Option<String>) -> CodeChunk,
) -> Vec<CodeChunk> {
    let mut chunks = Vec::new();
    let mut current_start = None;
    let mut current_type = ChunkType::Other;
    let mut brace_depth = 0;
    let mut symbol_name = None;
    let mut in_body = false;

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();

        if trimmed.starts_with("pub fn ") || trimmed.starts_with("fn ") {
            if current_start.is_none() {
                current_start = Some(i as u32);
                current_type = ChunkType::Function;
                symbol_name = extract_rust_fn_name(trimmed);
                in_body = false;
                brace_depth = 0;
            }
        } else if trimmed.starts_with("pub struct ") || trimmed.starts_with("struct ") {
            if current_start.is_none() {
                current_start = Some(i as u32);
                current_type = ChunkType::Struct;
                symbol_name = extract_rust_struct_name(trimmed);
                in_body = false;
                brace_depth = 0;
            }
        } else if trimmed.starts_with("impl ") {
            if current_start.is_none() {
                current_start = Some(i as u32);
                current_type = ChunkType::Impl;
                symbol_name = extract_rust_impl_name(trimmed);
                in_body = false;
                brace_depth = 0;
            }
        } else if trimmed.starts_with("pub trait ") || trimmed.starts_with("trait ") {
            if current_start.is_none() {
                current_start = Some(i as u32);
                current_type = ChunkType::Trait;
                symbol_name = extract_rust_trait_name(trimmed);
                in_body = false;
                brace_depth = 0;
            }
        } else if trimmed.starts_with("pub enum ") || trimmed.starts_with("enum ") {
            if current_start.is_none() {
                current_start = Some(i as u32);
                current_type = ChunkType::Enum;
                symbol_name = extract_rust_enum_name(trimmed);
                in_body = false;
                brace_depth = 0;
            }
        } else if trimmed.starts_with("pub mod ") || trimmed.starts_with("mod ") {
            if current_start.is_none() {
                current_start = Some(i as u32);
                current_type = ChunkType::Module;
                symbol_name = trimmed.split_whitespace().nth(1).map(|s| s.trim_end_matches('{').to_string());
                in_body = false;
                brace_depth = 0;
            }
        } else if trimmed.starts_with("pub type ") || trimmed.starts_with("type ") {
            if current_start.is_none() {
                current_start = Some(i as u32);
                current_type = ChunkType::Type;
                symbol_name = trimmed.split_whitespace().nth(2).map(|s| s.trim_end_matches(';').to_string());
                in_body = false;
                brace_depth = 0;
            }
        } else if trimmed.starts_with("pub const ") || trimmed.starts_with("const ") {
            if current_start.is_none() {
                current_start = Some(i as u32);
                current_type = ChunkType::Constant;
                symbol_name = trimmed.split_whitespace().nth(2).map(|s| s.to_string());
                in_body = false;
                brace_depth = 0;
            }
        }

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
                                if end_line - start >= min_lines {
                                    chunks.push(create_chunk(
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
        if end_line - start >= min_lines {
            chunks.push(create_chunk(
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
