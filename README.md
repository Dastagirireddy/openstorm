# OpenStorm

A high-performance AI-powered IDE built with Tauri, Rust, and Lit.js. Features an integrated AI agent with RAG (Retrieval-Augmented Generation), multi-provider LLM support, and tool calling — all without the JVM overhead.

## Features

### AI Agent
- **Multi-Provider LLM Support**: Ollama (local), OpenAI, Anthropic, LM Studio
- **RAG (Retrieval-Augmented Generation)**: BM25 keyword search with auto-context injection
- **Tool Calling**: Read/write/edit files, search code, run commands, check diagnostics
- **Thinking Model Support**: Captures reasoning tokens from thinking models (e.g., DeepSeek)
- **Mermaid Diagrams**: Renders mermaid diagrams from LLM responses
- **Token Diet**: Smart truncation, dynamic tool selection, and context optimization

### Core Editor
- **Multiple Buffers**: Tabbed interface for opening multiple files
- **Syntax Highlighting**: High-performance highlighting via CodeMirror 6
- **Language Support**: Rust, TypeScript, Go, Python, JavaScript, HTML, CSS, JSON, Markdown, YAML, C++, Java

### Search & Navigation
- **Quick Open** (`Cmd/Ctrl+P`): Fuzzy file search with live results
- **File Explorer**: Project tree with dynamic exclusion detection (Rust/Node/Go/Python)
- **Global Search** (`Cmd/Ctrl+Shift+F`): Regex-aware search across all files

### Terminal
- **Integrated PTY**: Native terminal with colors and mouse events via xterm.js

### Git Integration
- **Git Status**: View staged/unstaged changes
- **Git Diff**: View file changes inline
- **Git Commit**: Commit changes from the UI
- **Git History**: View commit history per file

### UI/UX
- **Activity Bar**: Quick access to panels (Explorer, Search, Git, AI, Settings)
- **Status Bar**: File info, line/column, language, git branch
- **Theme Engine**: Dark/light themes with customizable color palettes
- **Drag & Drop**: Drop files into the AI panel for context

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (Lit.js + Webview)                                 │
│  • CodeMirror 6 (Editor)  • Signals (State)  • Xterm.js    │
│  • AI Panel (Chat/Mermaid)• File Explorer   • Git Panel    │
└────────────────────┬────────────────────────────────────────┘
                     │ IPC (Events/Commands)
┌────────────────────┴────────────────────────────────────────┐
│ BACKEND (Tauri + Rust)                                      │
│  • AI Agent (RAG + Tools)  • Portable PTY   • DAP Client   │
│  • LLM Providers (4)       • File Watcher   • LSP Client   │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Backend**: Rust, Tauri 2.x
- **Frontend**: Lit.js, CodeMirror 6, TypeScript
- **AI/LLM**: Ollama, OpenAI, Anthropic, LM Studio
- **RAG**: BM25 keyword search, LanceDB (planned)
- **Terminal**: xterm.js with WebGL renderer
- **Syntax**: Tree-sitter (planned)
- **Styling**: Tailwind CSS 4

## Getting Started

### Prerequisites

- Node.js 18+
- Rust 1.75+
- pnpm (recommended) or npm
- For macOS: Xcode Command Line Tools
- For Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`
- For Windows: Visual Studio C++ Build Tools
- **LLM Provider**: Ollama (local), OpenAI API key, or Anthropic API key

### Installation

```bash
# Install dependencies
pnpm install

# Run in development mode (starts Vite + Tauri)
pnpm run tauri dev

# Build for production
pnpm run tauri build
```

### AI Setup

1. **Ollama (recommended for local)**: Install from [ollama.ai](https://ollama.ai), then pull a model:
   ```bash
   ollama pull deepseek-coder:6.7b
   ```

2. **OpenAI**: Set your API key in Settings > Providers

3. **Anthropic**: Set your API key in Settings > Providers

## Project Structure

```
openstorm/
├── src/                          # Frontend (Lit.js + TypeScript)
│   ├── main.ts                   # App entry, keyboard shortcuts
│   ├── components/
│   │   ├── ai/                   # AI panel, chat, event handling
│   │   ├── explorer/             # File explorer tree
│   │   ├── terminal/             # xterm.js terminal
│   │   ├── editor/               # CodeMirror editor, tabs
│   │   ├── git/                  # Git panel, diff viewer
│   │   └── layout/               # Status bar, icons, mermaid
│   ├── lib/
│   │   ├── ai/                   # AI state, storage, message parsing
│   │   └── services/             # Theme, settings stores
│   └── themes/                   # Theme definitions
├── src-tauri/                    # Rust backend
│   └── src/
│       ├── main.rs               # Tauri bootstrap
│       ├── commands.rs           # IPC handlers (file ops, search)
│       ├── file_watcher.rs       # File system watcher
│       └── ai/                   # AI agent, providers, RAG, tools
│           ├── agent.rs          # Agent loop, tool execution
│           ├── ollama.rs         # Ollama provider
│           ├── openai.rs         # OpenAI provider
│           ├── anthropic.rs      # Anthropic provider
│           ├── embedding_store.rs # BM25 keyword search
│           ├── rag.rs            # Code chunking, indexing
│           ├── tools.rs          # Tool definitions & execution
│           └── ignore.rs         # Project-type detection, exclusions
├── package.json
├── Cargo.toml
├── vite.config.ts
└── tauri.conf.json
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+P` | Quick Open (files) |
| `Cmd/Ctrl+O` | Open File |
| `Cmd/Ctrl+K, Cmd/Ctrl+O` | Open Folder |
| `Cmd/Ctrl+Shift+F` | Global Search |
| `Cmd/Ctrl+Shift+X` | Clear AI Chat |
| `Tab` | Switch AI Agents |
| `Cmd/Ctrl+P` (in AI) | AI Commands |

## Roadmap

### Core ✅
- [x] Tauri + Lit scaffolding
- [x] CodeMirror 6 integration
- [x] File explorer with project detection
- [x] Integrated terminal (xterm.js)
- [x] Git integration (status, diff, commit)
- [x] Theme engine (dark/light)
- [x] Activity bar and status bar

### AI Agent ✅
- [x] Multi-provider LLM support (Ollama, OpenAI, Anthropic, LM Studio)
- [x] RAG with BM25 keyword search
- [x] Auto-context injection
- [x] Tool calling (read, write, edit, search, run)
- [x] Thinking model support (DeepSeek, etc.)
- [x] Mermaid diagram rendering
- [x] Token usage tracking

### Planned
- [ ] LanceDB vector search for RAG
- [ ] Tree-sitter syntax highlighting
- [ ] LSP integration
- [ ] DAP debugger
- [ ] Dynamic tool selection (reduce tool count)
- [ ] Git blame integration
- [ ] Performance profiling

## Performance Goals

| Metric | Target | Status |
|--------|--------|--------|
| Startup Time | < 2 seconds | ✅ Achieved |
| Input Latency | < 16ms (60Hz) | ✅ Achieved |
| Memory (Idle) | < 250MB | ✅ Achieved |
| UI Thread | 60 FPS | ✅ Achieved |

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

---

Built with ⚡ by the OpenStorm Team
