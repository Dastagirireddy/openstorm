use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use tokio::sync::mpsc;

use crate::{log_debug, log_info};
use super::provider::*;

const DEFAULT_OLLAMA_URL: &str = "http://localhost:11434";

/// Rough token estimate: ~4 chars per token for English text
fn estimate_tokens(s: &str) -> usize {
    s.len() / 4
}

/// Truncate a string to a safe UTF-8 char boundary
fn truncate_to_boundary(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = 0;
    for (i, c) in s.char_indices() {
        let char_end = i + c.len_utf8();
        if char_end > max_bytes {
            break;
        }
        end = char_end;
    }
    &s[..end]
}

/// Log a summary of an outgoing LLM request
fn log_request(model: &str, messages: &[serde_json::Value], tools: Option<&Vec<ToolDefinition>>) {
    let msg_count = messages.len();
    let tool_count = tools.as_ref().map_or(0, |t| t.len());
    let total_chars: usize = messages.iter()
        .map(|m| m["content"].as_str().map_or(0, |s| s.len()))
        .sum();
    let tool_desc_chars: usize = tools.as_ref().map_or(0, |t| t.iter()
        .map(|td| td.function.description.len() + td.function.parameters.to_string().len())
        .sum());
    let est_tokens = estimate_tokens(&"x".repeat(total_chars + tool_desc_chars));
    log_info!(
        "[Ollama] Request: model={}, msgs={}, tools={}, ~{}k chars (~{} tokens)",
        model, msg_count, tool_count,
        (total_chars + tool_desc_chars) / 1000, est_tokens
    );
    // Log each message role + content preview
    for (i, msg) in messages.iter().enumerate() {
        let role = msg["role"].as_str().unwrap_or("?");
        let content = msg["content"].as_str().unwrap_or("");
        let preview = truncate_to_boundary(content, 120);
        let tool_calls = msg["tool_calls"].as_array().map_or(0, |a| a.len());
        log_debug!(
            "[Ollama]   msg[{}] role={} chars={} tools={} preview=\"{}\"",
            i, role, content.len(), tool_calls, preview
        );
    }
    // Log tool names
    if let Some(tools) = tools {
        let names: Vec<&str> = tools.iter().map(|t| t.function.name.as_str()).collect();
        log_debug!("[Ollama]   tools: {:?}", names);
    }
}

/// Log a summary of a non-streaming LLM response
fn log_response(body: &serde_json::Value) {
    let content = body["message"]["content"].as_str().unwrap_or("");
    let tool_calls = body["message"]["tool_calls"].as_array();
    let finish = body["done_reason"].as_str().unwrap_or("?");
    let prompt_tokens = body["usage"]["prompt_tokens"].as_u64().unwrap_or(0);
    let completion_tokens = body["usage"]["completion_tokens"].as_u64().unwrap_or(0);
    log_info!(
        "[Ollama] Response: content={}chars, tools={}, finish={}, prompt={}tok, completion={}tok",
        content.len(), tool_calls.map_or(0, |a| a.len()), finish, prompt_tokens, completion_tokens
    );
    if !content.is_empty() {
        let preview = truncate_to_boundary(content, 200);
        log_debug!("[Ollama]   content: \"{}\"", preview);
    }
    if let Some(calls) = tool_calls {
        for (i, call) in calls.iter().enumerate() {
            let name = call["function"]["name"].as_str().unwrap_or("?");
            let args = call["function"]["arguments"].to_string();
            let args_preview = truncate_to_boundary(&args, 150);
            log_debug!("[Ollama]   tool_call[{}]: {}({})", i, name, args_preview);
        }
    }
}

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

        // Set options for better text generation
        body["options"] = serde_json::json!({
            "temperature": 0.7,
            "num_predict": 1024
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

        log_request(&request.model, &ollama_messages, request.tools.as_ref());

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

        log_response(&body);

        let message = &body["message"];
        // This is a thinking model: use "thinking" as fallback for content
        let content = message["content"].as_str()
            .map(|s| s.to_string())
            .or_else(|| message["thinking"].as_str().map(|s| s.to_string()));
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

        // Set options for better text generation
        body["options"] = serde_json::json!({
            "temperature": 0.7,
            "num_predict": 1024
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

        log_request(&request.model, &ollama_messages, request.tools.as_ref());

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
            let mut chunks_sent = 0u32;
            let mut total_content_chars = 0usize;
            let mut total_thinking_chars = 0usize;
            let mut total_tool_calls = 0usize;
            let mut tool_names: Vec<String> = Vec::new();
            let mut first_chunk = true;
            let start = std::time::Instant::now();

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
                                // This is a thinking model: reasoning goes in "thinking", response in "content".
                                // During streaming, content is empty until thinking is done.
                                // We capture BOTH and use thinking as the text source if content is empty.
                                let content = val["message"]["content"].as_str().unwrap_or("");
                                let thinking = val["message"]["thinking"].as_str().unwrap_or("");

                                let effective_content = if !content.is_empty() {
                                    content
                                } else if !thinking.is_empty() {
                                    thinking
                                } else {
                                    ""
                                };

                                // Parse tool calls
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
                                            content: if effective_content.is_empty() {
                                                None
                                            } else {
                                                Some(effective_content.to_string())
                                            },
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
                                chunks_sent += 1;
                                if first_chunk {
                                    eprintln!("[Ollama] First chunk received after {:?}", start.elapsed());
                                    first_chunk = false;
                                }
                                total_content_chars += effective_content.len();
                                if !thinking.is_empty() {
                                    total_thinking_chars += thinking.len();
                                }
                                if let Some(tc) = val["message"]["tool_calls"].as_array() {
                                    total_tool_calls += tc.len();
                                    for call in tc {
                                        if let Some(name) = call["function"]["name"].as_str() {
                                            tool_names.push(name.to_string());
                                        }
                                    }
                                }

                                // Debug: log first few chunks and every 100th
                                if chunks_sent <= 5 || (chunks_sent % 100 == 0) {
                                    let has_tools = val["message"]["tool_calls"].as_array().map(|a| a.len()).unwrap_or(0);
                                    let done = val["done"].as_bool().unwrap_or(false);
                                    eprintln!(
                                        "[Ollama] chunk #{}: content={}chars, thinking={}chars, tools={}, done={}",
                                        chunks_sent, content.len(), thinking.len(), has_tools, done
                                    );
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
            eprintln!(
                "[Ollama] Stream ended after {:?}: {} chunks, {} content chars, {} thinking chars, {} tool calls {:?}",
                start.elapsed(), chunks_sent, total_content_chars, total_thinking_chars, total_tool_calls, tool_names
            );
        });

        Ok(rx)
    }
}
