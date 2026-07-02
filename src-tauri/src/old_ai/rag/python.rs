use super::chunk_types::{ChunkType, CodeChunk};

/// Chunk Python code
pub fn chunk_python(
    file_path: &str,
    lines: &[&str],
    min_lines: u32,
    create_chunk: impl Fn(&str, u32, u32, &[&str], ChunkType, Option<String>) -> CodeChunk,
) -> Vec<CodeChunk> {
    let mut chunks = Vec::new();
    let mut current_start = None;
    let mut current_type = ChunkType::Other;
    let mut symbol_name = None;
    let mut expected_indent = 0;

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        let indent = line.len() - line.trim_start().len();

        let is_new_def = trimmed.starts_with("def ")
            || trimmed.starts_with("async def ")
            || trimmed.starts_with("class ");

        if is_new_def {
            if let Some(start) = current_start {
                let end_line = i as u32;
                if end_line - start >= min_lines {
                    chunks.push(create_chunk(
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

        if trimmed.starts_with("def ") || trimmed.starts_with("async def ") {
            if current_start.is_none() {
                current_start = Some(i as u32);
                current_type = ChunkType::Function;
                symbol_name = extract_python_fn_name(trimmed);
                expected_indent = indent + 4;
            }
        } else if trimmed.starts_with("class ") {
            if current_start.is_none() {
                current_start = Some(i as u32);
                current_type = ChunkType::Struct;
                symbol_name = trimmed.split_whitespace().nth(1).map(|s| s.trim_end_matches('(').trim_end_matches(':').to_string());
                expected_indent = indent + 4;
            }
        }

        if current_start.is_some() && !is_new_def && i > 0 {
            let is_blank = trimmed.is_empty();
            let is_comment = trimmed.starts_with('#');
            let is_dedented = !is_blank && !is_comment && indent < expected_indent;

            if is_dedented {
                if let Some(start) = current_start {
                    let end_line = i as u32;
                    if end_line - start >= min_lines {
                        chunks.push(create_chunk(
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

fn extract_python_fn_name(line: &str) -> Option<String> {
    let words: Vec<&str> = line.split_whitespace().collect();
    for (i, word) in words.iter().enumerate() {
        if *word == "def" && i + 1 < words.len() {
            return Some(words[i + 1].trim_end_matches('(').to_string());
        }
    }
    None
}
