# OpenStorm

A high-performance, lightweight IDE built with Tauri, Rust, and Lit.js, focused on professional developer UX without the JVM overhead.

## Features

### Core Editor
- **Multiple Buffers**: Tabbed interface for opening multiple files
- **Syntax Highlighting**: High-performance highlighting via CodeMirror 6
- **Language Support**: Syntax highlighting for Rust, TypeScript, Go, Python, JavaScript, HTML, CSS, JSON, Markdown, YAML, C++, and Java

### Search & Navigation
- **Quick Open** (`Cmd/Ctrl+P`): Fuzzy file search overlay
- **File Explorer**: Efficient directory tree handling

### Terminal
- **Integrated PTY**: Native terminal with colors and mouse events via xterm.js

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+P` | Quick Open (files) |
| `Cmd/Ctrl+O` | Open File |
| `Cmd/Ctrl+K, Cmd/Ctrl+O` | Open Folder |

## Architecture

```
+-------------------------------------------------------------+
|              FRONTEND (Lit.js + Webview)                    |
|  +------------------+  +-----------------+  +------------+  |
|  |   CodeMirror 6   |  |     Signals     |  |  Xterm.js  |  |
|  | (Editor Engine)  |  | (State Mgmt)    |  | (Terminal) |  |
|  +------------------+  +-----------------+  +------------+  |
+-----------^----------------------|--------------------------+
            | IPC (Events/Commands)| (JSON-RPC / Binary)
+-----------v----------------------v--------------------------+
|                BACKEND (Tauri + Rust)                       |
|  +------------------+  +-----------------+  +------------+  |
|  |  Tree-sitter/LSP |  |  Portable PTY   |  | DAP Client |  |
|  |  (Intelligence)  |  |  (Shell Mgmt)   |  | (Debugger) |  |
|  +------------------+  +-----------------+  +------------+  |
+-------------------------------------------------------------+
```

## Tech Stack

- **Backend**: Rust, Tauri 2.x
- **Frontend**: Lit.js, CodeMirror 6, TypeScript
- **Terminal**: xterm.js with WebGL renderer
- **Syntax**: Tree-sitter
- **Styling**: Tailwind CSS 4

## Getting Started

### Prerequisites

- Node.js 18+
- Rust 1.75+
- pnpm (recommended) or npm
- For macOS: Xcode Command Line Tools
- For Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`
- For Windows: Visual Studio C++ Build Tools

### Installation

```bash
# Install dependencies
pnpm install

# Run in development mode (starts Vite + Tauri)
pnpm run tauri dev

# Build for production
pnpm run tauri build
```

### Project Structure

```
openstorm/
├── src/                    # Frontend source code
│   ├── main.ts            # App entry point
│   └── components/        # Lit.js web components
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── main.rs        # Tauri app entry
│   │   ├── commands.rs    # IPC command handlers
│   │   ├── file_watcher.rs # File system watcher
│   │   └── lsp.rs         # LSP client
│   ├── icons/             # App icons
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
├── assets/                # Static assets
├── package.json           # Node.js dependencies
└── vite.config.ts         # Vite bundler config
```

## Roadmap

### Phase 1 (Infrastructure) ✅
- [x] Tauri + Lit scaffolding
- [x] Basic layout engine
- [x] File I/O commands

### Phase 2 (Editor)
- [ ] CodeMirror 6 integration
- [ ] Tree-sitter highlighting
- [ ] LSP bridge

### Phase 3 (Intelligence)
- [ ] "Search Everywhere" fuzzy logic
- [ ] Go-to-Definition
- [ ] Symbol search

### Phase 4 (Debugger)
- [ ] DAP implementation
- [ ] Breakpoint UI
- [ ] Variable tree

### Phase 5 (Polish)
- [ ] Theme engine
- [ ] Git integration
- [ ] Performance profiling

## Performance Goals

| Metric | Target |
|--------|--------|
| Startup Time | < 2 seconds |
| Input Latency | < 16ms (60Hz) |
| Memory (Idle) | < 250MB |
| UI Thread | 60 FPS |

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

---

Built with ⚡ by the OpenStorm Team
