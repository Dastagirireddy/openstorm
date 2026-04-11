# Contributing to OpenStorm

Thank you for your interest in contributing to OpenStorm! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- Node.js 18+
- Rust 1.75+
- pnpm (recommended) or npm

### Setup

```bash
# Clone the repository
git clone https://github.com/Dastagirireddy/openstorm.git
cd openstorm

# Install dependencies
pnpm install

# Run in development mode
pnpm run tauri dev
```

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Create a new issue with:
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, version)

### Suggesting Features

1. Open an issue describing the feature
2. Explain the use case and benefits
3. Wait for maintainer feedback before implementing

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit with clear messages
6. Push and open a pull request

## Code Style

### Rust

- Follow Rust API Guidelines
- Use `rustfmt` for formatting
- Run Clippy for linting

### TypeScript/JavaScript

- Use TypeScript for type safety
- Follow existing code style
- Use ESLint if configured

## Development Workflow

1. **Frontend changes**: Run `pnpm dev` for Vite dev server
2. **Full app**: Run `pnpm run tauri dev` for Tauri + Vite
3. **Build**: Run `pnpm run tauri build` for production build

## Areas for Contribution

See the [Roadmap](README.md#roadmap) in README.md for planned features:

- CodeMirror 6 integration enhancements
- Tree-sitter highlighting improvements
- LSP bridge implementation
- Search functionality
- DAP debugger integration
- Theme engine
- Git integration

## Questions?

Feel free to open an issue for any questions or discussions.

---

By contributing, you agree that your contributions will be licensed under the MIT License.
