//! Debug Commands - Breakpoint Management
//!
//! Add, remove, and manage breakpoints

use crate::dap::DapClient;
use crate::commands::debug::types::{
    PendingBreakpoint, AddBreakpointRequest, BreakpointInfo, SetBreakpointsForFileRequest,
    push_pending_breakpoint,
};

#[tauri::command]
pub async fn add_breakpoint(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    request: AddBreakpointRequest,
) -> Result<BreakpointInfo, String> {
    let mut client = dap_client.lock().await;

    let abs_path = request.source_path.strip_prefix("file://").unwrap_or(&request.source_path).to_string();

    if client.get_session().is_none() {
        push_pending_breakpoint(PendingBreakpoint {
            source_path: abs_path.clone(),
            line: request.line,
            condition: request.condition.clone(),
            hit_condition: request.hit_condition.clone(),
            log_message: request.log_message.clone(),
        });
        return Ok(BreakpointInfo {
            id: 1,
            source_path: request.source_path.clone(),
            line: request.line,
            enabled: true,
            verified: false,
            condition: request.condition,
            hit_condition: request.hit_condition,
            log_message: request.log_message,
        });
    }

    let source_bps = vec![crate::dap::SourceBreakpoint {
        line: request.line,
        column: None,
        condition: request.condition.clone(),
        hit_condition: request.hit_condition.clone(),
        log_message: request.log_message.clone(),
    }];

    let result = client.set_breakpoints(&abs_path, source_bps);

    let id = match &result {
        Ok(bps) => bps.first().and_then(|bp| bp.id).map(|i| i as u32).unwrap_or(1),
        Err(e) => {
            eprintln!("[DAP] set_breakpoints error: {}", e);
            1
        }
    };

    let breakpoint = BreakpointInfo {
        id,
        source_path: request.source_path.clone(),
        line: request.line,
        enabled: true,
        verified: result.is_ok(),
        condition: request.condition,
        hit_condition: request.hit_condition,
        log_message: request.log_message,
    };

    Ok(breakpoint)
}

#[tauri::command]
pub async fn remove_breakpoint(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    source_path: String,
    lines: Vec<u32>,
) -> Result<(), String> {
    let mut client = dap_client.lock().await;

    let source_bps: Vec<crate::dap::SourceBreakpoint> = lines.iter().map(|&line| crate::dap::SourceBreakpoint {
        line,
        column: None,
        condition: None,
        hit_condition: None,
        log_message: None,
    }).collect();

    let _ = client.set_breakpoints(&source_path, source_bps);

    Ok(())
}

#[tauri::command]
pub async fn set_breakpoints_for_file(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    request: SetBreakpointsForFileRequest,
) -> Result<Vec<BreakpointInfo>, String> {
    let mut client = dap_client.lock().await;

    let source_bps: Vec<crate::dap::SourceBreakpoint> = request.breakpoints.iter().map(|bp| crate::dap::SourceBreakpoint {
        line: bp.line,
        column: None,
        condition: bp.condition.clone(),
        hit_condition: bp.hit_condition.clone(),
        log_message: bp.log_message.clone(),
    }).collect();

    let result = client.set_breakpoints(&request.source_path, source_bps);

    let breakpoints = match result {
        Ok(dap_bps) => dap_bps
            .iter()
            .enumerate()
            .map(|(i, bp)| BreakpointInfo {
                id: bp.id.map(|id| id as u32).unwrap_or(i as u32),
                source_path: request.source_path.clone(),
                line: bp.line.unwrap_or(0),
                enabled: true,
                verified: bp.verified,
                condition: request.breakpoints.get(i).and_then(|b| b.condition.clone()),
                hit_condition: request.breakpoints.get(i).and_then(|b| b.hit_condition.clone()),
                log_message: request.breakpoints.get(i).and_then(|b| b.log_message.clone()),
            })
            .collect(),
        Err(_) => request.breakpoints,
    };

    Ok(breakpoints)
}
