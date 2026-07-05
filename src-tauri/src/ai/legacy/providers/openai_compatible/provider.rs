use async_trait::async_trait;
use futures::StreamExt;
use tokio::sync::mpsc;

use crate::ai::legacy::providers::common::{ProviderHttpClient, SseLineParser};
use crate::ai::legacy::providers::traits::*;

/// Universal OpenAI-compatible LLM provider.
///
/// Works with any provider that implements the OpenAI Chat Completions API format:
/// OpenAI, OpenRouter, DeepSeek, Qwen, Groq, SambaNova, Together, Mistral,
/// Cerebras, Fireworks, LM Studio, NVIDIA NIM, and many more.
///
/// The key insight: all these providers share the same request/response wire format.
/// We only need to change the base URL and API key.
pub struct OpenAICompatibleProvider {
    http: ProviderHttpClient,
    base_url: String,
    api_key: String,
    provider_id: String,
    provider_name: String,
}

impl OpenAICompatibleProvider {
    /// Create a new OpenAI-compatible provider.
    ///
    /// # Arguments
    /// * `provider_id` - Provider identifier (e.g., "openai", "nvidia", "groq")
    /// * `base_url` - API base URL (e.g., "https://api.openai.com/v1")
    /// * `api_key` - API key (empty string for providers that don't require one)
    pub fn new(provider_id: &str, base_url: &str, api_key: &str) -> Self {
        let http = ProviderHttpClient::new(300);
        let provider_name = super::presets::get_preset(provider_id)
            .map(|p| p.name.to_string())
            .unwrap_or_else(|| provider_id.to_string());

        Self {
            http,
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.to_string(),
            provider_id: provider_id.to_string(),
            provider_name,
        }
    }

    /// Build the messages array in OpenAI format.
    ///
    /// Our internal `Message` type already matches OpenAI's wire format,
    /// so we serialize directly.
    fn build_messages(messages: &[Message]) -> Vec<serde_json::Value> {
        messages
            .iter()
            .filter_map(|msg| match msg {
                Message::System { content } => {
                    Some(serde_json::json!({"role": "system", "content": content}))
                }
                Message::User { content } => {
                    Some(serde_json::json!({"role": "user", "content": content}))
                }
                Message::Assistant {
                    content,
                    tool_calls,
                } => {
                    let mut obj = serde_json::json!({
                        "role": "assistant",
                        "content": content.as_deref().unwrap_or(""),
                    });
                    if let Some(calls) = tool_calls {
                        obj["tool_calls"] = serde_json::json!(calls);
                    }
                    Some(obj)
                }
                Message::Tool {
                    tool_call_id: _,
                    content,
                } => {
                    Some(serde_json::json!({
                        "role": "tool",
                        "content": content,
                    }))
                }
            })
            .collect()
    }

    /// Build the tools array in OpenAI format.
    fn build_tools(tools: &[ToolDefinition]) -> Vec<serde_json::Value> {
        tools
            .iter()
            .map(|t| {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": t.function.name,
                        "description": t.function.description,
                        "parameters": t.function.parameters,
                    }
                })
            })
            .collect()
    }

    /// Parse a non-streaming chat completion response.
    fn parse_response(
        body: serde_json::Value,
        model: &str,
    ) -> Result<ChatCompletionResponse, ProviderError> {
        let choice = body["choices"]
            .get(0)
            .ok_or_else(|| ProviderError::ServerError("No choices in response".to_string()))?;

        let msg = &choice["message"];
        let content = msg["content"].as_str().map(|s| s.to_string());
        let tool_calls_raw = msg["tool_calls"].as_array().map(|calls| {
            calls
                .iter()
                .enumerate()
                .filter_map(|(i, call)| {
                    let func = call.get("function")?;
                    Some(ToolCall {
                        id: call["id"]
                            .as_str()
                            .unwrap_or(&format!("call_{}", i))
                            .to_string(),
                        call_type: "function".to_string(),
                        function: FunctionCall {
                            name: func["name"].as_str()?.to_string(),
                            arguments: func["arguments"].to_string(),
                        },
                    })
                })
                .collect::<Vec<_>>()
        });

        let finish_reason = choice["finish_reason"]
            .as_str()
            .map(|s| s.to_string());

        Ok(ChatCompletionResponse {
            id: body["id"]
                .as_str()
                .unwrap_or("unknown")
                .to_string(),
            model: body["model"]
                .as_str()
                .unwrap_or(model)
                .to_string(),
            choices: vec![Choice {
                index: 0,
                message: Message::Assistant {
                    content,
                    tool_calls: tool_calls_raw,
                },
                finish_reason,
            }],
            usage: body.get("usage").and_then(|u| Some(Usage {
                prompt_tokens: u["prompt_tokens"].as_u64()? as u32,
                completion_tokens: u["completion_tokens"].as_u64()? as u32,
                total_tokens: u["total_tokens"].as_u64()? as u32,
            })),
        })
    }

    /// Parse a single SSE chunk into a ChatCompletionChunk.
    fn parse_chunk(val: &serde_json::Value) -> Option<ChatCompletionChunk> {
        let choice = val["choices"].get(0)?;
        let delta = choice.get("delta")?;

        Some(ChatCompletionChunk {
            id: val["id"].as_str().unwrap_or("unknown").to_string(),
            model: val["model"].as_str().unwrap_or("unknown").to_string(),
            choices: vec![ChunkChoice {
                index: 0,
                delta: Delta {
                    role: delta["role"].as_str().map(|s| s.to_string()),
                    content: delta["content"].as_str().map(|s| s.to_string()),
                    tool_calls: delta["tool_calls"].as_array().map(|calls| {
                        calls
                            .iter()
                            .enumerate()
                            .filter_map(|(i, call)| {
                                let func = call.get("function")?;
                                Some(ToolCallDelta {
                                    index: call["index"].as_u64().unwrap_or(i as u64) as u32,
                                    id: call["id"].as_str().map(|s| s.to_string()),
                                    call_type: call["type"].as_str().map(|s| s.to_string()),
                                    function: Some(FunctionCallDelta {
                                        name: func["name"].as_str().map(|s| s.to_string()),
                                        arguments: func["arguments"].as_str().map(|s| s.to_string()),
                                    }),
                                })
                            })
                            .collect()
                    }),
                },
                finish_reason: choice["finish_reason"].as_str().map(|s| s.to_string()),
            }],
            usage: val.get("usage").and_then(|u| Some(Usage {
                prompt_tokens: u["prompt_tokens"].as_u64()? as u32,
                completion_tokens: u["completion_tokens"].as_u64()? as u32,
                total_tokens: u["total_tokens"].as_u64().unwrap_or(0) as u32,
            })),
        })
    }
}

#[async_trait]
impl LlmProvider for OpenAICompatibleProvider {
    fn id(&self) -> &str {
        &self.provider_id
    }

    fn name(&self) -> &str {
        &self.provider_name
    }

    fn is_free(&self) -> bool {
        super::presets::get_preset(&self.provider_id)
            .map(|p| p.is_free)
            .unwrap_or(false)
    }

    async fn check_connection(&self) -> Result<bool, ProviderError> {
        let url = format!("{}/models", self.base_url);
        let resp = if self.api_key.is_empty() {
            self.http.get(&url).send().await?
        } else {
            self.http.get_bearer_auth(&url, &self.api_key).send().await?
        };
        Ok(resp.status().is_success())
    }

    async fn list_models(&self) -> Result<Vec<ModelInfo>, ProviderError> {
        let url = format!("{}/models", self.base_url);
        let resp = if self.api_key.is_empty() {
            self.http.get(&url).send().await?
        } else {
            self.http.get_bearer_auth(&url, &self.api_key).send().await?
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(ProviderError::ServerError(format!(
                "{} returned {}: {}",
                self.provider_name, status, text
            )));
        }

        let body: serde_json::Value = resp.json().await?;
        let models = body["data"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| {
                        let id = m["id"].as_str()?.to_string();
                        // Skip embedding, audio, image, and moderation models
                        if id.contains("embedding")
                            || id.contains("audio")
                            || id.contains("image")
                            || id.contains("moderation")
                            || id.contains("tts")
                            || id.contains("whisper")
                            || id.contains("dall-e")
                        {
                            return None;
                        }
                        Some(ModelInfo {
                            id: id.clone(),
                            name: m["name"].as_str().unwrap_or(&id).to_string(),
                            provider: self.provider_id.clone(),
                            context_window: m["context_length"]
                                .as_u64()
                                .unwrap_or(128_000) as u32,
                            max_output: m["max_output_tokens"]
                                .as_u64()
                                .unwrap_or(4_096) as u32,
                            supports_tools: true,
                            supports_vision: id.contains("vision")
                                || id.contains("gpt-4o")
                                || id.contains("claude")
                                || id.contains("gemini"),
                            is_free: self.is_free(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(models)
    }

    async fn chat_completion(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<ChatCompletionResponse, ProviderError> {
        let mut body = serde_json::json!({
            "model": request.model,
            "messages": Self::build_messages(&request.messages),
            "stream": false,
        });

        if let Some(tools) = &request.tools {
            body["tools"] = serde_json::json!(Self::build_tools(tools));
        }

        if let Some(temp) = request.temperature {
            body["temperature"] = serde_json::json!(temp);
        }
        if let Some(max_tokens) = request.max_tokens {
            body["max_tokens"] = serde_json::json!(max_tokens);
        }

        let url = format!("{}/chat/completions", self.base_url);
        let resp = self
            .http
            .bearer_auth(&url, &self.api_key)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(ProviderError::ServerError(format!(
                "{} returned {}: {}",
                self.provider_name, status, text
            )));
        }

        let body: serde_json::Value = resp.json().await?;
        Self::parse_response(body, &request.model)
    }

    async fn chat_completion_stream(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<mpsc::Receiver<ChatCompletionChunk>, ProviderError> {
        let mut body = serde_json::json!({
            "model": request.model,
            "messages": Self::build_messages(&request.messages),
            "stream": true,
        });

        if let Some(tools) = &request.tools {
            body["tools"] = serde_json::json!(Self::build_tools(tools));
        }

        if let Some(temp) = request.temperature {
            body["temperature"] = serde_json::json!(temp);
        }
        if let Some(max_tokens) = request.max_tokens {
            body["max_tokens"] = serde_json::json!(max_tokens);
        }

        let url = format!("{}/chat/completions", self.base_url);
        let resp = self
            .http
            .bearer_auth(&url, &self.api_key)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(ProviderError::ServerError(format!(
                "{} returned {}: {}",
                self.provider_name, status, text
            )));
        }

        let (tx, rx) = mpsc::channel(256);

        let provider_id = self.provider_id.clone();

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
                                if let Some(chunk) = Self::parse_chunk(&val) {
                                    if tx.send(chunk).await.is_err() {
                                        return;
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[{}] Stream error: {}", provider_id, e);
                        break;
                    }
                }
            }
        });

        Ok(rx)
    }
}
