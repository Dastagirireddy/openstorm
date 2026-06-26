use crate::config::AiProviderConfig;
use super::super::providers::{LlmProvider, ModelInfo, ProviderInfo, ProviderRegistry};

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
    Ok(ProviderRegistry::list_providers())
}

#[tauri::command]
pub async fn ai_list_models(provider_id: String) -> Result<Vec<ModelInfo>, String> {
    let config = AiProviderConfig::load();
    let provider = ProviderRegistry::create_for_listing(&provider_id, &config)
        .map_err(|e| e.to_string())?;
    provider.list_models().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_check_connection(provider_id: String) -> Result<bool, String> {
    let config = AiProviderConfig::load();
    let provider = ProviderRegistry::create_for_listing(&provider_id, &config)
        .map_err(|e| e.to_string())?;
    provider.check_connection().await.map_err(|e| e.to_string())
}
