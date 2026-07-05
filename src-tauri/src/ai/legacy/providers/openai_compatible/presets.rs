use crate::ai::legacy::providers::traits::ProviderInfo;

/// Default provider configurations for all OpenAI-compatible providers.
///
/// Each preset defines the default base URL, whether an API key is required,
/// and any provider-specific default headers.
#[derive(Clone)]
pub struct ProviderPreset {
    pub id: &'static str,
    pub name: &'static str,
    pub default_base_url: &'static str,
    pub is_free: bool,
    pub requires_api_key: bool,
}

/// Get a preset by provider ID.
pub fn get_preset(provider_id: &str) -> Option<ProviderPreset> {
    ALL_PRESETS.iter().find(|p| p.id == provider_id).cloned()
}

/// Get the default base URL for a provider ID.
pub fn default_base_url(provider_id: &str) -> String {
    get_preset(provider_id)
        .map(|p| p.default_base_url.to_string())
        .unwrap_or_default()
}

/// Convert presets to ProviderInfo structs for IPC.
pub fn list_provider_infos() -> Vec<ProviderInfo> {
    ALL_PRESETS
        .iter()
        .map(|p| ProviderInfo {
            id: p.id.to_string(),
            name: p.name.to_string(),
            is_free: p.is_free,
            requires_api_key: p.requires_api_key,
        })
        .collect()
}

/// All registered OpenAI-compatible provider presets.
const ALL_PRESETS: &[ProviderPreset] = &[
    // ── Free Cloud ──────────────────────────────────────────
    ProviderPreset {
        id: "nvidia",
        name: "NVIDIA NIM",
        default_base_url: "https://integrate.api.nvidia.com/v1",
        is_free: true,
        requires_api_key: true,
    },
    ProviderPreset {
        id: "groq",
        name: "Groq",
        default_base_url: "https://api.groq.com/openai/v1",
        is_free: true,
        requires_api_key: true,
    },
    ProviderPreset {
        id: "sambanova",
        name: "SambaNova",
        default_base_url: "https://api.sambanova.ai/v1",
        is_free: true,
        requires_api_key: true,
    },
    ProviderPreset {
        id: "openrouter",
        name: "OpenRouter",
        default_base_url: "https://openrouter.ai/api/v1",
        is_free: false,
        requires_api_key: true,
    },
    // ── Paid (Cheap) ───────────────────────────────────────
    ProviderPreset {
        id: "deepseek",
        name: "DeepSeek",
        default_base_url: "https://api.deepseek.com",
        is_free: false,
        requires_api_key: true,
    },
    ProviderPreset {
        id: "qwen",
        name: "Qwen (Alibaba)",
        default_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        is_free: false,
        requires_api_key: true,
    },
    ProviderPreset {
        id: "cerebras",
        name: "Cerebras",
        default_base_url: "https://api.cerebras.ai/v1",
        is_free: false,
        requires_api_key: true,
    },
    // ── Paid (Standard) ────────────────────────────────────
    ProviderPreset {
        id: "openai",
        name: "OpenAI",
        default_base_url: "https://api.openai.com/v1",
        is_free: false,
        requires_api_key: true,
    },
    ProviderPreset {
        id: "mistral",
        name: "Mistral",
        default_base_url: "https://api.mistral.ai/v1",
        is_free: false,
        requires_api_key: true,
    },
    ProviderPreset {
        id: "together",
        name: "Together AI",
        default_base_url: "https://api.together.xyz/v1",
        is_free: false,
        requires_api_key: true,
    },
    ProviderPreset {
        id: "fireworks",
        name: "Fireworks AI",
        default_base_url: "https://api.fireworks.ai/inference/v1",
        is_free: false,
        requires_api_key: true,
    },
    // ── Google AI Studio ────────────────────────────────
    ProviderPreset {
        id: "google",
        name: "Google AI Studio",
        default_base_url: "https://generativelanguage.googleapis.com/v1beta/openai/",
        is_free: true,
        requires_api_key: true,
    },
    // ── Local ──────────────────────────────────────────────
    ProviderPreset {
        id: "lmstudio",
        name: "LM Studio",
        default_base_url: "http://localhost:1234/v1",
        is_free: true,
        requires_api_key: false,
    },
];
