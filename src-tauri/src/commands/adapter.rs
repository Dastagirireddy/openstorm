//! Debug adapter installation commands

use crate::dap_installer;

#[tauri::command]
pub fn get_debug_adapter_info(
    installer: tauri::State<'_, dap_installer::DebugAdapterInstaller>,
    language: String,
) -> Result<Option<dap_installer::AdapterInfoResponse>, String> {
    println!("[DAP] Getting adapter info for language: {}", language);

    let mut info = dap_installer::DebugAdapterInstaller::get_adapter_info(&language)
        .ok_or_else(|| format!("No debugger available for language: {}", language))?;

    if let Some(adapter) = dap_installer::AdapterRegistry::get_adapter_for_language(&language) {
        info.is_installed = installer.is_adapter_installed(&adapter);
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
    let result = installer.install_adapter(&adapter).await;

    match &result {
        Ok(r) => println!("[DAP] Install result: success={}, message={}", r.success, r.message),
        Err(e) => println!("[DAP] Install failed: {}", e),
    }

    result
}
