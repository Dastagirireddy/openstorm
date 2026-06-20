use std::collections::HashMap;
use std::path::Path;

use super::ignore::{exclusions_for_project, should_skip_dir};
use super::rag::{CodeChunk, CodeChunker};

/// RAG usage metrics
#[derive(Debug, Clone, Default)]
pub struct RagMetrics {
    /// Total searches performed
    pub searches: u64,
    /// Total chunks returned
    pub chunks_returned: u64,
    /// Total keywords matched
    pub keywords_matched: u64,
    /// Estimated tokens saved (vs reading full files)
    pub tokens_saved: u64,
    /// Searches that returned no results
    pub empty_results: u64,
}

impl RagMetrics {
    /// Get metrics summary as a string
    pub fn metrics_summary(&self) -> String {
        let avg_chunks_per_search = if self.searches > 0 {
            self.chunks_returned as f64 / self.searches as f64
        } else {
            0.0
        };
        let success_rate = if self.searches > 0 {
            ((self.searches - self.empty_results) as f64 / self.searches as f64) * 100.0
        } else {
            0.0
        };

        format!(
            "RAG Metrics:\n\
             - Searches: {} (success rate: {:.0}%)\n\
             - Chunks returned: {} (avg {:.1} per search)\n\
             - Keywords matched: {}\n\
             - Estimated tokens saved: {}\n\
             - Empty results: {}",
            self.searches,
            success_rate,
            self.chunks_returned,
            avg_chunks_per_search,
            self.keywords_matched,
            self.tokens_saved,
            self.empty_results
        )
    }
}

/// In-memory vector store for code chunks using BM25-style retrieval
pub struct EmbeddingStore {
    /// All indexed chunks
    chunks: Vec<CodeChunk>,
    /// Inverted index: keyword -> chunk indices
    inverted_index: HashMap<String, Vec<usize>>,
    /// Document frequencies: keyword -> number of documents containing it
    doc_freq: HashMap<String, usize>,
    /// Total number of documents
    total_docs: usize,
    /// Average document length (in keywords)
    avg_doc_len: f64,
    /// Chunker for processing files
    chunker: CodeChunker,
    /// Usage metrics
    metrics: RagMetrics,
}

impl EmbeddingStore {
    pub fn new() -> Self {
        Self {
            chunks: Vec::new(),
            inverted_index: HashMap::new(),
            doc_freq: HashMap::new(),
            total_docs: 0,
            avg_doc_len: 0.0,
            chunker: CodeChunker::new(),
            metrics: RagMetrics::default(),
        }
    }

    /// Index a file's content
    pub fn index_file(&mut self, file_path: &str, content: &str) -> usize {
        let chunks = self.chunker.chunk_file(file_path, content);
        let chunk_count = chunks.len();

        for chunk in chunks {
            let idx = self.chunks.len();
            self.chunks.push(chunk.clone());

            // Update inverted index
            let mut unique_keywords = Vec::new();
            for keyword in &chunk.keywords {
                let lower = keyword.to_lowercase();
                if !unique_keywords.contains(&lower) {
                    unique_keywords.push(lower.clone());

                    self.inverted_index
                        .entry(lower.clone())
                        .or_insert_with(Vec::new)
                        .push(idx);
                }
            }

            // Update document frequencies
            for keyword in &unique_keywords {
                *self.doc_freq.entry(keyword.clone()).or_insert(0) += 1;
            }

            self.total_docs += 1;
        }

        // Recalculate average document length
        let total_keywords: usize = self.chunks.iter().map(|c| c.keywords.len()).sum();
        self.avg_doc_len = if self.total_docs > 0 {
            total_keywords as f64 / self.total_docs as f64
        } else {
            0.0
        };

        chunk_count
    }

    /// Index all files in a directory (recursively)
    pub async fn index_directory(&mut self, dir: &str) -> Result<usize, std::io::Error> {
        let mut total_chunks = 0;
        let mut stack = vec![std::path::PathBuf::from(dir)];
        let exclusions = exclusions_for_project(dir);

        while let Some(current_dir) = stack.pop() {
            let mut entries = match tokio::fs::read_dir(&current_dir).await {
                Ok(e) => e,
                Err(_) => continue,
            };

            while let Some(entry) = entries.next_entry().await? {
                let path = entry.path();
                let metadata = match entry.metadata().await {
                    Ok(m) => m,
                    Err(_) => continue,
                };

                if metadata.is_dir() {
                    let dir_name = path.file_name().unwrap_or_default().to_string_lossy();
                    if should_skip_dir(&dir_name, &exclusions) {
                        continue;
                    }
                    stack.push(path);
                } else if metadata.is_file() {
                    // Skip binary files and large files
                    if metadata.len() > 1_000_000 {
                        continue;
                    }

                    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                    match ext {
                        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "java" | "rb" | "css" | "html" | "json" | "yaml" | "yml" | "toml" | "md" | "sql" => {
                            if let Ok(content) = tokio::fs::read_to_string(&path).await {
                                let relative = path.strip_prefix(dir).unwrap_or(&path);
                                total_chunks += self.index_file(&relative.to_string_lossy(), &content);
                            }
                        }
                        _ => {}
                    }
                }
            }
        }

        Ok(total_chunks)
    }

    /// Search for relevant chunks using BM25 scoring
    pub fn search(&self, query: &str, max_results: usize) -> Vec<SearchResult> {
        // Stop words to ignore in queries
        const STOP_WORDS: &[&str] = &[
            "how", "what", "why", "when", "where", "which", "does", "do",
            "is", "are", "was", "were", "the", "a", "an", "in", "on", "at",
            "to", "for", "of", "with", "by", "from", "it", "this", "that",
            "and", "or", "but", "not", "can", "will", "should", "would",
            "could", "may", "might", "must", "shall", "works", "work",
        ];

        let query_keywords: Vec<String> = query
            .split(|c: char| !c.is_alphanumeric() && c != '_')
            .filter(|w| w.len() > 1 && !STOP_WORDS.contains(&w.to_lowercase().as_str()))
            .map(|w| w.to_lowercase())
            .collect();

        if query_keywords.is_empty() {
            return Vec::new();
        }

        // Accumulate scores per chunk (don't skip duplicates)
        let mut chunk_scores: std::collections::HashMap<usize, f64> = std::collections::HashMap::new();

        for keyword in &query_keywords {
            // Check inverted index for exact matches (BM25)
            if let Some(indices) = self.inverted_index.get(keyword) {
                let df = *self.doc_freq.get(keyword).unwrap_or(&1) as f64;
                let idf = ((self.total_docs as f64 - df + 0.5) / (df + 0.5) + 1.0).ln();

                for &chunk_idx in indices {
                    let chunk = &self.chunks[chunk_idx];
                    let tf = chunk.keywords.iter().filter(|k| k.to_lowercase() == *keyword).count() as f64;
                    let doc_len = chunk.keywords.len() as f64;

                    // BM25 formula
                    let k1 = 1.5;
                    let b = 0.75;
                    let score = idf * (tf * (k1 + 1.0)) / (tf + k1 * (1.0 - b + b * doc_len / self.avg_doc_len));

                    *chunk_scores.entry(chunk_idx).or_insert(0.0) += score;
                }
            }

            // Partial matches in keywords (lower weight)
            for (idx, chunk) in self.chunks.iter().enumerate() {
                for chunk_keyword in &chunk.keywords {
                    if chunk_keyword.to_lowercase().contains(keyword) || keyword.contains(&chunk_keyword.to_lowercase()) {
                        *chunk_scores.entry(idx).or_insert(0.0) += 1.0;
                        break;
                    }
                }
            }
        }

        // Bonus: exact symbol name matches
        for (idx, chunk) in self.chunks.iter().enumerate() {
            if let Some(ref name) = chunk.symbol_name {
                let name_lower = name.to_lowercase();
                for keyword in &query_keywords {
                    if name_lower.contains(keyword) || keyword.contains(&name_lower) {
                        *chunk_scores.entry(idx).or_insert(0.0) += 10.0;
                        break;
                    }
                }
            }
        }

        // Bonus: content keyword matches
        for (idx, chunk) in self.chunks.iter().enumerate() {
            let content_lower = chunk.content.to_lowercase();
            for keyword in &query_keywords {
                if content_lower.contains(keyword) {
                    *chunk_scores.entry(idx).or_insert(0.0) += 2.0;
                    break;
                }
            }
        }

        // Bonus: file path relevance — if query keywords appear in the file path
        for (idx, chunk) in self.chunks.iter().enumerate() {
            let path_lower = chunk.file_path.to_lowercase();
            let path_matches = query_keywords.iter().filter(|kw| path_lower.contains(kw.as_str())).count();
            if path_matches > 0 {
                *chunk_scores.entry(idx).or_insert(0.0) += (path_matches as f64) * 5.0;
            }
        }

        // Bonus: multi-keyword overlap — chunks matching 2+ keywords get a boost
        for (idx, chunk) in self.chunks.iter().enumerate() {
            let chunk_text = format!("{} {}", chunk.file_path.to_lowercase(), chunk.content.to_lowercase());
            let matches = query_keywords.iter().filter(|kw| chunk_text.contains(kw.as_str())).count();
            if matches >= 2 {
                *chunk_scores.entry(idx).or_insert(0.0) += (matches as f64) * 3.0;
            }
        }

        // Sort by score descending
        let mut scores: Vec<(usize, f64)> = chunk_scores.into_iter().collect();
        scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        // Return top results
        scores
            .into_iter()
            .take(max_results)
            .map(|(idx, score)| SearchResult {
                chunk: self.chunks[idx].clone(),
                score,
            })
            .collect()
    }

    /// Record a search (call after search to update metrics)
    pub fn record_search(&mut self, query: &str, results: &[SearchResult]) {
        self.metrics.searches += 1;
        self.metrics.chunks_returned += results.len() as u64;
        if results.is_empty() {
            self.metrics.empty_results += 1;
        }
        // Estimate tokens saved
        let tokens_per_chunk = 30 * 4;
        let tokens_without_rag = 200 * 4;
        let tokens_with_rag = results.len() * tokens_per_chunk;
        if tokens_without_rag > tokens_with_rag {
            self.metrics.tokens_saved += (tokens_without_rag - tokens_with_rag) as u64;
        }
    }

    /// Get chunks for a specific file
    pub fn get_file_chunks(&self, file_path: &str) -> Vec<&CodeChunk> {
        self.chunks
            .iter()
            .filter(|c| c.file_path == file_path)
            .collect()
    }

    /// Get a specific chunk by ID
    pub fn get_chunk(&self, chunk_id: &str) -> Option<&CodeChunk> {
        self.chunks.iter().find(|c| c.id == chunk_id)
    }

    /// Get all indexed files
    pub fn indexed_files(&self) -> Vec<&str> {
        let mut files: Vec<&str> = self.chunks.iter().map(|c| c.file_path.as_str()).collect();
        files.sort();
        files.dedup();
        files
    }

    /// Get statistics about the store
    pub fn stats(&self) -> StoreStats {
        StoreStats {
            total_chunks: self.chunks.len(),
            total_files: self.indexed_files().len(),
            total_keywords: self.inverted_index.len(),
            avg_chunk_size: if self.total_docs > 0 {
                self.avg_doc_len
            } else {
                0.0
            },
        }
    }

    /// Get RAG usage metrics
    pub fn metrics(&self) -> &RagMetrics {
        &self.metrics
    }

    /// Check if the store has been indexed
    pub fn is_empty(&self) -> bool {
        self.chunks.is_empty()
    }

    /// Clear the store
    pub fn clear(&mut self) {
        self.chunks.clear();
        self.inverted_index.clear();
        self.doc_freq.clear();
        self.total_docs = 0;
        self.avg_doc_len = 0.0;
        self.metrics = RagMetrics::default();
    }
}

impl Default for EmbeddingStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Search result with relevance score
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub chunk: CodeChunk,
    pub score: f64,
}

/// Store statistics
#[derive(Debug, Clone)]
pub struct StoreStats {
    pub total_chunks: usize,
    pub total_files: usize,
    pub total_keywords: usize,
    pub avg_chunk_size: f64,
}

impl std::fmt::Display for StoreStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{} chunks, {} files, {} keywords, avg {:.1} keywords/chunk",
            self.total_chunks, self.total_files, self.total_keywords, self.avg_chunk_size
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_index_and_search() {
        let mut store = EmbeddingStore::new();

        let code = r#"
pub fn calculate_sum(a: i32, b: i32) -> i32 {
    a + b
}

pub fn calculate_product(a: i32, b: i32) -> i32 {
    a * b
}
"#;

        store.index_file("math.rs", code);

        let results = store.search("calculate sum", 5);
        assert!(!results.is_empty());
        assert!(results[0].chunk.content.contains("calculate_sum"));
    }

    #[test]
    fn test_symbol_search() {
        let mut store = EmbeddingStore::new();

        let code = r#"
pub struct Config {
    pub name: String,
    pub value: i32,
}
"#;

        store.index_file("config.rs", code);

        let results = store.search("Config", 5);
        assert!(!results.is_empty());
    }

    #[test]
    fn test_store_stats() {
        let mut store = EmbeddingStore::new();
        store.index_file("test.rs", "fn foo() {}");
        store.index_file("test2.rs", "fn bar() {}");

        let stats = store.stats();
        assert_eq!(stats.total_files, 2);
    }
}
