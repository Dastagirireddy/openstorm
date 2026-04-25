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

## Strict Development Protocols

### 1. Theming & Styling (Tailwind 4)
- **Zero Custom CSS:** Use ONLY Tailwind 4 utility classes.
- **Semantic Colors:** Use color variables only (e.g., `bg-workbench`, `text-main`). NEVER hardcode hex/RGB or default Tailwind shades (e.g., `bg-blue-500`).
- **Icons:** STRICTLY use Iconify. NO inline SVGs. Use `icon="icon-set:name"` and style via Tailwind `text-*` classes.

### 2. Architectural Rigor (SOLID)
- **Strict SOLID:** Adhere to Single Responsibility and Interface Segregation.
- **File Length:** Maximum 250-300 lines per file. Break logic into Services/Modules if exceeded.
- **Clean Naming:** Standardized naming (PascalCase for Components, snake_case for Rust).

### 3. Performance & Modern Enterprise Standards
- **Lazy Loading:** Use dynamic `import()` for all non-essential modules (Terminal, Search, Settings) to ensure fast initialization.
- **Native Experience:** UI must be high-density, compact, and match modern enterprise desktop apps (macOS/Windows style).
- **Efficiency:** Minimize IPC overhead between Rust and Lit.js. Prefer zero-copy patterns in Rust.

### 4. Implementation Workflow
- **Research First:** Align with modern IDE benchmarks (VS Code/JetBrains) before building major UI features.
- **Refactoring:** If a file becomes "generic" or messy, prioritize refactoring to follow the internal style guide over adding new features.

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

## UI/UX Guidelines

- **No custom CSS** — Use Tailwind CSS 4 exclusively for styling
- **Brand colors** — Use `indigo` or `purple` as the primary brand colors
- **Native desktop UI** — Style components to match native desktop applications (macOS/Windows), not web apps:
  - Compact, dense layouts with smaller spacing
  - Native-like form controls and buttons
  - Subtle borders and shadows
  - System-like typography and spacing
