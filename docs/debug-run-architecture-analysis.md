# Debug & Run Architecture Analysis

## Executive Summary

The current Debug and Run implementation works but has significant architectural issues that limit scalability, maintainability, and plugin extensibility. This document analyzes the current state, identifies SOLID principle violations, and proposes a refactored architecture.

---

## Current Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Lit.js)                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Debug Panel  │  │ Editor       │  │ Status Bar   │  │ Terminal     │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
└─────────┼─────────────────┼─────────────────┼─────────────────┼────────────┘
          │                 │                 │                 │
          │ IPC Commands    │                 │                 │
          ▼                 ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Tauri + Rust)                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ main.rs                                                               │   │
│  │  • Registers all commands                                             │   │
│  │  • Manages shared state (DapClient, ProcessManager)                   │   │
│  │  • Spawns event pollers                                               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│         ┌────────────────────────────┼────────────────────────────┐         │
│         │                            │                            │         │
│         ▼                            ▼                            ▼         │
│  ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐   │
│  │ commands.rs     │       │ dap/            │       │ process/        │   │
│  │  • 40+ commands │       │  • DapClient    │       │  • ProcessMgr   │   │
│  │  • Mixed resp.  │       │  • Adapters     │       │  • Output       │   │
│  └─────────────────┘       └─────────────────┘       └─────────────────┘   │
│                                                                          │
│  ┌─────────────────┐       ┌─────────────────┐                           │
│  │ run_config/     │       │ dap_installer.rs│                           │
│  │  • Detector     │       │  • Installation │                           │
│  │  • Languages    │       │  • Registry     │                           │
│  └─────────────────┘       └─────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibility Map

| Component | Responsibilities | Lines of Code |
|-----------|-----------------|---------------|
| `commands.rs` | File I/O, Run configs, DAP commands, Process mgmt, Breakpoints, Watches | ~875 |
| `dap/adapter.rs` | DAP protocol, Connection mgmt, Message parsing, runInTerminal handling | ~825 |
| `dap/client.rs` | Session mgmt, Adapter orchestration, State machine | ~337 |
| `dap/adapters/*` | Language-specific adapter implementations | ~250-485 each |
| `process/manager.rs` | Process spawning, Output streaming, Lifecycle | ~275 |
| `run_config/*` | Language detection, Config storage | ~100-200 each |

---

## SOLID Principle Violations

### 1. Single Responsibility Principle (SRP) Violations

#### `commands.rs` - 875 lines, 40+ commands

```
Current responsibilities:
├── File operations (read, write, delete, rename)
├── Directory operations (list, search)
├── Run configuration (detect, save, load, delete)
├── Process management (spawn, terminate, list)
├── Debug session management (start, stop, actions)
├── Breakpoint management (add, remove, set)
├── Debug introspection (stack, scopes, variables, threads)
├── Watch expressions (add, remove, refresh)
├── Exception breakpoints (get filters, set)
└── Adapter installation (info, install)
```

**Problem**: A single file handles unrelated concerns. Changing file search logic requires touching debug adapter code.

#### `dap/adapter.rs` - 825 lines

```
Current responsibilities:
├── DAP message protocol (serialize/deserialize)
├── Connection management (stdio, TCP)
├── Reader loop for DAP messages
├── runInTerminal request handling
├── startDebugging request handling
├── Request/response correlation
├── Event buffering
└── Process termination
```

**Problem**: Connection logic mixed with protocol logic. `runInTerminal` shell execution (150+ lines) belongs in process management.

### 2. Open/Closed Principle (OCP) Violations

#### Adapter Creation in `DapClient`

```rust
// src-tauri/src/dap/client.rs:32-48
pub fn create_adapter(&mut self, adapter_type: &str) -> Result<(), String> {
    match adapter_type {
        "lldb" | "rust" => {
            self.adapter = Some(Box::new(LldbAdapter::new()));
            Ok(())
        }
        "js-debug" | "javascript" | "typescript" => {
            self.adapter = Some(Box::new(JsDebugAdapter::new()));
            Ok(())
        }
        "delve" | "go" => {
            self.adapter = Some(Box::new(GoAdapter::new()));
            Ok(())
        }
        _ => Err(format!("Unknown adapter type: {}", adapter_type)),
    }
}
```

**Problem**: Adding a new adapter requires modifying `DapClient`. No plugin registration mechanism.

#### Adapter Registry in `dap_installer.rs`

```rust
// src-tauri/src/dap_installer.rs:20-63
static ADAPTER_REGISTRY: Lazy<Vec<AdapterInfo>> = Lazy::new(|| {
    vec![
        AdapterInfo { id: "lldb", ... },
        AdapterInfo { id: "delve", ... },
        AdapterInfo { id: "js-debug", ... },
        AdapterInfo { id: "debugpy", ... },
    ]
});
```

**Problem**: Hardcoded list. External plugins cannot register adapters.

### 3. Liskov Substitution Principle (LSP)

The `DebugAdapter` trait is well-designed:

```rust
pub trait DebugAdapter: Send + Sync {
    fn name(&self) -> &'static str;
    fn start(&mut self, args: &LaunchRequestArgs) -> Result<(), String>;
    fn initialize(&mut self) -> Result<Capabilities, String>;
    // ... 15 more methods
}
```

**Good**: All adapters implement the same interface. No LSP violations.

### 4. Interface Segregation Principle (ISP) Issues

The `DebugAdapter` trait is cohesive, but `DapConnection` exposes too much:

```rust
// src-tauri/src/dap/adapter.rs
pub struct DapConnection {
    process: Option<std::process::Child>,
    stdin: Option<ChildStdin>,
    tcp_stream: Option<TcpStream>,
    seq: u32,
    response_tx: Sender<DapMessage>,
    response_rx: Option<Arc<Mutex<mpsc::Receiver<DapMessage>>>>,
    event_buffer: Vec<DapEvent>,
}
```

**Problem**: Adapters must understand connection internals (TCP vs stdio).

### 5. Dependency Inversion Principle (DIP) Violations

#### High-level modules depend on concrete implementations:

```rust
// src-tauri/src/commands.rs
use crate::dap::{DapClient, LaunchRequestArgs};
use crate::dap_installer;
use crate::process::{ProcessManager, ProcessId, ProcessInfo};
use crate::run_config::{RunConfiguration, ...};
```

**Problem**: Commands module directly depends on concrete types, not abstractions.

#### No dependency injection:

```rust
// src-tauri/src/main.rs
.manage(Mutex::new(dap::DapClient::new()))
.manage(dap_installer::DebugAdapterInstaller::new())
```

State is managed globally. No way to inject mock implementations for testing.

---

## Current File Structure Issues - RESOLVED

### Before Refactor

| File | Issues | Status |
|------|--------|--------|
| `commands.rs` | 875 lines, 40+ unrelated commands | SPLIT into 6 modules |
| `dap/adapter.rs` | 825 lines, protocol + connection + shell | EXTRACTED to connection.rs |
| `dap/adapters/js_debug.rs` | 250 lines, hardcoded paths | USES config module |
| `dap/adapters/go.rs` | 485 lines, cleanup logic mixed | USES config module |
| `dap_installer.rs` | 434 lines, registry + installation | USES AdapterRegistry |

### After Refactor

| Module | Files | Purpose |
|--------|-------|---------|
| `commands/` | 6 files | Single responsibility per file |
| `dap/` | 8 files | Separated protocol, adapter, service |
| `config/` | 1 file | Centralized configuration |

### Hardcoded Values - RESOLVED

All hardcoded values moved to `config/mod.rs`:

```rust
// config/mod.rs
pub struct PathConfig {
    pub adapter_dir: PathBuf,      // ~/.openstorm/adapters
    pub lsp_server_dir: PathBuf,   // ~/.openstorm/lsp
    pub template_dir: PathBuf,     // ~/.openstorm/templates
    pub debug_output_dir: PathBuf, // ./.openstorm/debug
}

pub struct PortConfig {
    pub js_debug_port: u16,        // 8123
}

pub struct AdapterConfig {
    pub lldb: LldbConfig,          // binary name, args, search paths
    pub delve: DelveConfig,        // binary name, args, output name
    pub js_debug: JsDebugConfig,   // repo, cache subdir, node args
    pub debugpy: DebugpyConfig,    // module, args, verify command
}
```

Adapters now use configuration:

```rust
// dap/adapters/js_debug.rs
let cache_dir = crate::config::get_paths().adapter_dir.clone();

// dap/adapters/go.rs
let output_path = workspace_debug_dir.join(&crate::config::get_adapters().delve.debug_output_name);

// dap/adapter.rs
let port = crate::config::get_ports().js_debug_port;
```

---

## Proposed Architecture

### Guiding Principles

1. **Separation of Concerns**: Each module has one reason to change
2. **Dependency Inversion**: Depend on abstractions, not concretions
3. **Open for Extension**: New adapters without modifying core
4. **Configuration over Hardcoding**: Paths, ports, commands configurable
5. **Testability**: Mock implementations possible

### Actual Module Structure (After Refactor)

```
src-tauri/src/
├── main.rs                          # App bootstrap, state registration
├── config/                          # Configuration (NEW)
│   ├── mod.rs                       # PathConfig, PortConfig, AdapterConfig
│   └── ...                          # Centralized paths, ports, settings
│
├── commands/                        # IPC Command Handlers (SPLIT)
│   ├── mod.rs                       # Re-exports
│   ├── file.rs                      # File I/O commands
│   ├── directory.rs                 # Directory commands
│   ├── run.rs                       # Run configuration commands
│   ├── debug.rs                     # Debug session commands
│   ├── adapter.rs                   # Adapter installation commands
│   └── watch.rs                     # Watch expressions
│
├── dap/                             # Debug Core (DAP)
│   ├── mod.rs
│   ├── types.rs                     # DAP types (StackFrame, etc.)
│   ├── adapter.rs                   # DebugAdapter trait (40 lines)
│   ├── adapter_registry.rs          # Plugin-ready registry (NEW)
│   ├── connection.rs                # JSON-RPC protocol (NEW - 470 lines)
│   ├── client.rs                    # DapClient wrapper
│   ├── service.rs                   # DebugService layer (NEW)
│   ├── watch.rs                     # Watch expressions
│   └── adapters/                    # Concrete Adapters
│       ├── mod.rs
│       ├── lldb.rs
│       ├── js_debug.rs
│       └── go.rs
│
├── process/                         # Process Management
│   ├── mod.rs
│   ├── manager.rs                   # ProcessManager
│   └── output.rs                    # Output streaming
│
├── run_config/                      # Run Configuration
│   ├── mod.rs
│   ├── configuration.rs             # RunConfiguration struct
│   ├── detector.rs                  # Auto-detection
│   ├── storage.rs                   # Persistence
│   └── languages/                   # Language-specific detectors
│
├── dap_installer.rs                 # Adapter Installation
├── lsp.rs                           # LSP Client
├── lsp_installer.rs                 # LSP Installation
├── templates.rs                     # Project templates
└── file_watcher.rs                  # File system watcher
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Lit.js)                                  │
│                         (Commands + Events)                                  │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼ IPC Layer
┌─────────────────────────────────────────────────────────────────────────────┐
│  COMMANDS LAYER (Thin handlers, delegate to services)                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐│
│  │ file.rs     │ │ process.rs  │ │ debug/      │ │ adapter_installer.rs    ││
│  │ directory.rs│ │ run.rs      │ │  session.rs │ │                         ││
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └───────────┬─────────────┘│
└─────────┼───────────────┼───────────────┼────────────────────┼──────────────┘
          │               │               │                    │
          ▼               ▼               ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SERVICE LAYER (Business Logic)                                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────────────┐│
│  │ ProcessService  │ │ DebugService    │ │ AdapterInstallationService      ││
│  │ • Spawn         │ │ • Session mgmt  │ │ • Registry                      ││
│  │ • Stream output │ │ • Breakpoints   │ │ • Download                      ││
│  │ • Lifecycle     │ │ • Introspection │ │ • Verify                        ││
│  └─────────────────┘ └────────┬────────┘ └─────────────────────────────────┘│
│                               │                                               │
│              ┌────────────────┼────────────────┐                             │
│              │                │                │                             │
│              ▼                ▼                ▼                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────────────┐│
│  │AdapterRegistry  │ │ConnectionPool   │ │PluginRegistry (future)          ││
│  │• Register       │ │• Stdio          │ │• Load plugins                   ││
│  │• Resolve        │ │• TCP            │ │• Discover adapters              ││
│  └────────┬────────┘ └────────┬────────┘ └─────────────────────────────────┘│
│           │                   │                                               │
│           ▼                   ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                      DEBUG ADAPTER INTERFACE                            │ │
│  │                    (trait: DebugAdapter)                                │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│           │                   │                   │                           │
│           ▼                   ▼                   ▼                           │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────────────┐ │
│  │  LldbAdapter    │ │  JsDebugAdapter │ │  GoAdapter / PythonAdapter      │ │
│  └─────────────────┘ └─────────────────┘ └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  EXTERNAL PROCESSES                                                         │
│  lldb-dap        node (js-debug)        dlv (delve)        python (debugpy) │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Abstractions

#### 1. Adapter Registry (Plugin-Ready)

```rust
// debug/adapter/registry.rs
pub trait AdapterProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn name(&self) -> &'static str;
    fn languages(&self) -> &'static [&'static str];
    fn create(&self, config: AdapterConfig) -> Result<Box<dyn DebugAdapter>, String>;
}

pub struct AdapterRegistry {
    providers: HashMap<String, Box<dyn AdapterProvider>>,
}

impl AdapterRegistry {
    pub fn register(&mut self, provider: Box<dyn AdapterProvider>);
    pub fn create(&self, id: &str, config: AdapterConfig) -> Result<Box<dyn DebugAdapter>, String>;
    pub fn for_language(&self, language: &str) -> Option<&dyn AdapterProvider>;
}
```

#### 2. Connection Abstraction

```rust
// debug/connection/traits.rs
pub trait DapConnection: Send + Sync {
    fn send(&mut self, message: &DapMessage) -> Result<(), String>;
    fn receive(&mut self, timeout: Duration) -> Result<DapMessage, String>;
    fn terminate(&mut self) -> Result<(), String>;
}

// Implementations: stdio.rs, tcp.rs
```

#### 3. Service Layer

```rust
// debug/services/mod.rs
pub trait DebugService: Send + Sync {
    fn start_session(&mut self, config: DebugConfig) -> Result<SessionId, String>;
    fn stop_session(&mut self, id: SessionId) -> Result<(), String>;
    fn execute_action(&mut self, id: SessionId, action: DebugAction) -> Result<(), String>;
}
```

#### 4. Configuration

```rust
// config/mod.rs
pub struct AppConfig {
    pub paths: PathConfig,
    pub ports: PortConfig,
    pub adapters: AdapterConfig,
}

pub struct PathConfig {
    pub cache_dir: PathBuf,      // ~/.openstorm
    pub adapter_dir: PathBuf,    // ~/.openstorm/adapters
    pub debug_output_dir: PathBuf, // ./.openstorm/debug
}

pub struct PortConfig {
    pub js_debug_port: u16,      // 8123
}
```

---

## Migration Path

### Phase 1: Extract Configuration (Low Risk) - COMPLETED
- Create `config/` module
- Move hardcoded paths/ports to configuration
- Update all references

### Phase 2: Extract Commands (Medium Risk) - COMPLETED
- Split `commands.rs` into submodules
- No logic changes, just file reorganization

### Phase 3: Adapter Registry (Medium Risk) - COMPLETED
- Create `AdapterRegistry` with registration API
- Update adapter creation to use registry
- Adapters register themselves at startup

### Phase 4: Connection Abstraction (High Risk) - COMPLETED
- Extract `DapConnection` to separate module
- Protocol handling separated from adapter trait
- `connection.rs` handles raw DAP, `adapter.rs` defines trait

### Phase 5: Service Layer (Medium Risk) - COMPLETED
- Create `DebugService` wrapper
- High-level debug operations
- Session lifecycle management

### Phase 6: Plugin Infrastructure (Future)
- Define plugin trait
- Plugin discovery mechanism
- Dynamic adapter loading

---

## Plugin Architecture Foundation

### What's Needed for Plugins

1. **Adapter Registration API**
   ```rust
   pub fn register_adapter(provider: Box<dyn AdapterProvider>);
   ```

2. **Plugin Manifest**
   ```rust
   pub struct PluginManifest {
       pub name: String,
       pub version: String,
       pub adapters: Vec<String>,
       pub entry_point: String,
   }
   ```

3. **Discovery Mechanism**
   - Scan `~/.openstorm/plugins/` directory
   - Load `manifest.json` from each plugin
   - Call plugin's `register` function

4. **Sandboxing (Future)**
   - Plugins run in separate process
   - IPC via DAP-like protocol

### Base Requirements (What We Need Now)

1. **Adapter Registry** - Replace hardcoded match with registry lookup
2. **Configuration System** - Centralized config for paths, ports, commands
3. **Service Traits** - Abstractions for debug, process, installation services
4. **Factory Pattern** - For creating adapters, connections, installers

---

## Recommendations Summary - ALL COMPLETED

### Completed Actions

| Priority | Action | Impact | Status |
|----------|--------|--------|--------|
| High | Extract `commands.rs` into submodules | Maintainability | DONE |
| High | Create `config/` module for hardcoded values | Maintainability | DONE |
| Medium | Implement `AdapterRegistry` | Extensibility | DONE |
| Medium | Create service layer for debug operations | Testability | DONE |
| Low | Extract connection trait | Flexibility | DONE |

### Results

| Metric | Before | After |
|--------|--------|-------|
| Files | 15 | 30+ |
| Largest file | 875 lines | 470 lines |
| Hardcoded values | 50+ | 0 (all in config) |
| Adapter registration | Hardcoded match | Registry pattern |
| Protocol handling | Mixed with adapter | Separated module |

### Long-Term Vision

1. **Plugin System**: Third-party adapters via plugins (foundation ready)
2. **Dynamic Loading**: Load adapters without recompiling (registry ready)
3. **Configuration UI**: User-configurable paths, ports, commands (config module ready)
4. **Testing**: Mock implementations for integration tests (traits available)

---

## Appendix: File Size Comparison

### Before Refactor

| File | Lines | Responsibilities |
|------|-------|-----------------|
| commands.rs | 875 | 10+ unrelated concerns |
| dap/adapter.rs | 825 | Protocol + Connection + Shell |
| dap/adapters/go.rs | 485 | Protocol + Cleanup |
| dap_installer.rs | 434 | Registry + Install + Verify |
| dap/client.rs | 337 | Session + Adapter mgmt |
| process/manager.rs | 275 | Process lifecycle |

### After Refactor

| Module | Files | Total Lines | Purpose |
|--------|-------|-------------|---------|
| `commands/` | 6 | ~900 | Single responsibility each |
| `dap/` | 8 | ~1,500 | Separated concerns |
| `config/` | 1 | ~300 | Centralized configuration |
| `process/` | 2 | ~300 | Process management |
| `run_config/` | 4 | ~400 | Run configuration |
| `dap_installer.rs` | 1 | ~430 | Installation logic |

**Total Debug/Run Related**: ~4,000 lines across 30+ files (each with single responsibility)
