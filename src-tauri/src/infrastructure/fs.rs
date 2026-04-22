/// File system abstraction for testability and dependency inversion
///
/// This trait allows us to mock file system operations in tests while
/// using the real implementation in production.

use std::io;
use std::path::{Path, PathBuf};

/// Trait for file system operations
pub trait FileSystem: Send + Sync {
    /// Check if a path exists
    fn exists(&self, path: &Path) -> bool;

    /// Check if a path is a file
    fn is_file(&self, path: &Path) -> bool;

    /// Check if a path is a directory
    fn is_dir(&self, path: &Path) -> bool;

    /// Read a file as a string
    fn read_to_string(&self, path: &Path) -> io::Result<String>;

    /// Read a file as bytes
    fn read(&self, path: &Path) -> io::Result<Vec<u8>>;

    /// Write bytes to a file
    fn write(&self, path: &Path, contents: &[u8]) -> io::Result<()>;

    /// Write string to a file
    fn write_string(&self, path: &Path, contents: &str) -> io::Result<()>;

    /// Create a directory and all parent directories
    fn create_dir_all(&self, path: &Path) -> io::Result<()>;

    /// Remove a file
    fn remove_file(&self, path: &Path) -> io::Result<()>;

    /// Remove a directory and all contents
    fn remove_dir_all(&self, path: &Path) -> io::Result<()>;

    /// Read directory entries
    fn read_dir(&self, path: &Path) -> io::Result<Vec<PathBuf>>;

    /// Copy a file
    fn copy(&self, from: &Path, to: &Path) -> io::Result<u64>;

    /// Rename a file or directory
    fn rename(&self, from: &Path, to: &Path) -> io::Result<()>;

    /// Get the canonical (absolute) path
    fn canonicalize(&self, path: &Path) -> io::Result<PathBuf>;
}

/// Default implementation using std::fs
#[derive(Debug, Clone, Copy)]
pub struct StdFileSystem;

impl FileSystem for StdFileSystem {
    fn exists(&self, path: &Path) -> bool {
        path.exists()
    }

    fn is_file(&self, path: &Path) -> bool {
        path.is_file()
    }

    fn is_dir(&self, path: &Path) -> bool {
        path.is_dir()
    }

    fn read_to_string(&self, path: &Path) -> io::Result<String> {
        std::fs::read_to_string(path)
    }

    fn read(&self, path: &Path) -> io::Result<Vec<u8>> {
        std::fs::read(path)
    }

    fn write(&self, path: &Path, contents: &[u8]) -> io::Result<()> {
        std::fs::write(path, contents)
    }

    fn write_string(&self, path: &Path, contents: &str) -> io::Result<()> {
        std::fs::write(path, contents)
    }

    fn create_dir_all(&self, path: &Path) -> io::Result<()> {
        std::fs::create_dir_all(path)
    }

    fn remove_file(&self, path: &Path) -> io::Result<()> {
        std::fs::remove_file(path)
    }

    fn remove_dir_all(&self, path: &Path) -> io::Result<()> {
        std::fs::remove_dir_all(path)
    }

    fn read_dir(&self, path: &Path) -> io::Result<Vec<PathBuf>> {
        std::fs::read_dir(path)?
            .map(|entry| entry.map(|e| e.path()))
            .collect()
    }

    fn copy(&self, from: &Path, to: &Path) -> io::Result<u64> {
        std::fs::copy(from, to)
    }

    fn rename(&self, from: &Path, to: &Path) -> io::Result<()> {
        std::fs::rename(from, to)
    }

    fn canonicalize(&self, path: &Path) -> io::Result<PathBuf> {
        std::fs::canonicalize(path)
    }
}
