use super::chunk_types::{ChunkType, CodeChunk};

/// Chunk TypeScript/JavaScript code
pub fn chunk_typescript(
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
        } else if trimmed.starts_with("export class ") || trimmed.starts_with("class ") {
            if current_start.is_none() {
                current_start = Some(i as u32);
                current_type = ChunkType::Struct;
                symbol_name = trimmed.split_whitespace().nth(2).map(|s| s.trim_end_matches('{').to_string());
                in_body = false;
                brace_depth = 0;
            }
        } else if trimmed.starts_with("export interface ") || trimmed.starts_with("interface ") {
            if current_start.is_none() {
                current_start = Some(i as u32);
                current_type = ChunkType::Trait;
                symbol_name = trimmed.split_whitespace().nth(2).map(|s| s.trim_end_matches('{').to_string());
                in_body = false;
                brace_depth = 0;
            }
        } else if trimmed.starts_with("export type ") || trimmed.starts_with("type ") {
            if current_start.is_none() {
                current_start = Some(i as u32);
                current_type = ChunkType::Type;
                symbol_name = trimmed.split_whitespace().nth(2).map(|s| s.trim_end_matches('=').to_string());
                in_body = false;
                brace_depth = 0;
            }
        } else if trimmed.starts_with("export const ") || trimmed.starts_with("const ") {
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

fn extract_ts_fn_name(line: &str) -> Option<String> {
    let words: Vec<&str> = line.split_whitespace().collect();
    for (i, word) in words.iter().enumerate() {
        if *word == "function" && i + 1 < words.len() {
            return Some(words[i + 1].trim_end_matches('(').to_string());
        }
    }
    None
}
