use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::fs;
use std::process::Command;
use once_cell::sync::Lazy;

/// Known debug adapters with download information
#[derive(Debug, Clone)]
pub struct AdapterInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub languages: Vec<&'static str>,
    pub download_url: Option<&'static str>,
    pub install_command: Option<&'static str>,
    pub binary_name: &'static str,
    pub binary_args: Vec<&'static str>,
    pub size_mb: u32,
}

static ADAPTER_REGISTRY: Lazy<Vec<AdapterInfo>> = Lazy::new(|| {
    vec![
        AdapterInfo {
            id: "lldb",
            name: "LLDB Debugger",
            languages: vec!["rust", "cpp", "c"],
            download_url: None,
            install_command: Some("xcode-select --install"),
            binary_name: "lldb-dap",
            binary_args: vec!["--adapter"],
            size_mb: 0,
        },
        AdapterInfo {
            id: "js-debug",
            name: "JavaScript Debugger",
            languages: vec!["javascript", "typescript"],
            download_url: None, // Fetch from GitHub API at runtime
            install_command: None,
            binary_name: "node",
            binary_args: vec!["js-debug/src/dapDebugServer.js"],
            size_mb: 2,
        },
        AdapterInfo {
            id: "debugpy",
            name: "Python Debugger",
            languages: vec!["python"],
            download_url: None,
            install_command: Some("pip install debugpy"),
            binary_name: "python",
            binary_args: vec!["-m", "debugpy.adapter"],
            size_mb: 5,
        },
        AdapterInfo {
            id: "delve",
            name: "Go Debugger",
            languages: vec!["go"],
            download_url: None,
            install_command: Some("go install github.com/go-delve/delve/cmd/dlv@latest"),
            binary_name: "dlv",
            binary_args: vec!["dap"],
            size_mb: 15,
        },
    ]
});

/// Adapter registry
pub struct AdapterRegistry;

impl AdapterRegistry {
    pub fn get_all_adapters() -> &'static Vec<AdapterInfo> {
        &ADAPTER_REGISTRY
    }

    pub fn get_adapter_for_language(language: &str) -> Option<&'static AdapterInfo> {
        ADAPTER_REGISTRY.iter().find(|adapter| adapter.languages.iter().any(|&l| l == language))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdapterInstallResult {
    pub success: bool,
    pub adapter_id: String,
    pub message: String,
    pub binary_path: Option<String>,
}

/// Debug Adapter Installer
pub struct DebugAdapterInstaller {
    cache_dir: PathBuf,
}

impl DebugAdapterInstaller {
    pub fn new() -> Self {
        let cache_dir = dirs::home_dir()
            .map(|h| h.join(".openstorm").join("adapters"))
            .unwrap_or_else(|| PathBuf::from(".openstorm/adapters"));

        // Ensure cache directory exists
        fs::create_dir_all(&cache_dir).ok();

        Self { cache_dir }
    }

    /// Get the cache directory for adapters
    pub fn cache_dir(&self) -> &Path {
        &self.cache_dir
    }

    /// Check if an adapter is already installed
    pub fn is_adapter_installed(&self, adapter: &AdapterInfo) -> bool {
        // For adapters that run via another binary (node, python), check differently
        match adapter.id {
            "js-debug" => {
                // Check if the debug server exists in cache
                let debug_server = self.cache_dir.join("js-debug").join("src").join("dapDebugServer.js");
                debug_server.exists()
            }
            "debugpy" => {
                // Try to import debugpy
                Command::new("python3")
                    .args(["-c", "import debugpy"])
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
            }
            "delve" => {
                Self::find_binary(adapter.binary_name).is_some()
            }
            "lldb" => {
                Self::find_binary(adapter.binary_name).is_some()
            }
            _ => Self::find_binary(adapter.binary_name).is_some(),
        }
    }

    /// Find a binary in PATH
    pub fn find_binary(name: &str) -> Option<String> {
        #[cfg(unix)]
        {
            let output = Command::new("which")
                .arg(name)
                .output()
                .ok()?;

            if output.status.success() {
                String::from_utf8(output.stdout).ok()
                    .map(|s| s.trim().to_string())
            } else {
                None
            }
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

    /// Install a debug adapter
    pub async fn install_adapter(&self, adapter: &AdapterInfo) -> Result<AdapterInstallResult, String> {
        match adapter.id {
            "lldb" => self.install_lldb(adapter),
            "js-debug" => self.install_js_debug(adapter).await,
            "debugpy" => self.install_debugpy(adapter),
            "delve" => self.install_delve(adapter),
            _ => Err(format!("Unknown adapter: {}", adapter.id)),
        }
    }

    fn install_lldb(&self, adapter: &AdapterInfo) -> Result<AdapterInstallResult, String> {
        // lldb-dap needs to be installed via system package manager
        let install_cmd = adapter.install_command
            .ok_or("lldb-dap must be installed manually")?;

        Err(format!(
            "LLDB debugger not found. Please install it by running:\n  {}",
            install_cmd
        ))
    }

    async fn install_js_debug(&self, adapter: &AdapterInfo) -> Result<AdapterInstallResult, String> {
        println!("[DAP] Installing js-debug adapter...");

        // Check if node is available
        let node_available = Self::find_binary("node")
            .ok_or("Node.js is required for JavaScript debugging. Please install Node.js.")?;

        println!("[DAP] Node found: {:?}", node_available);

        // Fetch the latest release from GitHub API
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

        // Find the tar.gz asset
        let assets = release["assets"]
            .as_array()
            .ok_or("No assets found in release")?;

        let asset = assets.iter()
            .find(|a| a["name"].as_str().map(|s| s.ends_with(".tar.gz")).unwrap_or(false))
            .ok_or("No .tar.gz asset found in release")?;

        let download_url = asset["browser_download_url"]
            .as_str()
            .ok_or("No download URL found")?;

        // Download the tar.gz file
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

        // Extract the tar.gz to cache directory
        let cursor = std::io::Cursor::new(bytes);
        let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(cursor));
        archive.unpack(&self.cache_dir)
            .map_err(|e| format!("Failed to extract tar.gz: {}", e))?;

        println!("[DAP] Extracted to: {:?}", self.cache_dir);

        // Verify the debug server exists (it's in js-debug/src/dapDebugServer.js)
        let debug_server = self.cache_dir.join("js-debug").join("src").join("dapDebugServer.js");
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

    fn install_debugpy(&self, adapter: &AdapterInfo) -> Result<AdapterInstallResult, String> {
        let _install_cmd = adapter.install_command
            .ok_or("debugpy must be installed via pip")?;

        // Try to install via pip
        let output = Command::new("pip3")
            .args(["install", "debugpy"])
            .output()
            .map_err(|e| format!("Failed to run pip: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to install debugpy: {}", stderr));
        }

        // Verify installation
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
            binary_path: Self::find_binary("python3"),
        })
    }

    fn install_delve(&self, adapter: &AdapterInfo) -> Result<AdapterInstallResult, String> {
        // Try to install via go install
        let output = Command::new("go")
            .args(["install", "github.com/go-delve/delve/cmd/dlv@latest"])
            .output()
            .map_err(|e| format!("Failed to run go install: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to install delve: {}", stderr));
        }

        // Verify installation
        let dlv_path = Self::find_binary("dlv")
            .ok_or("delve installed but not found in PATH")?;

        Ok(AdapterInstallResult {
            success: true,
            adapter_id: adapter.id.to_string(),
            message: "Go debugger (delve) installed successfully".to_string(),
            binary_path: Some(dlv_path),
        })
    }

    /// Get adapter info for frontend
    pub fn get_adapter_info(language: &str) -> Option<AdapterInfoResponse> {
        let adapter = AdapterRegistry::get_adapter_for_language(language)?;

        Some(AdapterInfoResponse {
            id: adapter.id.to_string(),
            name: adapter.name.to_string(),
            languages: adapter.languages.iter().map(|s| s.to_string()).collect(),
            size_mb: adapter.size_mb,
            install_command: adapter.install_command.map(|s| s.to_string()),
            is_installed: false, // Will be checked by caller
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterInfoResponse {
    pub id: String,
    pub name: String,
    pub languages: Vec<String>,
    pub size_mb: u32,
    pub install_command: Option<String>,
    pub is_installed: bool,
}

impl Default for DebugAdapterInstaller {
    fn default() -> Self {
        Self::new()
    }
}
