/// LSP Request Methods
///
/// Implementation of LSP request handlers (textDocument/* that return responses).

use super::client::LspClient;
use super::protocol::JsonRpcResponse;
use lsp_types::*;

impl LspClient {
    /// Format a document using the language server
    pub fn format_document(
        &mut self,
        uri: &str,
        content: &str,
        language_id: &str,
        options: &super::client::FormattingOptions,
    ) -> Result<String, String> {
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

        let response: JsonRpcResponse<Vec<TextEdit>> =
            self.send_request("textDocument/formatting", format_options)?;

        if let Some(error) = response.error {
            return Err(format!("LSP formatting error: {}", error.message));
        }

        let edits = response.result.unwrap_or_default();

        // Apply text edits to original content
        let formatted = super::helpers::apply_text_edits(content, &edits);
        Ok(formatted)
    }

    /// Get completions at a position
    pub fn get_completions(
        &mut self,
        uri: &str,
        content: &str,
        language_id: &str,
        line: u32,
        column: u32,
    ) -> Result<Vec<CompletionItem>, String> {
        if !self.initialized {
            return Err("LSP server not initialized".to_string());
        }

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

        let response: Result<JsonRpcResponse<CompletionResponse>, String> =
            self.send_request("textDocument/completion", params);
        let response = match response {
            Ok(r) => r,
            Err(e) => return Err(e),
        };

        if let Some(error) = response.error {
            return Err(format!("LSP completion error: {}", error.message));
        }

        match response.result {
            Some(CompletionResponse::Array(items)) => Ok(items),
            Some(CompletionResponse::List(list)) => Ok(list.items),
            None => Ok(Vec::new()),
        }
    }

    /// Get hover information at a position
    pub fn get_hover(
        &mut self,
        uri: &str,
        content: &str,
        language_id: &str,
        line: u32,
        column: u32,
    ) -> Result<Option<Hover>, String> {
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

        let response: Result<JsonRpcResponse<Hover>, String> =
            self.send_request("textDocument/hover", params);
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
    pub fn get_definition(
        &mut self,
        uri: &str,
        content: &str,
        language_id: &str,
        line: u32,
        column: u32,
    ) -> Result<Vec<Location>, String> {
        if !self.initialized {
            return Err("LSP server not initialized".to_string());
        }

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

        let response: Result<JsonRpcResponse<GotoDefinitionResponse>, String> =
            self.send_request("textDocument/definition", params);
        let response = match response {
            Ok(r) => r,
            Err(e) => return Err(e),
        };

        if let Some(error) = response.error {
            return Err(format!("LSP definition error: {}", error.message));
        }

        match response.result {
            Some(GotoDefinitionResponse::Scalar(location)) => Ok(vec![location]),
            Some(GotoDefinitionResponse::Array(locations)) => Ok(locations),
            Some(GotoDefinitionResponse::Link(links)) => Ok(links
                .into_iter()
                .map(|link| Location {
                    uri: link.target_uri,
                    range: link.target_selection_range,
                })
                .collect()),
            None => Ok(Vec::new()),
        }
    }
}
