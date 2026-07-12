use serde::{Deserialize, Serialize};

use super::types::{McpConfigField, McpServerConfig};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: McpTemplateCategory,
    pub icon: String,
    pub config: McpServerConfig,
    #[serde(default)]
    pub config_fields: Vec<McpConfigField>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum McpTemplateCategory {
    Browser,
    Development,
    Productivity,
    Data,
}

impl McpTemplate {
    pub fn all() -> Vec<Self> {
        vec![
            Self {
                id: "chrome-devtools".into(),
                name: "Chrome DevTools".into(),
                description: "Debug, profile, and audit web apps. Inspect console, network, performance traces, and run Lighthouse audits.".into(),
                category: McpTemplateCategory::Browser,
                icon: "devtools".into(),
                config: McpServerConfig {
                    name: "chrome-devtools".into(),
                    command: "npx".into(),
                    args: vec!["-y".into(), "chrome-devtools-mcp".into()],
                    env: Default::default(),
                    enabled: true,
                },
                config_fields: vec![],
            },
            Self {
                id: "playwright".into(),
                name: "Playwright".into(),
                description: "Browser automation and testing. Navigate, click, fill forms, take screenshots, and test across 143 devices.".into(),
                category: McpTemplateCategory::Browser,
                icon: "playwright".into(),
                config: McpServerConfig {
                    name: "playwright".into(),
                    command: "npx".into(),
                    args: vec!["-y".into(), "@playwright/mcp@latest".into()],
                    env: Default::default(),
                    enabled: true,
                },
                config_fields: vec![],
            },
            Self {
                id: "filesystem".into(),
                name: "Filesystem".into(),
                description: "Read, write, and search files on the local filesystem with sandboxed access.".into(),
                category: McpTemplateCategory::Development,
                icon: "folder".into(),
                config: McpServerConfig {
                    name: "filesystem".into(),
                    command: "npx".into(),
                    args: vec!["-y".into(), "@modelcontextprotocol/server-filesystem".into(), "/tmp".into()],
                    env: Default::default(),
                    enabled: true,
                },
                config_fields: vec![],
            },
            Self {
                id: "github".into(),
                name: "GitHub".into(),
                description: "Interact with GitHub repos, issues, PRs, and code search via the GitHub API.".into(),
                category: McpTemplateCategory::Development,
                icon: "github".into(),
                config: McpServerConfig {
                    name: "github".into(),
                    command: "npx".into(),
                    args: vec!["-y".into(), "@modelcontextprotocol/server-github".into()],
                    env: Default::default(),
                    enabled: true,
                },
                config_fields: vec![],
            },
            Self {
                id: "brave-search".into(),
                name: "Brave Search".into(),
                description: "Web and local search using Brave Search API. Requires API key.".into(),
                category: McpTemplateCategory::Data,
                icon: "search".into(),
                config: McpServerConfig {
                    name: "brave-search".into(),
                    command: "npx".into(),
                    args: vec!["-y".into(), "@modelcontextprotocol/server-brave-search".into()],
                    env: Default::default(),
                    enabled: true,
                },
                config_fields: vec![],
            },
            Self {
                id: "memory".into(),
                name: "Memory (Knowledge Graph)".into(),
                description: "Persistent knowledge graph for notes, code snippets, and context across sessions.".into(),
                category: McpTemplateCategory::Productivity,
                icon: "brain".into(),
                config: McpServerConfig {
                    name: "memory".into(),
                    command: "npx".into(),
                    args: vec!["-y".into(), "@modelcontextprotocol/server-memory".into()],
                    env: Default::default(),
                    enabled: true,
                },
                config_fields: vec![],
            },
            Self {
                id: "postgres".into(),
                name: "PostgreSQL".into(),
                description: "Read-only access to PostgreSQL databases. Query and explore schemas.".into(),
                category: McpTemplateCategory::Data,
                icon: "database".into(),
                config: McpServerConfig {
                    name: "postgres".into(),
                    command: "npx".into(),
                    args: vec!["-y".into(), "@modelcontextprotocol/server-postgres".into()],
                    env: Default::default(),
                    enabled: true,
                },
                config_fields: vec![],
            },
            Self {
                id: "mysql".into(),
                name: "MySQL".into(),
                description: "Read-only access to MySQL databases. Query and explore schemas.".into(),
                category: McpTemplateCategory::Data,
                icon: "database".into(),
                config: McpServerConfig {
                    name: "mysql".into(),
                    command: "npx".into(),
                    args: vec!["-y".into(), "mysql-mcp-server".into()],
                    env: Default::default(),
                    enabled: false,
                },
                config_fields: vec![
                    McpConfigField {
                        key: "MYSQL_HOST".into(),
                        label: "Host".into(),
                        default: "localhost".into(),
                        required: true,
                        secret: false,
                    },
                    McpConfigField {
                        key: "MYSQL_PORT".into(),
                        label: "Port".into(),
                        default: "3306".into(),
                        required: true,
                        secret: false,
                    },
                    McpConfigField {
                        key: "MYSQL_USER".into(),
                        label: "Username".into(),
                        default: "root".into(),
                        required: true,
                        secret: false,
                    },
                    McpConfigField {
                        key: "MYSQL_PASSWORD".into(),
                        label: "Password".into(),
                        default: "".into(),
                        required: false,
                        secret: true,
                    },
                    McpConfigField {
                        key: "MYSQL_DATABASE".into(),
                        label: "Database".into(),
                        default: "".into(),
                        required: false,
                        secret: false,
                    },
                ],
            },
            Self {
                id: "puppeteer".into(),
                name: "Puppeteer".into(),
                description: "Minimal Chromium automation. Navigate, screenshot, and evaluate JS. Good for simple workflows.".into(),
                category: McpTemplateCategory::Browser,
                icon: "puppeteer".into(),
                config: McpServerConfig {
                    name: "puppeteer".into(),
                    command: "npx".into(),
                    args: vec!["-y".into(), "@modelcontextprotocol/server-puppeteer".into()],
                    env: Default::default(),
                    enabled: true,
                },
                config_fields: vec![],
            },
        ]
    }

    pub fn find(id: &str) -> Option<Self> {
        Self::all().into_iter().find(|t| t.id == id)
    }
}
