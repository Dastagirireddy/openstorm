/// System theme detection
use tauri::command;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ThemeInfo {
    pub system_theme: String, // "light" | "dark"
}

#[command]
pub fn get_system_theme() -> ThemeInfo {
    let is_dark = dark_light::detect() == dark_light::Mode::Dark;
    ThemeInfo {
        system_theme: if is_dark { "dark".to_string() } else { "light".to_string() },
    }
}
