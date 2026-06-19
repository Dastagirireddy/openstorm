use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use tokio::sync::mpsc;

use super::provider::*;

const DEFAULT_OLLAMA_URL: &str = "http://localhost:11434";

pub struct OllamaProvider {
    client: Client,
    base_url: String,
}

impl OllamaProvider {
    pub fn new(base_url: Option<String>) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            base_url: base_url.unwrap_or_else(|| DEFAULT_OLLAMA_URL.to_string()),
        }
    }

    fn parse_model(&self, m: &serde_json::Value, is_local: bool) -> ModelInfo {
        let name = m["name"].as_str().unwrap_or("unknown").to_string();
        let size = m["size"].as_u64().unwrap_or(0);
        let context_window = if size > 20_000_000_000 {
            32768
        } else if size > 8_000_000_000 {
            16384
        } else {
            8192
        };
        ModelInfo {
            id: name.clone(),
            name,
            provider: "ollama".to_string(),
            context_window,
            max_output: 4096,
            supports_tools: true,
            supports_vision: false,
            is_free: true,
        }
    }
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    fn id(&self) -> &str {
        "ollama"
    }

    fn name(&self) -> &str {
        "Ollama"
    }

    fn is_free(&self) -> bool {
        true
    }

    async fn check_connection(&self) -> Result<bool, ProviderError> {
        let resp = self
            .client
            .get(format!("{}/api/tags", self.base_url))
            .send()
            .await?;
        Ok(resp.status().is_success())
    }

    async fn list_models(&self) -> Result<Vec<ModelInfo>, ProviderError> {
        let resp = self
            .client
            .get(format!("{}/api/tags", self.base_url))
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(ProviderError::ConnectionFailed(format!(
                "Ollama returned status {}",
                resp.status()
            )));
        }

        let body: serde_json::Value = resp.json().await?;
        let models = body["models"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .map(|m| self.parse_model(m, true))
                    .collect()
            })
            .unwrap_or_default();

        Ok(models)
    }

    async fn chat_completion(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<ChatCompletionResponse, ProviderError> {
        let ollama_messages: Vec<serde_json::Value> = request
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
                        // Ollama expects arguments as a JSON object, not a string
                        let ollama_calls: Vec<serde_json::Value> = calls
                            .iter()
                            .map(|c| {
                                let args: serde_json::Value = serde_json::from_str(&c.function.arguments)
                                    .unwrap_or(serde_json::json!({}));
                                serde_json::json!({
                                    "type": "function",
                                    "function": {
                                        "name": c.function.name,
                                        "arguments": args,
                                    }
                                })
                            })
                            .collect();
                        obj["tool_calls"] = serde_json::json!(ollama_calls);
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
            "messages": ollama_messages,
            "stream": false,
        });

        if let Some(tools) = &request.tools {
            let ollama_tools: Vec<serde_json::Value> = tools
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
            body["tools"] = serde_json::json!(ollama_tools);
        }

        let resp = self
            .client
            .post(format!("{}/api/chat", self.base_url))
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(ProviderError::ServerError(format!(
                "Ollama returned {}: {}",
                status, text
            )));
        }

        let body: serde_json::Value = resp.json().await?;

        let message = &body["message"];
        let content = message["content"].as_str().map(|s| s.to_string());
        let tool_calls_raw = message["tool_calls"].as_array().map(|calls| {
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

        let finish_reason = if tool_calls_raw
            .as_ref()
            .map(|v| !v.is_empty())
            .unwrap_or(false)
        {
            Some("tool_calls".to_string())
        } else {
            Some("stop".to_string())
        };

        Ok(ChatCompletionResponse {
            id: format!("ollama-{}", uuid::Uuid::new_v4()),
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
        let ollama_messages: Vec<serde_json::Value> = request
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
                        let ollama_calls: Vec<serde_json::Value> = calls
                            .iter()
                            .map(|c| {
                                let args: serde_json::Value = serde_json::from_str(&c.function.arguments)
                                    .unwrap_or(serde_json::json!({}));
                                serde_json::json!({
                                    "type": "function",
                                    "function": {
                                        "name": c.function.name,
                                        "arguments": args,
                                    }
                                })
                            })
                            .collect();
                        obj["tool_calls"] = serde_json::json!(ollama_calls);
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
            "messages": ollama_messages,
            "stream": true,
        });

        if let Some(tools) = &request.tools {
            let ollama_tools: Vec<serde_json::Value> = tools
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
            body["tools"] = serde_json::json!(ollama_tools);
        }

        let resp = self
            .client
            .post(format!("{}/api/chat", self.base_url))
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(ProviderError::ServerError(format!(
                "Ollama returned {}: {}",
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

                            if line.is_empty() {
                                continue;
                            }

                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                                // Parse tool calls from delta if present
                                let tool_calls = val["message"]["tool_calls"]
                                    .as_array()
                                    .map(|calls| {
                                        calls
                                            .iter()
                                            .enumerate()
                                            .filter_map(|(i, call)| {
                                                let func = call.get("function")?;
                                                let args = func.get("arguments").map(|a| a.to_string());
                                                Some(ToolCallDelta {
                                                    index: i as u32,
                                                    id: Some(format!("call_{}", i)),
                                                    call_type: Some("function".to_string()),
                                                    function: Some(FunctionCallDelta {
                                                        name: func["name"].as_str().map(|s| s.to_string()),
                                                        arguments: args,
                                                    }),
                                                })
                                            })
                                            .collect::<Vec<_>>()
                                    })
                                    .filter(|calls| !calls.is_empty());

                                let chunk = ChatCompletionChunk {
                                    id: val["model"]
                                        .as_str()
                                        .unwrap_or("ollama")
                                        .to_string(),
                                    model: val["model"]
                                        .as_str()
                                        .unwrap_or("unknown")
                                        .to_string(),
                                    choices: vec![ChunkChoice {
                                        index: 0,
                                        delta: Delta {
                                            role: None,
                                            content: val["message"]["content"]
                                                .as_str()
                                                .map(|s| s.to_string()),
                                            tool_calls,
                                        },
                                        finish_reason: if val["done"].as_bool() == Some(true) {
                                            Some("stop".to_string())
                                        } else {
                                            None
                                        },
                                    }],
                                };

                                if tx.send(chunk).await.is_err() {
                                    break;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[Ollama] Stream error: {}", e);
                        break;
                    }
                }
            }
        });

        Ok(rx)
    }
}
