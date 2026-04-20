use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use crate::run_config::{RunConfiguration, RunConfigurationDetector, ConfigurationStorage, Language};
use crate::process::{ProcessManager, ProcessId, ProcessInfo};
use crate::dap::{DapClient, LaunchRequestArgs};
use crate::dap_installer;
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
    pub is_executable: bool,
    pub children: Option<Vec<FileInfo>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub score: f64,
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileInfo>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files: Vec<FileInfo> = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            let file_name = entry.file_name().to_string_lossy().to_string();
            let file_path = entry.path().to_string_lossy().to_string();

            // Check if file is executable (Unix only)
            #[cfg(unix)]
            let is_executable = !metadata.is_dir() && {
                let mode = metadata.permissions().mode();
                (mode & 0o111) != 0  // Check if any execute bit is set
            };

            #[cfg(not(unix))]
            let is_executable = false;

            Some(FileInfo {
                name: file_name,
                path: file_path,
                is_dir: metadata.is_dir(),
                size: metadata.len(),
                modified: metadata
                    .modified()
                    .unwrap_or(SystemTime::UNIX_EPOCH)
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
                is_executable,
                children: None,
            })
        })
        .collect();

    // Sort: directories first, then files, alphabetically
    files.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
    });

    Ok(files)
}

#[tauri::command]
pub fn create_file(path: String, is_dir: bool) -> Result<(), String> {
    if is_dir {
        fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory: {}", e))
    } else {
        if let Some(parent) = PathBuf::from(&path).parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
        fs::write(&path, "").map_err(|e| format!("Failed to create file: {}", e))
    }
}

#[tauri::command]
pub fn delete_file(path: String, is_dir: bool) -> Result<(), String> {
    if is_dir {
        fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete directory: {}", e))
    } else {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {}", e))
    }
}

#[tauri::command]
pub fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename file: {}", e))
}

#[tauri::command]
pub fn get_file_info(path: String) -> Result<FileInfo, String> {
    let metadata = fs::metadata(&path).map_err(|e| format!("Failed to get file info: {}", e))?;
    let file_name = PathBuf::from(&path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    // Check if file is executable (Unix only)
    #[cfg(unix)]
    let is_executable = !metadata.is_dir() && {
        let mode = metadata.permissions().mode();
        (mode & 0o111) != 0  // Check if any execute bit is set
    };

    #[cfg(not(unix))]
    let is_executable = false;

    Ok(FileInfo {
        name: file_name,
        path,
        is_dir: metadata.is_dir(),
        size: metadata.len(),
        modified: metadata
            .modified()
            .unwrap_or(SystemTime::UNIX_EPOCH)
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        is_executable,
        children: None,
    })
}

#[tauri::command]
pub fn search_files(root_path: String, query: String) -> Result<Vec<SearchResult>, String> {
    let mut results = Vec::new();
    search_files_recursive(&root_path, &query, &mut results);
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    Ok(results)
}

fn search_files_recursive(path: &str, query: &str, results: &mut Vec<SearchResult>) {
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let entry_path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden files and common ignore directories
            if file_name.starts_with('.') {
                continue;
            }
            if entry_path.is_dir() {
                match file_name.as_str() {
                    "node_modules" | "target" | ".git" | "vendor" | "dist" => continue,
                    _ => {}
                }
            }

            // Simple fuzzy matching score
            let score = fuzzy_match_score(&file_name, &query);
            if score > 0.0 {
                results.push(SearchResult {
                    path: entry_path.to_string_lossy().to_string(),
                    name: file_name,
                    score,
                });
            }

            if entry_path.is_dir() {
                search_files_recursive(&entry_path.to_string_lossy().to_string(), query, results);
            }
        }
    }
}

fn fuzzy_match_score(text: &str, pattern: &str) -> f64 {
    let text_lower = text.to_lowercase();
    let pattern_lower = pattern.to_lowercase();

    // Exact prefix match gets highest score
    if text_lower.starts_with(&pattern_lower) {
        return 1.0;
    }

    // Contains match
    if text_lower.contains(&pattern_lower) {
        return 0.8;
    }

    // Fuzzy character match
    let mut text_chars = text_lower.chars();
    let mut matched = 0;
    let mut total_gaps = 0;
    let mut last_pos = 0;

    for pattern_char in pattern_lower.chars() {
        let mut found = false;
        for (i, text_char) in text_chars.by_ref().enumerate() {
            if text_char == pattern_char {
                matched += 1;
                total_gaps += i - last_pos;
                last_pos = i + 1;
                found = true;
                break;
            }
        }
        if !found {
            return 0.0;
        }
    }

    // Score based on match ratio and gap penalty
    let match_ratio = matched as f64 / pattern.len() as f64;
    let gap_penalty = (total_gaps as f64) / (text.len() as f64 * 2.0);
    (match_ratio - gap_penalty).max(0.1)
}

#[tauri::command]
pub fn detect_run_configurations(workspace_root: String) -> Vec<RunConfiguration> {
    let detector = RunConfigurationDetector::new(PathBuf::from(&workspace_root));
    detector.detect()
}

#[tauri::command]
pub async fn run_configuration(
    process_manager: tauri::State<'_, ProcessManager>,
    workspace_root: String,
    config: RunConfiguration,
) -> Result<ProcessId, String> {
    process_manager.spawn(&config).await
}

#[tauri::command]
pub async fn terminate_process(
    process_manager: tauri::State<'_, ProcessManager>,
    process_id: ProcessId,
) -> Result<(), String> {
    process_manager.terminate(process_id).await
}

#[tauri::command]
pub async fn list_running_processes(
    process_manager: tauri::State<'_, ProcessManager>,
) -> Result<Vec<ProcessInfo>, String> {
    Ok(process_manager.list_processes().await)
}

#[tauri::command]
pub fn save_run_configuration(
    workspace_root: String,
    config: RunConfiguration,
) -> Result<(), String> {
    let storage = ConfigurationStorage::new(PathBuf::from(workspace_root));
    storage.save_configuration(&config)
}

#[tauri::command]
pub fn load_run_configurations(workspace_root: String) -> Vec<RunConfiguration> {
    let storage = ConfigurationStorage::new(PathBuf::from(workspace_root));
    storage.load_configurations()
}

#[tauri::command]
pub fn delete_run_configuration(
    workspace_root: String,
    config_id: String,
) -> Result<(), String> {
    let storage = ConfigurationStorage::new(PathBuf::from(workspace_root));
    storage.delete_configuration(&config_id)
}

// DAP Debug Commands
#[tauri::command]
pub async fn start_debug_session(
    app_handle: tauri::AppHandle,
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    installer: tauri::State<'_, dap_installer::DebugAdapterInstaller>,
    _workspace_root: String,
    config: RunConfiguration,
) -> Result<u32, String> {
    println!("[DAP] Starting debug session for: {} (language: {:?})", config.name, config.language);

    let mut client = dap_client.lock().await;

    // Determine adapter type from config or auto-detect from language
    let adapter_type = config.debug_adapter
        .as_ref()
        .map(|a| a.adapter_type.clone())
        .or_else(|| {
            // Auto-detect based on language
            let lang_str = match config.language {
                Language::Rust => "rust",
                Language::JavaScript | Language::TypeScript => "javascript",
                Language::Python => "python",
                Language::Go => "go",
                Language::Cpp => "cpp",
                Language::Unknown => return None,
            };
            dap_installer::AdapterRegistry::get_adapter_for_language(lang_str)
                .map(|a| a.id.to_string())
        })
        .unwrap_or_else(|| "lldb".to_string());

    println!("[DAP] Using adapter type: {}", adapter_type);

    // Check if adapter is installed
    let adapter_info = dap_installer::AdapterRegistry::get_all_adapters()
        .iter()
        .find(|a| a.id == adapter_type);

    if let Some(adapter) = adapter_info {
        let is_installed = installer.is_adapter_installed(adapter);
        println!("[DAP] Adapter '{}' installed: {}", adapter.name, is_installed);
        if !is_installed {
            return Err(format!(
                "{} is not installed. Please install the debug adapter first.",
                adapter.name
            ));
        }
    }

    println!("[DAP] Creating adapter...");
    client.create_adapter(&adapter_type)?;

    let launch_args = LaunchRequestArgs {
        name: config.name.clone(),
        debug_type: adapter_type,
        request: "launch".to_string(),
        program: config.debug_adapter.as_ref().and_then(|da| da.args.first().cloned())
            .or_else(|| config.args.first().cloned()),
        cwd: config.cwd.map(|p| p.to_string_lossy().to_string()),
        args: Some(config.debug_adapter.as_ref().map(|da| da.args.clone()).unwrap_or_else(|| config.args.clone())),
        env: Some(config.env.clone()),
        stop_on_entry: Some(false),
        external_console: Some(false),
        debug_adapter_path: None,
    };

    println!("[DAP] Starting session with program: {:?}", launch_args.program);
    let result = client.start_session(&launch_args);
    match &result {
        Ok(id) => {
            println!("[DAP] Session started with ID: {}", id);
            // Flush pending breakpoints BEFORE finalizing launch
            flush_pending_breakpoints(&mut client);
            // Now send configurationDone to start debugging
            println!("[DAP] Finalizing launch...");
            if let Err(e) = client.finalize_launch() {
                println!("[DAP] Failed to finalize launch: {}", e);
                // Emit error event to frontend
                let _ = app_handle.emit("debug-error", serde_json::json!({
                    "message": format!("Failed to start debugging: {}", e)
                }));
            } else {
                println!("[DAP] Launch finalized successfully");
            }
        },
        Err(e) => {
            println!("[DAP] Session failed: {}", e);
            // Emit error event to frontend
            let _ = app_handle.emit("debug-error", serde_json::json!({
                "message": format!("Failed to start debugging session: {}", e)
            }));
        }
    }
    result
}

/// Flush pending breakpoints to the debug adapter
fn flush_pending_breakpoints(client: &mut DapClient) {
    let pending = PENDING_BREAKPOINTS.lock().unwrap().clone();
    if pending.is_empty() {
        println!("[DAP] No pending breakpoints to flush");
        return;
    }

    println!("[DAP] Flushing {} pending breakpoints", pending.len());

    // Group breakpoints by source path
    let mut breakpoints_by_path: std::collections::HashMap<String, Vec<crate::dap::SourceBreakpoint>> = std::collections::HashMap::new();
    for bp in pending {
        // js-debug expects absolute paths (not file:// URIs)
        let abs_path = bp.source_path.strip_prefix("file://").unwrap_or(&bp.source_path).to_string();
        breakpoints_by_path.entry(abs_path).or_insert_with(Vec::new).push(crate::dap::SourceBreakpoint {
            line: bp.line,
            column: None,
            condition: bp.condition,
            hit_condition: bp.hit_condition,
            log_message: bp.log_message,
        });
    }

    // Send breakpoints for each file using the public set_breakpoints method
    for (path, bps) in breakpoints_by_path {
        println!("[DAP] Setting {} breakpoints for {}", bps.len(), path);
        if let Err(e) = client.set_breakpoints(&path, bps) {
            println!("[DAP] Failed to set breakpoints: {}", e);
        }
    }

    // Clear pending breakpoints
    PENDING_BREAKPOINTS.lock().unwrap().clear();
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DebugAction {
    Continue,
    StepOver,
    StepInto,
    StepOut,
    Pause,
    Terminate,
}

#[tauri::command]
pub async fn debug_action(
    _app_handle: tauri::AppHandle,
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    action: DebugAction,
) -> Result<(), String> {
    let mut client = dap_client.lock().await;

    let result = match action {
        DebugAction::Continue => client.continue_execution(),
        DebugAction::StepOver => client.step_over(),
        DebugAction::StepInto => client.step_into(),
        DebugAction::StepOut => client.step_out(),
        DebugAction::Pause => client.pause(),
        DebugAction::Terminate => client.terminate_session(),
    };

    result
}

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

// Breakpoint management
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BreakpointInfo {
    pub id: u32,
    pub source_path: String,
    pub line: u32,
    pub enabled: bool,
    pub verified: bool,
    pub condition: Option<String>,
    pub hit_condition: Option<String>,
    pub log_message: Option<String>,
}

// Global store for pending breakpoints (set before session started)
use std::sync::Mutex as StdMutex;
use once_cell::sync::Lazy;

#[derive(Debug, Clone)]
pub struct PendingBreakpoint {
    pub source_path: String,
    pub line: u32,
    pub condition: Option<String>,
    pub hit_condition: Option<String>,
    pub log_message: Option<String>,
}

static PENDING_BREAKPOINTS: Lazy<StdMutex<Vec<PendingBreakpoint>>> = Lazy::new(|| StdMutex::new(Vec::new()));

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AddBreakpointRequest {
    pub source_path: String,
    pub line: u32,
    pub condition: Option<String>,
    pub hit_condition: Option<String>,
    pub log_message: Option<String>,
}

#[tauri::command]
pub async fn add_breakpoint(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    request: AddBreakpointRequest,
) -> Result<BreakpointInfo, String> {
    let mut client = dap_client.lock().await;

    println!("[DAP] add_breakpoint called: {}:{} (session: {:?})", request.source_path, request.line, client.get_session().map(|s| s.id));

    // js-debug expects absolute paths (not file:// URIs)
    let abs_path = request.source_path.strip_prefix("file://").unwrap_or(&request.source_path).to_string();
    println!("[DAP] Using absolute path: {}", abs_path);

    // Check if we have an adapter - if not, store as pending
    if client.get_session().is_none() {
        println!("[DAP] No active session, storing as pending breakpoint for path: {}", abs_path);
        PENDING_BREAKPOINTS.lock().unwrap().push(PendingBreakpoint {
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

    // Set breakpoints for the file with conditions using public method
    let source_bps = vec![crate::dap::SourceBreakpoint {
        line: request.line,
        column: None,
        condition: request.condition.clone(),
        hit_condition: request.hit_condition.clone(),
        log_message: request.log_message.clone(),
    }];

    let result = client.set_breakpoints(&abs_path, source_bps);

    println!("[DAP] set_breakpoints result: {:?}", result.is_ok());

    if let Ok(ref breakpoints) = &result {
        println!("[DAP] Set {} breakpoints:", breakpoints.len());
        for (i, bp) in breakpoints.iter().enumerate() {
            let id_str = match bp.id {
                Some(id) => format!("{}", id),
                None => "None".to_string(),
            };
            let line_str = match bp.line {
                Some(line) => format!("{}", line),
                None => "None".to_string(),
            };
            println!("[DAP]   Breakpoint {}: id={}, line={}, verified={}", i, id_str, line_str, bp.verified);
        }
    }

    let id = match &result {
        Ok(bps) => bps.first().and_then(|bp| bp.id).map(|i| i as u32).unwrap_or(1),
        Err(e) => {
            println!("[DAP] set_breakpoints error: {}", e);
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

    // Convert line numbers to SourceBreakpoints (without conditions to remove)
    let source_bps: Vec<crate::dap::SourceBreakpoint> = lines.iter().map(|&line| crate::dap::SourceBreakpoint {
        line,
        column: None,
        condition: None,
        hit_condition: None,
        log_message: None,
    }).collect();

    // Set breakpoints with empty list to remove all, or with remaining lines
    let _ = client.set_breakpoints(&source_path, source_bps);

    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SetBreakpointsForFileRequest {
    pub source_path: String,
    pub breakpoints: Vec<BreakpointInfo>,
}

#[tauri::command]
pub async fn set_breakpoints_for_file(
    dap_client: tauri::State<'_, tokio::sync::Mutex<DapClient>>,
    request: SetBreakpointsForFileRequest,
) -> Result<Vec<BreakpointInfo>, String> {
    let mut client = dap_client.lock().await;

    // Convert BreakpointInfo to SourceBreakpoint for DAP
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

// Debug Adapter Installation Commands
#[tauri::command]
pub fn get_debug_adapter_info(
    installer: tauri::State<'_, dap_installer::DebugAdapterInstaller>,
    language: String,
) -> Result<Option<dap_installer::AdapterInfoResponse>, String> {
    println!("[DAP] Getting adapter info for language: {}", language);

    let mut info = dap_installer::DebugAdapterInstaller::get_adapter_info(&language)
        .ok_or_else(|| format!("No debugger available for language: {}", language))?;

    // Check if already installed
    if let Some(adapter) = dap_installer::AdapterRegistry::get_adapter_for_language(&language) {
        info.is_installed = installer.is_adapter_installed(adapter);
        println!("[DAP] Adapter '{}' is_installed: {}", info.name, info.is_installed);
    }

    Ok(Some(info))
}

#[tauri::command]
pub async fn install_debug_adapter(
    installer: tauri::State<'_, dap_installer::DebugAdapterInstaller>,
    language: String,
) -> Result<dap_installer::AdapterInstallResult, String> {
    println!("[DAP] Installing adapter for language: {}", language);

    let adapter = dap_installer::AdapterRegistry::get_adapter_for_language(&language)
        .ok_or_else(|| format!("No debugger available for language: {}", language))?;

    println!("[DAP] Found adapter: {} (id: {})", adapter.name, adapter.id);
    let result = installer.install_adapter(adapter).await;

    match &result {
        Ok(r) => println!("[DAP] Install result: success={}, message={}", r.success, r.message),
        Err(e) => println!("[DAP] Install failed: {}", e),
    }

    result
}

// Watch Expression Commands
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

    // Get current watch expressions
    let watches = client.get_watch_expressions();

    // Evaluate each expression
    let mut evaluations = Vec::new();
    for watch in &watches {
        let result = client.evaluate(&watch.expression, None);
        evaluations.push(result);
    }

    // Update watches with evaluated values
    client.refresh_watch_expressions(evaluations);

    Ok(client.get_watch_expressions().into_iter().map(|w| w.into()).collect())
}

// Exception Breakpoint Commands
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ExceptionBreakpointFilterResult {
    pub filter_id: String,
    pub label: String,
    pub description: Option<String>,
    pub default: Option<bool>,
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
