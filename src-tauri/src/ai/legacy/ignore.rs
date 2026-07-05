use std::path::Path;

/// Detect project type and return directories to exclude from indexing/traversal.
///
/// Returns a list of directory names that should be skipped.
/// These are compared against the directory's file_name(), so no path separators needed.
pub fn exclusions_for_project(project_path: &str) -> Vec<&'static str> {
    let root = Path::new(project_path);
    let mut excluded: Vec<&'static str> = Vec::new();

    // ── Universal exclusions (always skip) ──────────────────────
    excluded.extend_from_slice(&[
        ".git", ".svn", ".hg",           // Version control
        ".openstorm",                     // IDE metadata
        ".cache", ".tmp",                 // Caches
        "target",                         // Rust build artifacts (universal)
        "node_modules",                   // JS dependencies (universal)
    ]);

    // ── Project-type specific exclusions ────────────────────────

    // Rust
    if root.join("Cargo.toml").exists() {
        excluded.push("target");
    }

    // Node.js / TypeScript / JavaScript
    if root.join("package.json").exists() {
        excluded.extend_from_slice(&[
            "node_modules",
            "dist",
            "build",
            ".next",          // Next.js
            ".nuxt",          // Nuxt.js
            ".output",        // Nitro / Nuxt
            ".turbo",         // Turborepo
            "coverage",       // Test coverage
            ".parcel-cache",  // Parcel
        ]);
    }

    // Go
    if root.join("go.mod").exists() {
        excluded.push("vendor");
    }

    // Python
    if root.join("pyproject.toml").exists()
        || root.join("requirements.txt").exists()
        || root.join("setup.py").exists()
    {
        excluded.extend_from_slice(&[
            "__pycache__",
            ".venv",
            "venv",
            ".mypy_cache",
            ".pytest_cache",
            ".tox",
            "eggs",
            "*.egg-info",  // Note: this won't match as a dir name, but harmless
        ]);
    }

    // Java
    if root.join("pom.xml").exists() || root.join("build.gradle").exists() || root.join("build.gradle.kts").exists() {
        excluded.extend_from_slice(&[
            "build",
            ".gradle",
        ]);
    }

    // Ruby
    if root.join("Gemfile").exists() {
        excluded.extend_from_slice(&[
            "vendor",
            ".bundle",
        ]);
    }

    // C/C++
    if root.join("CMakeLists.txt").exists() {
        excluded.push("build");
    }

    // ── User overrides (.openstorm/ignore) ──────────────────────
    let ignore_file = root.join(".openstorm").join("ignore");
    if let Ok(content) = std::fs::read_to_string(&ignore_file) {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }
            // Convert to static str leak — small, one-time cost
            excluded.push(Box::leak(trimmed.to_string().into_boxed_str()));
        }
    }

    excluded
}

/// Check if a directory name should be excluded.
pub fn should_skip_dir(dir_name: &str, exclusions: &[&str]) -> bool {
    // Always skip hidden directories
    if dir_name.starts_with('.') {
        return true;
    }
    exclusions.contains(&dir_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_universal_exclusions() {
        let exclusions = exclusions_for_project("/nonexistent/path");
        assert!(exclusions.contains(&".git"));
        assert!(exclusions.contains(&".openstorm"));
        assert!(exclusions.contains(&".cache"));
    }

    #[test]
    fn test_rust_exclusions() {
        // This test only works if run from a Rust project directory
        let exclusions = exclusions_for_project(".");
        if Path::new("Cargo.toml").exists() {
            assert!(exclusions.contains(&"target"));
        }
    }

    #[test]
    fn test_should_skip_hidden() {
        assert!(should_skip_dir(".git", &[]));
        assert!(should_skip_dir(".hidden", &[]));
        assert!(!should_skip_dir("src", &[]));
    }

    #[test]
    fn test_should_skip_exclusions() {
        let excl = vec!["node_modules", "dist", "target"];
        assert!(should_skip_dir("node_modules", &excl));
        assert!(should_skip_dir("dist", &excl));
        assert!(!should_skip_dir("src", &excl));
    }
}
