/// LSP Client Core
///
/// Core client struct with process management and JSON-RPC communication.

use super::protocol::{JsonRpcNotification, JsonRpcRequest, JsonRpcResponse};
use lsp_types::InitializeResult;
use std::collections::HashSet;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

/// Formatting options for LSP
#[derive(Debug, Clone)]
pub struct FormattingOptions {
    pub tab_size: u32,
    pub insert_spaces: bool,
    pub trim_trailing_whitespace: bool,
    pub insert_final_newline: bool,
    pub trim_final_newlines: bool,
}

impl Default for FormattingOptions {
    fn default() -> Self {
        FormattingOptions {
            tab_size: 4,
            insert_spaces: true,
            trim_trailing_whitespace: true,
            insert_final_newline: true,
            trim_final_newlines: true,
        }
    }
}

/// Single LSP client for a language server
pub struct LspClient {
    process: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    #[allow(dead_code)]
    server_id: u32,
    pub(crate) request_id: u32,
    pub(crate) initialized: bool,
    root_path: String,
    pub(crate) open_documents: HashSet<String>,
}

impl LspClient {
    /// Start a new language server process
    pub fn new(server_command: &str, args: &[&str]) -> Result<Self, String> {
        let mut child = Command::new(server_command)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start LSP server '{}': {}", server_command, e))?;

        let stdin = child.stdin.take().ok_or("Failed to open stdin")?;
        let stdout = BufReader::new(child.stdout.take().ok_or("Failed to open stdout")?);

        // Drain stderr in a background thread to prevent blocking
        let stderr = child.stderr.take().ok_or("Failed to open stderr")?;
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stderr);
            let mut line = String::new();
            while reader.read_line(&mut line).is_ok() {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    eprintln!("[LSP stderr] {}", trimmed);
                }
                line.clear();
            }
        });

        Ok(LspClient {
            process: child,
            stdin,
            stdout,
            server_id: 1,
            request_id: 0,
            initialized: false,
            root_path: String::new(),
            open_documents: HashSet::new(),
        })
    }

    /// Initialize the language server
    pub fn initialize(&mut self, root_path: &str) -> Result<InitializeResult, String> {
        use lsp_types::*;
        use url::Url;

        self.root_path = root_path.to_string();
        self.request_id = 1;

        let url = Url::from_file_path(root_path)
            .map_err(|_| format!("Invalid root path: {}", root_path))?;

        let uri: lsp_types::Uri = url.as_str().parse().unwrap();

        let params = InitializeParams {
            process_id: Some(std::process::id()),
            root_path: None,
            root_uri: Some(uri.clone()),
            initialization_options: None,
            capabilities: ClientCapabilities {
                text_document: Some(TextDocumentClientCapabilities {
                    formatting: Some(DocumentFormattingClientCapabilities {
                        dynamic_registration: Some(false),
                    }),
                    ..Default::default()
                }),
                ..Default::default()
            },
            trace: Some(TraceValue::Off),
            workspace_folders: Some(vec![WorkspaceFolder {
                name: root_path.to_string(),
                uri: uri.clone(),
            }]),
            client_info: Some(ClientInfo {
                name: "OpenStorm".to_string(),
                version: Some("0.1.0".to_string()),
            }),
            locale: None,
            work_done_progress_params: Default::default(),
        };

        let response: JsonRpcResponse<InitializeResult> = self.send_request("initialize", params)?;

        if let Some(error) = response.error {
            return Err(format!("LSP initialize error: {}", error.message));
        }

        let result = response.result.ok_or("LSP initialize returned no result")?;

        // Send initialized notification
        self.send_notification("initialized", serde_json::json!({}))?;

        self.initialized = true;
        Ok(result)
    }

    /// Send an LSP request and receive response
    pub(crate) fn send_request<T: serde::Serialize, R: serde::de::DeserializeOwned>(
        &mut self,
        method: &str,
        params: T,
    ) -> Result<JsonRpcResponse<R>, String> {
        self.request_id += 1;
        let id = self.request_id;

        let request = JsonRpcRequest {
            jsonrpc: "2.0",
            id,
            method: method.to_string(),
            params,
        };

        let json = serde_json::to_string(&request)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;

        self.write_message(&json)?;
        self.read_response::<R>(id)
    }

    /// Send an LSP notification (no response expected)
    pub fn send_notification<T: serde::Serialize>(
        &mut self,
        method: &str,
        params: T,
    ) -> Result<(), String> {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0",
            method: method.to_string(),
            params,
        };

        let json = serde_json::to_string(&notification)
            .map_err(|e| format!("Failed to serialize notification: {}", e))?;

        self.write_message(&json)
    }

    /// Write a JSON-RPC message with Content-Length header
    fn write_message(&mut self, content: &str) -> Result<(), String> {
        let header = format!("Content-Length: {}\r\n\r\n", content.len());
        self.stdin
            .write_all(header.as_bytes())
            .map_err(|e| format!("Failed to write header: {}", e))?;
        self.stdin
            .write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write body: {}", e))?;
        self.stdin
            .flush()
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;
        Ok(())
    }

    /// Read and parse an LSP response
    fn read_response<T: serde::de::DeserializeOwned>(
        &mut self,
        expected_id: u32,
    ) -> Result<JsonRpcResponse<T>, String> {
        loop {
            let mut content_length = None;
            let reader = &mut self.stdout;

            loop {
                let mut line = String::new();
                reader
                    .read_line(&mut line)
                    .map_err(|e| format!("Failed to read response: {}", e))?;

                let line = line.trim();
                if line.is_empty() {
                    break;
                }

                if let Some(value) = line.strip_prefix("Content-Length: ") {
                    content_length = Some(
                        value
                            .parse::<usize>()
                            .map_err(|e| format!("Invalid Content-Length: {}", e))?,
                    );
                }
            }

            let length = content_length.ok_or("Missing Content-Length header")?;

            let mut buffer = vec![0u8; length];
            reader
                .read_exact(&mut buffer)
                .map_err(|e| format!("Failed to read body: {}", e))?;

            let body = String::from_utf8(buffer)
                .map_err(|e| format!("Invalid UTF-8 in response: {}", e))?;

            let response: JsonRpcResponse<T> = match serde_json::from_str(&body) {
                Ok(r) => r,
                Err(e) => {
                    eprintln!(
                        "[LSP] Failed to parse message: {} - body: {}",
                        e,
                        &body[..body.len().min(200)]
                    );
                    continue;
                }
            };

            if response.id == 0 || response.id != expected_id {
                continue;
            }

            return Ok(response);
        }
    }
}

impl Drop for LspClient {
    fn drop(&mut self) {
        let _ = self.send_notification("exit", serde_json::json!({}));
        let _ = self.process.kill();
    }
}
