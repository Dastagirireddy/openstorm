use crate::graph::errors::GraphResult;
use crate::graph::store::GraphStore;
use crate::graph::types::{GraphNode, NodeKind};

pub struct SearchResult {
    pub node: GraphNode,
    pub score: f64,
}

pub fn search_nodes(store: &GraphStore, query: &str, limit: usize) -> GraphResult<Vec<GraphNode>> {
    let terms: Vec<String> = query
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|t| t.len() > 1)
        .map(|t| t.to_lowercase())
        .collect();

    if terms.is_empty() {
        return Ok(Vec::new());
    }

    // Build scoring conditions: count how many terms match each node
    let mut match_cases = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    for term in &terms {
        // Each term contributes 1 point if it matches
        match_cases.push(format!(
            "WHEN LOWER(name) LIKE ?{} THEN 1",
            params.len() + 1
        ));
        params.push(Box::new(format!("%{}%", term)));
    }

    let match_count_expr = format!("CASE {} ELSE 0 END", match_cases.join(" "));

    // Directory relevance: boost nodes in ai/, rag/, context/ directories
    let directory_boost = "CASE
        WHEN LOWER(file_path) LIKE '%/ai/%' OR LOWER(file_path) LIKE '%/ai\\%' THEN 10
        WHEN LOWER(file_path) LIKE '%/rag/%' OR LOWER(file_path) LIKE '%/rag\\%' THEN 15
        WHEN LOWER(file_path) LIKE '%/context/%' THEN 12
        WHEN LOWER(file_path) LIKE '%/graph/%' THEN 10
        WHEN LOWER(file_path) LIKE '%/agent/%' THEN 8
        WHEN LOWER(file_path) LIKE '%/embedding%' THEN 8
        WHEN LOWER(file_path) LIKE '%/tools/%' THEN 5
        ELSE 0
    END";

    // Node kind penalty: penalize imports and files, prefer functions/structs
    let kind_penalty = "CASE
        WHEN kind = 'Import' THEN -5
        WHEN kind = 'File' THEN -3
        WHEN kind = 'Function' THEN 2
        WHEN kind = 'Struct' THEN 3
        WHEN kind = 'Trait' THEN 3
        WHEN kind = 'Enum' THEN 3
        WHEN kind = 'Module' THEN 1
        WHEN kind = 'Impl' THEN 2
        ELSE 0
    END";

    // Path length penalty: shorter paths are more relevant
    let _path_penalty = "1.0 / (1.0 + LENGTH(file_path) * 0.1)";

    let sql = format!(
        "SELECT id, kind, name, file_path, start_line, end_line, language,
            -- Score = sum of matching terms + directory boost + kind bonus
            ({}) AS term_score,
            ({}) AS dir_boost,
            ({}) AS kind_bonus
         FROM nodes
         WHERE ({})
         ORDER BY (term_score + dir_boost + kind_bonus) DESC
         LIMIT ?{}",
        match_count_expr,
        directory_boost,
        kind_penalty,
        // WHERE clause: at least one term must match
        (0..terms.len())
            .map(|i| format!("LOWER(name) LIKE ?{}", i + 1))
            .collect::<Vec<_>>()
            .join(" OR "),
        params.len() + 1,
    );

    // Add limit param
    params.push(Box::new(limit as i64));

    let params_ref: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let mut stmt = store.conn().prepare(&sql)?;
    let results: Vec<SearchResult> = stmt
        .query_map(params_ref.as_slice(), |row| {
            let node = GraphNode {
                id: row.get(0)?,
                kind: parse_node_kind(row.get::<_, String>(1)?),
                name: row.get(2)?,
                file_path: row.get(3)?,
                start_line: row.get(4)?,
                end_line: row.get(5)?,
                language: row.get(6)?,
            };
            let term_score: f64 = row.get(7)?;
            let dir_boost: f64 = row.get(8)?;
            let kind_bonus: f64 = row.get(9)?;

            Ok(SearchResult {
                node,
                score: term_score + dir_boost + kind_bonus,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Results are already sorted by SQL, just extract nodes
    Ok(results.into_iter().map(|r| r.node).collect())
}

pub fn parse_node_kind(s: String) -> NodeKind {
    match s.as_str() {
        "File" => NodeKind::File,
        "Module" => NodeKind::Module,
        "Function" => NodeKind::Function,
        "Struct" => NodeKind::Struct,
        "Enum" => NodeKind::Enum,
        "Trait" => NodeKind::Trait,
        "Impl" => NodeKind::Impl,
        "Import" => NodeKind::Import,
        "Constant" => NodeKind::Constant,
        "Type" => NodeKind::Type,
        _ => NodeKind::Function,
    }
}
