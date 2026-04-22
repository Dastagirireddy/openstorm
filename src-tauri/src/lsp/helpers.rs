/// Text editing helpers for LSP
///
/// Utility functions for applying text edits and converting positions.

use lsp_types::{Position, TextEdit};

/// Apply a list of text edits to content
pub fn apply_text_edits(content: &str, edits: &[TextEdit]) -> String {
    if edits.is_empty() {
        return content.to_string();
    }

    // Convert edits to byte offsets
    let mut offset_edits: Vec<(usize, usize, String)> = edits
        .iter()
        .map(|edit| {
            let start_offset = position_to_offset(content, edit.range.start);
            let end_offset = position_to_offset(content, edit.range.end);
            (start_offset, end_offset, edit.new_text.clone())
        })
        .collect();

    // Sort by start offset descending (apply from end to start)
    offset_edits.sort_by(|a, b| b.0.cmp(&a.0));

    let mut result = content.to_string();

    for (start, end, new_text) in offset_edits {
        if start <= result.len() && end <= result.len() && start <= end {
            result.replace_range(start..end, &new_text);
        }
    }

    result
}

/// Convert LSP Position (line, character) to byte offset in string
pub fn position_to_offset(content: &str, pos: Position) -> usize {
    let mut offset = 0;
    let mut current_line = 0;
    let mut current_char = 0;
    let target_line = pos.line as usize;
    let target_char = pos.character as usize;

    let chars: Vec<char> = content.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if current_line == target_line && current_char == target_char {
            break;
        }

        if chars[i] == '\n' {
            current_line += 1;
            current_char = 0;
            i += 1;
            offset += 1;
            continue;
        }

        if current_line == target_line {
            current_char += 1;
        }

        i += 1;
        offset += 1;
    }

    offset
}
