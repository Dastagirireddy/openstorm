/// Infrastructure layer - low-level abstractions for external dependencies
///
/// This module provides traits for file system, process spawning, and HTTP client
/// operations. This follows the Dependency Inversion Principle (DIP) by allowing
/// high-level modules to depend on abstractions rather than concrete implementations.
///
/// # Usage
///
/// Most code can use the default `Std*` implementations:
///
/// ```rust
/// use crate::infrastructure::{StdFileSystem, StdProcessSpawner};
///
/// let fs = StdFileSystem;
/// let spawner = StdProcessSpawner;
/// ```
///
/// For testing, you can provide mock implementations:
///
/// ```rust
/// struct MockFileSystem;
/// impl FileSystem for MockFileSystem {
///     fn exists(&self, path: &Path) -> bool { true }
///     // ... other methods
/// }
/// ```

mod fs;
mod process;
mod http;

pub use fs::{FileSystem, StdFileSystem};
pub use process::{ProcessHandle, ProcessSpawner, StdProcessSpawner};
pub use http::{HttpClient, HttpResponse, StdHttpClient};
