// LSP Server Installer - Downloads language servers directly from GitHub/releases
// No dependency on npm, rustup, go, etc.

use serde::Serialize;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use tokio_stream::StreamExt;

/// LSP Server download configuration
#[derive(Debug, Clone)]
pub struct LspServerConfig {
    pub language_id: String,
    pub server_name: String,
    pub github_repo: Option<String>,
    pub npm_package: Option<String>,
    pub binary_name: String,
    pub extract_binary: Option<String>, // Path inside archive to extract
    pub install_via_go_tool: bool,      // Use `go install` for installation (e.g., gopls)
}

/// Progress callback type
pub type ProgressCallback = Box<dyn Fn(u64, u64)>;

/// Get the LSP server configuration for a language
pub fn get_server_config(language_id: &str) -> Option<LspServerConfig> {
    match language_id {
        "rust" => Some(LspServerConfig {
            language_id: "rust".to_string(),
            server_name: "rust-analyzer".to_string(),
            github_repo: Some("rust-lang/rust-analyzer".to_string()),
            npm_package: None,
            binary_name: "rust-analyzer".to_string(),
            extract_binary: Some("rust-analyzer".to_string()),
            install_via_go_tool: false,
        }),
        "typescript" | "javascript" => Some(LspServerConfig {
            language_id: language_id.to_string(),
            server_name: "typescript-language-server".to_string(),
            github_repo: None,
            npm_package: Some("typescript-language-server".to_string()),
            binary_name: "typescript-language-server".to_string(),
            extract_binary: Some("node_modules/typescript-language-server/lib/cli.js".to_string()),
            install_via_go_tool: false,
        }),
        "python" => Some(LspServerConfig {
            language_id: "python".to_string(),
            server_name: "pyright".to_string(),
            github_repo: None,
            npm_package: Some("pyright".to_string()),
            binary_name: "pyright".to_string(),
            extract_binary: None, // npm install handles this
            install_via_go_tool: false,
        }),
        "go" => Some(LspServerConfig {
            language_id: "go".to_string(),
            server_name: "gopls".to_string(),
            github_repo: None,
            npm_package: None,
            binary_name: "gopls".to_string(),
            extract_binary: None,
            // gopls doesn't provide pre-built binaries, use go install
            install_via_go_tool: true,
        }),
        "cpp" | "c" => Some(LspServerConfig {
            language_id: "cpp".to_string(),
            server_name: "clangd".to_string(),
            github_repo: None, // LLVM is too large, use system package
            npm_package: None,
            binary_name: "clangd".to_string(),
            extract_binary: None,
            install_via_go_tool: false,
        }),
        _ => None,
    }
}

/// Get the cache directory for LSP servers
pub fn get_lsp_cache_dir() -> PathBuf {
    dirs::home_dir()
        .map(|mut p| {
            p.push(".openstorm");
            p.push("lsp-servers");
            p
        })
        .unwrap_or_else(|| PathBuf::from(".openstorm/lsp-servers"))
}

/// Check if a server is installed in cache
pub fn is_server_installed_cached(config: &LspServerConfig) -> bool {
    let cache_dir = get_lsp_cache_dir();
    let binary_path = cache_dir.join(&config.binary_name);

    if !binary_path.exists() {
        return false;
    }

    // For Node.js wrapper scripts, just check existence
    if config.npm_package.is_some() {
        return true;
    }

    // For Go binaries (gopls), just check existence since --version may not work
    if config.install_via_go_tool {
        return true;
    }

    // Try to run --version to verify it works for other native binaries
    Command::new(&binary_path)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Check if a server is installed (by name in PATH)
pub fn is_server_installed(server_name: &str) -> bool {
    Command::new(server_name)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Get the installed binary path
pub fn get_binary_path(config: &LspServerConfig) -> PathBuf {
    let cache_dir = get_lsp_cache_dir();
    cache_dir.join(&config.binary_name)
}

/// Download a file from URL with progress tracking
pub async fn download_file(
    url: &str,
    dest: &Path,
    on_progress: Arc<dyn Fn(u64, u64) + Send + Sync + 'static>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {}", e))?;

    let total_size = response
        .content_length()
        .ok_or("Content-Length not available")?;

    let mut file = File::create(dest)
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream
        .next()
        .await
        .transpose()
        .map_err(|e| format!("Download error: {}", e))?
    {
        file.write_all(&chunk)
            .map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;
        on_progress(downloaded, total_size);
    }

    Ok(())
}

/// Install an LSP server
pub async fn install_server<F>(
    language_id: &str,
    on_progress: F,
) -> Result<String, String>
where
    F: Fn(InstallProgress) + Send + Sync + 'static,
{
    let config = get_server_config(language_id)
        .ok_or_else(|| format!("No LSP server configured for: {}", language_id))?;

    let cache_dir = get_lsp_cache_dir();
    fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache directory: {}", e))?;

    let on_progress = Arc::new(on_progress);

    on_progress(InstallProgress {
        stage: "Starting download...".to_string(),
        downloaded: 0,
        total: 0,
        percentage: 0.0,
    });

    // Handle npm-based servers (typescript-language-server, pyright)
    if let Some(npm_package) = &config.npm_package {
        return install_npm_package(npm_package, &config.binary_name, &cache_dir, on_progress.clone()).await;
    }

    // Handle Go-based servers (gopls)
    if config.install_via_go_tool {
        return install_via_go_tool(&config, &cache_dir, on_progress.clone()).await;
    }

    // Handle GitHub releases
    if let Some(repo) = &config.github_repo {
        return download_from_github(repo, &config, &cache_dir, on_progress.clone()).await;
    }

    Err(format!(
        "No installation method available for {}",
        config.server_name
    ))
}

/// Install via Go toolchain (for gopls and other Go LSP servers)
async fn install_via_go_tool(
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
    let go_check = Command::new("go")
        .arg("version")
        .output();

    match go_check {
        Ok(output) if output.status.success() => {
            eprintln!("[LSP Installer] Go is installed: {}", String::from_utf8_lossy(&output.stdout).trim());
        }
        Ok(output) => {
            return Err(format!("Go is installed but returned error: {}", String::from_utf8_lossy(&output.stderr)));
        }
        Err(_) => {
            return Err("Go is not installed. Please install Go from https://go.dev/dl/ to use gopls.".to_string());
        }
    }

    fs::create_dir_all(cache_dir)
        .map_err(|e| format!("Failed to create cache dir: {}", e))?;

    // gopls package path
    let package = "golang.org/x/tools/gopls@latest";

    eprintln!("[LSP Installer] Running: go install {}", package);

    let output = Command::new("go")
        .args(["install", package])
        .output()
        .map_err(|e| format!("Failed to run go install: {}", e))?;

    eprintln!("[LSP Installer] go install stdout: {}", String::from_utf8_lossy(&output.stdout));
    eprintln!("[LSP Installer] go install stderr: {}", String::from_utf8_lossy(&output.stderr));

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

    // Get GOBIN or GOPATH to find where the binary was installed
    let gobin_output = Command::new("go")
        .args(["env", "GOBIN"])
        .output()
        .map_err(|e| format!("Failed to run go env: {}", e))?;

    let gobin = String::from_utf8_lossy(&gobin_output.stdout).trim().to_string();

    let source_binary = if !gobin.is_empty() {
        PathBuf::from(gobin).join(&config.binary_name)
    } else {
        // Fallback to GOPATH/bin
        let gopath_output = Command::new("go")
            .args(["env", "GOPATH"])
            .output()
            .map_err(|e| format!("Failed to run go env: {}", e))?;
        let gopath = String::from_utf8_lossy(&gopath_output.stdout).trim().to_string();
        PathBuf::from(gopath).join("bin").join(&config.binary_name)
    };

    if !source_binary.exists() {
        return Err(format!("gopls binary not found at {:?}", source_binary));
    }

    eprintln!("[LSP Installer] Found binary at: {:?}", source_binary);

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

/// Install an npm package
async fn install_npm_package(
    package: &str,
    binary_name: &str,
    cache_dir: &Path,
    on_progress: Arc<dyn Fn(InstallProgress) + Send + Sync + 'static>,
) -> Result<String, String> {
    on_progress(InstallProgress {
        stage: format!("Installing {} via npm...", package),
        downloaded: 0,
        total: 0,
        percentage: 0.0,
    });

    // Create npm packages directory
    let npm_dir = cache_dir.join("npm-packages");
    fs::create_dir_all(&npm_dir)
        .map_err(|e| format!("Failed to create npm dir: {}", e))?;

    // Run npm install - include typescript for typescript-language-server
    let npm_dir_str = npm_dir.to_string_lossy().to_string();
    let mut args = vec!["install", package, "--prefix", npm_dir_str.as_str()];
    if package == "typescript-language-server" {
        // typescript-language-server requires typescript as a peer dependency
        args.push("typescript");
    }
    eprintln!("[LSP Installer] Running: npm {} args: {:?}", args[0], args);

    let output = Command::new("npm")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run npm: {}", e))?;

    eprintln!("[LSP Installer] npm stdout: {}", String::from_utf8_lossy(&output.stdout));
    eprintln!("[LSP Installer] npm stderr: {}", String::from_utf8_lossy(&output.stderr));

    if !output.status.success() {
        return Err(format!(
            "npm install failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    on_progress(InstallProgress {
        stage: "Extracting binary...".to_string(),
        downloaded: 50,
        total: 100,
        percentage: 50.0,
    });

    // Find and copy the binary
    let source_binary = match package {
        "typescript-language-server" => {
            // Try multiple possible paths
            let path1 = npm_dir.join("node_modules/typescript-language-server/lib/cli.mjs");
            let path2 = npm_dir.join("node_modules/typescript-language-server/lib/cli.js");
            let path3 = npm_dir.join("node_modules/typescript-language-server/bin/typescript-language-server");

            path1.exists().then(|| path1)
                .or_else(|| path2.exists().then(|| path2))
                .or_else(|| path3.exists().then(|| path3))
                .ok_or_else(|| "typescript-language-server binary not found".to_string())?
        }
        "pyright" => {
            let path1 = npm_dir.join("node_modules/pyright/index.js");
            let path2 = npm_dir.join("node_modules/pyright/langserver.index.js");

            path1.exists().then(|| path1)
                .or_else(|| path2.exists().then(|| path2))
                .ok_or_else(|| "pyright binary not found".to_string())?
        }
        _ => return Err(format!("Unknown npm package: {}", package)),
    };

    eprintln!("[LSP Installer] Found binary at: {:?}", source_binary);

    // Create a wrapper script for the binary
    let dest_binary = cache_dir.join(binary_name);

    // For Node.js binaries, create a wrapper script
    let wrapper_script = if cfg!(unix) {
        if package == "typescript-language-server" {
            format!(
                r#"#!/bin/sh
exec node "{}" --stdio "$@"
"#,
                source_binary.display()
            )
        } else {
            format!(
                r#"#!/bin/sh
exec node "{}" "$@"
"#,
                source_binary.display()
            )
        }
    } else {
        if package == "typescript-language-server" {
            format!(
                r#"@echo off
node "{}" --stdio %*
"#,
                source_binary.display()
            )
        } else {
            format!(
                r#"@echo off
node "{}" %*
"#,
                source_binary.display()
            )
        }
    };

    fs::write(&dest_binary, wrapper_script)
        .map_err(|e| format!("Failed to write wrapper: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&dest_binary, fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    // Keep node_modules in cache directory - don't clean up temp dir
    // The binary wrapper references files in this directory
    eprintln!("[LSP Installer] Keeping node_modules at: {:?}", npm_dir);

    on_progress(InstallProgress {
        stage: "Installation complete!".to_string(),
        downloaded: 100,
        total: 100,
        percentage: 100.0,
    });

    Ok(format!("{} installed successfully", package))
}

/// Download from GitHub releases
async fn download_from_github(
    repo: &str,
    config: &LspServerConfig,
    cache_dir: &Path,
    on_progress: Arc<dyn Fn(InstallProgress) + Send + Sync + 'static>,
) -> Result<String, String> {

    on_progress(InstallProgress {
        stage: format!("Fetching latest release for {}...", repo),
        downloaded: 0,
        total: 0,
        percentage: 0.0,
    });

    // Get latest release info
    let client = reqwest::Client::new();
    let release_url = format!("https://api.github.com/repos/{}/releases/latest", repo);
    let release: serde_json::Value = client
        .get(&release_url)
        .header("User-Agent", "OpenStorm-LSP-Installer")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch release info: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse release JSON: {}", e))?;

    let tag_name = release["tag_name"]
        .as_str()
        .ok_or("No tag_name in release")?;

    on_progress(InstallProgress {
        stage: format!("Downloading {} {}...", config.server_name, tag_name),
        downloaded: 0,
        total: 0,
        percentage: 0.0,
    });

    // Determine asset name based on platform
    let asset_name = get_github_asset_name(repo, &config.server_name);

    // Find the asset in the release
    let assets = release["assets"]
        .as_array()
        .ok_or("No assets in release")?;

    let asset = assets
        .iter()
        .find(|a| a["name"].as_str() == Some(&asset_name))
        .ok_or_else(|| format!("Asset not found: {}", asset_name))?;

    let download_url = asset["browser_download_url"]
        .as_str()
        .ok_or("No download URL in asset")?;

    // Download the asset
    let temp_file = cache_dir.join(format!("{}.tmp", config.server_name));
    let on_progress_download = on_progress.clone();
    download_file(download_url, &temp_file, Arc::new(move |downloaded, total| {
        let pct = if total > 0 {
            (downloaded as f64 / total as f64) * 100.0
        } else {
            0.0
        };
        on_progress_download(InstallProgress {
            stage: format!("Downloading... {:.1}%", pct),
            downloaded,
            total,
            percentage: pct,
        });
    }))
    .await?;

    on_progress(InstallProgress {
        stage: "Extracting...".to_string(),
        downloaded: 50,
        total: 100,
        percentage: 50.0,
    });

    // Extract the binary
    let extracted = extract_archive(&temp_file, cache_dir, &config.binary_name, &config).await?;

    // Clean up temp file
    let _ = fs::remove_file(&temp_file);

    // Set executable permissions on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let binary_path = cache_dir.join(&config.binary_name);
        if binary_path.exists() {
            fs::set_permissions(&binary_path, fs::Permissions::from_mode(0o755))
                .map_err(|e| format!("Failed to set permissions: {}", e))?;
        }
    }

    on_progress(InstallProgress {
        stage: "Installation complete!".to_string(),
        downloaded: 100,
        total: 100,
        percentage: 100.0,
    });

    Ok(format!(
        "{} {} installed successfully",
        config.server_name, tag_name
    ))
}

/// Get the asset name for GitHub release based on platform
fn get_github_asset_name(repo: &str, server_name: &str) -> String {
    let os = if cfg!(target_os = "macos") {
        "apple-darwin"
    } else if cfg!(target_os = "linux") {
        "unknown-linux-gnu"
    } else if cfg!(target_os = "windows") {
        "pc-windows-msvc"
    } else {
        "unknown"
    };

    let arch = if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "unknown"
    };

    // Special handling for specific servers
    match repo {
        "rust-lang/rust-analyzer" => {
            format!("rust-analyzer-{}-{}.gz", arch, os)
        }
        "golang/tools" => {
            // gopls releases use different naming
            format!("gopls-{}-{}.tar.gz", arch, os)
        }
        _ => {
            format!("{}-{}-{}.tar.gz", server_name, arch, os)
        }
    }
}

/// Extract an archive and get the binary
async fn extract_archive(
    archive: &Path,
    dest_dir: &Path,
    binary_name: &str,
    config: &LspServerConfig,
) -> Result<PathBuf, String> {
    let file_name = archive.file_name().unwrap_or_default().to_string_lossy();

    if file_name.ends_with(".gz") || file_name.ends_with(".tar.gz") {
        extract_tar_gz(archive, dest_dir, binary_name, config).await
    } else if file_name.ends_with(".zip") {
        extract_zip(archive, dest_dir, binary_name, config).await
    } else {
        // Assume it's a raw binary
        let dest = dest_dir.join(binary_name);
        fs::copy(archive, &dest)
            .map_err(|e| format!("Failed to copy binary: {}", e))?;
        Ok(dest)
    }
}

/// Extract a tar.gz archive
async fn extract_tar_gz(
    archive: &Path,
    dest_dir: &Path,
    binary_name: &str,
    config: &LspServerConfig,
) -> Result<PathBuf, String> {
    let file = File::open(archive).map_err(|e| format!("Failed to open archive: {}", e))?;
    let decoder = flate2::read::GzDecoder::new(file);
    let mut tar = tar::Archive::new(decoder);

    // If we know the binary path inside the archive, extract just that
    if let Some(ref extract_path) = config.extract_binary {
        let entries = tar.entries().map_err(|e| format!("Failed to read tar: {}", e))?;

        for entry in entries {
            let mut entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry
                .path()
                .map_err(|e| format!("Failed to get path: {}", e))?;

            if path.to_string_lossy().contains(extract_path) {
                let dest = dest_dir.join(binary_name);
                entry
                    .unpack(&dest)
                    .map_err(|e| format!("Failed to extract: {}", e))?;
                return Ok(dest);
            }
        }
    }

    // Otherwise, extract all and look for the binary
    tar.unpack(dest_dir)
        .map_err(|e| format!("Failed to unpack: {}", e))?;

    Ok(dest_dir.join(binary_name))
}

/// Extract a zip archive
async fn extract_zip(
    archive: &Path,
    dest_dir: &Path,
    binary_name: &str,
    config: &LspServerConfig,
) -> Result<PathBuf, String> {
    let file = File::open(archive).map_err(|e| format!("Failed to open zip: {}", e))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {}", e))?;

    for i in 0..zip.len() {
        let mut file = zip.by_index(i).map_err(|e| format!("Failed to get file: {}", e))?;
        let name = file.name().to_string();

        if let Some(ref extract_path) = config.extract_binary {
            if name.contains(extract_path) {
                let dest = dest_dir.join(binary_name);
                let mut outfile =
                    File::create(&dest).map_err(|e| format!("Failed to create file: {}", e))?;
                io::copy(&mut file, &mut outfile)
                    .map_err(|e| format!("Failed to extract: {}", e))?;
                return Ok(dest);
            }
        }
    }

    Err(format!("Binary not found in archive"))
}

/// Progress information for the installer
#[derive(Debug, Clone, Serialize)]
pub struct InstallProgress {
    pub stage: String,
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}
