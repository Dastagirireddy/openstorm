// LSP Client Implementation for OpenStorm
// Handles communication with language servers via JSON-RPC protocol

use lsp_types::*;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};
use url::Url;

/// LSP JSON-RPC request message
#[derive(Debug, serde::Serialize)]
struct JsonRpcRequest<T> {
    jsonrpc: &'static str,
    id: u32,
    method: String,
    params: T,
}

/// LSP JSON-RPC response message
#[derive(Debug)]
struct JsonRpcResponse<T> {
    jsonrpc: String,
    id: u32,
    result: Option<T>,
    error: Option<JsonRpcError>,
}

impl<'de, T: serde::de::Deserialize<'de>> serde::de::Deserialize<'de> for JsonRpcResponse<T> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::de::Deserializer<'de>,
    {
        use serde::de::{MapAccess, Visitor};
        use std::fmt;

        struct JsonRpcResponseVisitor<T>(std::marker::PhantomData<T>);

        impl<'de, T: serde::de::Deserialize<'de>> Visitor<'de> for JsonRpcResponseVisitor<T> {
            type Value = JsonRpcResponse<T>;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a JSON-RPC response")
            }

            fn visit_map<M>(self, mut map: M) -> Result<Self::Value, M::Error>
            where
                M: MapAccess<'de>,
            {
                let mut jsonrpc = None;
                let mut id = None;
                let mut result: Option<T> = None;
                let mut error: Option<JsonRpcError> = None;

                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "jsonrpc" => jsonrpc = Some(map.next_value()?),
                        "id" => id = Some(map.next_value()?),
                        "result" => result = map.next_value()?,
                        "error" => error = map.next_value()?,
                        _ => { let _: serde::de::IgnoredAny = map.next_value()?; }
                    }
                }

                Ok(JsonRpcResponse {
                    jsonrpc: jsonrpc.unwrap_or_else(|| "2.0".to_string()),
                    id: id.unwrap_or(0),
                    result,
                    error,
                })
            }
        }

        deserializer.deserialize_map(JsonRpcResponseVisitor(std::marker::PhantomData))
    }
}

// Note: JsonRpcResponse doesn't implement Default - removed to allow non-Default types

#[derive(Debug, serde::Deserialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

/// LSP notification (no ID)
#[derive(Debug, serde::Serialize)]
struct JsonRpcNotification<T> {
    jsonrpc: &'static str,
    method: String,
    params: T,
}

/// Single LSP client for a language server
pub struct LspClient {
    process: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    server_id: u32,
    request_id: u32,
    initialized: bool,
    root_path: String,
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

        Ok(LspClient {
            process: child,
            stdin,
            stdout,
            server_id: 1,
            request_id: 0,
            initialized: false,
            root_path: String::new(),
        })
    }

    /// Initialize the language server
    pub fn initialize(&mut self, root_path: &str) -> Result<InitializeResult, String> {
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

    /// Format a document using the language server
    pub fn format_document(&mut self, uri: &str, content: &str, language_id: &str, options: &FormattingOptions) -> Result<String, String> {
        if !self.initialized {
            return Err("LSP server not initialized".to_string());
        }

        // Open the document first
        self.did_open(uri, content, language_id)?;

        // Build formatting params
        let format_uri = url::Url::parse(uri).map_err(|e| format!("Invalid URI: {}", e))?;
        let format_options = DocumentFormattingParams {
            text_document: TextDocumentIdentifier {
                uri: format_uri.as_str().parse().unwrap(),
            },
            options: lsp_types::FormattingOptions {
                tab_size: options.tab_size,
                insert_spaces: options.insert_spaces,
                trim_trailing_whitespace: Some(options.trim_trailing_whitespace),
                trim_final_newlines: Some(options.trim_final_newlines),
                insert_final_newline: Some(options.insert_final_newline),
                properties: Default::default(),
            },
            work_done_progress_params: Default::default(),
        };

        let response: JsonRpcResponse<Vec<TextEdit>> = self.send_request("textDocument/formatting", format_options)?;

        eprintln!("[LSP] Raw response - error: {:?}, has_result: {}",
            response.error, response.result.is_some());

        if let Some(error) = response.error {
            return Err(format!("LSP formatting error: {}", error.message));
        }

        let edits = response.result.unwrap_or_default();
        eprintln!("[LSP] Content preview (first 100 chars): {}",
            content.chars().take(100).collect::<String>());

        eprintln!("[LSP] Received {} edits", edits.len());
        for (i, edit) in edits.iter().enumerate() {
            eprintln!("[LSP] Edit {}: range=[{}:{} - {}:{}], new_text={:?}",
                i,
                edit.range.start.line, edit.range.start.character,
                edit.range.end.line, edit.range.end.character,
                edit.new_text);
        }

        // Apply text edits to original content
        let formatted = apply_text_edits(content, &edits);
        eprintln!("[LSP] Formatted content length: {} -> {}", content.len(), formatted.len());
        Ok(formatted)
    }

    /// Get completions at a position
    pub fn get_completions(&mut self, uri: &str, content: &str, language_id: &str, line: u32, column: u32) -> Result<Vec<CompletionItem>, String> {
        if !self.initialized {
            return Err("LSP server not initialized".to_string());
        }

        println!("[LSP Client] get_completions called: uri={}, line={}, col={}", uri, line, column);

        // Open the document first (only if not already open)
        self.did_open(uri, content, language_id)?;

        let params = CompletionParams {
            text_document_position: TextDocumentPositionParams {
                text_document: TextDocumentIdentifier {
                    uri: uri.parse().map_err(|e| format!("Invalid URI: {}", e))?,
                },
                position: Position { line, character: column },
            },
            work_done_progress_params: Default::default(),
            partial_result_params: Default::default(),
            context: None,
        };

        println!("[LSP Client] Sending completion request");
        let response: Result<JsonRpcResponse<CompletionResponse>, String> = self.send_request("textDocument/completion", params);
        let response = match response {
            Ok(r) => r,
            Err(e) => return Err(e),
        };

        if let Some(error) = response.error {
            return Err(format!("LSP completion error: {}", error.message));
        }

        println!("[LSP Client] Got completion response: {} items", match &response.result {
            Some(CompletionResponse::Array(items)) => items.len(),
            Some(CompletionResponse::List(list)) => list.items.len(),
            None => 0,
        });

        match response.result {
            Some(CompletionResponse::Array(items)) => Ok(items),
            Some(CompletionResponse::List(list)) => Ok(list.items),
            None => Ok(Vec::new()),
        }
    }

    /// Get hover information at a position
    pub fn get_hover(&mut self, uri: &str, content: &str, language_id: &str, line: u32, column: u32) -> Result<Option<Hover>, String> {
        if !self.initialized {
            return Err("LSP server not initialized".to_string());
        }

        self.did_open(uri, content, language_id)?;

        let params = HoverParams {
            text_document_position_params: TextDocumentPositionParams {
                text_document: TextDocumentIdentifier {
                    uri: uri.parse().map_err(|e| format!("Invalid URI: {}", e))?,
                },
                position: Position { line, character: column },
            },
            work_done_progress_params: Default::default(),
        };

        let response: Result<JsonRpcResponse<Hover>, String> = self.send_request("textDocument/hover", params);
        let response = match response {
            Ok(r) => r,
            Err(e) => return Err(e),
        };

        if let Some(error) = response.error {
            return Err(format!("LSP hover error: {}", error.message));
        }

        Ok(response.result)
    }

    /// Get definition location at a position
    pub fn get_definition(&mut self, uri: &str, content: &str, language_id: &str, line: u32, column: u32) -> Result<Vec<Location>, String> {
        if !self.initialized {
            return Err("LSP server not initialized".to_string());
        }

        eprintln!("[LSP] get_definition: uri={}, line={}, col={}, language={}", uri, line, column, language_id);

        self.did_open(uri, content, language_id)?;

        let params = GotoDefinitionParams {
            text_document_position_params: TextDocumentPositionParams {
                text_document: TextDocumentIdentifier {
                    uri: uri.parse().map_err(|e| format!("Invalid URI: {}", e))?,
                },
                position: Position { line, character: column },
            },
            work_done_progress_params: Default::default(),
            partial_result_params: Default::default(),
        };

        eprintln!("[LSP] Sending definition request for position {}:{} ", line, column);
        let response: Result<JsonRpcResponse<GotoDefinitionResponse>, String> = self.send_request("textDocument/definition", params);
        let response = match response {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[LSP] Definition request error: {}", e);
                return Err(e);
            }
        };

        if let Some(error) = response.error {
            eprintln!("[LSP] Definition error response: {}", error.message);
            return Err(format!("LSP definition error: {}", error.message));
        }

        eprintln!("[LSP] Definition response has result: {}", response.result.is_some());
        match response.result {
            Some(GotoDefinitionResponse::Scalar(location)) => {
                eprintln!("[LSP] Found definition (scalar): {:?}", location.uri);
                Ok(vec![location])
            },
            Some(GotoDefinitionResponse::Array(locations)) => {
                eprintln!("[LSP] Found {} definition(s)", locations.len());
                Ok(locations)
            },
            Some(GotoDefinitionResponse::Link(links)) => {
                eprintln!("[LSP] Found {} definition link(s)", links.len());
                Ok(links.into_iter().map(|link| Location {
                    uri: link.target_uri,
                    range: link.target_selection_range,
                }).collect())
            }
            None => {
                eprintln!("[LSP] No definition found");
                Ok(Vec::new())
            }
        }
    }

    /// Get diagnostics for a document
    pub fn get_diagnostics(&mut self, uri: &str, content: &str, language_id: &str) -> Result<Vec<Diagnostic>, String> {
        if !self.initialized {
            return Err("LSP server not initialized".to_string());
        }

        self.did_open(uri, content, language_id)?;

        // Diagnostics are typically sent as notifications, not requests
        // We'll return empty here and rely on the notification handler
        // This is a placeholder for future implementation
        Ok(Vec::new())
    }

    /// Send didChange notification when document changes
    pub fn did_change(&mut self, uri: &str, content: &str, language_id: &str, version: i32) -> Result<(), String> {
        let params = DidChangeTextDocumentParams {
            text_document: VersionedTextDocumentIdentifier {
                uri: uri.parse().map_err(|e| format!("Invalid URI: {}", e))?,
                version,
            },
            content_changes: vec![TextDocumentContentChangeEvent {
                range: None,
                range_length: None,
                text: content.to_string(),
            }],
        };

        self.send_notification("textDocument/didChange", params)
    }

    /// Send didClose notification when document closes
    pub fn did_close(&mut self, uri: &str) -> Result<(), String> {
        let params = DidCloseTextDocumentParams {
            text_document: TextDocumentIdentifier {
                uri: uri.parse().map_err(|e| format!("Invalid URI: {}", e))?,
            },
        };

        self.send_notification("textDocument/didClose", params)
    }

    /// Send didSave notification when document is saved
    pub fn did_save(&mut self, uri: &str, content: Option<&str>) -> Result<(), String> {
        let params = DidSaveTextDocumentParams {
            text_document: TextDocumentIdentifier {
                uri: uri.parse().map_err(|e| format!("Invalid URI: {}", e))?,
            },
            text: content.map(|s| s.to_string()),
        };

        self.send_notification("textDocument/didSave", params)
    }

    /// Send a textDocument/didOpen notification
    fn did_open(&mut self, uri: &str, content: &str, language_id: &str) -> Result<(), String> {
        println!("[LSP Client] did_open called with uri: {}", uri);
        let parsed_uri = url::Url::parse(uri).map_err(|e| format!("Invalid URI: {}", e))?;
        println!("[LSP Client] did_open parsed uri: {}", parsed_uri.as_str());
        let params = DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: parsed_uri.as_str().parse().unwrap(),
                language_id: language_id.to_string(),
                version: 1,
                text: content.to_string(),
            },
        };

        println!("[LSP Client] Sending didOpen notification");
        self.send_notification("textDocument/didOpen", params)
    }

    /// Send an LSP request and receive response
    fn send_request<T: serde::Serialize, R: serde::de::DeserializeOwned>(
        &mut self,
        method: &str,
        params: T,
    ) -> Result<JsonRpcResponse<R>, String> {
        self.request_id += 1;
        let id = self.request_id;

        // Build JSON-RPC request
        let request = JsonRpcRequest {
            jsonrpc: "2.0",
            id,
            method: method.to_string(),
            params,
        };

        // Serialize to JSON
        let json = serde_json::to_string(&request)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;

        // Send with Content-Length header
        self.write_message(&json)?;

        // Read response
        self.read_response::<R>(id)
    }

    /// Send an LSP notification (no response expected)
    fn send_notification<T: serde::Serialize>(
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
    /// Skips notifications (messages without an ID or with id: 0) until we get a matching response
    fn read_response<T: serde::de::DeserializeOwned>(&mut self, expected_id: u32) -> Result<JsonRpcResponse<T>, String> {
        loop {
            // Read Content-Length header
            let mut content_length = None;
            let reader = &mut self.stdout;

            loop {
                let mut line = String::new();
                reader
                    .read_line(&mut line)
                    .map_err(|e| format!("Failed to read response: {}", e))?;

                let line = line.trim();
                if line.is_empty() {
                    // End of headers
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

            // Read body
            let mut buffer = vec![0u8; length];
            reader
                .read_exact(&mut buffer)
                .map_err(|e| format!("Failed to read body: {}", e))?;

            let body = String::from_utf8(buffer)
                .map_err(|e| format!("Invalid UTF-8 in response: {}", e))?;

            // Try to parse as a response
            let response: JsonRpcResponse<T> = match serde_json::from_str(&body) {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("[LSP] Failed to parse message: {} - body: {}", e, &body[..body.len().min(200)]);
                    continue; // Skip malformed messages
                }
            };

            // Check if this is a notification (no ID or id is null/0)
            // Notifications don't have an ID that matches our request
            if response.id == 0 || response.id != expected_id {
                eprintln!("[LSP] Skipping notification/unexpected response (id={}, expected={})", response.id, expected_id);
                continue; // Keep reading until we get the matching response
            }

            return Ok(response);
        }
    }
}

impl Drop for LspClient {
    fn drop(&mut self) {
        // Try to send shutdown request
        let _ = self.send_notification("exit", serde_json::json!({}));
        let _ = self.process.kill();
    }
}

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

/// Apply a list of text edits to content
fn apply_text_edits(content: &str, edits: &[TextEdit]) -> String {
    if edits.is_empty() {
        return content.to_string();
    }

    // Convert edits to byte offsets
    let mut offset_edits: Vec<(usize, usize, String)> = edits
        .iter()
        .map(|edit| {
            let start_offset = position_to_offset(content, edit.range.start);
            let end_offset = position_to_offset(content, edit.range.end);
            (start_offset, end_offset, edit.new_text.clone())
        })
        .collect();

    // Sort by start offset descending (apply from end to start)
    offset_edits.sort_by(|a, b| b.0.cmp(&a.0));

    let mut result = content.to_string();

    for (start, end, new_text) in offset_edits {
        if start <= result.len() && end <= result.len() && start <= end {
            result.replace_range(start..end, &new_text);
        }
    }

    result
}

/// Convert LSP Position (line, character) to byte offset in string
fn position_to_offset(content: &str, pos: lsp_types::Position) -> usize {
    let mut offset = 0;
    let mut current_line = 0;
    let mut current_char = 0;
    let target_line = pos.line as usize;
    let target_char = pos.character as usize;

    let chars: Vec<char> = content.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if current_line == target_line && current_char == target_char {
            break;
        }

        if chars[i] == '\n' {
            current_line += 1;
            current_char = 0;
            i += 1;
            offset += 1;
            continue;
        }

        if current_line == target_line {
            current_char += 1;
        }

        i += 1;
        offset += 1;
    }

    offset
}

/// Connection pool for LSP servers - maintains persistent connections for intellisense
pub struct LspConnectionPool {
    connections: HashMap<String, LspClient>,
    root_path: String,
}

impl LspConnectionPool {
    pub fn new(root_path: String) -> Self {
        LspConnectionPool {
            connections: HashMap::new(),
            root_path,
        }
    }

    /// Get or create a connection for a language
    pub fn get_or_create(&mut self, language_id: &str) -> Result<&mut LspClient, String> {
        if !self.connections.contains_key(language_id) {
            let (server, args) = get_server_for_language(language_id)
                .ok_or_else(|| {
                    eprintln!("[LSP Pool] No LSP server found for {}. Please install the language server.", language_id);
                    format!("No LSP server configured for language: {}. Install the language server for intellisense features.", language_id)
                })?;

            eprintln!("[LSP Pool] Starting {} server ({})...", language_id, server);
            let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            let mut client = match LspClient::new(&server, &args_ref) {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[LSP Pool] Failed to start {} server: {}", language_id, e);
                    return Err(format!("Failed to start LSP server for {}: {}", language_id, e));
                }
            };
            match client.initialize(&self.root_path) {
                Ok(_) => eprintln!("[LSP Pool] {} server initialized successfully", language_id),
                Err(e) => {
                    eprintln!("[LSP Pool] Failed to initialize {} server: {}", language_id, e);
                    return Err(format!("Failed to initialize LSP server for {}: {}", language_id, e));
                }
            }

            self.connections.insert(language_id.to_string(), client);
        }

        Ok(self.connections.get_mut(language_id).unwrap())
    }

    /// Remove a connection
    pub fn remove(&mut self, language_id: &str) -> bool {
        self.connections.remove(language_id).is_some()
    }

    /// Get all active connections
    pub fn keys(&self) -> impl Iterator<Item = &String> {
        self.connections.keys()
    }
}

impl Drop for LspConnectionPool {
    fn drop(&mut self) {
        for (lang, client) in &mut self.connections {
            eprintln!("[LSP Pool] Shutting down {} server", lang);
            let _ = client.send_notification("shutdown", serde_json::json!({}));
            let _ = client.send_notification("exit", serde_json::json!({}));
        }
    }
}

// Global connection pool - wrapped in Arc<Mutex> for thread safety
static mut CONNECTION_POOL: Option<Arc<Mutex<LspConnectionPool>>> = None;

/// Initialize the global connection pool
pub fn init_connection_pool(root_path: String) {
    unsafe {
        CONNECTION_POOL = Some(Arc::new(Mutex::new(LspConnectionPool::new(root_path))));
    }
}

/// Get the global connection pool
fn get_pool() -> Option<Arc<Mutex<LspConnectionPool>>> {
    unsafe { CONNECTION_POOL.clone() }
}

/// Format code using LSP - creates a temporary client for each request
/// This is simpler than managing a pool of clients and works well for on-demand formatting
pub fn format_with_lsp(
    language_id: &str,
    root_path: &str,
    uri: &str,
    content: &str,
    options: &FormattingOptions,
) -> Result<String, String> {
    let (server, args) = get_server_for_language(language_id)
        .ok_or_else(|| format!("No LSP server configured for language: {}", language_id))?;

    eprintln!("[LSP] Starting {} server...", language_id);
    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let mut client = LspClient::new(&server, &args_ref)?;
    eprintln!("[LSP] Initializing...");
    client.initialize(root_path)?;
    eprintln!("[LSP] Formatting document...");
    let result = client.format_document(uri, content, language_id, options);
    eprintln!("[LSP] Done");
    result
}

/// LSP Server info
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LspServerInfo {
    pub language_id: String,
    pub server_name: String,
    pub install_command: String,
    pub is_installed: bool,
}

/// Get the LSP server command and arguments for a language
/// Returns (binary_path, args) - checks cached install first, then system PATH
fn get_server_for_language(language_id: &str) -> Option<(String, Vec<String>)> {
    // First check if we have a cached/downloaded version
    if let Some(config) = crate::lsp_installer::get_server_config(language_id) {
        if crate::lsp_installer::is_server_installed_cached(&config) {
            let path = crate::lsp_installer::get_binary_path(&config);
            eprintln!("[LSP] Found cached {} server at {:?}", language_id, path);
            return Some((path.to_string_lossy().to_string(), vec![]));
        } else {
            eprintln!("[LSP] {} server not installed in cache", language_id);
        }
    }

    // Fall back to system PATH
    let result = match language_id {
        "rust" => Some(("rust-analyzer".to_string(), vec![])),
        "go" => Some(("gopls".to_string(), vec![])),
        "python" => Some(("pyright".to_string(), vec!["--stdio".to_string()])),
        "cpp" | "c" => Some(("clangd".to_string(), vec![])),
        "typescript" | "javascript" => Some(("typescript-language-server".to_string(), vec!["--stdio".to_string()])),
        _ => None,
    };

    if let Some((ref binary, _)) = result {
        // Check if binary exists in PATH
        use std::env;
        use std::ffi::OsStr;

        let path = env::var_os("PATH").unwrap_or_default();
        let binary_exists = env::split_paths(&path).any(|dir| {
            let full_path = dir.join(binary);
            full_path.exists() || full_path.with_extension("exe").exists()
        });

        if binary_exists {
            eprintln!("[LSP] Found {} in system PATH", binary);
        } else {
            eprintln!("[LSP] {} NOT found in PATH - install LSP server for intellisense", binary);
            return None;
        }
    }

    result
}

/// Tauri command: Get status of all LSP servers
#[tauri::command]
pub fn get_lsp_server_status() -> Vec<LspServerInfo> {
    let servers = vec![
        ("rust", "rust-analyzer"),
        ("go", "gopls"),
        ("python", "pyright"),
        ("cpp", "clangd"),
        ("typescript", "typescript-language-server"),
        ("javascript", "typescript-language-server"),
    ];

    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();

    for (lang, server) in servers {
        if seen.contains(server) {
            continue;
        }
        seen.insert(server);

        // Check if installed via our installer or system PATH
        let is_installed = if let Some(config) = crate::lsp_installer::get_server_config(lang) {
            crate::lsp_installer::is_server_installed_cached(&config)
        } else {
            // Fall back to system PATH check
            crate::lsp_installer::is_server_installed(server)
        };

        // Get install source for display
        let install_source = if let Some(config) = crate::lsp_installer::get_server_config(lang) {
            if let Some(repo) = &config.github_repo {
                format!("GitHub: {}", repo)
            } else if let Some(npm) = &config.npm_package {
                format!("npm: {}", npm)
            } else {
                "Direct download".to_string()
            }
        } else {
            "System package".to_string()
        };

        result.push(LspServerInfo {
            language_id: lang.to_string(),
            server_name: server.to_string(),
            install_command: install_source,
            is_installed,
        });
    }

    result
}

/// Tauri command: Install an LSP server (async, with progress events to frontend)
#[tauri::command]
pub async fn install_lsp_server(
    language_id: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use tauri::Emitter;
    eprintln!("[LSP Installer] Installing {} server...", language_id);

    // Clone for use in closure
    let language_id_clone = language_id.clone();

    // Install with progress events emitted to frontend
    let result = crate::lsp_installer::install_server(&language_id, move |progress| {
        eprintln!(
            "[LSP Installer] {}: {:.1}%",
            progress.stage, progress.percentage
        );

        // Emit event to frontend
        let _ = app_handle.emit("lsp-install-progress", &ProgressEvent {
            language_id: language_id_clone.clone(),
            stage: progress.stage.clone(),
            percentage: progress.percentage,
        });
    })
    .await;

    match &result {
        Ok(msg) => eprintln!("[LSP Installer] {}", msg),
        Err(e) => eprintln!("[LSP Installer] Error: {}", e),
    }

    result
}

/// Progress event for frontend
#[derive(Clone, serde::Serialize)]
pub struct ProgressEvent {
    pub language_id: String,
    pub stage: String,
    pub percentage: f64,
}

/// Tauri command: Format Rust code
#[tauri::command]
pub fn format_rust(content: String, tab_width: u32) -> Result<String, String> {
    // Try rust-analyzer first, fall back to rustfmt
    let options = FormattingOptions {
        tab_size: tab_width,
        insert_spaces: true,
        ..Default::default()
    };

    // Try LSP formatting
    match format_with_lsp("rust", "/tmp", "file:///tmp/test.rs", &content, &options) {
        Ok(formatted) => Ok(formatted),
        Err(_) => {
            // Fall back to rustfmt
            format_with_rustfmt(&content, tab_width)
        }
    }
}

/// Tauri command: Format Go code
#[tauri::command]
pub fn format_go(content: String, tab_width: u32) -> Result<String, String> {
    let options = FormattingOptions {
        tab_size: tab_width,
        insert_spaces: true,
        ..Default::default()
    };

    match format_with_lsp("go", "/tmp", "file:///tmp/test.go", &content, &options) {
        Ok(formatted) => Ok(formatted),
        Err(_) => format_with_gofmt(&content),
    }
}

/// Tauri command: Format Python code
#[tauri::command]
pub fn format_python(content: String, tab_width: u32) -> Result<String, String> {
    let options = FormattingOptions {
        tab_size: tab_width,
        insert_spaces: true,
        ..Default::default()
    };

    match format_with_lsp("python", "/tmp", "file:///tmp/test.py", &content, &options) {
        Ok(formatted) => Ok(formatted),
        Err(_) => format_with_black(&content, tab_width),
    }
}

/// Tauri command: Format C/C++ code
#[tauri::command]
pub fn format_cpp(content: String, tab_width: u32) -> Result<String, String> {
    let options = FormattingOptions {
        tab_size: tab_width,
        insert_spaces: true,
        ..Default::default()
    };

    match format_with_lsp("cpp", "/tmp", "file:///tmp/test.cpp", &content, &options) {
        Ok(formatted) => Ok(formatted),
        Err(_) => format_with_clang_format(&content, tab_width),
    }
}

/// Tauri command: Format JavaScript code
#[tauri::command]
pub fn format_javascript(content: String, tab_width: u32) -> Result<String, String> {
    let options = FormattingOptions {
        tab_size: tab_width,
        insert_spaces: true,
        ..Default::default()
    };

    match format_with_lsp("javascript", "/tmp", "file:///tmp/test.js", &content, &options) {
        Ok(formatted) => Ok(formatted),
        Err(_) => {
            // No good fallback for JS - return original
            Ok(content)
        }
    }
}

/// Tauri command: Format TypeScript code
#[tauri::command]
pub fn format_typescript(content: String, tab_width: u32) -> Result<String, String> {
    let options = FormattingOptions {
        tab_size: tab_width,
        insert_spaces: true,
        ..Default::default()
    };

    match format_with_lsp("typescript", "/tmp", "file:///tmp/test.ts", &content, &options) {
        Ok(formatted) => Ok(formatted),
        Err(_) => {
            // No good fallback for TS - return original
            Ok(content)
        }
    }
}

/// Completion item for frontend
#[derive(Debug, Clone, serde::Serialize)]
pub struct CompletionItemInfo {
    pub label: String,
    pub kind: i32,
    pub detail: Option<String>,
    pub documentation: Option<String>,
    pub sort_text: Option<String>,
    pub filter_text: Option<String>,
    pub insert_text: Option<String>,
}

/// Hover info for frontend
#[derive(Debug, Clone, serde::Serialize)]
pub struct HoverInfo {
    pub contents: String,
    pub range: Option<RangeInfo>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RangeInfo {
    pub start_line: u32,
    pub start_char: u32,
    pub end_line: u32,
    pub end_char: u32,
}

/// Location info for frontend (go to definition)
#[derive(Debug, Clone, serde::Serialize)]
pub struct LocationInfo {
    pub uri: String,
    pub start_line: u32,
    pub start_char: u32,
    pub end_line: u32,
    pub end_char: u32,
}

/// Diagnostic info for frontend
#[derive(Debug, Clone, serde::Serialize)]
pub struct DiagnosticInfo {
    pub message: String,
    pub severity: i32,
    pub start_line: u32,
    pub start_char: u32,
    pub end_line: u32,
    pub end_char: u32,
    pub source: Option<String>,
    pub code: Option<String>,
}

/// Tauri command: Get completions at position
#[tauri::command]
pub fn get_completions(
    language_id: String,
    uri: String,
    content: String,
    line: u32,
    column: u32,
) -> Result<Vec<CompletionItemInfo>, String> {
    let pool = get_pool().ok_or("Connection pool not initialized")?;
    let mut pool_guard = pool.lock().map_err(|e| format!("Lock error: {}", e))?;
    let client = pool_guard.get_or_create(&language_id)?;

    let items = client.get_completions(&uri, &content, &language_id, line, column)?;

    Ok(items
        .into_iter()
        .map(|item| CompletionItemInfo {
            label: item.label,
            kind: item.kind.map(|k| match k {
                CompletionItemKind::TEXT => 1,
                CompletionItemKind::METHOD => 2,
                CompletionItemKind::FUNCTION => 3,
                CompletionItemKind::CONSTRUCTOR => 4,
                CompletionItemKind::FIELD => 5,
                CompletionItemKind::VARIABLE => 6,
                CompletionItemKind::CLASS => 7,
                CompletionItemKind::INTERFACE => 8,
                CompletionItemKind::MODULE => 9,
                CompletionItemKind::PROPERTY => 10,
                CompletionItemKind::UNIT => 11,
                CompletionItemKind::VALUE => 12,
                CompletionItemKind::ENUM => 13,
                CompletionItemKind::KEYWORD => 14,
                CompletionItemKind::SNIPPET => 15,
                CompletionItemKind::COLOR => 16,
                CompletionItemKind::FILE => 17,
                CompletionItemKind::REFERENCE => 18,
                CompletionItemKind::FOLDER => 19,
                CompletionItemKind::ENUM_MEMBER => 20,
                CompletionItemKind::CONSTANT => 21,
                CompletionItemKind::STRUCT => 22,
                CompletionItemKind::EVENT => 23,
                CompletionItemKind::OPERATOR => 24,
                CompletionItemKind::TYPE_PARAMETER => 25,
                _ => 1,
            }).unwrap_or(1),
            detail: item.detail,
            documentation: item.documentation.map(|doc| match doc {
                lsp_types::Documentation::String(s) => s,
                lsp_types::Documentation::MarkupContent(markup) => markup.value,
            }),
            sort_text: item.sort_text,
            filter_text: item.filter_text,
            insert_text: item.insert_text,
        })
        .collect())
}

/// Tauri command: Get hover information at position
#[tauri::command]
pub fn get_hover(
    language_id: String,
    uri: String,
    content: String,
    line: u32,
    column: u32,
) -> Result<Option<HoverInfo>, String> {
    let pool = get_pool().ok_or("Connection pool not initialized")?;
    let mut pool_guard = pool.lock().map_err(|e| format!("Lock error: {}", e))?;
    let client = pool_guard.get_or_create(&language_id)?;

    match client.get_hover(&uri, &content, &language_id, line, column)? {
        Some(hover) => {
            let contents = match hover.contents {
                lsp_types::HoverContents::Scalar(marked_string) => match marked_string {
                    lsp_types::MarkedString::String(s) => s,
                    lsp_types::MarkedString::LanguageString(ls) => ls.value,
                },
                lsp_types::HoverContents::Array(arr) => arr
                    .into_iter()
                    .map(|ms| match ms {
                        lsp_types::MarkedString::String(s) => s,
                        lsp_types::MarkedString::LanguageString(ls) => ls.value,
                    })
                    .collect::<Vec<_>>()
                    .join("\n\n"),
                lsp_types::HoverContents::Markup(markup) => markup.value,
            };

            let range = hover.range.map(|r| RangeInfo {
                start_line: r.start.line,
                start_char: r.start.character,
                end_line: r.end.line,
                end_char: r.end.character,
            });

            Ok(Some(HoverInfo { contents, range }))
        }
        None => Ok(None),
    }
}

/// Tauri command: Get definition location at position
#[tauri::command]
pub fn get_definition(
    language_id: String,
    uri: String,
    content: String,
    line: u32,
    column: u32,
) -> Result<Vec<LocationInfo>, String> {
    let pool = get_pool().ok_or("Connection pool not initialized")?;
    let mut pool_guard = pool.lock().map_err(|e| format!("Lock error: {}", e))?;
    let client = pool_guard.get_or_create(&language_id)?;

    let locations = client.get_definition(&uri, &content, &language_id, line, column)?;

    Ok(locations
        .into_iter()
        .map(|loc| {
            let uri_str = loc.uri.to_string();
            LocationInfo {
                uri: uri_str,
                start_line: loc.range.start.line,
                start_char: loc.range.start.character,
                end_line: loc.range.end.line,
                end_char: loc.range.end.character,
            }
        })
        .collect())
}

/// Tauri command: Initialize LSP connection pool for a project
#[tauri::command]
pub fn initialize_lsp_pool(root_path: String) -> Result<(), String> {
    eprintln!("[LSP] Initializing connection pool for: {}", root_path);
    init_connection_pool(root_path);
    Ok(())
}

/// Tauri command: Notify document opened (for sync)
#[tauri::command]
pub fn notify_document_opened(
    language_id: String,
    uri: String,
    content: String,
    version: i32,
) -> Result<(), String> {
    let pool = get_pool().ok_or("Connection pool not initialized")?;
    let mut pool_guard = pool.lock().map_err(|e| format!("Lock error: {}", e))?;
    let client = pool_guard.get_or_create(&language_id)?;
    println!("[LSP] notify_document_opened: language_id={}, uri={}", language_id, uri);
    client.did_open(&uri, &content, &language_id)
}

/// Tauri command: Notify document changed (for sync)
#[tauri::command]
pub fn notify_document_changed(
    language_id: String,
    uri: String,
    content: String,
    version: i32,
) -> Result<(), String> {
    let pool = get_pool().ok_or("Connection pool not initialized")?;
    let mut pool_guard = pool.lock().map_err(|e| format!("Lock error: {}", e))?;
    let client = pool_guard.get_or_create(&language_id)?;
    client.did_change(&uri, &content, &language_id, version)
}

/// Tauri command: Notify document closed
#[tauri::command]
pub fn notify_document_closed(language_id: String, uri: String) -> Result<(), String> {
    let pool = get_pool().ok_or("Connection pool not initialized")?;
    let mut pool_guard = pool.lock().map_err(|e| format!("Lock error: {}", e))?;
    let client = pool_guard.get_or_create(&language_id)?;
    client.did_close(&uri)
}

/// Tauri command: Notify document saved
#[tauri::command]
pub fn notify_document_saved(
    language_id: String,
    uri: String,
    content: Option<String>,
) -> Result<(), String> {
    let pool = get_pool().ok_or("Connection pool not initialized")?;
    let mut pool_guard = pool.lock().map_err(|e| format!("Lock error: {}", e))?;
    let client = pool_guard.get_or_create(&language_id)?;
    client.did_save(&uri, content.as_deref())
}

/// Fallback: Format Rust code using rustfmt
fn format_with_rustfmt(content: &str, tab_width: u32) -> Result<String, String> {
    use std::process::Command;

    let mut child = Command::new("rustfmt")
        .arg("--emit")
        .arg("stdout")
        .arg("--config")
        .arg(format!("tab_spaces={}", tab_width))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn rustfmt: {}", e))?;

    let stdin = child.stdin.as_mut().ok_or("Failed to open rustfmt stdin")?;
    stdin.write_all(content.as_bytes()).map_err(|e| format!("Failed to write to rustfmt: {}", e))?;

    let output = child.wait_with_output().map_err(|e| format!("Failed to read rustfmt output: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format!("rustfmt failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}

/// Fallback: Format Go code using gofmt
fn format_with_gofmt(content: &str) -> Result<String, String> {
    use std::process::Command;

    let mut child = Command::new("gofmt")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn gofmt: {}", e))?;

    let stdin = child.stdin.as_mut().ok_or("Failed to open gofmt stdin")?;
    stdin.write_all(content.as_bytes()).map_err(|e| format!("Failed to write to gofmt: {}", e))?;

    let output = child.wait_with_output().map_err(|e| format!("Failed to read gofmt output: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format!("gofmt failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}

/// Fallback: Format Python code using black
fn format_with_black(content: &str, tab_width: u32) -> Result<String, String> {
    use std::process::Command;

    let mut child = Command::new("black")
        .arg("-")
        .arg("--line-length")
        .arg(tab_width.to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn black: {}", e))?;

    let stdin = child.stdin.as_mut().ok_or("Failed to open black stdin")?;
    stdin.write_all(content.as_bytes()).map_err(|e| format!("Failed to write to black: {}", e))?;

    let output = child.wait_with_output().map_err(|e| format!("Failed to read black output: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format!("black failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}

/// Fallback: Format C/C++ code using clang-format
fn format_with_clang_format(content: &str, tab_width: u32) -> Result<String, String> {
    use std::process::Command;

    let mut child = Command::new("clang-format")
        .arg(format!("-style={{BasedOnStyle: LLVM, IndentWidth: {}}}", tab_width))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn clang-format: {}", e))?;

    let stdin = child.stdin.as_mut().ok_or("Failed to open clang-format stdin")?;
    stdin.write_all(content.as_bytes()).map_err(|e| format!("Failed to write to clang-format: {}", e))?;

    let output = child.wait_with_output().map_err(|e| format!("Failed to read clang-format output: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format!("clang-format failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}
