/// Process spawning abstraction for testability and dependency inversion
///
/// This trait allows us to mock process operations in tests while
/// using the real implementation in production.

use std::io;
use std::process::{Child, Command, Stdio};

/// Result of spawning a process
pub struct ProcessHandle {
    pub child: Child,
}

/// Trait for process spawning operations
pub trait ProcessSpawner: Send + Sync {
    /// Spawn a new process with the given command and arguments
    fn spawn(
        &self,
        command: &str,
        args: &[&str],
        stdin: Stdio,
        stdout: Stdio,
        stderr: Stdio,
    ) -> io::Result<ProcessHandle>;

    /// Spawn a process that inherits the parent's stdio (for running commands)
    fn spawn_inherit_stdio(&self, command: &str, args: &[&str]) -> io::Result<Child>;
}

/// Default implementation using std::process::Command
#[derive(Debug, Clone, Copy)]
pub struct StdProcessSpawner;

impl ProcessSpawner for StdProcessSpawner {
    fn spawn(
        &self,
        command: &str,
        args: &[&str],
        stdin: Stdio,
        stdout: Stdio,
        stderr: Stdio,
    ) -> io::Result<ProcessHandle> {
        let child = Command::new(command)
            .args(args)
            .stdin(stdin)
            .stdout(stdout)
            .stderr(stderr)
            .spawn()?;
        Ok(ProcessHandle { child })
    }

    fn spawn_inherit_stdio(&self, command: &str, args: &[&str]) -> io::Result<Child> {
        Command::new(command)
            .args(args)
            .spawn()
    }
}
