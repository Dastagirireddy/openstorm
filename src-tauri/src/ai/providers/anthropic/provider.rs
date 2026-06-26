use async_trait::async_trait;
use futures::StreamExt;
use tokio::sync::mpsc;

use crate::ai::providers::common::{ProviderHttpClient, SseLineParser};
use crate::ai::providers::traits::*;

use super::translator::AnthropicTranslator;

const ANTHROPIC_API_VERSION: &str = "2023-06-01";
const DEFAULT_MAX_TOKENS: u32 = 4096;

/// Anthropic Claude LLM provider.
///
/// Implements the Anthropic Messages API format, translating between
/// our internal OpenAI-style messages and Anthropic's wire format.
pub struct AnthropicProvider {
    http: ProviderHttpClient,
    api_key: String,
}

impl AnthropicProvider {
    /// Create a new Anthropic provider.
    ///
    /// # Arguments
    /// * `api_key` - Anthropic API key (required)
    pub fn new(api_key: &str) -> Self {
        let http = ProviderHttpClient::new(300);

        Self {
            http,
            api_key: api_key.to_string(),
        }
    }

    /// Build the standard Anthropic request headers.
    fn auth_headers(&self) -> Vec<(&str, &str)> {
        vec![
            ("x-api-key", &self.api_key),
            ("anthropic-version", ANTHROPIC_API_VERSION),
        ]
    }
}

#[async_trait]
impl LlmProvider for AnthropicProvider {
    fn id(&self) -> &str {
        "anthropic"
    }

    fn name(&self) -> &str {
        "Claude (Anthropic)"
    }

    fn is_free(&self) -> bool {
        false
    }

    async fn check_connection(&self) -> Result<bool, ProviderError> {
        let url = "https://api.anthropic.com/v1/messages";
        // Anthropic doesn't have a models endpoint, so we send a minimal request
        // to check if the API key is valid.
        let body = serde_json::json!({
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 1,
            "messages": [{"role": "user", "content": "hi"}],
        });

        let resp = self
            .http
            .with_headers(url, &self.auth_headers())
            .json(&body)
            .send()
            .await?;

        // 200 = valid key, 401 = invalid key (but connection works)
        Ok(resp.status().is_success() || resp.status().as_u16() == 400)
    }

    async fn list_models(&self) -> Result<Vec<ModelInfo>, ProviderError> {
        // Anthropic doesn't have a public models list endpoint.
        // Return the known Claude models.
        Ok(vec![
            ModelInfo {
                id: "claude-opus-4-20250514".to_string(),
                name: "Claude Opus 4".to_string(),
                provider: "anthropic".to_string(),
                context_window: 200_000,
                max_output: 32_000,
                supports_tools: true,
                supports_vision: true,
                is_free: false,
            },
            ModelInfo {
                id: "claude-sonnet-4-20250514".to_string(),
                name: "Claude Sonnet 4".to_string(),
                provider: "anthropic".to_string(),
                context_window: 200_000,
                max_output: 64_000,
                supports_tools: true,
                supports_vision: true,
                is_free: false,
            },
            ModelInfo {
                id: "claude-haiku-4-5-20251001".to_string(),
                name: "Claude Haiku 4.5".to_string(),
                provider: "anthropic".to_string(),
                context_window: 200_000,
                max_output: 8_192,
                supports_tools: true,
                supports_vision: true,
                is_free: false,
            },
            ModelInfo {
                id: "claude-3-5-sonnet-20241022".to_string(),
                name: "Claude 3.5 Sonnet".to_string(),
                provider: "anthropic".to_string(),
                context_window: 200_000,
                max_output: 8_192,
                supports_tools: true,
                supports_vision: true,
                is_free: false,
            },
        ])
    }

    async fn chat_completion(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<ChatCompletionResponse, ProviderError> {
        // Ensure max_tokens is set (required by Anthropic)
        let mut request = request;
        if request.max_tokens.is_none() {
            request.max_tokens = Some(DEFAULT_MAX_TOKENS);
        }

        let body = AnthropicTranslator::to_anthropic_request(&request);
        let url = "https://api.anthropic.com/v1/messages";

        let resp = self
            .http
            .with_headers(url, &self.auth_headers())
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(ProviderError::ServerError(format!(
                "Anthropic returned {}: {}",
                status, text
            )));
        }

        let body: serde_json::Value = resp.json().await?;
        AnthropicTranslator::from_anthropic_response(&body, &request.model)
    }

    async fn chat_completion_stream(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<mpsc::Receiver<ChatCompletionChunk>, ProviderError> {
        // Ensure max_tokens is set (required by Anthropic)
        let mut request = request;
        if request.max_tokens.is_none() {
            request.max_tokens = Some(DEFAULT_MAX_TOKENS);
        }

        let mut body = AnthropicTranslator::to_anthropic_request(&request);
        body["stream"] = serde_json::json!(true);

        let url = "https://api.anthropic.com/v1/messages";
        let resp = self
            .http
            .with_headers(url, &self.auth_headers())
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(ProviderError::ServerError(format!(
                "Anthropic returned {}: {}",
                status, text
            )));
        }

        let (tx, rx) = mpsc::channel(256);

        tokio::spawn(async move {
            let mut stream = resp.bytes_stream();
            let mut parser = SseLineParser::new();

            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(bytes) => {
                        let lines = parser.feed(&bytes);

                        for line in lines {
                            if SseLineParser::is_done(&line) {
                                continue;
                            }

                            if let Ok(val) =
                                serde_json::from_str::<serde_json::Value>(&line)
                            {
                                if let Some(chunk) =
                                    AnthropicTranslator::from_anthropic_stream_chunk(&val)
                                {
                                    if tx.send(chunk).await.is_err() {
                                        return;
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[Anthropic] Stream error: {}", e);
                        break;
                    }
                }
            }
        });

        Ok(rx)
    }
}
