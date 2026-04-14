use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateVariable {
    pub name: String,
    pub r#type: String,
    pub required: Option<bool>,
    pub default: Option<serde_json::Value>,
    pub placeholder: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub language: String,
    pub icon: String,
    #[serde(alias = "iconColor")]
    pub icon_color: String,
    pub version: String,
    pub variables: Vec<TemplateVariable>,
    #[serde(skip)]
    pub template_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateCategory {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProjectRequest {
    pub template_id: String,
    pub project_name: String,
    pub project_path: String,
    pub variables: Option<serde_json::Value>,
}

/// Get the bundled templates directory
fn get_bundled_templates_dir(_app_handle: &AppHandle) -> PathBuf {
    // For development, use relative path from project root
    // In production, templates would be bundled in the resources directory
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| String::new());
    if !manifest_dir.is_empty() {
        // Development mode - templates are in project root
        PathBuf::from(&manifest_dir).parent()
            .map(|p| p.join("templates"))
            .unwrap_or_else(|| PathBuf::from("../../templates"))
    } else {
        // Production mode - use current working directory
        PathBuf::from("templates")
    }
}

/// Get the user templates directory
fn get_user_templates_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home).join(".openstorm").join("templates")
}

/// Load a single template from a directory
fn load_template(template_path: &PathBuf) -> Option<Template> {
    let json_path = template_path.join("template.json");
    if !json_path.exists() {
        return None;
    }

    let json_content = fs::read_to_string(&json_path).ok()?;
    let mut template: Template = serde_json::from_str(&json_content).ok()?;
    template.template_path = template_path.clone();
    Some(template)
}

/// Load all templates from a directory
fn load_templates_from_dir(base_path: &PathBuf) -> Vec<Template> {
    let mut templates = Vec::new();

    if !base_path.exists() {
        return templates;
    }

    // Read category directories
    let categories = match fs::read_dir(base_path) {
        Ok(entries) => entries,
        Err(_) => return templates,
    };

    for category_entry in categories.flatten() {
        let category_path = category_entry.path();
        if !category_path.is_dir() {
            continue;
        }

        // Read template directories within category
        let templates_dir = match fs::read_dir(&category_path) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for template_entry in templates_dir.flatten() {
            let template_path = template_entry.path();
            if let Some(template) = load_template(&template_path) {
                templates.push(template);
            }
        }
    }

    templates
}

/// List all available templates
#[tauri::command]
pub async fn list_templates(app_handle: AppHandle) -> Result<Vec<Template>, String> {
    let mut templates = Vec::new();

    // Load bundled templates first
    let bundled_dir = get_bundled_templates_dir(&app_handle);
    templates.extend(load_templates_from_dir(&bundled_dir));

    // Load user templates (can override bundled)
    let user_dir = get_user_templates_dir();
    let user_templates = load_templates_from_dir(&user_dir);

    // Remove duplicates from bundled if user has override
    for user_template in user_templates {
        templates.retain(|t| t.id != user_template.id);
        templates.push(user_template);
    }

    // Sort by category, then name
    templates.sort_by(|a, b| {
        a.category
            .cmp(&b.category)
            .then_with(|| a.name.cmp(&b.name))
    });

    Ok(templates)
}

/// List all available categories
#[tauri::command]
pub async fn list_categories(app_handle: AppHandle) -> Result<Vec<TemplateCategory>, String> {
    let templates = list_templates(app_handle).await?;

    // Define category metadata
    let category_info = [
        ("web-backend", "Web Backend", "server"),
        ("frontend", "Frontend", "globe"),
        ("cli", "Command Line", "terminal"),
        ("library", "Library", "package"),
        ("desktop", "Desktop", "box"),
        ("devops", "DevOps", "server"),
    ];

    let mut categories = Vec::new();

    for (id, name, icon) in category_info.iter() {
        let count = templates.iter().filter(|t| &t.category == id).count();
        if count > 0 {
            categories.push(TemplateCategory {
                id: id.to_string(),
                name: name.to_string(),
                icon: icon.to_string(),
                count,
            });
        }
    }

    Ok(categories)
}

/// Get a single template by ID
#[tauri::command]
pub async fn get_template(app_handle: AppHandle, template_id: String) -> Result<Template, String> {
    let templates = list_templates(app_handle).await?;

    templates
        .into_iter()
        .find(|t| t.id == template_id)
        .ok_or_else(|| format!("Template '{}' not found", template_id))
}

/// Replace variables in content
fn replace_variables(content: String, variables: &serde_json::Value) -> String {
    let mut result = content;

    if let Some(obj) = variables.as_object() {
        for (key, value) in obj {
            let placeholder = format!("{{{{{}}}}}", key);
            let replacement = match value {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::Bool(b) => b.to_string(),
                _ => value.to_string(),
            };
            result = result.replace(&placeholder, &replacement);
        }
    }

    result
}

/// Create a project from a template
#[tauri::command]
pub async fn create_project(
    app_handle: AppHandle,
    request: CreateProjectRequest,
) -> Result<String, String> {
    let templates = list_templates(app_handle.clone()).await?;

    let template = templates
        .into_iter()
        .find(|t| t.id == request.template_id)
        .ok_or_else(|| format!("Template '{}' not found", request.template_id))?;

    // Create project directory
    let project_path = PathBuf::from(&request.project_path).join(&request.project_name);

    if project_path.exists() {
        return Err(format!(
            "Directory '{}' already exists",
            project_path.display()
        ));
    }

    fs::create_dir_all(&project_path)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;

    // Prepare variables
    let mut variables = request.variables.unwrap_or_default();
    if let Some(obj) = variables.as_object_mut() {
        obj.insert(
            "project-name".to_string(),
            serde_json::Value::String(request.project_name.clone()),
        );
    } else {
        let mut obj = serde_json::Map::new();
        obj.insert(
            "project-name".to_string(),
            serde_json::Value::String(request.project_name.clone()),
        );
        variables = serde_json::Value::Object(obj);
    }

    // Copy and process template files
    let files_dir = template.template_path.join("files");
    if files_dir.exists() {
        copy_template_files(&files_dir, &project_path, &variables)?;
    }

    // Initialize git repo
    init_git_repo(&project_path)?;

    Ok(project_path.to_string_lossy().to_string())
}

/// Recursively copy template files, replacing variables
fn copy_template_files(
    src_dir: &PathBuf,
    dst_dir: &PathBuf,
    variables: &serde_json::Value,
) -> Result<(), String> {
    for entry in fs::read_dir(src_dir)
        .map_err(|e| format!("Failed to read template directory: {}", e))?
        .flatten()
    {
        let src_path = entry.path();
        let file_name = entry.file_name();

        // Skip . and ..
        if file_name == "." || file_name == ".." {
            continue;
        }

        let file_name_str = file_name.to_string_lossy();

        // Replace variables in file names (e.g., {{project-name}}.txt)
        let processed_name = replace_variables(file_name_str.to_string(), variables);

        let dst_path = dst_dir.join(&processed_name);

        if src_path.is_dir() {
            fs::create_dir_all(&dst_path)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
            copy_template_files(&src_path, &dst_path, variables)?;
        } else {
            // Read template file, replace variables, write to destination
            let content = fs::read_to_string(&src_path)
                .map_err(|e| format!("Failed to read {}: {}", src_path.display(), e))?;

            let processed_content = replace_variables(content, variables);

            fs::write(&dst_path, processed_content)
                .map_err(|e| format!("Failed to write {}: {}", dst_path.display(), e))?;
        }
    }

    Ok(())
}

/// Initialize a git repository in the project directory
fn init_git_repo(project_path: &PathBuf) -> Result<(), String> {
    use std::process::Command;

    // Check if git is installed
    let git_check = Command::new("git").arg("--version").output();

    if git_check.is_err() {
        // Git not installed, skip initialization
        return Ok(());
    }

    let output = Command::new("git")
        .arg("init")
        .current_dir(project_path)
        .output()
        .map_err(|e| format!("Failed to initialize git repo: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git init failed: {}", stderr));
    }

    Ok(())
}

/// Open a folder picker dialog
#[tauri::command]
pub fn open_folder_dialog(app: AppHandle) -> Result<Option<String>, String> {
    use std::sync::{Arc, Mutex};

    let result = Arc::new(Mutex::new(None));
    let result_clone = result.clone();

    app.dialog().file().pick_folder(move |folder_path: Option<FilePath>| {
        let path_str = folder_path.map(|p| p.to_string());
        if let Ok(mut guard) = result_clone.lock() {
            *guard = path_str;
        }
    });

    // Block until dialog completes (not ideal but works for this use case)
    loop {
        if let Ok(guard) = result.lock() {
            if guard.is_some() {
                return Ok(guard.clone());
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
}
