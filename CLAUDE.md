# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm install                    # Install dependencies
pnpm run tauri dev              # Run in development mode (starts Vite + Tauri)
pnpm dev                        # Run Vite dev server only

# Build
pnpm run tauri build            # Build for production
pnpm build                      # Build frontend only

# The Tauri CLI can also be used directly
cargo tauri dev                 # Alternative dev command
cargo tauri build               # Alternative build command
```

## Architecture

OpenStorm is a Tauri-based IDE with a Rust backend and Lit.js frontend:

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (Lit.js + Webview)                                 │
│  • CodeMirror 6 (Editor)  • Signals (State)  • Xterm.js    │
└────────────────────┬────────────────────────────────────────┘
                     │ IPC (Events/Commands)
┌────────────────────┴────────────────────────────────────────┐
│ BACKEND (Tauri + Rust)                                      │
│  • Tree-sitter/LSP  • Portable PTY  • DAP Client           │
└─────────────────────────────────────────────────────────────┘
```

### Frontend (`src/`)
- **Entry**: `src/main.ts` - Root Lit component (`<openstorm-app>`)
- **Components**: Lit web components in `src/components/`:
  - `editor-panel.ts` - CodeMirror 6 editor
  - `file-sidebar.ts` - File explorer tree
  - `tab-bar.ts` - Tab management
  - `terminal-panel.ts` - xterm.js terminal
  - `search-overlay.ts` - Quick open/search
  - `status-bar.ts` - Status bar
- **Styling**: Tailwind CSS 4 + CSS custom properties
- **State**: Event-driven via CustomEvents (`open-file`, `content-changed`, etc.)

### Backend (`src-tauri/`)
- **Entry**: `src-tauri/src/main.rs` - Tauri app setup
- **Commands** (`commands.rs`): File I/O, search, directory listing
  - `read_file`, `write_file`, `list_directory`
  - `create_file`, `delete_file`, `rename_file`
  - `search_files` - Fuzzy file search
- **File Watcher** (`file_watcher.rs`): notify-rs for file change events
- **LSP Client** (`lsp.rs`): Language Server Protocol (placeholder)
- **Config**: `tauri.conf.json` - Window, bundle, and build settings

### Key Dependencies
- **Rust**: `tauri@2`, `tokio`, `tree-sitter`, `notify`, `portable-pty`, `lsp-types`
- **Frontend**: `lit`, `codemirror`, `xterm`, `@tauri-apps/api`

## Project Structure

```
openstorm/
├── src/                    # Frontend (Lit.js + TypeScript)
│   ├── main.ts            # App entry, keyboard shortcuts
│   ├── components/        # Lit web components
│   └── styles.css         # Global styles, CSS variables
├── src-tauri/
│   ├── src/
│   │   ├── main.rs        # Tauri bootstrap, command registration
│   │   ├── commands.rs    # IPC handlers (file ops, search)
│   │   ├── file_watcher.rs # File system watcher
│   │   └── lsp.rs         # LSP client (incomplete)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── tsconfig.json
└── vite.config.ts
```
