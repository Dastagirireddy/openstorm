use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Metadata attached to every message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageMetadata {
    /// Timestamp when message was created
    pub timestamp: DateTime<Utc>,
    /// Agent that created this message (None for user messages)
    pub agent_id: Option<String>,
    /// Session ID for the conversation
    pub session_id: String,
    /// Token count for this message (if known)
    pub token_count: Option<usize>,
    /// Cost associated with this message (if known)
    pub cost: Option<f64>,
}

impl MessageMetadata {
    /// Create new metadata with current timestamp
    pub fn new(session_id: impl Into<String>) -> Self {
        Self {
            timestamp: Utc::now(),
            agent_id: None,
            session_id: session_id.into(),
            token_count: None,
            cost: None,
        }
    }

    /// Create metadata with agent ID
    pub fn with_agent(session_id: impl Into<String>, agent_id: impl Into<String>) -> Self {
        Self {
            timestamp: Utc::now(),
            agent_id: Some(agent_id.into()),
            session_id: session_id.into(),
            token_count: None,
            cost: None,
        }
    }

    /// Set token count
    pub fn with_tokens(mut self, tokens: usize) -> Self {
        self.token_count = Some(tokens);
        self
    }

    /// Set cost
    pub fn with_cost(mut self, cost: f64) -> Self {
        self.cost = Some(cost);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metadata_new() {
        let meta = MessageMetadata::new("session-1");
        assert_eq!(meta.session_id, "session-1");
        assert!(meta.agent_id.is_none());
        assert!(meta.token_count.is_none());
        assert!(meta.cost.is_none());
    }

    #[test]
    fn test_metadata_with_agent() {
        let meta = MessageMetadata::with_agent("session-1", "agent-1");
        assert_eq!(meta.session_id, "session-1");
        assert_eq!(meta.agent_id.as_deref(), Some("agent-1"));
    }

    #[test]
    fn test_metadata_builder() {
        let meta = MessageMetadata::new("session-1")
            .with_tokens(100)
            .with_cost(0.05);
        assert_eq!(meta.token_count, Some(100));
        assert_eq!(meta.cost, Some(0.05));
    }

    #[test]
    fn test_metadata_serialization() {
        let meta = MessageMetadata::new("session-1").with_tokens(50);
        let json = serde_json::to_string(&meta).unwrap();
        let deserialized: MessageMetadata = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.session_id, "session-1");
        assert_eq!(deserialized.token_count, Some(50));
    }
}
