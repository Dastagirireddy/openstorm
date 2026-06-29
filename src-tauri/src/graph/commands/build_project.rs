use std::path::Path;

use tauri::{AppHandle, Emitter, State};

use super::GraphState;
use crate::graph::builder::GraphBuilder;
use crate::graph::extractor::registry::ExtractorRegistry;
use crate::graph::extractor::rust::RustExtractor;
use crate::graph::extractor::typescript::TypeScriptExtractor;
use crate::graph::extractor::python::PythonExtractor;
use crate::graph::extractor::go::GoExtractor;
use crate::graph::store::GraphStore;

const IGNORED_DIRS: &[&str] = &[
    ".git", ".hg", ".svn", ".openstorm",
    "node_modules", "target", "dist", "build", "out",
    "graphify-out", "__pycache__", ".pytest_cache", ".mypy_cache",
    "vendor", "coverage", ".next", ".nuxt", ".output",
    "venv", ".venv", "env", ".env",
    "tmp", "temp", ".cache",
];

const IGNORED_FILES: &[&str] = &[
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock",
    "Gemfile.lock", "poetry.lock", "Pipfile.lock", "composer.lock",
    ".gitignore", ".dockerignore", ".env",
    "Cargo.toml", "package.json", "tsconfig.json",
];

#[derive(serde::Serialize, Clone)]
pub struct BuildProgress {
    pub phase: String,
    pub files_scanned: usize,
    pub total_nodes: usize,
}

#[derive(serde::Serialize)]
pub struct BuildResult {
    pub node_count: usize,
    pub edge_count: usize,
    pub files_scanned: usize,
    pub errors: Vec<String>,
}

#[tauri::command]
pub async fn graph_build_project(
    project_path: String,
    app: AppHandle,
    state: State<'_, GraphState>,
) -> Result<BuildResult, String> {
    let store_path = format!("{}/.openstorm/graph.db", project_path);
    std::fs::create_dir_all(format!("{}/.openstorm", &project_path)).ok();

    let store = GraphStore::open(&store_path).map_err(|e| e.to_string())?;
    let cached = store.node_count().unwrap_or(0) > 0;

    {
        let mut store_guard = state.store.lock().map_err(|e| e.to_string())?;
        *store_guard = Some(store);
    }

    if cached {
        let _ = app.emit("graph-build-progress", BuildProgress {
            phase: "loaded".into(),
            files_scanned: 0,
            total_nodes: 0,
        });
        return Ok(BuildResult {
            node_count: 0,
            edge_count: 0,
            files_scanned: 0,
            errors: Vec::new(),
        });
    }

    let root = project_path.clone();
    let app2 = app.clone();

    let (graph_data, files_scanned, errors) = {
        tokio::task::spawn_blocking(move || {
            let mut registry = ExtractorRegistry::new();
            registry.register(RustExtractor::create());
            registry.register(TypeScriptExtractor::create());
            registry.register(PythonExtractor::create());
            registry.register(GoExtractor::create());

            let mut builder = GraphBuilder::new();
            let mut files_scanned = 0;
            let mut errors = Vec::new();

            scan_directory(&root, &root, &registry, &mut builder, &mut files_scanned, &mut errors, &app2);

            (builder.build(), files_scanned, errors)
        })
        .await
        .map_err(|e| e.to_string())?
    };

    let node_count = graph_data.nodes.len();
    let edge_count = graph_data.edges.len();

    let _ = app.emit("graph-build-progress", BuildProgress {
        phase: "storing".into(),
        files_scanned,
        total_nodes: node_count,
    });

    {
        let store_guard = state.store.lock().map_err(|e| e.to_string())?;
        let store = store_guard.as_ref().ok_or("Graph store not initialized")?;
        store.clear().map_err(|e| e.to_string())?;
        store.insert_graph(&graph_data).map_err(|e| e.to_string())?;
    }

    let _ = app.emit("graph-build-progress", BuildProgress {
        phase: "done".into(),
        files_scanned,
        total_nodes: node_count,
    });

    Ok(BuildResult {
        node_count,
        edge_count,
        files_scanned,
        errors,
    })
}

fn scan_directory(
    root: &str,
    dir_path: &str,
    registry: &ExtractorRegistry,
    builder: &mut GraphBuilder,
    files_scanned: &mut usize,
    errors: &mut Vec<String>,
    app: &AppHandle,
) {
    let entries = match std::fs::read_dir(dir_path) {
        Ok(entries) => entries,
        Err(e) => {
            errors.push(format!("Failed to read directory {}: {}", dir_path, e));
            return;
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let abs_str = path.to_string_lossy();

        if path.is_dir() {
            let dir_name = path.file_name().unwrap_or_default().to_string_lossy();
            if IGNORED_DIRS.contains(&dir_name.as_ref()) {
                continue;
            }
            scan_directory(root, &abs_str, registry, builder, files_scanned, errors, app);
        } else if path.extension().and_then(|e| e.to_str()).is_some() {
            let file_name = path.file_name().unwrap_or_default().to_string_lossy();
            if IGNORED_FILES.contains(&file_name.as_ref()) {
                continue;
            }
            if registry.is_supported(&abs_str) {
                let rel_path = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().to_string();
                match std::fs::read_to_string(&path) {
                    Ok(content) => {
                        let result = registry.extract(&rel_path, &content);
                        builder.add_extracted(result);
                        *files_scanned += 1;

                        if *files_scanned % 20 == 0 {
                            let _ = app.emit("graph-build-progress", BuildProgress {
                                phase: "scanning".into(),
                                files_scanned: *files_scanned,
                                total_nodes: builder.node_count(),
                            });
                        }
                    }
                    Err(e) => {
                        errors.push(format!("Failed to read {}: {}", abs_str, e));
                    }
                }
            }
        }
    }
}
