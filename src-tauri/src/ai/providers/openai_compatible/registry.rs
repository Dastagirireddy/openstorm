use std::sync::Arc;

use crate::ai::providers::traits::{LlmProvider, ProviderError};
use crate::ai::providers::openai_compatible::provider::OpenAICompatibleProvider;
use crate::ai::providers::anthropic::provider::AnthropicProvider;
use crate::config::AiProviderConfig;

use super::presets;

/// Provider factory — single source of truth for creating provider instances.
///
/// Follows the Factory pattern. Centralizes all provider instantiation logic
/// so that `chat.rs` and `commands/providers.rs` don't need to know about
/// concrete types.
pub struct ProviderRegistry;

impl ProviderRegistry {
    /// Create a provider instance from saved configuration.
    ///
    /// This is the main entry point used by `ai_chat` and other commands.
    /// The config determines which provider to create based on `config.provider`.
    pub fn create(config: &AiProviderConfig) -> Result<Arc<dyn LlmProvider>, ProviderError> {
        match config.provider.as_str() {
            // ── Existing local providers (backward compat) ──
            "ollama" => {
                let base_url = if config.base_url.is_empty() {
                    None
                } else {
                    Some(config.base_url.clone())
                };
                Ok(Arc::new(crate::ai::providers::OllamaProvider::new(base_url)))
            }
            // ── Anthropic (different API format) ──────────
            "anthropic" => {
                if config.api_key.is_empty() {
                    return Err(ProviderError::AuthenticationRequired(
                        "Anthropic requires an API key".to_string(),
                    ));
                }
                Ok(Arc::new(AnthropicProvider::new(&config.api_key)))
            }
            // ── All OpenAI-compatible providers ────────────
            provider_id => {
                let base_url = if config.base_url.is_empty() {
                    presets::default_base_url(provider_id)
                } else {
                    config.base_url.clone()
                };

                Ok(Arc::new(OpenAICompatibleProvider::new(
                    provider_id,
                    &base_url,
                    &config.api_key,
                )))
            }
        }
    }

    /// Create a provider for listing models or checking connections.
    ///
    /// Uses the same logic as `create()` but accepts a provider_id directly
    /// (for cases where we don't have a full config yet).
    pub fn create_for_listing(
        provider_id: &str,
        config: &AiProviderConfig,
    ) -> Result<Arc<dyn LlmProvider>, ProviderError> {
        match provider_id {
            "ollama" => {
                let base_url = if config.base_url.is_empty() {
                    None
                } else {
                    Some(config.base_url.clone())
                };
                Ok(Arc::new(crate::ai::providers::OllamaProvider::new(base_url)))
            }
            "anthropic" => {
                if config.api_key.is_empty() {
                    return Err(ProviderError::AuthenticationRequired(
                        "Anthropic requires an API key".to_string(),
                    ));
                }
                Ok(Arc::new(AnthropicProvider::new(&config.api_key)))
            }
            provider_id => {
                let base_url = if config.base_url.is_empty() {
                    presets::default_base_url(provider_id)
                } else {
                    config.base_url.clone()
                };

                Ok(Arc::new(OpenAICompatibleProvider::new(
                    provider_id,
                    &base_url,
                    &config.api_key,
                )))
            }
        }
    }

    /// List all available providers (both OpenAI-compatible and Anthropic).
    pub fn list_providers() -> Vec<crate::ai::providers::traits::ProviderInfo> {
        let mut providers = presets::list_provider_infos();

        // Add Anthropic
        providers.push(crate::ai::providers::traits::ProviderInfo {
            id: "anthropic".to_string(),
            name: "Claude (Anthropic)".to_string(),
            is_free: false,
            requires_api_key: true,
        });

        // Add Ollama (local, always first)
        providers.insert(
            0,
            crate::ai::providers::traits::ProviderInfo {
                id: "ollama".to_string(),
                name: "Ollama".to_string(),
                is_free: true,
                requires_api_key: false,
            },
        );

        providers
    }

    /// Get the default base URL for a provider ID.
    pub fn default_base_url(provider_id: &str) -> String {
        match provider_id {
            "ollama" => "http://localhost:11434".to_string(),
            "anthropic" => "https://api.anthropic.com".to_string(),
            _ => presets::default_base_url(provider_id),
        }
    }
}
