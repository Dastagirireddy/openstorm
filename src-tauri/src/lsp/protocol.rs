/// LSP JSON-RPC protocol types
///
/// This module defines the JSON-RPC 2.0 message types used for communication
/// with language servers via the Language Server Protocol.

/// LSP JSON-RPC request message
#[derive(Debug, serde::Serialize)]
pub struct JsonRpcRequest<T> {
    pub jsonrpc: &'static str,
    pub id: u32,
    pub method: String,
    pub params: T,
}

/// LSP JSON-RPC response message
#[derive(Debug)]
pub struct JsonRpcResponse<T> {
    pub jsonrpc: String,
    pub id: u32,
    pub result: Option<T>,
    pub error: Option<JsonRpcError>,
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

/// LSP JSON-RPC error
#[derive(Debug, serde::Deserialize)]
#[allow(dead_code)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
}

/// LSP notification (no ID)
#[derive(Debug, serde::Serialize)]
pub struct JsonRpcNotification<T> {
    pub jsonrpc: &'static str,
    pub method: String,
    pub params: T,
}
