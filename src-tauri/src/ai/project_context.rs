use serde::Serialize;
use std::path::Path;

/// Detected project context for building the system prompt
#[derive(Debug, Clone, Serialize)]
pub struct ProjectContext {
    pub language: String,
    pub framework: Option<String>,
    pub build_tool: Option<String>,
    pub has_git: bool,
    pub key_files: Vec<String>,
}

impl ProjectContext {
    /// Detect project context by scanning config files in the project root
    pub fn detect(project_path: &str) -> Self {
        let root = Path::new(project_path);

        let (language, framework, build_tool) = Self::detect_language(root);
        let has_git = root.join(".git").exists();
        let key_files = Self::find_key_files(root);

        Self {
            language,
            framework,
            build_tool,
            has_git,
            key_files,
        }
    }

    /// Detect primary language and framework from config files
    fn detect_language(root: &Path) -> (String, Option<String>, Option<String>) {
        // Rust
        if root.join("Cargo.toml").exists() {
            let content = std::fs::read_to_string(root.join("Cargo.toml")).unwrap_or_default();
            let framework = if content.contains("tauri") {
                Some("Tauri".to_string())
            } else if content.contains("actix") {
                Some("Actix".to_string())
            } else if content.contains("axum") {
                Some("Axum".to_string())
            } else if content.contains("tokio") {
                Some("Tokio async".to_string())
            } else {
                None
            };
            return ("Rust".to_string(), framework, Some("Cargo".to_string()));
        }

        // Node.js / TypeScript / JavaScript
        if root.join("package.json").exists() {
            let content =
                std::fs::read_to_string(root.join("package.json")).unwrap_or_default();
            let framework = if content.contains("react") {
                Some("React".to_string())
            } else if content.contains("vue") {
                Some("Vue".to_string())
            } else if content.contains("svelte") {
                Some("Svelte".to_string())
            } else if content.contains("lit") || content.contains("web-component") {
                Some("Lit web components".to_string())
            } else if content.contains("next") {
                Some("Next.js".to_string())
            } else if content.contains("express") {
                Some("Express".to_string())
            } else if content.contains("fastify") {
                Some("Fastify".to_string())
            } else {
                None
            };

            let has_tsconfig = root.join("tsconfig.json").exists();
            let lang = if has_tsconfig {
                "TypeScript"
            } else {
                "JavaScript"
            };

            let build_tool = if content.contains("vite") {
                Some("Vite".to_string())
            } else if content.contains("webpack") {
                Some("Webpack".to_string())
            } else if content.contains("esbuild") {
                Some("esbuild".to_string())
            } else if content.contains("turbo") {
                Some("Turborepo".to_string())
            } else if content.contains("pnpm") {
                Some("pnpm".to_string())
            } else {
                Some("npm".to_string())
            };

            return (lang.to_string(), framework, build_tool);
        }

        // Go
        if root.join("go.mod").exists() {
            return ("Go".to_string(), None, Some("Go modules".to_string()));
        }

        // Python
        if root.join("pyproject.toml").exists()
            || root.join("requirements.txt").exists()
            || root.join("setup.py").exists()
        {
            let framework = if root.join("manage.py").exists() {
                Some("Django".to_string())
            } else if root.join("pyproject.toml").exists() {
                let content =
                    std::fs::read_to_string(root.join("pyproject.toml")).unwrap_or_default();
                if content.contains("fastapi") {
                    Some("FastAPI".to_string())
                } else if content.contains("flask") || content.contains("Flask") {
                    Some("Flask".to_string())
                } else {
                    None
                }
            } else {
                None
            };
            return ("Python".to_string(), framework, Some("pip".to_string()));
        }

        // Java
        if root.join("pom.xml").exists() {
            return (
                "Java".to_string(),
                None,
                Some("Maven".to_string()),
            );
        }
        if root.join("build.gradle").exists() || root.join("build.gradle.kts").exists() {
            return (
                "Java".to_string(),
                None,
                Some("Gradle".to_string()),
            );
        }

        // Ruby
        if root.join("Gemfile").exists() {
            let content = std::fs::read_to_string(root.join("Gemfile")).unwrap_or_default();
            let framework = if content.contains("rails") {
                Some("Rails".to_string())
            } else if content.contains("sinatra") {
                Some("Sinatra".to_string())
            } else {
                None
            };
            return ("Ruby".to_string(), framework, Some("Bundler".to_string()));
        }

        // C/C++
        if root.join("CMakeLists.txt").exists() {
            return (
                "C/C++".to_string(),
                None,
                Some("CMake".to_string()),
            );
        }

        ("Unknown".to_string(), None, None)
    }

    /// Find key config files to mention in the prompt
    fn find_key_files(root: &Path) -> Vec<String> {
        let candidates = vec![
            "Cargo.toml",
            "package.json",
            "tsconfig.json",
            "go.mod",
            "pyproject.toml",
            "requirements.txt",
            "pom.xml",
            "build.gradle",
            "Gemfile",
            "CMakeLists.txt",
            "Makefile",
            "Dockerfile",
            ".gitignore",
            "README.md",
            "AGENTS.md",
        ];

        candidates
            .into_iter()
            .filter(|f| root.join(f).exists())
            .map(|f| f.to_string())
            .collect()
    }

    /// Build the project context section for the system prompt
    pub fn to_prompt_section(&self) -> String {
        let mut lines = vec!["Project context:".to_string()];

        lines.push(format!("- Language: {}", self.language));

        if let Some(ref fw) = self.framework {
            lines.push(format!("- Framework: {}", fw));
        }
        if let Some(ref bt) = self.build_tool {
            lines.push(format!("- Build tool: {}", bt));
        }
        if self.has_git {
            lines.push("- Version control: Git".to_string());
        }
        if !self.key_files.is_empty() {
            lines.push(format!("- Config files: {}", self.key_files.join(", ")));
        }

        lines.join("\n")
    }
}
