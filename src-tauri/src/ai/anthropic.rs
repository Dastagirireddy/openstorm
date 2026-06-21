use async_trait::async_trait;
use reqwest::Client;
use tokio::sync::mpsc;

use super::provider::*;

const DEFAULT_ANTHROPIC_URL: &str = "https://api.anthropic.com/v1";

pub struct AnthropicProvider {
    client: Client,
    api_key: String,
    base_url: String,
}

impl AnthropicProvider {
    pub fn new(api_key: String, base_url: Option<String>) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            api_key,
            base_url: base_url.unwrap_or_else(|| DEFAULT_ANTHROPIC_URL.to_string()),
        }
    }
}

#[async_trait]
impl LlmProvider for AnthropicProvider {
    fn id(&self) -> &str {
        "anthropic"
    }

    fn name(&self) -> &str {
        "Anthropic"
    }

    fn is_free(&self) -> bool {
        false
    }

    async fn check_connection(&self) -> Result<bool, ProviderError> {
        // Anthropic doesn't have a models endpoint; try a simple request
        let resp = self
            .client
            .get(format!("{}/models", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .send()
            .await;
        // Even a 401 means the endpoint exists
        Ok(resp.is_ok())
    }

    async fn list_models(&self) -> Result<Vec<ModelInfo>, ProviderError> {
        // Anthropic doesn't have a public models endpoint
        // Return known models
        let models = vec![
            ModelInfo {
                id: "claude-sonnet-4-20250514".to_string(),
                name: "Claude Sonnet 4".to_string(),
                provider: "anthropic".to_string(),
                context_window: 200000,
                max_output: 8192,
                supports_tools: true,
                supports_vision: true,
                is_free: false,
            },
            ModelInfo {
                id: "claude-3-5-haiku-20241022".to_string(),
                name: "Claude 3.5 Haiku".to_string(),
                provider: "anthropic".to_string(),
                context_window: 200000,
                max_output: 8192,
                supports_tools: true,
                supports_vision: true,
                is_free: false,
            },
            ModelInfo {
                id: "claude-3-5-sonnet-20241022".to_string(),
                name: "Claude 3.5 Sonnet".to_string(),
                provider: "anthropic".to_string(),
                context_window: 200000,
                max_output: 8192,
                supports_tools: true,
                supports_vision: true,
                is_free: false,
            },
            ModelInfo {
                id: "claude-3-opus-20240229".to_string(),
                name: "Claude 3 Opus".to_string(),
                provider: "anthropic".to_string(),
                context_window: 200000,
                max_output: 4096,
                supports_tools: true,
                supports_vision: true,
                is_free: false,
            },
        ];

        Ok(models)
    }

    async fn chat_completion(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<ChatCompletionResponse, ProviderError> {
        let mut system = String::new();
        let mut anthropic_messages: Vec<serde_json::Value> = Vec::new();

        for msg in &request.messages {
            match msg {
                Message::System { content } => {
                    if !system.is_empty() {
                        system.push_str("\n\n");
                    }
                    system.push_str(content);
                }
                Message::User { content } => {
                    anthropic_messages.push(serde_json::json!({
                        "role": "user",
                        "content": content,
                    }));
                }
                Message::Assistant {
                    content,
                    tool_calls,
                } => {
                    if let Some(calls) = tool_calls {
                        // Include tool use blocks
                        let mut content_blocks: Vec<serde_json::Value> = Vec::new();
                        if let Some(text) = content {
                            if !text.is_empty() {
                                content_blocks.push(serde_json::json!({
                                    "type": "text",
                                    "text": text,
                                }));
                            }
                        }
                        for call in calls {
                            content_blocks.push(serde_json::json!({
                                "type": "tool_use",
                                "id": call.id,
                                "name": call.function.name,
                                "input": serde_json::from_str::<serde_json::Value>(&call.function.arguments)
                                    .unwrap_or(serde_json::json!({})),
                            }));
                        }
                        anthropic_messages.push(serde_json::json!({
                            "role": "assistant",
                            "content": content_blocks,
                        }));
                    } else {
                        anthropic_messages.push(serde_json::json!({
                            "role": "assistant",
                            "content": content.as_deref().unwrap_or(""),
                        }));
                    }
                }
                Message::Tool {
                    tool_call_id,
                    content,
                } => {
                    anthropic_messages.push(serde_json::json!({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": tool_call_id,
                            "content": content,
                        }],
                    }));
                }
            }
        }

        let mut body = serde_json::json!({
            "model": request.model,
            "messages": anthropic_messages,
            "max_tokens": request.max_tokens.unwrap_or(4096),
        });

        if !system.is_empty() {
            body["system"] = serde_json::json!(system);
        }

        if let Some(tools) = &request.tools {
            let anthropic_tools: Vec<serde_json::Value> = tools
                .iter()
                .map(|t| {
                    serde_json::json!({
                        "name": t.function.name,
                        "description": t.function.description,
                        "input_schema": t.function.parameters,
                    })
                })
                .collect();
            body["tools"] = serde_json::json!(anthropic_tools);
        }

        if let Some(temp) = request.temperature {
            body["temperature"] = serde_json::json!(temp);
        }

        let resp = self
            .client
            .post(format!("{}/messages", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
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

        let mut content_text = String::new();
        let mut tool_calls = Vec::new();

        if let Some(content_blocks) = body["content"].as_array() {
            for block in content_blocks {
                match block["type"].as_str() {
                    Some("text") => {
                        if let Some(text) = block["text"].as_str() {
                            content_text.push_str(text);
                        }
                    }
                    Some("tool_use") => {
                        tool_calls.push(ToolCall {
                            id: block["id"].as_str().unwrap_or("unknown").to_string(),
                            call_type: "function".to_string(),
                            function: FunctionCall {
                                name: block["name"].as_str().unwrap_or("unknown").to_string(),
                                arguments: serde_json::to_string(
                                    &block.get("input").cloned().unwrap_or(serde_json::json!({})),
                                )
                                .unwrap_or_default(),
                            },
                        });
                    }
                    _ => {}
                }
            }
        }

        let stop_reason = body["stop_reason"].as_str().map(|s| s.to_string());

        let content = if content_text.is_empty() {
            None
        } else {
            Some(content_text)
        };

        let tool_calls_opt = if tool_calls.is_empty() {
            None
        } else {
            Some(tool_calls)
        };

        Ok(ChatCompletionResponse {
            id: body["id"]
                .as_str()
                .unwrap_or("anthropic-unknown")
                .to_string(),
            model: body["model"]
                .as_str()
                .unwrap_or("unknown")
                .to_string(),
            choices: vec![Choice {
                index: 0,
                message: Message::Assistant {
                    content,
                    tool_calls: tool_calls_opt,
                },
                finish_reason: stop_reason,
            }],
            usage: body.get("usage").and_then(|u| Some(Usage {
                prompt_tokens: u["input_tokens"].as_u64()? as u32,
                completion_tokens: u["output_tokens"].as_u64()? as u32,
                total_tokens: (u["input_tokens"].as_u64()? + u["output_tokens"].as_u64()?) as u32,
            })),
        })
    }

    async fn chat_completion_stream(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<mpsc::Receiver<ChatCompletionChunk>, ProviderError> {
        let mut system = String::new();
        let mut anthropic_messages: Vec<serde_json::Value> = Vec::new();

        for msg in &request.messages {
            match msg {
                Message::System { content } => {
                    if !system.is_empty() {
                        system.push_str("\n\n");
                    }
                    system.push_str(content);
                }
                Message::User { content } => {
                    anthropic_messages.push(serde_json::json!({
                        "role": "user",
                        "content": content,
                    }));
                }
                Message::Assistant {
                    content,
                    tool_calls,
                } => {
                    if let Some(calls) = tool_calls {
                        let mut content_blocks: Vec<serde_json::Value> = Vec::new();
                        if let Some(text) = content {
                            if !text.is_empty() {
                                content_blocks.push(serde_json::json!({
                                    "type": "text",
                                    "text": text,
                                }));
                            }
                        }
                        for call in calls {
                            content_blocks.push(serde_json::json!({
                                "type": "tool_use",
                                "id": call.id,
                                "name": call.function.name,
                                "input": serde_json::from_str::<serde_json::Value>(&call.function.arguments)
                                    .unwrap_or(serde_json::json!({})),
                            }));
                        }
                        anthropic_messages.push(serde_json::json!({
                            "role": "assistant",
                            "content": content_blocks,
                        }));
                    } else {
                        anthropic_messages.push(serde_json::json!({
                            "role": "assistant",
                            "content": content.as_deref().unwrap_or(""),
                        }));
                    }
                }
                Message::Tool {
                    tool_call_id,
                    content,
                } => {
                    anthropic_messages.push(serde_json::json!({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": tool_call_id,
                            "content": content,
                        }],
                    }));
                }
            }
        }

        let mut body = serde_json::json!({
            "model": request.model,
            "messages": anthropic_messages,
            "max_tokens": request.max_tokens.unwrap_or(4096),
            "stream": true,
        });

        if !system.is_empty() {
            body["system"] = serde_json::json!(system);
        }

        if let Some(tools) = &request.tools {
            let anthropic_tools: Vec<serde_json::Value> = tools
                .iter()
                .map(|t| {
                    serde_json::json!({
                        "name": t.function.name,
                        "description": t.function.description,
                        "input_schema": t.function.parameters,
                    })
                })
                .collect();
            body["tools"] = serde_json::json!(anthropic_tools);
        }

        if let Some(temp) = request.temperature {
            body["temperature"] = serde_json::json!(temp);
        }

        let resp = self
            .client
            .post(format!("{}/messages", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
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
            use futures::StreamExt;

            let mut stream = resp.bytes_stream();
            let mut buffer = String::new();
            let mut current_tool_call_id = String::new();
            let mut current_tool_name = String::new();
            let mut current_tool_args = String::new();

            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(bytes) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));

                        // Process SSE lines
                        while let Some(pos) = buffer.find('\n') {
                            let line = buffer[..pos].trim().to_string();
                            buffer = buffer[pos + 1..].to_string();

                            if line.is_empty() || line.starts_with(": ") {
                                continue;
                            }

                            let json_str = if let Some(data) = line.strip_prefix("data: ") {
                                data.trim()
                            } else {
                                continue;
                            };

                            if let Ok(val) =
                                serde_json::from_str::<serde_json::Value>(json_str)
                            {
                                let event_type = val["type"].as_str().unwrap_or("");

                                match event_type {
                                    "message_start" => {
                                        let msg_id = val["message"]["id"]
                                            .as_str()
                                            .unwrap_or("anthropic-unknown")
                                            .to_string();
                                        let model = val["message"]["model"]
                                            .as_str()
                                            .unwrap_or("unknown")
                                            .to_string();

                                        let chunk = ChatCompletionChunk {
                                            id: msg_id,
                                            model,
                                            choices: vec![ChunkChoice {
                                                index: 0,
                                                delta: Delta {
                                                    role: Some("assistant".to_string()),
                                                    content: None,
                                                    tool_calls: None,
                                                },
                                                finish_reason: None,
                                            }],
                                            usage: None,
                                        };

                                        if tx.send(chunk).await.is_err() {
                                            return;
                                        }
                                    }
                                    "content_block_start" => {
                                        let block_type =
                                            val["content_block"]["type"].as_str().unwrap_or("");
                                        if block_type == "tool_use" {
                                            current_tool_call_id = val["content_block"]["id"]
                                                .as_str()
                                                .unwrap_or("unknown")
                                                .to_string();
                                            current_tool_name = val["content_block"]["name"]
                                                .as_str()
                                                .unwrap_or("unknown")
                                                .to_string();
                                            current_tool_args.clear();
                                        }
                                    }
                                    "content_block_delta" => {
                                        let delta = &val["delta"];
                                        let delta_type =
                                            delta["type"].as_str().unwrap_or("");

                                        match delta_type {
                                            "text_delta" => {
                                                let text =
                                                    delta["text"].as_str().unwrap_or("");
                                                let chunk = ChatCompletionChunk {
                                                    id: "anthropic-stream".to_string(),
                                                    model: "unknown".to_string(),
                                                    choices: vec![ChunkChoice {
                                                        index: 0,
                                                        delta: Delta {
                                                            role: None,
                                                            content: Some(text.to_string()),
                                                            tool_calls: None,
                                                        },
                                                        finish_reason: None,
                                                    }],
                                                    usage: None,
                                                };
                                                if tx.send(chunk).await.is_err() {
                                                    return;
                                                }
                                            }
                                            "input_json_delta" => {
                                                let partial =
                                                    delta["partial_json"].as_str().unwrap_or("");
                                                current_tool_args.push_str(partial);
                                            }
                                            _ => {}
                                        }
                                    }
                                    "content_block_stop" => {
                                        if !current_tool_call_id.is_empty() {
                                            let chunk = ChatCompletionChunk {
                                                id: "anthropic-stream".to_string(),
                                                model: "unknown".to_string(),
                                                choices: vec![ChunkChoice {
                                                    index: 0,
                                                    delta: Delta {
                                                        role: None,
                                                        content: None,
                                                        tool_calls: Some(vec![ToolCallDelta {
                                                            index: 0,
                                                            id: Some(current_tool_call_id.clone()),
                                                            call_type: Some("function".to_string()),
                                                            function: Some(FunctionCallDelta {
                                                                name: Some(
                                                                    current_tool_name.clone(),
                                                                ),
                                                                arguments: Some(
                                                                    current_tool_args.clone(),
                                                                ),
                                                            }),
                                                        }]),
                                                    },
                                                    finish_reason: None,
                                                    }],
                                                    usage: None,
                                                };
                                            if tx.send(chunk).await.is_err() {
                                                return;
                                            }
                                            current_tool_call_id.clear();
                                            current_tool_name.clear();
                                            current_tool_args.clear();
                                        }
                                    }
                                    "message_delta" => {
                                        let stop_reason = val["delta"]["stop_reason"]
                                            .as_str()
                                            .map(|s| s.to_string());
                                        let chunk = ChatCompletionChunk {
                                            id: "anthropic-stream".to_string(),
                                            model: "unknown".to_string(),
                                            choices: vec![ChunkChoice {
                                                index: 0,
                                                delta: Delta {
                                                    role: None,
                                                    content: None,
                                                    tool_calls: None,
                                                },
                                                finish_reason: stop_reason,
                                            }],
                                            usage: None,
                                        };
                                        if tx.send(chunk).await.is_err() {
                                            return;
                                        }
                                    }
                                    "message_stop" => {
                                        break;
                                    }
                                    _ => {}
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
