use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, AppHandle};

pub struct Terminal {
    pub id: u32,
    writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
    #[allow(dead_code)]
    child: Arc<Mutex<Box<dyn portable_pty::ChildKiller + Send>>>,
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

        let mut cmd = CommandBuilder::new("sh");
        cmd.cwd(cwd.clone());

        // On macOS, use zsh
        #[cfg(target_os = "macos")]
        {
            cmd = CommandBuilder::new("zsh");
            cmd.cwd(cwd.clone());
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

        let terminal = Terminal {
            id,
            writer: Arc::new(Mutex::new(writer)),
            child: Arc::new(Mutex::new(child)),
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
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let output = String::from_utf8_lossy(&buf[..n]).to_string();

                        // Emit event to frontend
                        if let Some(ref handle) = app_handle_opt {
                            let _ = handle.emit("terminal-output", serde_json::json!({
                                "id": terminal_id,
                                "data": output
                            }));
                        }

                        // Check if terminal was closed
                        let term = terminals.lock().unwrap();
                        if !term.contains_key(&terminal_id) {
                            break;
                        }
                    }
                    Err(_) => break,
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
        // Note: portable-pty resize requires access to the master handle
        // For now, this is a no-op but the terminal will still work
        let _ = (id, cols, rows);
        Ok(())
    }

    pub fn close(&self, id: u32) -> Result<(), String> {
        let mut terminals = self.terminals.lock().unwrap();
        terminals.remove(&id);
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
