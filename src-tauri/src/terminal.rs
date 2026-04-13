use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, AppHandle};

pub struct Terminal {
    #[allow(dead_code)]
    pub id: u32,
    writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
    #[allow(dead_code)]
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    #[allow(dead_code)]
    master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
}

pub struct PtyManager {
    pty_system: NativePtySystem,
    terminals: Arc<Mutex<std::collections::HashMap<u32, Terminal>>>,
    next_id: Arc<Mutex<u32>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        PtyManager {
            pty_system: NativePtySystem::default(),
            terminals: Arc::new(Mutex::new(std::collections::HashMap::new())),
            next_id: Arc::new(Mutex::new(1)),
            app_handle: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        let mut app_handle = self.app_handle.lock().unwrap();
        *app_handle = Some(handle);
    }

    pub fn create_terminal(&self, cwd: Option<String>) -> Result<u32, String> {
        let id = {
            let mut next_id = self.next_id.lock().unwrap();
            let id = *next_id;
            *next_id += 1;
            id
        };

        let cwd = cwd.unwrap_or_else(|| std::env::current_dir().unwrap().to_string_lossy().to_string());

        // Detect user's default shell from $SHELL env var, fallback to platform default
        let shell = std::env::var("SHELL")
            .ok()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| {
                // Platform fallbacks
                #[cfg(target_os = "macos")]
                return "/bin/zsh".to_string();
                #[cfg(not(target_os = "macos"))]
                return "/bin/sh".to_string();
            });

        let mut cmd = CommandBuilder::new(shell.clone());
        cmd.cwd(cwd.clone());

        // Set terminal-specific environment variables
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        // Inherit important environment variables from parent process
        let inherit_vars = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "EDITOR", "PAGER"];
        for key in inherit_vars {
            if let Ok(value) = std::env::var(key) {
                cmd.env(key, value);
            }
        }

        let pair = self
            .pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open pty: {}", e))?;

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get writer: {}", e))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;

        let master = pair.master;
        let master_arc = Arc::new(Mutex::new(master));
        let child_arc = Arc::new(Mutex::new(child));
        let writer_arc = Arc::new(Mutex::new(writer));

        let terminal = Terminal {
            id,
            writer: writer_arc,
            child: child_arc,
            master: master_arc.clone(),
        };

        {
            let mut terminals = self.terminals.lock().unwrap();
            terminals.insert(id, terminal);
        }

        // Spawn reader task to capture output and emit events
        let terminals = self.terminals.clone();
        let app_handle_opt = self.app_handle.lock().unwrap().clone();
        let terminal_id = id;

        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 4096];
            let exit_emitted = false;

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF - process exited
                    Ok(n) => {
                        let output = String::from_utf8_lossy(&buf[..n]).to_string();

                        // Emit output event to frontend
                        if let Some(ref handle) = app_handle_opt {
                            let _ = handle.emit("terminal-output", serde_json::json!({
                                "id": terminal_id,
                                "data": output
                            }));
                        }

                        // Check if terminal was closed by user
                        let term = terminals.lock().unwrap();
                        if !term.contains_key(&terminal_id) {
                            break;
                        }
                    }
                    Err(e) => {
                        // Emit error event
                        if let Some(ref handle) = app_handle_opt {
                            let _ = handle.emit("terminal-error", serde_json::json!({
                                "id": terminal_id,
                                "error": e.to_string()
                            }));
                        }
                        break;
                    }
                }
            }

            // Emit exit event when process ends
            if !exit_emitted {
                if let Some(ref handle) = app_handle_opt {
                    let _ = handle.emit("terminal-exit", serde_json::json!({
                        "id": terminal_id
                    }));
                }
            }
        });

        Ok(id)
    }

    pub fn write(&self, id: u32, data: String) -> Result<(), String> {
        let terminals = self.terminals.lock().unwrap();
        if let Some(terminal) = terminals.get(&id) {
            let mut writer = terminal.writer.lock().unwrap();
            writer
                .write_all(data.as_bytes())
                .map_err(|e| format!("Failed to write: {}", e))?;
            writer
                .flush()
                .map_err(|e| format!("Failed to flush: {}", e))?;
            Ok(())
        } else {
            Err(format!("Terminal {} not found", id))
        }
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<(), String> {
        let terminals = self.terminals.lock().unwrap();
        if let Some(terminal) = terminals.get(&id) {
            let master = terminal.master.lock().unwrap();
            master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| format!("Failed to resize pty: {}", e))?;
            Ok(())
        } else {
            Err(format!("Terminal {} not found", id))
        }
    }

    pub fn close(&self, id: u32) -> Result<(), String> {
        let mut terminals = self.terminals.lock().unwrap();
        if let Some(terminal) = terminals.remove(&id) {
            // Kill the child process to clean up resources
            let mut child = terminal.child.lock().unwrap();
            child.kill().map_err(|e| format!("Failed to kill process: {}", e))?;
        }
        Ok(())
    }
}

// Tauri commands
#[tauri::command]
pub fn terminal_create(manager: tauri::State<PtyManager>, cwd: Option<String>) -> Result<u32, String> {
    manager.create_terminal(cwd)
}

#[tauri::command]
pub fn terminal_write(manager: tauri::State<PtyManager>, id: u32, data: String) -> Result<(), String> {
    manager.write(id, data)
}

#[tauri::command]
pub fn terminal_resize(manager: tauri::State<PtyManager>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    manager.resize(id, cols, rows)
}

#[tauri::command]
pub fn terminal_close(manager: tauri::State<PtyManager>, id: u32) -> Result<(), String> {
    manager.close(id)
}
