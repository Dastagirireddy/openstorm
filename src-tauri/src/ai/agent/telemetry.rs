use super::types::{TelemetryField, TelemetryFieldType};

/// Generate telemetry fields from a tool execution result.
///
/// Returns structured key-value pairs for the v2 timeline telemetry box.
/// Each tool type produces contextually relevant fields.
///
/// # Arguments
/// * `tool_name` - Name of the tool that was executed.
/// * `result` - The raw result string from tool execution.
/// * `arguments` - JSON string of the tool's arguments.
pub fn build_telemetry_fields(
    tool_name: &str,
    result: &str,
    arguments: &str,
) -> Vec<TelemetryField> {
    let args: serde_json::Value = serde_json::from_str(arguments).unwrap_or_default();

    match tool_name {
        "run_background" => build_run_background_telemetry(result, &args),
        "read_process_output" => build_read_process_telemetry(result, &args),
        "run_command" => build_run_command_telemetry(result, &args),
        "write_file" | "edit_file" => build_file_write_telemetry(result, &args),
        "read_file" => build_read_file_telemetry(result, &args),
        "search_code" => build_search_code_telemetry(result, &args),
        _ => build_generic_telemetry(tool_name, result),
    }
}

/// Build telemetry for `run_background` tool.
fn build_run_background_telemetry(
    result: &str,
    args: &serde_json::Value,
) -> Vec<TelemetryField> {
    let mut fields = Vec::new();
    if let Some(pid) = result
        .lines()
        .find_map(|l| l.split_whitespace().find_map(|w| w.parse::<u32>().ok()))
    {
        fields.push(TelemetryField {
            key: "pid".to_string(),
            value: pid.to_string(),
            field_type: TelemetryFieldType::Text,
        });
    }
    let command = args["command"].as_str().unwrap_or("unknown");
    fields.push(TelemetryField {
        key: "command".to_string(),
        value: command.to_string(),
        field_type: TelemetryFieldType::Text,
    });
    fields.push(TelemetryField {
        key: "status".to_string(),
        value: "running".to_string(),
        field_type: TelemetryFieldType::Success,
    });
    fields
}

/// Build telemetry for `read_process_output` tool.
fn build_read_process_telemetry(
    result: &str,
    args: &serde_json::Value,
) -> Vec<TelemetryField> {
    let pid = args["pid"]
        .as_u64()
        .map(|p| p.to_string())
        .unwrap_or_default();
    let mut fields = vec![
        TelemetryField {
            key: "pid".to_string(),
            value: pid,
            field_type: TelemetryFieldType::Text,
        },
        TelemetryField {
            key: "output_lines".to_string(),
            value: result.lines().count().to_string(),
            field_type: TelemetryFieldType::Text,
        },
    ];
    if result.contains("error") || result.contains("Error") {
        fields.push(TelemetryField {
            key: "status".to_string(),
            value: "error".to_string(),
            field_type: TelemetryFieldType::Error,
        });
    } else {
        fields.push(TelemetryField {
            key: "status".to_string(),
            value: "ok".to_string(),
            field_type: TelemetryFieldType::Success,
        });
    }
    fields
}

/// Build telemetry for `run_command` tool.
fn build_run_command_telemetry(
    result: &str,
    args: &serde_json::Value,
) -> Vec<TelemetryField> {
    let command = args["command"].as_str().unwrap_or("unknown");
    vec![
        TelemetryField {
            key: "command".to_string(),
            value: command.to_string(),
            field_type: TelemetryFieldType::Text,
        },
        TelemetryField {
            key: "exit".to_string(),
            value: if result.starts_with("Error") {
                "error".to_string()
            } else {
                "0".to_string()
            },
            field_type: if result.starts_with("Error") {
                TelemetryFieldType::Error
            } else {
                TelemetryFieldType::Success
            },
        },
    ]
}

/// Build telemetry for `write_file` / `edit_file` tools.
fn build_file_write_telemetry(
    result: &str,
    args: &serde_json::Value,
) -> Vec<TelemetryField> {
    let path = args["path"].as_str().unwrap_or("unknown");
    let mut fields = vec![TelemetryField {
        key: "path".to_string(),
        value: path.to_string(),
        field_type: TelemetryFieldType::Text,
    }];
    if result.starts_with("Successfully") {
        fields.push(TelemetryField {
            key: "status".to_string(),
            value: "written".to_string(),
            field_type: TelemetryFieldType::Success,
        });
    } else {
        fields.push(TelemetryField {
            key: "status".to_string(),
            value: "error".to_string(),
            field_type: TelemetryFieldType::Error,
        });
    }
    fields
}

/// Build telemetry for `read_file` tool.
fn build_read_file_telemetry(
    result: &str,
    args: &serde_json::Value,
) -> Vec<TelemetryField> {
    let path = args["path"].as_str().unwrap_or("unknown");
    vec![
        TelemetryField {
            key: "path".to_string(),
            value: path.to_string(),
            field_type: TelemetryFieldType::Text,
        },
        TelemetryField {
            key: "lines".to_string(),
            value: result.lines().count().to_string(),
            field_type: TelemetryFieldType::Text,
        },
    ]
}

/// Build telemetry for `search_code` tool.
fn build_search_code_telemetry(
    result: &str,
    args: &serde_json::Value,
) -> Vec<TelemetryField> {
    let pattern = args["pattern"].as_str().unwrap_or("");
    vec![
        TelemetryField {
            key: "pattern".to_string(),
            value: pattern.to_string(),
            field_type: TelemetryFieldType::Text,
        },
        TelemetryField {
            key: "matches".to_string(),
            value: result
                .lines()
                .filter(|l| !l.starts_with("..."))
                .count()
                .to_string(),
            field_type: TelemetryFieldType::Text,
        },
    ]
}

/// Build generic telemetry for unknown tools.
fn build_generic_telemetry(tool_name: &str, result: &str) -> Vec<TelemetryField> {
    vec![
        TelemetryField {
            key: "tool".to_string(),
            value: tool_name.to_string(),
            field_type: TelemetryFieldType::Text,
        },
        TelemetryField {
            key: "result_len".to_string(),
            value: result.len().to_string(),
            field_type: TelemetryFieldType::Text,
        },
    ]
}
