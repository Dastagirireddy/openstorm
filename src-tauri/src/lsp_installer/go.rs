/// Go Toolchain Installer
///
/// Installs LSP servers using `go install` (gopls).

use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::Arc;

use super::config::LspServerConfig;
use super::installer::InstallProgress;

/// Install via Go toolchain (for gopls and other Go LSP servers)
pub async fn install_via_go_tool(
    config: &LspServerConfig,
    cache_dir: &Path,
    on_progress: Arc<dyn Fn(InstallProgress) + Send + Sync + 'static>,
) -> Result<String, String> {
    on_progress(InstallProgress {
        stage: format!("Installing {} via go install...", config.server_name),
        downloaded: 0,
        total: 0,
        percentage: 0.0,
    });

    // Check if go is installed
    let go_check = Command::new("go").arg("version").output();

    match go_check {
        Ok(output) if output.status.success() => {}
        Ok(output) => {
            return Err(format!(
                "Go is installed but returned error: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        Err(_) => {
            return Err(
                "Go is not installed. Please install Go from https://go.dev/dl/ to use gopls."
                    .to_string(),
            );
        }
    }

    fs::create_dir_all(cache_dir)
        .map_err(|e| format!("Failed to create cache dir: {}", e))?;

    let package = "golang.org/x/tools/gopls@latest";

    let output = Command::new("go")
        .args(["install", package])
        .output()
        .map_err(|e| format!("Failed to run go install: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "go install failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    on_progress(InstallProgress {
        stage: "Finding installed binary...".to_string(),
        downloaded: 50,
        total: 100,
        percentage: 50.0,
    });

    let gobin_output = Command::new("go")
        .args(["env", "GOBIN"])
        .output()
        .map_err(|e| format!("Failed to run go env: {}", e))?;

    let gobin = String::from_utf8_lossy(&gobin_output.stdout).trim().to_string();

    let source_binary = if !gobin.is_empty() {
        std::path::PathBuf::from(gobin).join(&config.binary_name)
    } else {
        let gopath_output = Command::new("go")
            .args(["env", "GOPATH"])
            .output()
            .map_err(|e| format!("Failed to run go env: {}", e))?;
        let gopath = String::from_utf8_lossy(&gopath_output.stdout).trim().to_string();
        std::path::PathBuf::from(gopath).join("bin").join(&config.binary_name)
    };

    if !source_binary.exists() {
        return Err(format!("gopls binary not found at {:?}", source_binary));
    }

    // Copy binary to our cache directory
    let dest_binary = cache_dir.join(&config.binary_name);
    fs::copy(&source_binary, &dest_binary)
        .map_err(|e| format!("Failed to copy binary: {}", e))?;

    // Set executable permissions on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&dest_binary, fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    on_progress(InstallProgress {
        stage: "Installation complete!".to_string(),
        downloaded: 100,
        total: 100,
        percentage: 100.0,
    });

    Ok(format!("{} installed successfully", config.server_name))
}
