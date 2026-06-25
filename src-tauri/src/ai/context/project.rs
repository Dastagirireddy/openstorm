use serde::Serialize;
use std::path::Path;

/// Detected project metadata for building the system prompt.
#[derive(Debug, Clone, Serialize)]
pub struct ProjectContext {
    pub language: String,
    pub framework: Option<String>,
    pub build_tool: Option<String>,
    pub has_git: bool,
    pub key_files: Vec<String>,
}

impl ProjectContext {
    pub fn detect(project_path: &str) -> Self {
        let root = Path::new(project_path);
        let (language, framework, build_tool) = detect_language(root);
        Self {
            language,
            framework,
            build_tool,
            has_git: root.join(".git").exists(),
            key_files: find_key_files(root),
        }
    }

    pub fn to_prompt_section(&self) -> String {
        let mut lines = vec![format!("Project context:\n- Language: {}", self.language)];
        if let Some(ref fw) = self.framework { lines.push(format!("- Framework: {}", fw)); }
        if let Some(ref bt) = self.build_tool { lines.push(format!("- Build tool: {}", bt)); }
        if self.has_git { lines.push("- Version control: Git".to_string()); }
        if !self.key_files.is_empty() { lines.push(format!("- Config files: {}", self.key_files.join(", "))); }
        lines.join("\n")
    }
}

fn detect_language(root: &Path) -> (String, Option<String>, Option<String>) {
    // Rust
    if let Some(content) = read_if_exists(root, "Cargo.toml") {
        let fw = match true {
            _ if content.contains("tauri") => Some("Tauri"),
            _ if content.contains("actix") => Some("Actix"),
            _ if content.contains("axum") => Some("Axum"),
            _ if content.contains("tokio") => Some("Tokio async"),
            _ => None,
        };
        return ("Rust".into(), fw.map(String::from), Some("Cargo".into()));
    }
    // Node.js / TypeScript
    if let Some(content) = read_if_exists(root, "package.json") {
        let fw = match true {
            _ if content.contains("react") => Some("React"),
            _ if content.contains("vue") => Some("Vue"),
            _ if content.contains("svelte") => Some("Svelte"),
            _ if content.contains("lit") => Some("Lit web components"),
            _ if content.contains("next") => Some("Next.js"),
            _ if content.contains("express") => Some("Express"),
            _ if content.contains("fastify") => Some("Fastify"),
            _ => None,
        };
        let lang = if root.join("tsconfig.json").exists() { "TypeScript" } else { "JavaScript" };
        let bt = match true {
            _ if content.contains("vite") => Some("Vite"),
            _ if content.contains("webpack") => Some("Webpack"),
            _ if content.contains("esbuild") => Some("esbuild"),
            _ if content.contains("turbo") => Some("Turborepo"),
            _ if content.contains("pnpm") => Some("pnpm"),
            _ => Some("npm"),
        };
        return (lang.into(), fw.map(String::from), bt.map(String::from));
    }
    // Go
    if root.join("go.mod").exists() { return ("Go".into(), None, Some("Go modules".into())); }
    // Python
    if root.join("pyproject.toml").exists() || root.join("requirements.txt").exists() || root.join("setup.py").exists() {
        let fw = if root.join("manage.py").exists() { Some("Django") }
        else if let Some(c) = read_if_exists(root, "pyproject.toml") {
            if c.contains("fastapi") { Some("FastAPI") } else if c.contains("flask") { Some("Flask") } else { None }
        } else { None };
        return ("Python".into(), fw.map(String::from), Some("pip".into()));
    }
    // Java
    if root.join("pom.xml").exists() { return ("Java".into(), None, Some("Maven".into())); }
    if root.join("build.gradle").exists() || root.join("build.gradle.kts").exists() { return ("Java".into(), None, Some("Gradle".into())); }
    // Ruby
    if let Some(c) = read_if_exists(root, "Gemfile") {
        let fw = if c.contains("rails") { Some("Rails") } else if c.contains("sinatra") { Some("Sinatra") } else { None };
        return ("Ruby".into(), fw.map(String::from), Some("Bundler".into()));
    }
    // C/C++
    if root.join("CMakeLists.txt").exists() { return ("C/C++".into(), None, Some("CMake".into())); }
    ("Unknown".into(), None, None)
}

fn read_if_exists(root: &Path, name: &str) -> Option<String> {
    std::fs::read_to_string(root.join(name)).ok()
}

fn find_key_files(root: &Path) -> Vec<String> {
    ["Cargo.toml", "package.json", "tsconfig.json", "go.mod", "pyproject.toml",
     "requirements.txt", "pom.xml", "build.gradle", "Gemfile", "CMakeLists.txt",
     "Makefile", "Dockerfile", ".gitignore", "README.md", "AGENTS.md"]
        .iter().filter(|f| root.join(f).exists()).map(|f| f.to_string()).collect()
}
