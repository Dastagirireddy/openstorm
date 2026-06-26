use reqwest::Client;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};

use crate::ai::providers::traits::ProviderError;

/// Shared HTTP client for all LLM providers.
///
/// Provides consistent timeout, header management, and error handling
/// across OpenAI-compatible and Anthropic providers.
pub struct ProviderHttpClient {
    client: Client,
}

impl ProviderHttpClient {
    /// Create a new HTTP client with the specified timeout.
    pub fn new(timeout_secs: u64) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(timeout_secs))
            .build()
            .expect("Failed to create HTTP client");

        Self { client }
    }

    /// Create a request builder with Bearer token authentication.
    pub fn bearer_auth(
        &self,
        url: &str,
        api_key: &str,
    ) -> reqwest::RequestBuilder {
        self.client
            .post(url)
            .bearer_auth(api_key)
            .header("Content-Type", "application/json")
    }

    /// Create a request builder with custom headers.
    pub fn with_headers(
        &self,
        url: &str,
        headers: &[(&str, &str)],
    ) -> reqwest::RequestBuilder {
        let mut header_map = HeaderMap::new();
        for (key, value) in headers {
            if let (Ok(name), Ok(val)) = (
                HeaderName::from_bytes(key.as_bytes()),
                HeaderValue::from_str(value),
            ) {
                header_map.insert(name, val);
            }
        }

        self.client
            .post(url)
            .headers(header_map)
            .header("Content-Type", "application/json")
    }

    /// Create a GET request with Bearer token authentication.
    pub fn get_bearer_auth(
        &self,
        url: &str,
        api_key: &str,
    ) -> reqwest::RequestBuilder {
        self.client
            .get(url)
            .bearer_auth(api_key)
    }

    /// Create a GET request with custom headers.
    pub fn get_with_headers(
        &self,
        url: &str,
        headers: &[(&str, &str)],
    ) -> reqwest::RequestBuilder {
        let mut header_map = HeaderMap::new();
        for (key, value) in headers {
            if let (Ok(name), Ok(val)) = (
                HeaderName::from_bytes(key.as_bytes()),
                HeaderValue::from_str(value),
            ) {
                header_map.insert(name, val);
            }
        }

        self.client
            .get(url)
            .headers(header_map)
    }

    /// Create a simple GET request (no auth).
    pub fn get(&self, url: &str) -> reqwest::RequestBuilder {
        self.client.get(url)
    }

    /// Get a reference to the underlying reqwest client.
    pub fn inner(&self) -> &Client {
        &self.client
    }

    /// Convert an HTTP status error into a ProviderError.
    pub fn status_error(status: reqwest::StatusCode, body: String, provider: &str) -> ProviderError {
        match status.as_u16() {
            401 => ProviderError::AuthenticationRequired(format!(
                "{}: Invalid API key",
                provider
            )),
            403 => ProviderError::AuthenticationRequired(format!(
                "{}: API key lacks required permissions",
                provider
            )),
            404 => ProviderError::NotFound(format!(
                "{}: Resource not found",
                provider
            )),
            429 => ProviderError::RateLimited(format!(
                "{}: Rate limit exceeded",
                provider
            )),
            500..=599 => ProviderError::ServerError(format!(
                "{} server error ({}): {}",
                provider, status, body
            )),
            _ => ProviderError::ServerError(format!(
                "{} returned {}: {}",
                provider, status, body
            )),
        }
    }
}
