/// Fallback formatting functions
///
/// These formatters are used when the LSP server is not available or fails.
/// They use command-line tools like rustfmt, gofmt, black, and clang-format.

use std::io::Write;
use std::process::{Command, Stdio};

/// Fallback: Format Rust code using rustfmt
pub fn format_with_rustfmt(content: &str, tab_width: u32) -> Result<String, String> {
    let mut child = Command::new("rustfmt")
        .arg("--emit")
        .arg("stdout")
        .arg("--config")
        .arg(format!("tab_spaces={}", tab_width))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn rustfmt: {}", e))?;

    let stdin = child.stdin.as_mut().ok_or("Failed to open rustfmt stdin")?;
    stdin.write_all(content.as_bytes()).map_err(|e| format!("Failed to write to rustfmt: {}", e))?;

    let output = child.wait_with_output().map_err(|e| format!("Failed to read rustfmt output: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format!("rustfmt failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}

/// Fallback: Format Go code using gofmt
pub fn format_with_gofmt(content: &str) -> Result<String, String> {
    let mut child = Command::new("gofmt")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn gofmt: {}", e))?;

    let stdin = child.stdin.as_mut().ok_or("Failed to open gofmt stdin")?;
    stdin.write_all(content.as_bytes()).map_err(|e| format!("Failed to write to gofmt: {}", e))?;

    let output = child.wait_with_output().map_err(|e| format!("Failed to read gofmt output: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format!("gofmt failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}

/// Fallback: Format Python code using black
pub fn format_with_black(content: &str, tab_width: u32) -> Result<String, String> {
    let mut child = Command::new("black")
        .arg("-")
        .arg("--line-length")
        .arg(tab_width.to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn black: {}", e))?;

    let stdin = child.stdin.as_mut().ok_or("Failed to open black stdin")?;
    stdin.write_all(content.as_bytes()).map_err(|e| format!("Failed to write to black: {}", e))?;

    let output = child.wait_with_output().map_err(|e| format!("Failed to read black output: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format!("black failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}

/// Fallback: Format C/C++ code using clang-format
pub fn format_with_clang_format(content: &str, tab_width: u32) -> Result<String, String> {
    let mut child = Command::new("clang-format")
        .arg(format!("-style={{BasedOnStyle: LLVM, IndentWidth: {}}}", tab_width))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn clang-format: {}", e))?;

    let stdin = child.stdin.as_mut().ok_or("Failed to open clang-format stdin")?;
    stdin.write_all(content.as_bytes()).map_err(|e| format!("Failed to write to clang-format: {}", e))?;

    let output = child.wait_with_output().map_err(|e| format!("Failed to read clang-format output: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format!("clang-format failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}
