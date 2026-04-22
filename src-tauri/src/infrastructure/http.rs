/// HTTP client abstraction for testability and dependency inversion
///
/// This trait allows us to mock HTTP operations in tests while
/// using the real implementation in production.

use std::io;
use std::path::Path;

/// HTTP response
pub struct HttpResponse {
    pub status: u16,
    pub body: Vec<u8>,
}

/// Trait for HTTP client operations
pub trait HttpClient: Send + Sync {
    /// Send a GET request and return the response
    fn get(&self, url: &str) -> io::Result<HttpResponse>;

    /// Send a GET request and stream the response to a file
    fn get_to_file(&self, url: &str, dest: &Path, progress_callback: &dyn Fn(u64, u64)) -> io::Result<()>;
}

/// Default implementation using reqwest
pub struct StdHttpClient {
    client: reqwest::blocking::Client,
}

impl StdHttpClient {
    pub fn new() -> Self {
        Self {
            client: reqwest::blocking::ClientBuilder::new()
                .timeout(std::time::Duration::from_secs(300))
                .build()
                .expect("Failed to create HTTP client"),
        }
    }
}

impl Default for StdHttpClient {
    fn default() -> Self {
        Self::new()
    }
}

impl HttpClient for StdHttpClient {
    fn get(&self, url: &str) -> io::Result<HttpResponse> {
        let response = self.client.get(url).send().map_err(|e| {
            io::Error::new(io::ErrorKind::Other, format!("HTTP GET failed: {}", e))
        })?;

        let status = response.status().as_u16();
        let body = response.bytes().map_err(|e| {
            io::Error::new(io::ErrorKind::Other, format!("Failed to read response body: {}", e))
        })?.to_vec();

        Ok(HttpResponse { status, body })
    }

    fn get_to_file(&self, url: &str, dest: &Path, progress_callback: &dyn Fn(u64, u64)) -> io::Result<()> {
        use std::fs::File;
        use std::io::Write;

        let response = self.client.get(url).send().map_err(|e| {
            io::Error::new(io::ErrorKind::Other, format!("HTTP GET failed: {}", e))
        })?;

        let total_size = response
            .headers()
            .get(reqwest::header::CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);

        let mut file = File::create(dest)?;
        let mut downloaded = 0u64;

        let bytes = response.bytes().map_err(|e| {
            io::Error::new(io::ErrorKind::Other, format!("Failed to read response: {}", e))
        })?;

        // Write in chunks and report progress
        let chunk_size = 8192;
        for chunk in bytes.chunks(chunk_size) {
            file.write_all(chunk)?;
            downloaded += chunk.len() as u64;
            if total_size > 0 {
                progress_callback(downloaded, total_size);
            }
        }

        Ok(())
    }
}

// Simple blocking implementation for now
impl HttpClient for () {
    fn get(&self, _url: &str) -> io::Result<HttpResponse> {
        Err(io::Error::new(
            io::ErrorKind::Other,
            "Unit type HttpClient not implemented",
        ))
    }

    fn get_to_file(&self, _url: &str, _dest: &Path, _progress_callback: &dyn Fn(u64, u64)) -> io::Result<()> {
        Err(io::Error::new(
            io::ErrorKind::Other,
            "Unit type HttpClient not implemented",
        ))
    }
}
