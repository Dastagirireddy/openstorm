//! DAP Installer - Adapter Installers
//!
//! Installation logic for each adapter type

use std::path::Path;
use std::process::Command;

use super::types::{AdapterInfo, AdapterInstallResult};

/// Find a binary in PATH
pub fn find_binary(name: &str) -> Option<String> {
    #[cfg(unix)]
    {
        let output = Command::new("which")
            .arg(name)
            .output()
            .ok()?;

        if output.status.success() {
            return String::from_utf8(output.stdout).ok()
                .map(|s| s.trim().to_string());
        }

        // For lldb-dap, also check Xcode toolchain paths
        if name == "lldb-dap" {
            let xcode_paths = [
                "/Library/Developer/CommandLineTools/usr/bin",
                "/Applications/Xcode.app/Contents/Developer/usr/bin",
            ];
            for path in xcode_paths {
                let full_path = std::path::Path::new(path).join(name);
                if full_path.exists() {
                    return Some(full_path.to_string_lossy().to_string());
                }
            }
        }

        None
    }

    #[cfg(windows)]
    {
        let output = Command::new("where")
            .arg(name)
            .output()
            .ok()?;

        if output.status.success() {
            String::from_utf8(output.stdout).ok()
                .and_then(|s| s.lines().next().map(|l| l.to_string()))
        } else {
            None
        }
    }
}

/// Install LLDB debugger
pub fn install_lldb(adapter: &AdapterInfo) -> Result<AdapterInstallResult, String> {
    println!("[DAP] Checking for LLDB debugger...");

    if let Some(path) = find_binary(&adapter.binary_name) {
        println!("[DAP] LLDB debugger found at: {}", path);
        return Ok(AdapterInstallResult {
            success: true,
            adapter_id: adapter.id.to_string(),
            message: "LLDB debugger is available".to_string(),
            binary_path: Some(path),
        });
    }

    println!("[DAP] Running xcode-select --install...");
    let output = Command::new("xcode-select")
        .arg("--install")
        .output()
        .map_err(|e| format!("Failed to run xcode-select: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);

    if stderr.contains("already installed") || stdout.contains("already installed") {
        let xcode_lldb_dap = std::path::Path::new("/Library/Developer/CommandLineTools/usr/bin/lldb-dap");
        if xcode_lldb_dap.exists() {
            println!("[DAP] LLDB debugger found at Xcode path (not in PATH)");
            return Ok(AdapterInstallResult {
                success: true,
                adapter_id: adapter.id.to_string(),
                message: "LLDB debugger found but not in PATH. OpenStorm will use it directly.".to_string(),
                binary_path: Some(xcode_lldb_dap.to_string_lossy().to_string()),
            });
        }
        return Err(
            "Xcode command line tools are installed, but lldb-dap was not found.
Please ensure Xcode command line tools are properly installed."
                .to_string(),
        );
    }

    if !output.status.success() {
        return Err(format!("xcode-select failed: {}", stderr));
    }

    std::thread::sleep(std::time::Duration::from_secs(2));
    if let Some(path) = find_binary(&adapter.binary_name) {
        return Ok(AdapterInstallResult {
            success: true,
            adapter_id: adapter.id.to_string(),
            message: "LLDB debugger installed successfully".to_string(),
            binary_path: Some(path),
        });
    }

    Ok(AdapterInstallResult {
        success: true,
        adapter_id: adapter.id.to_string(),
        message: "Xcode command line tools installation started. Please complete the installation in the system dialog.".to_string(),
        binary_path: None,
    })
}

/// Install JavaScript debugger (vscode-js-debug)
pub async fn install_js_debug(adapter: &AdapterInfo, cache_dir: &Path) -> Result<AdapterInstallResult, String> {
    println!("[DAP] Installing js-debug adapter...");

    let node_available = find_binary("node")
        .ok_or("Node.js is required for JavaScript debugging. Please install Node.js.")?;

    println!("[DAP] Node found: {:?}", node_available);

    let client = reqwest::Client::new();
    println!("[DAP] Fetching latest js-debug release from GitHub...");
    let response = client.get("https://api.github.com/repos/microsoft/vscode-js-debug/releases/latest")
        .header("User-Agent", "openstorm-ide")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch release info: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to fetch release info: {}", response.status()));
    }

    let release: serde_json::Value = response.json()
        .await
        .map_err(|e| format!("Failed to parse release info: {}", e))?;

    let assets = release["assets"]
        .as_array()
        .ok_or("No assets found in release")?;

    let asset = assets.iter()
        .find(|a| a["name"].as_str().map(|s| s.ends_with(".tar.gz")).unwrap_or(false))
        .ok_or("No .tar.gz asset found in release")?;

    let download_url = asset["browser_download_url"]
        .as_str()
        .ok_or("No download URL found")?;

    let response = client.get(download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download js-debug: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    let bytes = response.bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    println!("[DAP] Downloaded {} bytes, extracting...", bytes.len());

    let cursor = std::io::Cursor::new(bytes);
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(cursor));
    archive.unpack(cache_dir)
        .map_err(|e| format!("Failed to extract tar.gz: {}", e))?;

    println!("[DAP] Extracted to: {:?}", cache_dir);

    let debug_server = cache_dir.join("js-debug").join("src").join("dapDebugServer.js");
    println!("[DAP] Checking for debug server at: {:?}", debug_server);
    if !debug_server.exists() {
        println!("[DAP] Debug server not found!");
        return Err("js-debug debug server not found after extraction".to_string());
    }
    println!("[DAP] Debug server found!");

    Ok(AdapterInstallResult {
        success: true,
        adapter_id: adapter.id.to_string(),
        message: "JavaScript debugger (vscode-js-debug) installed successfully".to_string(),
        binary_path: Some(node_available),
    })
}

/// Install Python debugger (debugpy)
pub fn install_debugpy(adapter: &AdapterInfo) -> Result<AdapterInstallResult, String> {
    let _install_cmd = adapter.install_command.clone()
        .ok_or("debugpy must be installed via pip")?;

    let output = Command::new("pip3")
        .args(["install", "debugpy"])
        .output()
        .map_err(|e| format!("Failed to run pip: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to install debugpy: {}", stderr));
    }

    let check = Command::new("python3")
        .args(["-c", "import debugpy; print(debugpy.__version__)"])
        .output()
        .map_err(|e| format!("Failed to verify debugpy: {}", e))?;

    if !check.status.success() {
        return Err("debugpy installation failed".to_string());
    }

    let version = String::from_utf8_lossy(&check.stdout).trim().to_string();

    Ok(AdapterInstallResult {
        success: true,
        adapter_id: adapter.id.to_string(),
        message: format!("Python debugger (debugpy {}) installed successfully", version),
        binary_path: find_binary("python3"),
    })
}

/// Install Go debugger (delve)
pub fn install_delve(adapter: &AdapterInfo) -> Result<AdapterInstallResult, String> {
    let output = Command::new("go")
        .args(["install", "github.com/go-delve/delve/cmd/dlv@latest"])
        .output()
        .map_err(|e| format!("Failed to run go install: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to install delve: {}", stderr));
    }

    let dlv_path = find_binary("dlv")
        .ok_or("delve installed but not found in PATH")?;

    Ok(AdapterInstallResult {
        success: true,
        adapter_id: adapter.id.to_string(),
        message: "Go debugger (delve) installed successfully".to_string(),
        binary_path: Some(dlv_path),
    })
}
