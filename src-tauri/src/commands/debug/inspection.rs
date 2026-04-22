//! Debug Commands - Inspection
//!
//! Stack traces, variables, scopes, and expression evaluation

use crate::dap::DapClient;

#[tauri::command]
pub async fn get_stack_trace(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
) -> Result<Vec<crate::dap::StackFrame>, String> {
    let mut client = dap_client.lock().await;
    client.stack_trace()
}

#[tauri::command]
pub async fn get_scopes(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    frame_id: i64,
) -> Result<Vec<crate::dap::Scope>, String> {
    let mut client = dap_client.lock().await;
    client.scopes(frame_id)
}

#[tauri::command]
pub async fn get_variables(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    variables_reference: i64,
) -> Result<Vec<crate::dap::Variable>, String> {
    let mut client = dap_client.lock().await;
    client.variables(variables_reference)
}

#[tauri::command]
pub async fn evaluate_expression(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    expression: String,
    frame_id: Option<i64>,
) -> Result<crate::dap::Variable, String> {
    let mut client = dap_client.lock().await;
    client.evaluate(&expression, frame_id)
}

#[tauri::command]
pub async fn get_threads(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
) -> Result<Vec<crate::dap::Thread>, String> {
    let mut client = dap_client.lock().await;
    client.get_threads()
}
