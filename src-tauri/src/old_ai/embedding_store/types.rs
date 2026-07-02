use super::super::rag::CodeChunk;

#[derive(Debug, Clone, Default)]
pub struct RagMetrics {
    pub searches: u64,
    pub chunks_returned: u64,
    pub keywords_matched: u64,
    pub tokens_saved: u64,
    pub empty_results: u64,
}

impl RagMetrics {
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

#[derive(Debug, Clone)]
pub struct SearchResult {
    pub chunk: CodeChunk,
    pub score: f64,
}

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
