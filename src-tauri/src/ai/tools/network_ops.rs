use super::ToolRegistry;

impl ToolRegistry {
    /// Fetch content from a URL
    pub(super) async fn webfetch(&self, args: &serde_json::Value) -> String {
        let url = args["url"].as_str().unwrap_or("");
        let max_bytes = args["max_bytes"].as_u64().unwrap_or(50000) as usize;

        if url.is_empty() {
            return "Error: no URL provided".to_string();
        }

        // Validate URL scheme
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return format!("Error: unsupported URL scheme '{}'. Only http:// and https:// are supported.", 
                url.split(':').next().unwrap_or(""));
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build();

        let client = match client {
            Ok(c) => c,
            Err(e) => return format!("Error creating HTTP client: {}", e),
        };

        let response = client.get(url).send().await;

        match response {
            Ok(resp) => {
                let status = resp.status();
                let content_type = resp.headers()
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("unknown")
                    .to_string();

                if !status.is_success() {
                    return format!("HTTP {} {}\nContent-Type: {}", status.as_u16(), status.canonical_reason().unwrap_or("Unknown"), content_type);
                }

                let body = resp.bytes().await;
                match body {
                    Ok(bytes) => {
                        let total_size = bytes.len();
                        let body_str = String::from_utf8_lossy(&bytes);
                        
                        let truncated = if body_str.len() > max_bytes {
                            &body_str[..max_bytes]
                        } else {
                            &body_str
                        };

                        let mut result = format!("URL: {}\nStatus: {} {}\nContent-Type: {}\nSize: {} bytes{}\n\n{}",
                            url,
                            status.as_u16(),
                            status.canonical_reason().unwrap_or(""),
                            content_type,
                            total_size,
                            if total_size > max_bytes { " (truncated)" } else { "" },
                            truncated
                        );

                        if total_size > max_bytes {
                            result.push_str(&format!("\n\n... (truncated at {} of {} bytes)", max_bytes, total_size));
                        }

                        result
                    }
                    Err(e) => format!("Error reading response body: {}", e),
                }
            }
            Err(e) => format!("Error fetching URL: {}", e),
        }
    }
}
