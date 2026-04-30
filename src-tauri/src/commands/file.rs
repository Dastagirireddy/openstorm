//! File operation commands

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[derive(Debug, Serialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
    pub is_executable: bool,
    pub children: Option<Vec<FileInfo>>,
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

    #[cfg(unix)]
    let is_executable = !metadata.is_dir() && {
        let mode = metadata.permissions().mode();
        (mode & 0o111) != 0
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

/// Read a file as base64-encoded binary (for images and other binary files)
#[tauri::command]
pub fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(BASE64.encode(&bytes))
}

/// Get image metadata (dimensions, format, etc.)
#[derive(Debug, Serialize)]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub size: u64,
}

#[tauri::command]
pub fn get_image_metadata(path: String) -> Result<ImageMetadata, String> {
    let file_size = fs::metadata(&path)
        .map_err(|e| format!("Failed to get file size: {}", e))?
        .len();

    let img = image::open(&path)
        .map_err(|e| format!("Failed to open image: {}", e))?;

    let width = img.width();
    let height = img.height();
    let format = format!("{:?}", img.color());

    Ok(ImageMetadata {
        width,
        height,
        format,
        size: file_size,
    })
}
