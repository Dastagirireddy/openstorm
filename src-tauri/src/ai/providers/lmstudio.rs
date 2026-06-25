use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use tokio::sync::mpsc;

use super::traits::*;

const DEFAULT_LMSTUDIO_URL: &str = "http://localhost:1234/v1";

pub struct LmStudioProvider {
    client: Client,
    base_url: String,
}

impl LmStudioProvider {
    pub fn new(base_url: Option<String>) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            base_url: base_url.unwrap_or_else(|| DEFAULT_LMSTUDIO_URL.to_string()),
        }
    }
}

#[async_trait]
impl LlmProvider for LmStudioProvider {
    fn id(&self) -> &str {
        "lmstudio"
    }

    fn name(&self) -> &str {
        "LM Studio"
    }

    fn is_free(&self) -> bool {
        true
    }

    async fn check_connection(&self) -> Result<bool, ProviderError> {
        let resp = self
            .client
            .get(format!("{}/models", self.base_url))
            .send()
            .await?;
        Ok(resp.status().is_success())
    }

    async fn list_models(&self) -> Result<Vec<ModelInfo>, ProviderError> {
        let resp = self
            .client
            .get(format!("{}/models", self.base_url))
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(ProviderError::ConnectionFailed(format!(
                "LM Studio returned status {}",
                resp.status()
            )));
        }

        let body: serde_json::Value = resp.json().await?;
        let models = body["data"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .map(|m| {
                        let id = m["id"].as_str().unwrap_or("unknown").to_string();
                        ModelInfo {
                            id: id.clone(),
                            name: id.clone(),
                            provider: "lmstudio".to_string(),
                            context_window: 8192,
                            max_output: 4096,
                            supports_tools: false,
                            supports_vision: false,
                            is_free: true,
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
        let messages: Vec<serde_json::Value> = request
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
            .collect();

        let mut body = serde_json::json!({
            "model": request.model,
            "messages": messages,
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

        let resp = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(ProviderError::ServerError(format!(
                "LM Studio returned {}: {}",
                status, text
            )));
        }

        let body: serde_json::Value = resp.json().await?;

        let choice = body["choices"].get(0).ok_or_else(|| {
            ProviderError::ServerError("No choices in response".to_string())
        })?;

        let msg = &choice["message"];
        let content = msg["content"].as_str().map(|s| s.to_string());
        let tool_calls_raw = msg["tool_calls"].as_array().map(|calls| {
            calls
                .iter()
                .enumerate()
                .filter_map(|(i, call)| {
                    let func = call.get("function")?;
                    Some(ToolCall {
                        id: format!("call_{}", i),
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
            id: body["id"].as_str().unwrap_or("lmstudio").to_string(),
            model: request.model,
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
        let messages: Vec<serde_json::Value> = request
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
            .collect();

        let mut body = serde_json::json!({
            "model": request.model,
            "messages": messages,
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

        let resp = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(ProviderError::ServerError(format!(
                "LM Studio returned {}: {}",
                status, text
            )));
        }

        let (tx, rx) = mpsc::channel(256);

        tokio::spawn(async move {
            let mut stream = resp.bytes_stream();
            let mut buffer = String::new();

            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(bytes) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));

                        while let Some(pos) = buffer.find('\n') {
                            let line = buffer[..pos].trim().to_string();
                            buffer = buffer[pos + 1..].to_string();

                            if line.is_empty() || !line.starts_with("data: ") {
                                continue;
                            }

                            let data = &line[6..];
                            if data == "[DONE]" {
                                break;
                            }

                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                                let choice = val["choices"].get(0);
                                let delta = choice.and_then(|c| c.get("delta"));

                                let chunk = ChatCompletionChunk {
                                    id: val["id"]
                                        .as_str()
                                        .unwrap_or("lmstudio")
                                        .to_string(),
                                    model: val["model"]
                                        .as_str()
                                        .unwrap_or("unknown")
                                        .to_string(),
                                    choices: vec![ChunkChoice {
                                        index: 0,
                                        delta: Delta {
                                            role: delta
                                                .and_then(|d| d["role"].as_str())
                                                .map(|s| s.to_string()),
                                            content: delta
                                                .and_then(|d| d["content"].as_str())
                                                .map(|s| s.to_string()),
                                            tool_calls: None,
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
                        eprintln!("[LM Studio] Stream error: {}", e);
                        break;
                    }
                }
            }
        });

        Ok(rx)
    }
}
