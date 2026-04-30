# Viewer Architecture

This document describes the plugin-based viewer system that allows OpenStorm to render different file types with specialized components.

## Overview

The viewer architecture follows a **plugin pattern** where each file type is handled by a dedicated viewer component. The `FileViewerContainer` dynamically swaps viewers based on the file extension.

```
┌─────────────────────────────────────────────────────────────────┐
│                     FileViewerContainer                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Viewer Registry                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │   TextView  │  │ ImageView   │  │  DBView     │  ...  │  │
│  │  │  (*.ts,*)   │  │  (*.png)    │  │  (*.db)     │       │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │  │
│  │         │                │                │               │  │
│  │         └────────────────┴────────────────┘               │  │
│  │                          │                                │  │
│  │                  getViewerForExtension()                  │  │
│  └──────────────────────────┼────────────────────────────────┘  │
│                             │                                   │
│  ┌──────────────────────────▼────────────────────────────────┐  │
│  │              Active Viewer Instance                        │  │
│  │   mount() → loadFile() → render → unmount()               │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
              ┌───────────────┴───────────────┐
              │                               │
       ┌──────▼──────┐                 ┌──────▼──────┐
       │  main.ts    │                 │ Other       │
       │  (tabs)     │                 │ Components  │
       └─────────────┘                 └─────────────┘
```

## File Structure

```
src/viewers/
├── ARCHITECTURE.md          # This document
├── types.ts                 # Core interfaces (FileViewer, ViewerMetadata, ViewerAction)
├── registry.ts              # ViewerRegistry class + default registrations
├── index.ts                 # Module exports
└── builtin/                 # Built-in viewers
    ├── index.ts
    ├── text-viewer.ts       # CodeMirror-based text/code editor
    ├── image-viewer.ts      # [TODO] Image previewer
    ├── markdown-viewer.ts   # [TODO] Markdown renderer
    ├── database-viewer.ts   # [TODO] SQL/database editor
    └── diagram-viewer.ts    # [TODO] Diagram visualizer

src/components/viewers/
├── index.ts
└── file-viewer-container.ts  # Container that swaps viewers
```

## Core Interfaces

### FileViewer

All viewers must implement this interface:

```typescript
interface FileViewer {
  readonly metadata: ViewerMetadata;

  // Lifecycle
  mount(container: HTMLElement): void;
  unmount(): void;

  // File operations
  loadFile(path: string, content: string): Promise<void>;
  saveFile?(): Promise<string>;

  // State
  isDirtyState(): boolean;
  canSave(): boolean;

  // Optional capabilities
  getToolbarActions?(): ViewerAction[];
}
```

### ViewerMetadata

Describes what file types a viewer supports:

```typescript
interface ViewerMetadata {
  id: string;                    // Unique identifier
  displayName: string;           // Human-readable name
  supportedExtensions: string[]; // File extensions (e.g., ['ts', 'js'] or ['*'])
  supportedMimeTypes?: string[]; // Optional MIME types (e.g., ['image/*'])
}
```

### ViewerAction

Toolbar buttons that a viewer can provide:

```typescript
interface ViewerAction {
  id: string;
  icon: string;           // Iconify icon name
  label: string;
  onClick: () => void;
  enabled?: boolean;
}
```

## Data Flow

### Opening a File

```
┌──────────────┐
│  main.ts     │  tabs = [{id, path, content, ...}]
│              │  activeTabId = "some-id"
└──────┬───────┘
       │
       │ Lit property binding
       │ [tabs]="tabs" [activeTabId]="activeTabId"
       ▼
┌──────────────────────────────┐
│  FileViewerContainer         │  updated() hook fires
│                              │  → finds active tab
│  ┌────────────────────────┐  │
│  │  registry.getViewer()  │  │  Looks up extension in registry
│  └──────────┬─────────────┘  │
│             │                │
│             ▼                │
│  ┌────────────────────────┐  │
│  │  viewer.mount()        │  │  Attaches to DOM container
│  │  viewer.loadFile()     │  │  Renders content
│  └────────────────────────┘  │
└──────────────────────────────┘
```

### Content Change Flow

```
┌──────────────────────────────┐
│  TextViewer (CodeMirror)     │  User types → docChanged
│                              │
│  EditorView.updateListener   │
└──────────┬───────────────────┘
           │
           │ dispatch('content-changed', {path, content, isModified})
           ▼
┌──────────────────────────────┐
│  main.ts                     │  handleContentChanged()
│                              │  → updates tabs state
│                              │  → triggers save indicator
└──────────────────────────────┘
```

### Save Flow

```
┌──────────────┐
│  main.ts     │  User presses Ctrl+S
│              │  → saveActiveFile()
└──────┬───────┘
       │
       │ dispatch('save-file')
       ▼
┌──────────────────────────────┐
│  FileViewerContainer         │  handleSaveFile()
│                              │  → currentViewer.saveFile()
│  ┌────────────────────────┐  │
│  │  TextViewer.saveFile() │  │  → invoke('write_file', ...)
│  └──────────┬─────────────┘  │
│             │                │
│             │ dispatch('file-saved', {path, content})
│             ▼                │
│  ┌────────────────────────┐  │
│  │  main.ts               │  │  handleFileSaved()
│  │  → update _savedContent│  │  → clear modified state
│  └────────────────────────┘  │
└──────────────────────────────┘
```

## Creating a New Viewer

### Step 1: Create the Viewer Class

The `ImageViewer` is a complete example with zoom, pan, and metadata display:

```typescript
// src/viewers/builtin/image-viewer.ts

import type { FileViewer, ViewerMetadata, ViewerAction } from '../types.js';
import { invoke } from '@tauri-apps/api/core';

interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
}

export class ImageViewer implements FileViewer {
  readonly metadata: ViewerMetadata = {
    id: 'image',
    displayName: 'Image Viewer',
    supportedExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'],
  };

  private container: HTMLElement | null = null;
  private filePath: string = '';
  private base64Content: string = '';
  private metadata: ImageMetadata | null = null;
  private scale: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;

  mount(container: HTMLElement): void {
    this.container = container;
    this.setupEventListeners();
  }

  unmount(): void {
    this.removeEventListeners();
    this.container = null;
  }

  async loadFile(path: string, content: string): Promise<void> {
    this.filePath = path;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // Read file as base64 from backend
    this.base64Content = await invoke<string>('read_file_base64', { path });

    // Fetch metadata
    this.metadata = await invoke<ImageMetadata>('get_image_metadata', { path });

    this.render();
  }

  isDirtyState(): boolean { return false; }
  canSave(): boolean { return false; }

  getToolbarActions(): ViewerAction[] {
    return [
      { id: 'zoom-out', icon: 'lucide:zoom-out', label: 'Zoom Out', onClick: () => this.zoom(0.8) },
      { id: 'zoom-reset', icon: 'lucide:zoom-reset', label: 'Reset', onClick: () => this.resetZoom() },
      { id: 'zoom-in', icon: 'lucide:zoom-in', label: 'Zoom In', onClick: () => this.zoom(1.25) },
      { id: 'fit-screen', icon: 'lucide:minimize-2', label: 'Fit', onClick: () => this.fitToScreen() },
    ];
  }

  private render(): void {
    // Creates image element with pan/zoom viewport
    // Displays metadata overlay (dimensions, format, size)
    // Shows zoom level indicator
  }

  private zoom(factor: number): void {
    this.scale = Math.max(0.1, Math.min(10, this.scale * factor));
    this.updateTransform();
  }

  // ... pan handling with mouse drag
}
```

### Step 2: Register the Viewer

```typescript
// src/viewers/registry.ts

import { createImageViewer } from './builtin/image-viewer.js';

// Register image viewer
registry.register('image', createImageViewer, {
  id: 'image',
  displayName: 'Image Viewer',
  supportedExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
});
```

### Step 3: Export from builtin/index.ts

```typescript
// src/viewers/builtin/index.ts

export { TextViewer, createTextViewer } from './text-viewer.js';
export { ImageViewer, createImageViewer } from './image-viewer.js';
```

## Viewer Registry API

```typescript
import { registry } from './viewers/registry.js';

// Get viewer for a file extension
const viewer = await registry.getViewerForExtension('png');

// Get viewer by ID
const textViewer = await registry.getViewerById('text');

// Check if viewer exists for extension
const hasImageViewer = registry.hasViewerForExtension('png');

// Get all registered viewers
const allViewers = registry.getAllViewers();
// Returns: ViewerMetadata[]
```

## FileViewerContainer API

The container component exposes methods for external components to interact with the active viewer:

```typescript
// Get reference to container
const container = document.querySelector('file-viewer-container') as any;

// Open a file
await container.openFile('/path/to/file.ts', 'content here');

// Save current file
await container.saveFile();

// Check if modified
const isDirty = container.isDirtyState();

// Debug API (text viewer specific)
container.setBreakpoints([{id: 1, line: 10, verified: true}]);
container.setDebugLine(10);
container.setDebugMode(true);
```

## Extension Points

### Viewer-Specific State

Viewers can maintain their own state. The container only manages lifecycle:

```typescript
export class DatabaseViewer implements FileViewer {
  private connection: DatabaseConnection | null = null;
  private query: string = '';
  private results: QueryResult[] = [];

  async loadFile(path: string, content: string) {
    this.connection = await this.connect(path);
    this.results = await this.connection.execute('SELECT * FROM schema');
    this.render();
  }

  private render() {
    // Render query editor + results grid
  }
}
```

### Toolbar Actions

Viewers can provide custom toolbar buttons:

```typescript
getToolbarActions(): ViewerAction[] {
  return [
    {
      id: 'run-query',
      icon: 'lucide:play',
      label: 'Run',
      onClick: () => this.executeQuery(),
      enabled: this.query.length > 0,
    },
    {
      id: 'export-csv',
      icon: 'lucide:download',
      label: 'Export CSV',
      onClick: () => this.exportToCSV(),
    },
  ];
}
```

### Event Dispatching

Viewers can dispatch custom events for parent components to handle:

```typescript
import { dispatch } from '../../lib/types/events.js';

// Content changed
dispatch('content-changed', {
  path: this.filePath,
  content: newContent,
  isModified: true,
});

// Custom viewer event
dispatch('query-executed', {
  query: this.query,
  rowCount: this.results.length,
  duration: this.executionTime,
});
```

## Implemented Viewers

### TextViewer

**Status:** Complete

CodeMirror 6-based text and code editor with:
- Syntax highlighting for 15+ languages
- LSP integration (completions, hover, go-to-definition)
- Breakpoint gutter for debugging
- Inline variable values during debug sessions
- Fold gutters and indentation markers

### ImageViewer

**Status:** Complete

Image previewer with:
- Zoom in/out (mouse wheel + toolbar buttons)
- Pan (click and drag)
- Fit to screen / Actual size buttons
- Metadata overlay (dimensions, format, file size)
- Zoom level indicator
- Support for: PNG, JPG, JPEG, GIF, WebP, BMP, SVG, ICO

### Planned Viewers

| Viewer | Status | Description |
|--------|--------|-------------|
| MarkdownViewer | TODO | Rendered markdown with split edit/preview |
| DatabaseViewer | TODO | SQL editor + results grid + connection management |
| DiagramViewer | TODO | Interactive diagram/node editor |
| HexViewer | TODO | Binary file hex editor |
| PDFViewer | TODO | PDF renderer |

### Third-Party Viewer Plugins

The registry supports external registration, enabling third-party plugins:

```typescript
// In a plugin package
import { registry } from 'openstorm/viewers';

registry.register('mermaid', createMermaidViewer, {
  id: 'mermaid',
  displayName: 'Mermaid Diagram Viewer',
  supportedExtensions: ['mmd', 'mermaid'],
});
```

## Design Principles

1. **Zero coupling** - Viewers don't know about each other
2. **Lazy loading** - Viewers are loaded only when needed
3. **Consistent API** - All viewers implement the same interface
4. **Extensible** - New viewers can be added without modifying existing code
5. **Container manages lifecycle** - mount/unmount prevents memory leaks

## Troubleshooting

### Viewer not loading for extension

1. Check extension is registered in `registry.ts`
2. Verify extension matching is case-insensitive (use `.toLowerCase()`)
3. Check browser console for "No viewer found for extension" errors

### Content not rendering

1. Ensure `mount()` is called before `loadFile()`
2. Verify container element exists and is visible
3. Check for async errors in `loadFile()`

### Memory leaks

1. Always clean up in `unmount()` (remove event listeners, destroy instances)
2. Container calls `unmount()` automatically when switching viewers
