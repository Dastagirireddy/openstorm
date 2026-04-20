use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OutputType {
    Stdout,
    Stderr,
    Stdin,
    Error,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputEvent {
    pub process_id: u32,
    pub output_type: OutputType,
    pub data: String,
    pub timestamp: u64,
}

impl OutputEvent {
    pub fn stdout(process_id: u32, data: String) -> Self {
        Self {
            process_id,
            output_type: OutputType::Stdout,
            data,
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        }
    }

    pub fn stderr(process_id: u32, data: String) -> Self {
        Self {
            process_id,
            output_type: OutputType::Stderr,
            data,
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        }
    }

    pub fn error(process_id: u32, data: String) -> Self {
        Self {
            process_id,
            output_type: OutputType::Error,
            data,
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        }
    }

    pub fn info(process_id: u32, data: String) -> Self {
        Self {
            process_id,
            output_type: OutputType::Info,
            data,
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        }
    }
}
