use crate::ai::providers::traits::*;

/// Translator between OpenStorm's internal message format and Anthropic's Messages API.
///
/// Anthropic uses a different wire format than OpenAI:
/// - System prompt is a top-level field, not a message
/// - Messages alternate user/assistant only
/// - Tool calls are in `content[]` blocks, not `tool_calls[]`
/// - `max_tokens` is required
/// - Auth uses `x-api-key` header instead of `Authorization: Bearer`
pub struct AnthropicTranslator;

impl AnthropicTranslator {
    /// Convert an OpenAI-style ChatCompletionRequest into an Anthropic Messages API request body.
    pub fn to_anthropic_request(request: &ChatCompletionRequest) -> serde_json::Value {
        let mut system_parts = Vec::new();
        let mut messages = Vec::new();

        // Extract system messages and convert the rest to Anthropic format
        for msg in &request.messages {
            match msg {
                Message::System { content } => {
                    system_parts.push(content.clone());
                }
                Message::User { content } => {
                    messages.push(serde_json::json!({
                        "role": "user",
                        "content": content,
                    }));
                }
                Message::Assistant {
                    content,
                    tool_calls,
                } => {
                    // Assistant messages with tool calls need special handling
                    if let Some(calls) = tool_calls {
                        let mut content_blocks: Vec<serde_json::Value> = Vec::new();

                        // Add text content if present
                        if let Some(text) = content {
                            if !text.is_empty() {
                                content_blocks.push(serde_json::json!({
                                    "type": "text",
                                    "text": text,
                                }));
                            }
                        }

                        // Add tool use blocks
                        for call in calls {
                            let input: serde_json::Value =
                                serde_json::from_str(&call.function.arguments)
                                    .unwrap_or(serde_json::json!({}));
                            content_blocks.push(serde_json::json!({
                                "type": "tool_use",
                                "id": call.id,
                                "name": call.function.name,
                                "input": input,
                            }));
                        }

                        messages.push(serde_json::json!({
                            "role": "assistant",
                            "content": content_blocks,
                        }));
                    } else {
                        messages.push(serde_json::json!({
                            "role": "assistant",
                            "content": content.as_deref().unwrap_or(""),
                        }));
                    }
                }
                Message::Tool {
                    tool_call_id,
                    content,
                } => {
                    // Tool results become user messages with tool_result blocks
                    messages.push(serde_json::json!({
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

        // Merge consecutive user messages (Anthropic requires alternating roles)
        let messages = Self::merge_consecutive_roles(messages);

        let mut body = serde_json::json!({
            "model": request.model,
            "messages": messages,
            "max_tokens": request.max_tokens.unwrap_or(4096),
        });

        // System prompt is a top-level field
        if !system_parts.is_empty() {
            body["system"] = serde_json::json!(system_parts.join("\n\n"));
        }

        // Convert tools to Anthropic format
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

        body
    }

    /// Convert an Anthropic Messages API response into an OpenAI-style ChatCompletionResponse.
    pub fn from_anthropic_response(
        body: &serde_json::Value,
        model: &str,
    ) -> Result<ChatCompletionResponse, ProviderError> {
        let content_blocks = body["content"]
            .as_array()
            .ok_or_else(|| ProviderError::ServerError("No content in response".to_string()))?;

        let mut text_content = String::new();
        let mut tool_calls = Vec::new();

        for block in content_blocks {
            match block["type"].as_str() {
                Some("text") => {
                    if let Some(text) = block["text"].as_str() {
                        text_content.push_str(text);
                    }
                }
                Some("tool_use") => {
                    let id = block["id"].as_str().unwrap_or("unknown").to_string();
                    let name = block["name"].as_str().unwrap_or("unknown").to_string();
                    let input = block["input"].clone();
                    tool_calls.push(ToolCall {
                        id,
                        call_type: "function".to_string(),
                        function: FunctionCall {
                            name,
                            arguments: input.to_string(),
                        },
                    });
                }
                _ => {}
            }
        }

        let finish_reason = match body["stop_reason"].as_str() {
            Some("end_turn") | Some("stop_sequence") => Some("stop".to_string()),
            Some("max_tokens") => Some("length".to_string()),
            Some("tool_use") => Some("tool_calls".to_string()),
            _ => Some("stop".to_string()),
        };

        let tool_calls_opt = if tool_calls.is_empty() {
            None
        } else {
            Some(tool_calls)
        };

        Ok(ChatCompletionResponse {
            id: body["id"].as_str().unwrap_or("unknown").to_string(),
            model: body["model"].as_str().unwrap_or(model).to_string(),
            choices: vec![Choice {
                index: 0,
                message: Message::Assistant {
                    content: if text_content.is_empty() {
                        None
                    } else {
                        Some(text_content)
                    },
                    tool_calls: tool_calls_opt,
                },
                finish_reason,
            }],
            usage: body.get("usage").and_then(|u| {
                Some(Usage {
                    prompt_tokens: u["input_tokens"].as_u64()? as u32,
                    completion_tokens: u["output_tokens"].as_u64()? as u32,
                    total_tokens: (u["input_tokens"].as_u64()? + u["output_tokens"].as_u64()?) as u32,
                })
            }),
        })
    }

    /// Convert an Anthropic SSE chunk into an OpenAI-style ChatCompletionChunk.
    pub fn from_anthropic_stream_chunk(
        val: &serde_json::Value,
    ) -> Option<ChatCompletionChunk> {
        let event_type = val.get("type")?.as_str()?;
        let message = val.get("message")?;

        match event_type {
            "message_start" => {
                Some(ChatCompletionChunk {
                    id: message["id"].as_str().unwrap_or("unknown").to_string(),
                    model: message["model"].as_str().unwrap_or("unknown").to_string(),
                    choices: vec![ChunkChoice {
                        index: 0,
                        delta: Delta {
                            role: Some("assistant".to_string()),
                            content: None,
                            tool_calls: None,
                        },
                        finish_reason: None,
                    }],
                    usage: message.get("usage").and_then(|u| Some(Usage {
                        prompt_tokens: u["input_tokens"].as_u64()? as u32,
                        completion_tokens: 0,
                        total_tokens: u["input_tokens"].as_u64()? as u32,
                    })),
                })
            }
            "content_block_delta" => {
                let delta = val.get("delta")?;
                let block_index = val["index"].as_u64().unwrap_or(0) as u32;

                match delta["type"].as_str() {
                    Some("text_delta") => {
                        Some(ChatCompletionChunk {
                            id: message["id"].as_str().unwrap_or("unknown").to_string(),
                            model: message["model"].as_str().unwrap_or("unknown").to_string(),
                            choices: vec![ChunkChoice {
                                index: 0,
                                delta: Delta {
                                    role: None,
                                    content: delta["text"].as_str().map(|s| s.to_string()),
                                    tool_calls: None,
                                },
                                finish_reason: None,
                            }],
                            usage: None,
                        })
                    }
                    Some("input_json_delta") => {
                        Some(ChatCompletionChunk {
                            id: message["id"].as_str().unwrap_or("unknown").to_string(),
                            model: message["model"].as_str().unwrap_or("unknown").to_string(),
                            choices: vec![ChunkChoice {
                                index: 0,
                                delta: Delta {
                                    role: None,
                                    content: None,
                                    tool_calls: Some(vec![ToolCallDelta {
                                        index: block_index,
                                        id: None,
                                        call_type: None,
                                        function: Some(FunctionCallDelta {
                                            name: None,
                                            arguments: delta["partial_json"].as_str().map(|s| s.to_string()),
                                        }),
                                    }]),
                                },
                                finish_reason: None,
                            }],
                            usage: None,
                        })
                    }
                    _ => None,
                }
            }
            "content_block_start" => {
                let block = val.get("content_block")?;
                match block["type"].as_str() {
                    Some("tool_use") => {
                        Some(ChatCompletionChunk {
                            id: message["id"].as_str().unwrap_or("unknown").to_string(),
                            model: message["model"].as_str().unwrap_or("unknown").to_string(),
                            choices: vec![ChunkChoice {
                                index: 0,
                                delta: Delta {
                                    role: None,
                                    content: None,
                                    tool_calls: Some(vec![ToolCallDelta {
                                        index: val["index"].as_u64().unwrap_or(0) as u32,
                                        id: block["id"].as_str().map(|s| s.to_string()),
                                        call_type: Some("function".to_string()),
                                        function: Some(FunctionCallDelta {
                                            name: block["name"].as_str().map(|s| s.to_string()),
                                            arguments: None,
                                        }),
                                    }]),
                                },
                                finish_reason: None,
                            }],
                            usage: None,
                        })
                    }
                    _ => None,
                }
            }
            "message_delta" => {
                let delta = val.get("delta")?;
                Some(ChatCompletionChunk {
                    id: message["id"].as_str().unwrap_or("unknown").to_string(),
                    model: message["model"].as_str().unwrap_or("unknown").to_string(),
                    choices: vec![ChunkChoice {
                        index: 0,
                        delta: Delta {
                            role: None,
                            content: None,
                            tool_calls: None,
                        },
                        finish_reason: delta["stop_reason"].as_str().map(|s| {
                            match s {
                                "end_turn" | "stop_sequence" => "stop",
                                "max_tokens" => "length",
                                "tool_use" => "tool_calls",
                                _ => "stop",
                            }
                            .to_string()
                        }),
                    }],
                    usage: None,
                })
            }
            _ => None,
        }
    }

    /// Merge consecutive messages with the same role.
    ///
    /// Anthropic requires strict user/assistant alternation. Tool results
    /// (which are user messages) may follow other user messages.
    fn merge_consecutive_roles(messages: Vec<serde_json::Value>) -> Vec<serde_json::Value> {
        if messages.is_empty() {
            return messages;
        }

        let mut merged = Vec::new();
        let mut current = messages[0].clone();

        for msg in messages.into_iter().skip(1) {
            let current_role = current["role"].as_str();
            let next_role = msg["role"].as_str();

            if current_role == next_role {
                // Merge content blocks
                if let (Some(current_content), Some(next_content)) =
                    (current["content"].as_array(), msg["content"].as_array())
                {
                    let mut combined = current_content.clone();
                    combined.extend(next_content.clone());
                    current["content"] = serde_json::json!(combined);
                }
            } else {
                merged.push(current);
                current = msg;
            }
        }
        merged.push(current);

        merged
    }
}
