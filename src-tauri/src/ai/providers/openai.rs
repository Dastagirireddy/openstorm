use async_trait::async_trait;
use reqwest::Client;
use tokio::sync::mpsc;

use super::traits::*;

const DEFAULT_OPENAI_URL: &str = "https://api.openai.com/v1";

pub struct OpenAiProvider {
    client: Client,
    api_key: String,
    base_url: String,
}

impl OpenAiProvider {
    pub fn new(api_key: String, base_url: Option<String>) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            api_key,
            base_url: base_url.unwrap_or_else(|| DEFAULT_OPENAI_URL.to_string()),
        }
    }

    fn auth_header(&self) -> String {
        format!("Bearer {}", self.api_key)
    }
}

#[async_trait]
impl LlmProvider for OpenAiProvider {
    fn id(&self) -> &str {
        "openai"
    }

    fn name(&self) -> &str {
        "OpenAI"
    }

    fn is_free(&self) -> bool {
        false
    }

    async fn check_connection(&self) -> Result<bool, ProviderError> {
        let resp = self
            .client
            .get(format!("{}/models", self.base_url))
            .header("Authorization", self.auth_header())
            .send()
            .await?;
        Ok(resp.status().is_success())
    }

    async fn list_models(&self) -> Result<Vec<ModelInfo>, ProviderError> {
        let resp = self
            .client
            .get(format!("{}/models", self.base_url))
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(ProviderError::ServerError(format!(
                "OpenAI returned {}: {}",
                status, text
            )));
        }

        let body: serde_json::Value = resp.json().await?;
        let models = body["data"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| {
                        let id = m["id"].as_str()?.to_string();
                        // Filter to chat models only
                        if id.starts_with("gpt-") || id.starts_with("o1") || id.starts_with("o3") {
                            Some(ModelInfo {
                                id: id.clone(),
                                name: id.clone(),
                                provider: "openai".to_string(),
                                context_window: match id.as_str() {
                                    "gpt-4o" | "gpt-4o-mini" => 128000,
                                    "gpt-4-turbo" => 128000,
                                    "gpt-4" => 8192,
                                    "gpt-3.5-turbo" => 16385,
                                    "o1" | "o1-mini" | "o1-pro" => 200000,
                                    "o3" | "o3-mini" => 200000,
                                    _ => 128000,
                                },
                                max_output: match id.as_str() {
                                    "gpt-4o" | "gpt-4o-mini" => 16384,
                                    "gpt-4-turbo" => 4096,
                                    "gpt-4" => 8192,
                                    "gpt-3.5-turbo" => 4096,
                                    "o1" | "o1-pro" => 32768,
                                    "o1-mini" => 65536,
                                    "o3" | "o3-mini" => 100000,
                                    _ => 4096,
                                },
                                supports_tools: !id.starts_with("o1"), // o1 doesn't support tools yet
                                supports_vision: id.contains("o") || id.contains("gpt-4"),
                                is_free: false,
                            })
                        } else {
                            None
                        }
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
        let openai_messages: Vec<serde_json::Value> = request
            .messages
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
                        let openai_calls: Vec<serde_json::Value> = calls
                            .iter()
                            .map(|c| {
                                serde_json::json!({
                                    "id": c.id,
                                    "type": "function",
                                    "function": {
                                        "name": c.function.name,
                                        "arguments": c.function.arguments,
                                    }
                                })
                            })
                            .collect();
                        obj["tool_calls"] = serde_json::json!(openai_calls);
                    }
                    Some(obj)
                }
                Message::Tool {
                    tool_call_id,
                    content,
                } => {
                    Some(serde_json::json!({
                        "role": "tool",
                        "tool_call_id": tool_call_id,
                        "content": content,
                    }))
                }
            })
            .collect();

        let mut body = serde_json::json!({
            "model": request.model,
            "messages": openai_messages,
            "stream": false,
        });

        if let Some(tools) = &request.tools {
            let openai_tools: Vec<serde_json::Value> = tools
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
                .collect();
            body["tools"] = serde_json::json!(openai_tools);
        }

        if let Some(temp) = request.temperature {
            body["temperature"] = serde_json::json!(temp);
        }
        if let Some(max_tokens) = request.max_tokens {
            body["max_tokens"] = serde_json::json!(max_tokens);
        }

        let resp = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", self.auth_header())
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(ProviderError::ServerError(format!(
                "OpenAI returned {}: {}",
                status, text
            )));
        }

        let body: serde_json::Value = resp.json().await?;

        let choice = body["choices"]
            .as_array()
            .and_then(|arr| arr.first());

        let message = choice
            .and_then(|c| c.get("message"))
            .ok_or_else(|| ProviderError::ServerError("No message in response".to_string()))?;

        let content = message["content"].as_str().map(|s| s.to_string());
        let tool_calls_raw = message["tool_calls"].as_array().map(|calls| {
            calls
                .iter()
                .enumerate()
                .filter_map(|(i, call)| {
                    let func = call.get("function")?;
                    Some(ToolCall {
                        id: call["id"].as_str()?.to_string(),
                        call_type: "function".to_string(),
                        function: FunctionCall {
                            name: func["name"].as_str()?.to_string(),
                            arguments: func["arguments"].as_str()?.to_string(),
                        },
                    })
                })
                .collect::<Vec<_>>()
        });

        let finish_reason = choice
            .and_then(|c| c["finish_reason"].as_str())
            .map(|s| s.to_string());

        Ok(ChatCompletionResponse {
            id: body["id"].as_str().unwrap_or("openai-unknown").to_string(),
            model: body["model"].as_str().unwrap_or("unknown").to_string(),
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

    async fn chat_completion_stream(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<mpsc::Receiver<ChatCompletionChunk>, ProviderError> {
        let openai_messages: Vec<serde_json::Value> = request
            .messages
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
                        let openai_calls: Vec<serde_json::Value> = calls
                            .iter()
                            .map(|c| {
                                serde_json::json!({
                                    "id": c.id,
                                    "type": "function",
                                    "function": {
                                        "name": c.function.name,
                                        "arguments": c.function.arguments,
                                    }
                                })
                            })
                            .collect();
                        obj["tool_calls"] = serde_json::json!(openai_calls);
                    }
                    Some(obj)
                }
                Message::Tool {
                    tool_call_id,
                    content,
                } => {
                    Some(serde_json::json!({
                        "role": "tool",
                        "tool_call_id": tool_call_id,
                        "content": content,
                    }))
                }
            })
            .collect();

        let mut body = serde_json::json!({
            "model": request.model,
            "messages": openai_messages,
            "stream": true,
        });

        if let Some(tools) = &request.tools {
            let openai_tools: Vec<serde_json::Value> = tools
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
                .collect();
            body["tools"] = serde_json::json!(openai_tools);
        }

        if let Some(temp) = request.temperature {
            body["temperature"] = serde_json::json!(temp);
        }
        if let Some(max_tokens) = request.max_tokens {
            body["max_tokens"] = serde_json::json!(max_tokens);
        }

        let resp = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", self.auth_header())
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(ProviderError::ServerError(format!(
                "OpenAI returned {}: {}",
                status, text
            )));
        }

        let (tx, rx) = mpsc::channel(256);

        tokio::spawn(async move {
            use futures::StreamExt;

            let mut stream = resp.bytes_stream();
            let mut buffer = String::new();

            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(bytes) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));

                        // Process SSE lines
                        while let Some(pos) = buffer.find('\n') {
                            let line = buffer[..pos].trim().to_string();
                            buffer = buffer[pos + 1..].to_string();

                            // Skip empty lines and SSE prefix
                            if line.is_empty() || line.starts_with(": ") {
                                continue;
                            }

                            // Extract data from "data: {...}" format
                            let json_str = if let Some(data) = line.strip_prefix("data: ") {
                                data.trim()
                            } else {
                                continue;
                            };

                            // Handle [DONE] marker
                            if json_str == "[DONE]" {
                                break;
                            }

                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                                let choice = val["choices"]
                                    .as_array()
                                    .and_then(|arr| arr.first());

                                let delta = choice
                                    .and_then(|c| c.get("delta"))
                                    .cloned()
                                    .unwrap_or(serde_json::json!({}));

                                let tool_calls = delta["tool_calls"]
                                    .as_array()
                                    .map(|calls| {
                                        calls
                                            .iter()
                                            .enumerate()
                                            .filter_map(|(i, call)| {
                                                let func = call.get("function")?;
                                                Some(ToolCallDelta {
                                                    index: call["index"].as_u64().unwrap_or(i as u64) as u32,
                                                    id: call["id"].as_str().map(|s| s.to_string()),
                                                    call_type: Some("function".to_string()),
                                                    function: Some(FunctionCallDelta {
                                                        name: func["name"].as_str().map(|s| s.to_string()),
                                                        arguments: func["arguments"].as_str().map(|s| s.to_string()),
                                                    }),
                                                })
                                            })
                                            .collect::<Vec<_>>()
                                    })
                                    .filter(|calls| !calls.is_empty());

                                let chunk = ChatCompletionChunk {
                                    id: val["id"]
                                        .as_str()
                                        .unwrap_or("openai-unknown")
                                        .to_string(),
                                    model: val["model"]
                                        .as_str()
                                        .unwrap_or("unknown")
                                        .to_string(),
                                    choices: vec![ChunkChoice {
                                        index: 0,
                                        delta: Delta {
                                            role: delta["role"].as_str().map(|s| s.to_string()),
                                            content: delta["content"].as_str().map(|s| s.to_string()),
                                            tool_calls,
                                        },
                                        finish_reason: choice
                                            .and_then(|c| c["finish_reason"].as_str())
                                            .map(|s| s.to_string()),
                                    }],
                                    usage: None,
                                };

                                if tx.send(chunk).await.is_err() {
                                    break;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[OpenAI] Stream error: {}", e);
                        break;
                    }
                }
            }
        });

        Ok(rx)
    }
}
