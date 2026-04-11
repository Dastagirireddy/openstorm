use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

pub struct FileWatcher {
    watcher: Arc<Mutex<RecommendedWatcher>>,
    watched_path: Arc<Mutex<Option<PathBuf>>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
}

impl FileWatcher {
    pub fn new() -> Self {
        let app_handle = Arc::new(Mutex::new(None::<AppHandle>));
        let app_handle_clone = Arc::clone(&app_handle);

        let watcher = Arc::new(Mutex::new(
            RecommendedWatcher::new(
                move |event: notify::Result<notify::Event>| {
                    if let Ok(e) = event {
                        if let Some(ref handle) = *app_handle_clone.lock().unwrap() {
                            // Emit file change event to frontend
                            let paths: Vec<String> = e.paths.iter().filter_map(|p| p.to_str().map(|s| s.to_string())).collect();
                            let event_type = match e.kind {
                                EventKind::Create(_) => "create",
                                EventKind::Modify(_) => "modify",
                                EventKind::Remove(_) => "remove",
                                _ => "other",
                            };
                            let _ = handle.emit("file-change", serde_json::json!({
                                "paths": paths,
                                "type": event_type
                            }));
                        }
                    }
                },
                Config::default(),
            )
            .expect("Failed to create file watcher"),
        ));

        FileWatcher {
            watcher,
            watched_path: Arc::new(Mutex::new(None)),
            app_handle,
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        *self.app_handle.lock().unwrap() = Some(handle);
    }

    pub fn watch(&self, path: PathBuf) -> notify::Result<()> {
        if let Ok(mut watcher) = self.watcher.lock() {
            // Unwatch previous path if exists
            if let Ok(prev_path) = self.watched_path.lock() {
                if let Some(ref p) = *prev_path {
                    let _ = watcher.unwatch(p);
                }
            }

            // Watch new path
            let result = watcher.watch(&path, RecursiveMode::NonRecursive);
            if result.is_ok() {
                *self.watched_path.lock().unwrap() = Some(path);
            }
            result
        } else {
            Err(notify::Error::new(notify::ErrorKind::Generic("Failed to lock watcher".to_string())))
        }
    }
}

#[tauri::command]
pub fn start_watching(state: State<FileWatcher>, path: String) -> Result<(), String> {
    state.watch(PathBuf::from(path)).map_err(|e| e.to_string())
}
