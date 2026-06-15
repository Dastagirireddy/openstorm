# Database Panel Design Document

## Overview

A comprehensive database management panel for OpenStorm IDE that supports multiple database vendors (SQL and NoSQL) with a plugin-based architecture following SOLID principles.

---

## Goals

1. **Multi-Vendor Support**: Support PostgreSQL, MySQL, SQLite, MongoDB, Redis, and extensible for future databases
2. **Desktop-Native Experience**: Match IntelliJ's Database panel density and workflow
3. **Secure Connection Storage**: Encrypted credential storage with system keychain integration
4. **Extensible Architecture**: Plugin-based driver system for adding new database types
5. **Query Execution**: SQL editor with syntax highlighting and result visualization
6. **Schema Browser**: Tree view of tables, collections, columns, and indexes

---

## Project vs Workspace Model

Following VS Code and IntelliJ conventions:

| Concept | Definition | Storage |
|---------|------------|---------|
| **Project** | Single folder/repository | `{folder}/.openstorm/` |
| **Workspace** | One or more projects in a window | `{path}/workspace.json` or implicit |
| **Recent Projects** | Global list of opened projects/workspaces | Global config directory |

### Workspace File Format (`.openstorm-workspace`)

```json
{
  "folders": [
    { "path": "/Users/dasta/work/my-app/frontend" },
    { "path": "/Users/dasta/work/my-app/backend" }
  ],
  "settings": {
    "database.activeConnection": "postgres-local"
  }
}
```

### Recent Projects Storage

Stored globally in `recent_projects.json`:

```json
{
  "projects": [
    {
      "path": "/Users/dasta/work/my-rust-app",
      "last_opened": "2025-05-01T14:30:00Z",
      "workspace_type": "single_folder"
    },
    {
      "path": "/Users/dasta/work/monorepo/my-workspace.openstorm-workspace",
      "last_opened": "2025-04-28T09:00:00Z",
      "workspace_type": "multi_root",
      "folders": [
        "/Users/dasta/work/monorepo/frontend",
        "/Users/dasta/work/monorepo/backend"
      ]
    }
  ]
}
```

---

## Connection Storage Strategy

### Platform-Specific Storage Paths

Following platform conventions (IntelliJ, VS Code) and XDG Base Directory spec:

| Platform | Global Config Path |
|----------|-------------------|
| **macOS** | `~/Library/Application Support/OpenStorm/` |
| **Linux** | `~/.config/openstorm/` |
| **Windows** | `%APPDATA%\OpenStorm\` |

Use the [`directories`](https://docs.rs/directories/latest/directories/) crate for cross-platform paths:

```rust
use directories::ProjectDirs;

let proj = ProjectDirs::from("com", "OpenStorm", "OpenStorm")
    .expect("no valid home directory");

let config_dir = proj.config_dir();      // Platform-specific config
let data_dir = proj.data_dir();          // For databases, caches
```

### Project vs Global Storage

```
┌─────────────────────────────────────────────────────────────────┐
│ Connection Storage Architecture                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GLOBAL (User-wide)                                             │
│  macOS: ~/Library/Application Support/OpenStorm/                │
│  Linux: ~/.config/openstorm/                                    │
│  ├── config.toml              # User settings (TOML)            │
│  ├── connections/                                               │
│  │   └── global.json          # Global DB connections (JSON)    │
│  └── recent_projects.json     # Recent projects list (JSON)     │
│                                                                 │
│  PROJECT (Per-workspace)                                        │
│  {project_root}/.openstorm/                                     │
│  ├── connections.json         # Project-specific connections    │
│  └── workspace.json           # Multi-root workspace definition │
│                                                                 │
│  CREDENTIALS (Both)                                             │
│  System Keychain (via keyring crate)                            │
│    - macOS: Keychain                                            │
│    - Windows: Credential Manager                                │
│    - Linux: libsecret / KWallet                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Storage Locations

| Data Type | Location | Format | Human-Edited? |
|-----------|----------|--------|---------------|
| User settings | `config.toml` | TOML | Yes |
| Global connections | `connections/global.json` | JSON | No (UI-managed) |
| Project connections | `{project}/.openstorm/connections.json` | JSON | No (UI-managed) |
| Workspace definition | `{project}/.openstorm/workspace.json` | JSON | No |
| Recent projects | `recent_projects.json` | JSON | No |
| Passwords, tokens | System Keychain | OS-managed | No |
| Saved queries | `queries/{connection_id}/` | JSON/SQL | Yes |
| Query history | `query_history.json` | JSON | No |

### Connection Resolution Order

When a project is opened, connections are loaded and merged:

1. **Load global connections** (base layer)
2. **Load project connections** (override layer - same ID replaces global)
3. **Result**: Unified connection list, project-specific takes precedence

```rust
pub fn list_connections(&self, project_path: Option<&Path>) -> Vec<ConnectionInfo> {
    let mut connections = Vec::new();
    
    // Load global connections first
    if let Ok(global) = self.storage.load_global() {
        connections.extend(global);
    }
    
    // Load project-specific connections (override globals with same ID)
    if let Some(project) = project_path {
        if let Ok(project_conns) = self.storage.load_project(project) {
            for conn in project_conns {
                if let Some(existing) = connections.iter_mut().find(|c| c.id == conn.id) {
                    *existing = conn;
                } else {
                    connections.push(conn);
                }
            }
        }
    }
    
    connections
}
```

### Why TOML for Config, JSON for Data?

| Format | Use Case | Rationale |
|--------|----------|-----------|
| **TOML** | `config.toml` (user settings) | Rust standard (Cargo.toml), supports comments, no whitespace sensitivity |
| **JSON** | `connections.json`, `workspace.json` | Machine-written, fast parsing, structured data |

The Rust [`config`](https://docs.rs/config/latest/config/) crate supports both formats with the same API.

---

## Architecture (SOLID Principles)

### 1. Single Responsibility Principle

Each component has one well-defined responsibility:

```
src-tauri/src/database/
├── mod.rs                    # Module entry, re-exports
├── manager.rs                # Connection lifecycle management (merge global + project)
├── storage.rs                # Persistence (TOML/JSON + Keychain)
├── query_executor.rs         # SQL/NoSQL query execution
├── schema_inspector.rs       # Metadata extraction (tables, columns)
├── connection_pool.rs        # Connection pooling & health checks
│
├── traits/
│   ├── mod.rs                # Trait re-exports
│   ├── database_provider.rs  # DatabaseProvider trait (factory)
│   ├── database_connection.rs # DatabaseConnection trait (operations)
│   └── query_builder.rs      # QueryBuilder trait (optional)
│
├── providers/
│   ├── mod.rs                # Provider registry
│   ├── postgres.rs           # PostgreSQL implementation
│   ├── mysql.rs              # MySQL implementation
│   ├── sqlite.rs             # SQLite implementation
│   ├── mongodb.rs            # MongoDB implementation
│   └── redis.rs              # Redis implementation
│
└── types/
    ├── mod.rs                # Type re-exports
    ├── connection.rs         # ConnectionConfig, ConnectionInfo, ConnectionScope
    ├── query_result.rs       # QueryResult, Column, Row
    └── schema.rs             # Table, Column, Index, Schema
```

### 2. Interface Segregation Principle

Small, focused traits instead of one large trait:

```rust
// === traits/database_connection.rs ===

/// Core connection operations
pub trait DatabaseConnection: Send + Sync {
    async fn connect(&mut self) -> Result<(), DatabaseError>;
    async fn disconnect(&mut self) -> Result<(), DatabaseError>;
    fn is_connected(&self) -> bool;
    fn get_info(&self) -> &ConnectionInfo;
}

/// Query execution capability (for SQL databases)
pub trait QueryExecutor: DatabaseConnection {
    async fn execute(&self, query: &str) -> Result<QueryResult, DatabaseError>;
    async fn execute_batch(&self, queries: &[&str]) -> Result<Vec<QueryResult>, DatabaseError>;
}

/// Schema introspection capability
pub trait SchemaInspector: DatabaseConnection {
    async fn list_tables(&self) -> Result<Vec<TableInfo>, DatabaseError>;
    async fn get_table_schema(&self, table: &str) -> Result<Vec<ColumnInfo>, DatabaseError>;
    async fn list_indexes(&self, table: &str) -> Result<Vec<IndexInfo>, DatabaseError>;
}

/// Transaction support (optional capability)
pub trait TransactionSupport: DatabaseConnection {
    async fn begin_transaction(&mut self) -> Result<(), DatabaseError>;
    async fn commit(&mut self) -> Result<(), DatabaseError>;
    async fn rollback(&mut self) -> Result<(), DatabaseError>;
}
```

### 3. Dependency Inversion Principle

High-level manager depends on abstractions, not concrete providers:

```rust
// === manager.rs ===

pub struct DatabaseManager {
    storage: ConnectionStorage,
    pools: HashMap<String, ConnectionPool>,
    // Depends on trait, not concrete types
    providers: HashMap<DatabaseType, Box<dyn DatabaseProvider>>,
}

impl DatabaseManager {
    pub fn new() -> Self {
        let mut manager = DatabaseManager { /* ... */ };
        manager.register_default_providers();
        manager
    }
    
    // Providers register themselves via trait interface
    pub fn register_provider(&mut self, db_type: DatabaseType, provider: Box<dyn DatabaseProvider>) {
        self.providers.insert(db_type, provider);
    }
}
```

### 4. Open/Closed Principle

New database providers can be added without modifying existing code:

```rust
// === providers/mod.rs ===

/// Factory trait for creating database connections
pub trait DatabaseProvider: Send + Sync {
    fn db_type(&self) -> DatabaseType;
    fn create_connection(&self, config: ConnectionConfig) -> Box<dyn DatabaseConnection>;
    fn get_display_name(&self) -> &'static str;
    fn get_icon(&self) -> &'static str; // Iconify icon name
    fn default_port(&self) -> u16;
}

// Registry pattern for provider discovery
pub struct ProviderRegistry {
    providers: HashMap<DatabaseType, Box<dyn DatabaseProvider>>,
}

impl ProviderRegistry {
    pub fn register(&mut self, provider: Box<dyn DatabaseProvider>) {
        self.providers.insert(provider.db_type(), provider);
    }
    
    pub fn get(&self, db_type: DatabaseType) -> Option<&dyn DatabaseProvider> {
        self.providers.get(&db_type).map(|p| p.as_ref())
    }
}
```

### Connection Scope: Project vs Global

```rust
// === types/connection.rs ===

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionScope {
    /// Available in all projects (stored in global config)
    Global,
    /// Only available in specific project (stored in .openstorm/connections.json)
    Project,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionInfo {
    pub id: String,
    pub name: String,
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub scope: ConnectionScope,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub id: Option<String>,  // None for new connections
    pub name: String,
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,     // Stored in keychain, not serialized
    pub database: Option<String>,
    pub scope: ConnectionScope,
    pub options: HashMap<String, String>,  // Driver-specific options (SSL, timeout, etc.)
}
```

### Make Global / Make Project Actions

Users can change connection scope via context menu:

- **Make Global**: Move from project to global storage (available in all projects)
- **Make Project-Specific**: Move from global to current project only

```rust
pub fn make_connection_global(&mut self, connection_id: &str) -> Result<(), DatabaseError> {
    // Load from project storage
    let conn = self.storage.load_from_project(connection_id)?;
    
    // Save to global storage
    self.storage.save_to_global(&conn)?;
    
    // Remove from project storage
    self.storage.delete_from_project(connection_id)?;
    
    Ok(())
}
```

### 5. Liskov Substitution Principle

All providers implement the same trait interface, guaranteeing consistent behavior:

```rust
// Any DatabaseProvider can be substituted in the registry
let postgres = PostgresProvider::new();
let mongodb = MongoProvider::new();

registry.register(Box::new(postgres));  // Works
registry.register(Box::new(mongodb));   // Works - same interface
```

---

## Frontend Architecture

### Component Structure

```
src/components/panels/database/
├── database-panel.ts           # Main panel container
├── connection-tree.ts          # Tree view of connections/tables
├── connection-dialog.ts        # Create/edit connection dialog
├── query-editor.ts             # SQL editor with syntax highlighting
├── result-grid.ts              # Tabular result display
├── schema-browser.ts           # Schema visualization
└── toolbar/
    ├── connection-toolbar.ts   # Connection actions
    └── query-toolbar.ts        # Query execution controls
```

### Panel Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Database Panel (Right Activity Bar)                         │
├──────────────────┬──────────────────────────────────────────┤
│ Connection Tree  │ Query Editor / Result View               │
│                  │                                          │
│ ▼ PostgreSQL     │ ┌────────────────────────────────────┐   │
│   ├─ public      │ │ SELECT * FROM users WHERE id = 1  │   │
│   │ ├─ users     │ │                                   │   │
│   │ ├─ orders    │ │                                   │   │
│   │ └─ products  │ │                                   │   │
│   ├─ other       │ └────────────────────────────────────┘   │
│                  │                                          │
│ ▼ MongoDB        │ ┌────────────────────────────────────┐   │
│   ├─ users       │ │ id  │ name  │ email               │   │
│   └─ inventory   │ │ 1   │ John  │ john@example.com    │   │
│                  │ │ 2   │ Jane  │ jane@example.com    │   │
│ [+] Add Connection│ └────────────────────────────────────┘   │
└──────────────────┴──────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Backend:**
- [ ] Create `database/` module structure
- [ ] Implement `ConnectionConfig` and `ConnectionInfo` types
- [ ] Implement `ConnectionStorage` with JSON + Keychain integration
- [ ] Define trait interfaces (`DatabaseConnection`, `DatabaseProvider`)
- [ ] Implement `DatabaseManager` with connection lifecycle

**Frontend:**
- [ ] Expand `database-panel.ts` with basic layout
- [ ] Create `connection-tree.ts` component
- [ ] Create `connection-dialog.ts` for add/edit
- [ ] Add database panel toggle to right activity bar

**Deliverable:** Can add/remove connections, credentials stored securely

---

### Phase 2: PostgreSQL Driver (Week 2-3)

**Backend:**
- [ ] Add `sqlx` dependency with `postgres` feature
- [ ] Implement `PostgresProvider` and `PostgresConnection`
- [ ] Implement `QueryExecutor` for PostgreSQL
- [ ] Implement `SchemaInspector` for PostgreSQL
- [ ] Add Tauri commands: `db_connect`, `db_execute`, `db_get_schema`

**Frontend:**
- [ ] Create `query-editor.ts` with CodeMirror SQL mode
- [ ] Create `result-grid.ts` for tabular data
- [ ] Wire up query execution flow
- [ ] Add error toast notifications

**Deliverable:** Can connect to PostgreSQL, run queries, view results

---

### Phase 3: Additional SQL Databases (Week 3-4)

**Backend:**
- [ ] Implement `MySqlProvider` (sqlx mysql feature)
- [ ] Implement `SqliteProvider` (sqlx sqlite feature)
- [ ] Refactor common SQL logic into shared module

**Frontend:**
- [ ] Add database type selector in connection dialog
- [ ] Show database-specific icon in tree
- [ ] Connection type-specific default ports

**Deliverable:** Support for PostgreSQL, MySQL, SQLite

---

### Phase 4: NoSQL Databases (Week 4-5)

**Backend:**
- [ ] Add `mongodb` dependency
- [ ] Implement `MongoProvider` with `SchemaInspector` for collections
- [ ] Implement query execution for MongoDB queries
- [ ] Add `redis` dependency
- [ ] Implement `RedisProvider` (key-value browser, command executor)

**Frontend:**
- [ ] JSON viewer for MongoDB results
- [ ] Key-value tree view for Redis
- [ ] Redis command input (GET, SET, KEYS, etc.)

**Deliverable:** Full SQL + NoSQL support

---

### Phase 5: Advanced Features (Week 5-6)

**Backend:**
- [ ] Connection pooling with `bb8` or `sqlx::Pool`
- [ ] Query history tracking
- [ ] Saved queries storage
- [ ] Export results (CSV, JSON)
- [ ] Query cancellation support

**Frontend:**
- [ ] Query history panel
- [ ] Saved queries sidebar
- [ ] Export buttons (CSV, JSON)
- [ ] Query execution progress indicator
- [ ] Syntax highlighting for multiple SQL dialects

**Deliverable:** Production-ready database tool

---

## Tauri Commands (IPC API)

```rust
// Connection Management
#[tauri::command]
async fn db_list_connections(project_path: Option<String>) -> Vec<ConnectionInfo>;
#[tauri::command]
async fn db_add_connection(config: ConnectionConfig, project_path: Option<String>) -> Result<String, String>;
#[tauri::command]
async fn db_remove_connection(id: String, project_path: Option<String>) -> Result<(), String>;
#[tauri::command]
async fn db_update_connection(config: ConnectionConfig, project_path: Option<String>) -> Result<(), String>;
#[tauri::command]
async fn db_test_connection(config: ConnectionConfig) -> Result<bool, String>;
#[tauri::command]
async fn db_make_connection_global(connection_id: String, project_path: String) -> Result<(), String>;
#[tauri::command]
async fn db_make_connection_project(connection_id: String, project_path: String) -> Result<(), String>;

// Query Execution
#[tauri::command]
async fn db_execute_query(connection_id: String, query: String) -> Result<QueryResult, String>;
#[tauri::command]
async fn db_cancel_query(connection_id: String) -> Result<(), String>;

// Schema Introspection
#[tauri::command]
async fn db_get_tables(connection_id: String) -> Result<Vec<TableInfo>, String>;
#[tauri::command]
async fn db_get_columns(connection_id: String, table: String) -> Result<Vec<ColumnInfo>, String>;
#[tauri::command]
async fn db_get_indexes(connection_id: String, table: String) -> Result<Vec<IndexInfo>, String>;

// Data Operations
#[tauri::command]
async fn db_export_results(connection_id: String, query: String, format: String) -> Result<String, String>;
```

---

## Dependencies

### Rust (Cargo.toml)

```toml
[dependencies]
# Database drivers
sqlx = { version = "0.7", features = ["postgres", "mysql", "sqlite", "runtime-tokio-rustls"] }
mongodb = "2.8"
redis = "0.24"

# Connection pooling
bb8 = "0.8"
bb8-postgres = "0.8"

# Security - System keychain
keyring = "2.3"

# Serialization - TOML for config, JSON for data
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"      # Machine-written data (connections, workspace)
toml = "0.8"            # Human-edited config (config.toml)

# Configuration management (layered config system)
config = "0.15"

# Platform-specific paths (XDG, macOS, Windows)
directories = "5.0"

# Error handling
thiserror = "1.0"
anyhow = "1.0"

# Async
tokio = { version = "1.0", features = ["full"] }

# Date/time
chrono = { version = "0.4", features = ["serde"] }
```

### Frontend (package.json)

```json
{
  "dependencies": {
    "@codemirror/lang-sql": "^6.0.0",
    "@codemirror/language": "^6.0.0",
    "@uiw/codemirror-theme-vscode": "^4.21.0"
  }
}
```

---

## Security Considerations

1. **No plaintext passwords**: All credentials stored in system keychain
2. **Connection validation**: Test connections before saving
3. **Query parameterization**: Use prepared statements to prevent SQL injection
4. **Connection limits**: Rate limit connection attempts
5. **Audit logging**: Log all query executions for debugging

---

## Testing Strategy

### Unit Tests
- Connection serialization/deserialization
- Keychain storage/retrieval
- Provider factory methods

### Integration Tests
- Connect to real databases (PostgreSQL, MySQL in Docker)
- Execute queries and verify results
- Schema introspection accuracy

### E2E Tests
- Add connection via UI
- Run query and verify results display
- Save and reload connections

---

## Future Extensions

1. **Data Editor**: Inline cell editing with dirty state tracking
2. **ER Diagrams**: Visual schema relationship viewer
3. **Query Builder**: Visual query builder for non-SQL users
4. **Migration Tools**: Schema migration generation
5. **Backup/Restore**: Database export/import utilities
6. **Performance Insights**: Query plan visualization

---

## References

- IntelliJ Database Documentation: https://www.jetbrains.com/help/idea/database-tool-window.html
- sqlx Documentation: https://docs.rs/sqlx/latest/sqlx/
- Tauri Plugin Architecture: https://v2.tauri.app/plugin/development/
