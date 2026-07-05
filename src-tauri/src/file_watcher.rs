use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::graph::commands::GraphState;

pub struct FileWatcher {
    watcher: Arc<Mutex<RecommendedWatcher>>,
    watched_path: Arc<Mutex<Option<PathBuf>>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
}

/// Check if a path is a git repository
fn is_git_repository(path: &Path) -> bool {
    path.join(".git").exists()
}

/// Check if a file extension is supported by the graph extractors
fn is_graph_supported(ext: &str) -> bool {
    matches!(ext, "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go")
}

impl FileWatcher {
    pub fn new() -> Self {
        let app_handle = Arc::new(Mutex::new(None::<AppHandle>));
        let app_handle_clone = Arc::clone(&app_handle);
        let watched_path = Arc::new(Mutex::new(None::<PathBuf>));
        let _watched_path_for_closure = Arc::clone(&watched_path);

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

                            // Update graph for supported file changes
                            if let Some(graph_state) = handle.try_state::<GraphState>() {
                                let store_result = graph_state.store.lock();
                                let watcher_result = graph_state.watcher.lock();

                                if let (Ok(store_guard), Ok(watcher_guard)) = (&store_result, &watcher_result) {
                                    if let (Some(store), Some(graph_watcher)) = (store_guard.as_ref(), watcher_guard.as_ref()) {
                                        for path_str in &paths {
                                            let path = Path::new(path_str);

                                            // Skip non-supported files
                                            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                                            if !is_graph_supported(ext) {
                                                continue;
                                            }

                                            // Skip files in ignored directories
                                            if should_skip_path(path) {
                                                continue;
                                            }

                                            match e.kind {
                                                EventKind::Create(_) | EventKind::Modify(_) => {
                                                    if let Ok(content) = std::fs::read_to_string(path) {
                                                        if let Err(e) = graph_watcher.on_file_changed(store, path, &content) {
                                                            crate::log_warn!("Graph update failed for {}: {}", path_str, e);
                                                        }
                                                    }
                                                }
                                                EventKind::Remove(_) => {
                                                    if let Err(e) = graph_watcher.on_file_deleted(store, path) {
                                                        crate::log_warn!("Graph deletion failed for {}: {}", path_str, e);
                                                    }
                                                }
                                                _ => {}
                                            }
                                        }
                                    }
                                }
                            }

                            // Check if .git folder itself was created or removed (not contents inside it)
                            let mut git_folder_created = false;
                            let mut git_folder_removed = false;

                            for path in &paths {
                                let is_git_folder = path.ends_with("/.git") || path.ends_with("\\.git") || path == ".git";

                                if is_git_folder {
                                    if matches!(e.kind, EventKind::Create(_)) {
                                        git_folder_created = true;
                                    } else if matches!(e.kind, EventKind::Remove(_)) {
                                        git_folder_removed = true;
                                    }
                                }
                            }

                            // Emit git-repo-changed only when .git folder itself is created/removed
                            if git_folder_created || git_folder_removed {
                                let _ = handle.emit("git-repo-changed", serde_json::json!({
                                    "is_repository": git_folder_created
                                }));
                            }

                            // Emit git-refresh for any file changes so frontend re-checks git status
                            let _ = handle.emit("git-refresh", ());
                        }
                    }
                },
                Config::default().with_poll_interval(std::time::Duration::from_secs(2)),
            )
            .expect("Failed to create file watcher"),
        ));

        FileWatcher {
            watcher,
            watched_path,
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

            // Watch new path recursively to detect .git folder creation
            let result = watcher.watch(&path, RecursiveMode::Recursive);
            if result.is_ok() {
                *self.watched_path.lock().unwrap() = Some(path);
            }
            result
        } else {
            Err(notify::Error::new(notify::ErrorKind::Generic("Failed to lock watcher".to_string())))
        }
    }

    pub fn unwatch_current(&self) -> Result<(), String> {
        if let Ok(mut watcher) = self.watcher.lock() {
            // Get the path to unwatch, then drop the lock before updating
            let path_to_unwatch = {
                if let Ok(prev_path) = self.watched_path.lock() {
                    prev_path.clone()
                } else {
                    return Err("Failed to lock watched path".to_string());
                }
            };

            if let Some(ref p) = path_to_unwatch {
                watcher.unwatch(p).map_err(|e| e.to_string())?;
            }

            // Now update the watched path
            if let Ok(mut watched) = self.watched_path.lock() {
                *watched = None;
            }

            Ok(())
        } else {
            Err("Failed to lock watcher".to_string())
        }
    }
}

fn should_skip_path(path: &Path) -> bool {
    let skip_dirs = [".git", ".hg", ".svn", ".openstorm", "node_modules", "target", "dist", "build"];
    for component in path.components() {
        if let std::path::Component::Normal(name) = component {
            if skip_dirs.contains(&name.to_str().unwrap_or("")) {
                return true;
            }
        }
    }
    false
}

#[tauri::command]
pub fn start_watching(state: State<FileWatcher>, path: String) -> Result<(), String> {
    state.watch(PathBuf::from(path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_watching(state: State<FileWatcher>) -> Result<(), String> {
    state.unwatch_current()
}
