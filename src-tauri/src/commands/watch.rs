//! Watch expression commands

use crate::dap::DapClient;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WatchExpressionResult {
    pub id: u32,
    pub expression: String,
    pub value: Option<String>,
    pub type_hint: Option<String>,
    pub error: Option<String>,
}

impl From<crate::dap::watch::WatchExpression> for WatchExpressionResult {
    fn from(w: crate::dap::watch::WatchExpression) -> Self {
        Self {
            id: w.id,
            expression: w.expression,
            value: w.value,
            type_hint: w.type_hint,
            error: w.error,
        }
    }
}

#[tauri::command]
pub async fn add_watch_expression(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    expression: String,
) -> Result<u32, String> {
    let mut client = dap_client.lock().await;
    Ok(client.add_watch_expression(expression))
}

#[tauri::command]
pub async fn remove_watch_expression(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    id: u32,
) -> Result<(), String> {
    let mut client = dap_client.lock().await;
    if client.remove_watch_expression(id) {
        Ok(())
    } else {
        Err("Watch expression not found".to_string())
    }
}

#[tauri::command]
pub async fn get_watch_expressions(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
) -> Result<Vec<WatchExpressionResult>, String> {
    let client = dap_client.lock().await;
    Ok(client.get_watch_expressions().into_iter().map(|w| w.into()).collect())
}

#[tauri::command]
pub async fn refresh_watch_expressions(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
) -> Result<Vec<WatchExpressionResult>, String> {
    let mut client = dap_client.lock().await;

    let watches = client.get_watch_expressions();

    let mut evaluations = Vec::new();
    for watch in &watches {
        let result = client.evaluate(&watch.expression, None);
        evaluations.push(result);
    }

    client.refresh_watch_expressions(evaluations);

    Ok(client.get_watch_expressions().into_iter().map(|w| w.into()).collect())
}

#[tauri::command]
pub async fn get_exception_breakpoint_filters(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
) -> Result<Vec<ExceptionBreakpointFilterResult>, String> {
    let mut client = dap_client.lock().await;
    let filters = client.get_exception_breakpoint_filters();
    Ok(filters.into_iter().map(|f| ExceptionBreakpointFilterResult {
        filter_id: f.filter_id,
        label: f.label,
        description: f.description,
        default: f.default,
    }).collect())
}

#[tauri::command]
pub async fn set_exception_breakpoints(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    filters: Vec<String>,
) -> Result<(), String> {
    let mut client = dap_client.lock().await;
    client.set_exception_breakpoints(filters)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExceptionBreakpointFilterResult {
    pub filter_id: String,
    pub label: String,
    pub description: Option<String>,
    pub default: Option<bool>,
}
