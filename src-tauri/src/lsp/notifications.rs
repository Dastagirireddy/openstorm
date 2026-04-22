/// LSP Notification Methods
///
/// Implementation of LSP notification handlers (textDocument/did* that don't return responses).

use super::client::LspClient;
use lsp_types::*;

impl LspClient {
    /// Send didChange notification when document changes
    pub fn did_change(
        &mut self,
        uri: &str,
        content: &str,
        _language_id: &str,
        version: i32,
    ) -> Result<(), String> {
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

        self.open_documents.remove(uri);
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
    pub fn did_open(&mut self, uri: &str, content: &str, language_id: &str) -> Result<(), String> {
        // Skip if document is already open
        if self.open_documents.contains(uri) {
            return Ok(());
        }

        let parsed_uri = url::Url::parse(uri).map_err(|e| format!("Invalid URI: {}", e))?;
        let params = DidOpenTextDocumentParams {
            text_document: TextDocumentItem {
                uri: parsed_uri.as_str().parse().unwrap(),
                language_id: language_id.to_string(),
                version: 1,
                text: content.to_string(),
            },
        };

        self.send_notification("textDocument/didOpen", params)?;
        self.open_documents.insert(uri.to_string());
        Ok(())
    }
}
