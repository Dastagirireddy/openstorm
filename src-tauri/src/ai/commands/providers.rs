use crate::config::AiProviderConfig;
use super::super::providers::{LlmProvider, LmStudioProvider, ModelInfo, OllamaProvider, ProviderInfo};

#[tauri::command]
pub async fn ai_get_config() -> Result<AiProviderConfig, String> {
    Ok(AiProviderConfig::load())
}

#[tauri::command]
pub async fn ai_set_config(config: AiProviderConfig) -> Result<(), String> {
    config.save()
}

#[tauri::command]
pub async fn ai_list_providers() -> Result<Vec<ProviderInfo>, String> {
    Ok(vec![
        ProviderInfo {
            id: "ollama".to_string(),
            name: "Ollama".to_string(),
            is_free: true,
            requires_api_key: false,
        },
        ProviderInfo {
            id: "lmstudio".to_string(),
            name: "LM Studio".to_string(),
            is_free: true,
            requires_api_key: false,
        },
    ])
}

#[tauri::command]
pub async fn ai_list_models(provider_id: String) -> Result<Vec<ModelInfo>, String> {
    match provider_id.as_str() {
        "ollama" => {
            let provider = OllamaProvider::new(None);
            provider.list_models().await.map_err(|e| e.to_string())
        }
        "lmstudio" => {
            let config = AiProviderConfig::load();
            let base_url = if config.base_url.is_empty() {
                None
            } else {
                Some(config.base_url.clone())
            };
            let provider = LmStudioProvider::new(base_url);
            provider.list_models().await.map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown provider: {}", provider_id)),
    }
}

#[tauri::command]
pub async fn ai_check_connection(provider_id: String) -> Result<bool, String> {
    match provider_id.as_str() {
        "ollama" => {
            let provider = OllamaProvider::new(None);
            provider.check_connection().await.map_err(|e| e.to_string())
        }
        "lmstudio" => {
            let config = AiProviderConfig::load();
            let base_url = if config.base_url.is_empty() {
                None
            } else {
                Some(config.base_url.clone())
            };
            let provider = LmStudioProvider::new(base_url);
            provider.check_connection().await.map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown provider: {}", provider_id)),
    }
}
