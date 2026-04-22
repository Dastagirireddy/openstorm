/// LSP Installer - Downloads and installs language servers
///
/// This module handles the installation of LSP servers from various sources:
/// - GitHub releases (pre-built binaries)
/// - npm packages (Node.js-based servers)
/// - Go toolchain (go install for servers like gopls)

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Arc;

use tokio_stream::StreamExt;

use super::config::{get_lsp_cache_dir, LspServerConfig};

/// Progress tracking for installation
#[derive(Clone, Debug)]
pub struct InstallProgress {
    pub stage: String,
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
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

    // Check if file is still gzip compressed (extraction failure recovery)
    if is_gzip_file(&binary_path) {
        if let Err(_) = repair_gzip_binary(&binary_path) {
            return false;
        }
    }

    // Try to run --version to verify it works for other native binaries
    std::process::Command::new(&binary_path)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Check if a file is gzip compressed by reading magic bytes
fn is_gzip_file(path: &Path) -> bool {
    if let Ok(mut file) = File::open(path) {
        let mut buf = [0u8; 2];
        if file.read_exact(&mut buf).is_ok() {
            return buf[0] == 0x1F && buf[1] == 0x8B;
        }
    }
    false
}

/// Repair a gzip-compressed binary by decompressing it in place
fn repair_gzip_binary(path: &Path) -> Result<(), String> {
    use flate2::read::GzDecoder;

    let file = File::open(path).map_err(|e| format!("Failed to open: {}", e))?;
    let mut decoder = GzDecoder::new(file);
    let mut decompressed = Vec::new();
    decoder
        .read_to_end(&mut decompressed)
        .map_err(|e| format!("Failed to decompress: {}", e))?;

    let mut outfile = File::create(path).map_err(|e| format!("Failed to create: {}", e))?;
    outfile
        .write_all(&decompressed)
        .map_err(|e| format!("Failed to write: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    Ok(())
}

/// Check if a server is installed (by name in PATH)
pub fn is_server_installed(server_name: &str) -> bool {
    std::process::Command::new(server_name)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
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
    let config = super::config::get_server_config(language_id)
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

    // Handle npm-based servers
    if let Some(npm_package) = &config.npm_package {
        return super::npm::install_npm_package(
            npm_package,
            &config.binary_name,
            &cache_dir,
            on_progress.clone(),
        )
        .await;
    }

    // Handle Go-based servers
    if config.install_via_go_tool {
        return super::go::install_via_go_tool(&config, &cache_dir, on_progress.clone()).await;
    }

    // Handle GitHub releases
    if let Some(repo) = &config.github_repo {
        return super::github::download_from_github(repo, &config, &cache_dir, on_progress.clone()).await;
    }

    Err(format!(
        "No installation method available for {}",
        config.server_name
    ))
}
