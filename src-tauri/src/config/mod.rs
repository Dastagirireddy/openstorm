//! Configuration module for centralized paths, ports, and adapter settings.
//!
//! This module provides a single source of truth for all configuration values
//! that were previously hardcoded throughout the codebase.

use std::path::{Path, PathBuf};
use directories::ProjectDirs;

/// Path configuration for OpenStorm
#[derive(Debug, Clone)]
pub struct PathConfig {
    // Global config (user-wide settings, connections)
    /// Global config directory (default: platform-specific)
    /// - macOS: ~/Library/Application Support/OpenStorm/
    /// - Linux: ~/.config/openstorm/
    /// - Windows: %APPDATA%/OpenStorm/
    pub global_config_dir: PathBuf,
    /// Global connections storage (default: global_config_dir/connections/)
    pub global_connections_dir: PathBuf,

    // Legacy cache dir for adapters, LSP servers, templates
    /// Adapter storage directory (default: ~/.openstorm/adapters)
    pub adapter_dir: PathBuf,
    /// LSP server storage directory (default: ~/.openstorm/lsp-servers)
    pub lsp_server_dir: PathBuf,
    /// Template storage directory (default: ~/.openstorm/templates)
    pub template_dir: PathBuf,
    /// Debug output directory for temporary binaries (default: ./.openstorm/debug)
    pub debug_output_dir: PathBuf,

    // Project-specific (per-workspace)
    /// Project config directory name (default: .openstorm)
    pub project_config_dir_name: &'static str,
}

impl PathConfig {
    pub fn new() -> Self {
        // Use directories crate for platform-specific paths
        let proj_dirs = ProjectDirs::from("com", "OpenStorm", "OpenStorm")
            .expect("no valid home directory");

        let global_config_dir = proj_dirs.config_dir().to_path_buf();
        let global_connections_dir = global_config_dir.join("connections");

        // Legacy cache dir (for adapters, LSP, templates)
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        let cache_dir = home.join(".openstorm");

        Self {
            global_config_dir,
            global_connections_dir,
            adapter_dir: cache_dir.join("adapters"),
            lsp_server_dir: cache_dir.join("lsp-servers"),
            template_dir: cache_dir.join("templates"),
            debug_output_dir: PathBuf::from(".openstorm/debug"),
            project_config_dir_name: ".openstorm",
        }
    }

    /// Get project-specific config directory for a given project path
    pub fn project_config_dir(&self, project_root: &Path) -> PathBuf {
        project_root.join(self.project_config_dir_name)
    }

    /// Get project-specific connections file path
    pub fn project_connections_file(&self, project_root: &Path) -> PathBuf {
        self.project_config_dir(project_root).join("connections.json")
    }

    /// Get global connections file path
    pub fn global_connections_file(&self) -> PathBuf {
        self.global_connections_dir.join("global.json")
    }

    /// Get recent projects file path
    pub fn recent_projects_file(&self) -> PathBuf {
        self.global_config_dir.join("recent_projects.json")
    }

    /// Get app data directory (for password storage, etc.)
    pub fn app_data_dir(&self) -> &PathBuf {
        &self.global_config_dir
    }

    /// Ensure all directories exist
    pub fn create_directories(&self) -> std::io::Result<()> {
        // Global config directories
        std::fs::create_dir_all(&self.global_config_dir)?;
        std::fs::create_dir_all(&self.global_connections_dir)?;

        // Legacy cache directories
        std::fs::create_dir_all(&self.adapter_dir)?;
        std::fs::create_dir_all(&self.lsp_server_dir)?;
        std::fs::create_dir_all(&self.template_dir)?;
        std::fs::create_dir_all(&self.debug_output_dir)?;
        Ok(())
    }
}

impl Default for PathConfig {
    fn default() -> Self {
        Self::new()
    }
}

/// Port configuration for network-based adapters
#[derive(Debug, Clone)]
pub struct PortConfig {
    /// Port for JavaScript debugger (vscode-js-debug)
    pub js_debug_port: u16,
}

impl PortConfig {
    pub fn new() -> Self {
        Self {
            js_debug_port: 8123,
        }
    }

}

impl Default for PortConfig {
    fn default() -> Self {
        Self::new()
    }
}

/// Adapter-specific configuration
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AdapterConfig {
    /// LLDB debugger configuration
    pub lldb: LldbConfig,
    /// Delve (Go debugger) configuration
    pub delve: DelveConfig,
    /// JavaScript debugger configuration
    pub js_debug: JsDebugConfig,
    /// Debugpy (Python debugger) configuration
    pub debugpy: DebugpyConfig,
}

impl AdapterConfig {
    pub fn new() -> Self {
        Self {
            lldb: LldbConfig::default(),
            delve: DelveConfig::default(),
            js_debug: JsDebugConfig::default(),
            debugpy: DebugpyConfig::default(),
        }
    }
}

impl Default for AdapterConfig {
    fn default() -> Self {
        Self::new()
    }
}

/// LLDB debugger configuration
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct LldbConfig {
    /// Binary name or path
    pub binary_name: &'static str,
    /// Command line arguments
    pub args: Vec<&'static str>,
    /// Search paths for the binary
    pub search_paths: Vec<&'static str>,
    /// Xcode-specific paths (macOS)
    pub xcode_paths: Vec<&'static str>,
    /// Installation command
    pub install_command: &'static str,
}

impl Default for LldbConfig {
    fn default() -> Self {
        Self {
            binary_name: "lldb-dap",
            args: vec!["--adapter"],
            search_paths: vec!["lldb-dap", "lldb", "/usr/bin/lldb-dap", "/usr/local/bin/lldb-dap"],
            xcode_paths: vec![
                "/Library/Developer/CommandLineTools/usr/bin/lldb-dap",
                "/Applications/Xcode.app/Contents/Developer/usr/bin/lldb-dap",
            ],
            install_command: "xcode-select --install",
        }
    }
}

/// Delve (Go debugger) configuration
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct DelveConfig {
    /// Binary name or path
    pub binary_name: &'static str,
    /// Command line arguments for DAP mode
    pub dap_args: Vec<&'static str>,
    /// Search paths for the binary
    pub search_paths: Vec<&'static str>,
    /// Installation command
    pub install_command: &'static str,
    /// Default output path pattern for debug binary
    pub debug_output_name: &'static str,
}

impl Default for DelveConfig {
    fn default() -> Self {
        Self {
            binary_name: "dlv",
            dap_args: vec!["dap", "--listen", "--check-go-version=false"],
            search_paths: vec![
                "dlv",
                "/usr/local/bin/dlv",
                "/opt/homebrew/bin/dlv",
                "~/go/bin/dlv",
            ],
            install_command: "go install github.com/go-delve/delve/cmd/dlv@latest",
            debug_output_name: "__debug",
        }
    }
}

/// JavaScript debugger (vscode-js-debug) configuration
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct JsDebugConfig {
    /// Repository URL for releases
    pub github_repo: &'static str,
    /// Cache subdirectory name
    pub cache_subdir: &'static str,
    /// Debug server script path within cache
    pub debug_server_path: &'static str,
    /// Adapter ID for DAP
    pub adapter_id: &'static str,
    /// Default Node.js arguments to run the server
    pub node_args: Vec<&'static str>,
}

impl Default for JsDebugConfig {
    fn default() -> Self {
        Self {
            github_repo: "microsoft/vscode-js-debug",
            cache_subdir: "js-debug",
            debug_server_path: "src/dapDebugServer.js",
            adapter_id: "js-debug",
            node_args: vec![], // Dynamically set based on cache location
        }
    }
}

/// Debugpy (Python debugger) configuration
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct DebugpyConfig {
    /// Python binary name
    pub python_binary: &'static str,
    /// Module name for debugpy
    pub module_name: &'static str,
    /// Adapter arguments
    pub adapter_args: Vec<&'static str>,
    /// Installation command
    pub install_command: &'static str,
    /// Verification command
    pub verify_command: &'static str,
}

impl Default for DebugpyConfig {
    fn default() -> Self {
        Self {
            python_binary: "python3",
            module_name: "debugpy",
            adapter_args: vec!["-m", "debugpy.adapter"],
            install_command: "pip install debugpy",
            verify_command: "import debugpy; print(debugpy.__version__)",
        }
    }
}

/// Global configuration instance
#[derive(Debug, Clone)]
pub struct AppConfig {
    pub paths: PathConfig,
    pub ports: PortConfig,
    pub adapters: AdapterConfig,
}

impl AppConfig {
    pub fn new() -> Self {
        Self {
            paths: PathConfig::new(),
            ports: PortConfig::new(),
            adapters: AdapterConfig::new(),
        }
    }

    /// Ensure all configured directories exist
    pub fn create_directories(&self) -> std::io::Result<()> {
        self.paths.create_directories()
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self::new()
    }
}

// Global config instance using once_cell
use once_cell::sync::Lazy;

static GLOBAL_CONFIG: Lazy<AppConfig> = Lazy::new(|| AppConfig::new());

/// Get the global path configuration
pub fn get_paths() -> &'static PathConfig {
    &GLOBAL_CONFIG.paths
}

/// Get the global port configuration
pub fn get_ports() -> &'static PortConfig {
    &GLOBAL_CONFIG.ports
}

/// Get the global adapter configuration
pub fn get_adapters() -> &'static AdapterConfig {
    &GLOBAL_CONFIG.adapters
}
