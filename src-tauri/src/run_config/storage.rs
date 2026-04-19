use crate::run_config::configuration::RunConfiguration;
use serde_json;
use std::fs;
use std::path::PathBuf;

const CONFIG_DIR: &str = ".openstorm";
const CONFIG_FILE: &str = "launch.json";

pub struct ConfigurationStorage {
    workspace_root: PathBuf,
}

impl ConfigurationStorage {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self { workspace_root }
    }

    fn config_dir(&self) -> PathBuf {
        self.workspace_root.join(CONFIG_DIR)
    }

    fn config_file(&self) -> PathBuf {
        self.config_dir().join(CONFIG_FILE)
    }

    pub fn load_configurations(&self) -> Vec<RunConfiguration> {
        let config_path = self.config_file();
        if !config_path.exists() {
            return Vec::new();
        }

        let content = match fs::read_to_string(&config_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to read launch.json: {}", e);
                return Vec::new();
            }
        };

        let configs: Vec<RunConfiguration> = match serde_json::from_str(&content) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to parse launch.json: {}", e);
                Vec::new()
            }
        };

        configs
    }

    pub fn save_configurations(&self, configs: &[RunConfiguration]) -> Result<(), String> {
        let config_dir = self.config_dir();
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        let content = serde_json::to_string_pretty(configs)
            .map_err(|e| format!("Failed to serialize configurations: {}", e))?;

        fs::write(self.config_file(), &content)
            .map_err(|e| format!("Failed to write launch.json: {}", e))?;

        Ok(())
    }

    pub fn save_configuration(&self, config: &RunConfiguration) -> Result<(), String> {
        let mut configs = self.load_configurations();

        // Update existing or add new
        if let Some(existing) = configs.iter_mut().find(|c| c.id == config.id) {
            *existing = config.clone();
        } else {
            configs.push(config.clone());
        }

        self.save_configurations(&configs)
    }

    pub fn delete_configuration(&self, config_id: &str) -> Result<(), String> {
        let mut configs = self.load_configurations();
        configs.retain(|c| c.id != config_id);
        self.save_configurations(&configs)
    }

    pub fn config_file_path(&self) -> PathBuf {
        self.config_file()
    }
}
