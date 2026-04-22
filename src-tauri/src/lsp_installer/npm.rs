/// npm Package Installer
///
/// Installs LSP servers distributed via npm (typescript-language-server, pyright).

use std::fs;
use std::path::Path;
use std::sync::Arc;

use super::installer::InstallProgress;

/// Install an npm package
pub async fn install_npm_package(
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
        args.push("typescript");
    }

    let output = std::process::Command::new("npm")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run npm: {}", e))?;

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

    let source_binary = match package {
        "typescript-language-server" => {
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

    // Create a wrapper script for the binary
    let dest_binary = cache_dir.join(binary_name);

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

    on_progress(InstallProgress {
        stage: "Installation complete!".to_string(),
        downloaded: 100,
        total: 100,
        percentage: 100.0,
    });

    Ok(format!("{} installed successfully", package))
}
