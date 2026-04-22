/// GitHub Release Installer
///
/// Downloads LSP servers from GitHub releases.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use super::config::LspServerConfig;
use super::installer::{download_file, InstallProgress};

/// Download from GitHub releases
pub async fn download_from_github(
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
    extract_archive(&temp_file, cache_dir, &config.binary_name, config).await?;

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

    match repo {
        "rust-lang/rust-analyzer" => format!("rust-analyzer-{}-{}.gz", arch, os),
        "golang/tools" => format!("gopls-{}-{}.tar.gz", arch, os),
        _ => format!("{}-{}-{}.tar.gz", server_name, arch, os),
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

    if file_name.ends_with(".tar.gz") {
        extract_tar_gz(archive, dest_dir, binary_name, config).await
    } else if file_name.ends_with(".gz") {
        extract_gzip(archive, dest_dir, binary_name).await
    } else if file_name.ends_with(".zip") {
        extract_zip(archive, dest_dir, binary_name, config).await
    } else {
        let dest = dest_dir.join(binary_name);
        fs::copy(archive, &dest)
            .map_err(|e| format!("Failed to copy binary: {}", e))?;
        Ok(dest)
    }
}

/// Extract a gzip-compressed file (plain .gz, not tar.gz)
async fn extract_gzip(
    archive: &Path,
    dest_dir: &Path,
    binary_name: &str,
) -> Result<PathBuf, String> {
    use flate2::read::GzDecoder;

    let file = File::open(archive).map_err(|e| format!("Failed to open archive: {}", e))?;
    let mut decoder = GzDecoder::new(file);
    let mut buffer = Vec::new();
    decoder
        .read_to_end(&mut buffer)
        .map_err(|e| format!("Failed to decompress: {}", e))?;

    let dest = dest_dir.join(binary_name);
    let mut outfile =
        File::create(&dest).map_err(|e| format!("Failed to create file: {}", e))?;
    outfile
        .write_all(&buffer)
        .map_err(|e| format!("Failed to write: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&dest, fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    Ok(dest)
}

/// Extract a tar.gz archive
async fn extract_tar_gz(
    archive: &Path,
    dest_dir: &Path,
    binary_name: &str,
    config: &LspServerConfig,
) -> Result<PathBuf, String> {
    use flate2::read::GzDecoder;
    use tar::Archive;

    let file = File::open(archive).map_err(|e| format!("Failed to open archive: {}", e))?;
    let decoder = GzDecoder::new(file);
    let mut archive = Archive::new(decoder);

    if let Some(extract_path) = &config.extract_binary {
        for entry in archive
            .entries()
            .map_err(|e| format!("Failed to read archive: {}", e))?
        {
            let mut entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path().map_err(|e| format!("Failed to get path: {}", e))?;

            if path.to_string_lossy().contains(extract_path.as_str()) {
                let dest = dest_dir.join(binary_name);
                let mut outfile =
                    File::create(&dest).map_err(|e| format!("Failed to create file: {}", e))?;
                std::io::copy(&mut entry, &mut outfile)
                    .map_err(|e| format!("Failed to extract: {}", e))?;

                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    fs::set_permissions(&dest, fs::Permissions::from_mode(0o755))
                        .map_err(|e| format!("Failed to set permissions: {}", e))?;
                }

                return Ok(dest);
            }
        }
        Err(format!("Binary not found in archive: {}", extract_path))
    } else {
        archive
            .unpack(dest_dir)
            .map_err(|e| format!("Failed to extract: {}", e))?;
        Ok(dest_dir.join(binary_name))
    }
}

/// Extract a zip archive
async fn extract_zip(
    archive: &Path,
    dest_dir: &Path,
    binary_name: &str,
    config: &LspServerConfig,
) -> Result<PathBuf, String> {
    use zip::read::ZipArchive;

    let file = File::open(archive).map_err(|e| format!("Failed to open archive: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read archive: {}", e))?;

    if let Some(extract_path) = &config.extract_binary {
        for i in 0..archive.len() {
            let mut entry =
                archive.by_index(i).map_err(|e| format!("Failed to get entry: {}", e))?;
            let name = entry.name();

            if name.contains(extract_path.as_str()) {
                let dest = dest_dir.join(binary_name);
                let mut outfile =
                    File::create(&dest).map_err(|e| format!("Failed to create file: {}", e))?;
                std::io::copy(&mut entry, &mut outfile)
                    .map_err(|e| format!("Failed to extract: {}", e))?;

                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    fs::set_permissions(&dest, fs::Permissions::from_mode(0o755))
                        .map_err(|e| format!("Failed to set permissions: {}", e))?;
                }

                return Ok(dest);
            }
        }
        Err(format!("Binary not found in archive: {}", extract_path))
    } else {
        archive
            .extract(dest_dir)
            .map_err(|e| format!("Failed to extract: {}", e))?;
        Ok(dest_dir.join(binary_name))
    }
}
