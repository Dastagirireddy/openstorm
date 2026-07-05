use crate::config::AiProviderConfig;
use super::super::providers::{LlmProvider, ModelInfo, ProviderInfo, ProviderRegistry};

pub async fn ai_get_config() -> Result<AiProviderConfig, String> {
    Ok(AiProviderConfig::load())
}

pub async fn ai_set_config(config: AiProviderConfig) -> Result<(), String> {
    config.save()
}

#[allow(dead_code)]
pub async fn ai_list_providers() -> Result<Vec<ProviderInfo>, String> {
    Ok(ProviderRegistry::list_providers())
}

pub async fn ai_list_models(
    provider_id: String,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<Vec<ModelInfo>, String> {
    let mut config = AiProviderConfig::load();
    // Use provided key, or resolve from per-provider store
    config.api_key = api_key.filter(|k| !k.is_empty())
        .unwrap_or_else(|| config.api_key_for(&provider_id));
    if let Some(url) = base_url {
        config.base_url = url;
    }
    let provider = ProviderRegistry::create_for_listing(&provider_id, &config)
        .map_err(|e| e.to_string())?;
    provider.list_models().await.map_err(|e| e.to_string())
}

#[allow(dead_code)]
pub async fn ai_check_connection(
    provider_id: String,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<bool, String> {
    let mut config = AiProviderConfig::load();
    // Use provided key, or resolve from per-provider store
    config.api_key = api_key.filter(|k| !k.is_empty())
        .unwrap_or_else(|| config.api_key_for(&provider_id));
    if let Some(url) = base_url {
        config.base_url = url;
    }
    let provider = ProviderRegistry::create_for_listing(&provider_id, &config)
        .map_err(|e| e.to_string())?;
    provider.check_connection().await.map_err(|e| e.to_string())
}
