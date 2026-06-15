# Frontend Architecture Audit Report

**Project:** OpenStorm  
**Date:** 2026-04-22  
**Scope:** `/src/` directory (Lit.js + TypeScript frontend)

---

## Executive Summary

| Area | Status | Severity |
|------|--------|----------|
| SOLID Principles | **Improved** | Medium |
| Theming System | **Implemented** | Low |
| Icon Consistency | **Mixed** | Medium |
| Tailwind CSS Usage | **Good** | Low |
| Plugin/Extension Support | **Implemented** | Low |
| Overall Scalability | **Improved** | Medium |

---

## Refactoring Progress (Completed 2026-04-22)

### Phase 1: Foundation - **COMPLETE**

| Component | Status | File |
|-----------|--------|------|
| ThemeService | Implemented | `src/lib/theme-service.ts` |
| IconRegistry | Implemented | `src/lib/icon-registry.ts` |
| PluginRegistry | Implemented | `src/lib/plugin-registry.ts` |
| Service Layer | Implemented | `src/lib/services/` |

### Theme System Improvements

- **150+ CSS variables** now defined in `styles.css`
- **Dark theme support** built into ThemeService
- **Dynamic theme switching** API available
- **Plugin-provided themes** supported via PluginRegistry

### Files Updated to Use CSS Variables

| File | Changes |
|------|---------|
| `file-icons.ts` | All 60+ colors now use CSS variables |
| `folder-types.ts` | All folder colors use CSS variables |
| `icon.ts` | Brand color uses `var(--brand-primary)` |
| `welcome-screen.ts` | Project type colors use CSS variables |
| `status-bar.ts` | All arbitrary Tailwind values replaced |
| `editor-pane.ts` | IJ_COLORS removed, uses CSS variables |
| `activity-bar.ts` | Background/border colors use CSS variables |
| `app-header.ts` | All colors use CSS variables |
| `main.ts` | ThemeService initialized on startup |

### Service Layer Abstractions

| Service | Purpose | File |
|---------|---------|------|
| FileService | File system operations | `services/file-service.ts` |
| LspService | LSP operations | `services/lsp-service.ts` |
| DebugService | DAP operations | `services/debug-service.ts` |
| TerminalService | Terminal/PTY operations | `services/terminal-service.ts` |

### Plugin System Capabilities

The PluginRegistry now supports:
- **Theme providers** - Extensions can contribute custom themes
- **Icon providers** - Custom icon sets from plugins
- **Formatter providers** - Language formatters from plugins
- **Language support** - Syntax configuration from plugins
- **Toolbar extensions** - Custom toolbar actions

---

## Remaining Work

| Priority | Task | Estimated Effort |
|----------|------|------------------|
| 1 | Break down large components (editor-pane, debug-panel) | 2-3 weeks |
| 2 | Migrate inline SVGs to Iconify | 1 week |
| 3 | Add global state management (Zustand) | 1 week |
| 4 | Update components to use service layer | 1-2 weeks |
| 5 | Create plugin loading mechanism | 1 week |

---

## 1. SOLID Principles Analysis

### 1.1 Single Responsibility Principle (SRP) - **VIOLATED**

Components are handling too many responsibilities:

| Component | Lines | Responsibilities |
|-----------|-------|------------------|
| `editor-pane.ts` | 2,030 | Editing, debugging, LSP, breakpoints, formatting, hover tooltips |
| `debug-panel.ts` | 1,457 | 6 different panels (variables, watch, callstack, threads, breakpoints, console) |
| `project-explorer.ts` | 1,073 | File tree, context menus, dialogs, template detection |
| `terminal-pane.ts` | 907 | Terminal, app console, search, filtering |
| `main.ts` | 906 | App state, routing, events, keyboard shortcuts, file operations, debug sessions |

**Example from `editor-pane.ts` (lines 54-73):**
```typescript
const IJ_COLORS = {
  background: '#ffffff',
  gutterBackground: '#f0f0f0',
  // ... hardcoded theme colors
};

const intellijLightHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier], color: '#0033b3', fontWeight: 'bold' },
  // ... syntax highlighting rules
]);
```
The editor component directly embeds theme configuration that should be externalized.

### 1.2 Open/Closed Principle - **VIOLATED**

Components are not open for extension without modification:

- **No plugin architecture**: Extensions cannot inject functionality without modifying core files
- **Hardcoded dependencies**: Direct imports of all components in `main.ts` (lines 28-50)
- **No abstraction layer**: All IPC calls use direct `invoke()` instead of a service layer

**Example from `main.ts` (lines 28-50):**
```typescript
// Direct imports - no abstraction
import "./components/header/app-header.js";
import "./components/header/breadcrumb.js";
import "./components/navigation/activity-bar.js";
import "./components/explorer/project-explorer.js";
// ... 20+ more direct imports
```

### 1.3 Liskov Substitution Principle - **NOT APPLICABLE**

Lit web components don't use inheritance-based polymorphism extensively. No clear violations, but also no benefit from LSP patterns.

### 1.4 Interface Segregation Principle - **PARTIALLY FOLLOWED**

- TypeScript interfaces are well-defined (`EditorTab`, `Breakpoint`, `Variable`, etc.)
- However, components receive large state objects instead of focused interfaces

### 1.5 Dependency Inversion Principle - **VIOLATED**

High-level modules depend on low-level modules directly:

- No dependency injection pattern
- Direct `invoke()` calls to Tauri backend throughout all components
- No service abstractions for:
  - File operations
  - LSP communication
  - Debug adapter protocol
  - Terminal management

---

## 2. Theming System Analysis

### 2.1 Current State: **PARTIAL IMPLEMENTATION**

**45 CSS custom properties defined** in `src/styles.css` (lines 6-65):
```css
:root {
  --app-bg: #ffffff;
  --app-foreground: #1a1a1a;
  --app-border: #e5e7eb;
  --app-button-background: #6366f1;
  /* ... 41 more variables */
}
```

### 2.2 Hardcoded Colors Found: **573 occurrences**

| Location | Hardcoded Colors | Issue |
|----------|------------------|-------|
| `src/lib/file-icons.ts` | 60+ | File extension colors |
| `src/lib/folder-types.ts` | 24 | Folder type colors |
| `src/components/icon.ts` | 2 | Brand color `#5b47c9` (lines 55, 185) |
| `src/components/editor/editor-pane.ts` | 12 | `IJ_COLORS` constant (lines 54-61) |
| `src/components/status-bar.ts` | 30+ | Tailwind arbitrary values like `bg-[#f6f8fa]` |
| `src/components/welcome-screen.ts` | 15+ | Project type colors (lines 150-166) |
| `src/components/conditional-breakpoint-dialog.ts` | 50+ | Inline CSS styles |
| `src/components/debug-toolbar.ts` | 20+ | Inline CSS styles |
| `src/components/terminal/terminal-pane.ts` | 15+ | Xterm.js overrides |

**Example from `welcome-screen.ts` (lines 150-166):**
```typescript
private getProjectIcon(type: ProjectType): { name: string; color: string } {
  const iconMap: Record<ProjectType, { name: string; color: string }> = {
    'rust': { name: 'box', color: '#ea580c' },
    'node': { name: 'terminal', color: '#22c55e' },
    'python': { name: 'layers', color: '#3b82f6' },
    // ... all hardcoded
  };
}
```

**Example from `status-bar.ts` (line 339):**
```typescript
class="flex h-[28px] items-center justify-between px-3 bg-[#f6f8fa] border-t border-[#d0d7de] text-[#57606a]"
```

### 2.3 Theme Switching Capability: **NOT SUPPORTED**

- No theme switching mechanism exists
- CSS custom properties are defined but not leveraged consistently
- No theme context or provider pattern
- No support for:
  - Dark theme
  - High contrast theme
  - User-defined themes
  - Extension-provided themes

---

## 3. Icon Usage Analysis

### 3.1 Three Icon Systems in Use: **INCONSISTENT**

| System | Usage | Location |
|--------|-------|----------|
| **Lucide** | 40 icons | `src/components/icon.ts` (line 5) |
| **Iconify** | 8 collections | `src/main.ts` (lines 8-25) |
| **Inline SVGs** | Scattered | `activity-bar.ts`, `icon.ts` logo |

### 3.2 Lucide Icons (Primary System)

Registered in `icon.ts`:
```typescript
import { Play, Bug, Square, GitBranch, ... } from 'lucide';
```
40 icons mapped to names like `'play'`, `'bug'`, `'folder'`, etc.

### 3.3 Iconify Collections (Secondary System)

8 collections registered in `main.ts`:
- `devicon` - Programming language icons
- `vscode-icons` - File type icons
- `tabler` - General UI icons
- `catppuccin` - Themed icons
- `file-icons` - File type icons
- `logos` - Brand logos
- `mdi` - Material Design icons
- `streamline-flex-color` - Colored icons

### 3.4 Inline SVGs (Problem Areas)

**`activity-bar.ts` (lines 22-42):**
```typescript
icon: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ...>
  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8..."/>
</svg>`
```

**`icon.ts` (lines 52-67):**
```typescript
function OpenStormLogo(): ReturnType<typeof svg> {
  return svg`
    <svg viewBox="0 0 48 48" fill="none" ...>
      <rect x="2" y="2" width="44" height="44" rx="10" fill="#5b47c9"/>
      <!-- 20+ lines of inline SVG -->
    </svg>
  `;
}
```

### 3.5 Recommendation

Consolidate to **Iconify** as the single source:
- Already has 8 collections registered
- Supports theme-aware coloring
- Better tree-shaking than inline SVGs
- Consistent API across all components

---

## 4. Tailwind CSS Usage Analysis

### 4.1 Current State: **GOOD WITH EXCEPTIONS**

**23 components** extend `TailwindElement` base class:
```typescript
export class ProjectExplorer extends TailwindElement()
```

**4 components** still use custom CSS (`static styles`):
- `conditional-breakpoint-dialog.ts` - 50+ lines of custom CSS
- `debug-toolbar.ts` - 20+ lines of custom CSS
- `terminal-pane.ts` - 40+ lines of custom CSS (Xterm.js overrides)
- `icon.ts` - Minimal custom CSS

### 4.2 Tailwind Violations

**Arbitrary values instead of theme:**
```typescript
// status-bar.ts line 339
bg-[#f6f8fa] text-[#57606a] border-[#d0d7de]

// Should use CSS variables or Tailwind theme extension
```

**Inline styles instead of Tailwind:**
```typescript
// template-picker.ts line 207
style="background-color: ${colors[language] || '#6b7280'}"

// resizable-container.ts line 83
style=${sizeStyle}
```

### 4.3 Xterm.js Exception

`terminal-pane.ts` requires custom CSS for Xterm.js integration:
```css
.xterm {
  height: 100% !important;
  width: 100% !important;
}
```
This is acceptable as third-party library integration.

---

## 5. Plugin/Extension Architecture

### 5.1 Current State: **NOT IMPLEMENTED**

No formal plugin system exists. Extension points needed:

| Feature | Current State | Required |
|---------|---------------|----------|
| Theme providers | None | CSS variable injection |
| Icon providers | Hardcoded mappings | Registry pattern |
| Formatter providers | Local array | Plugin registration |
| Language support | Direct imports | Lazy loading |
| Toolbar extensions | Static | Dynamic registration |

### 5.2 Existing Extension Points (Informal)

**`src/lib/formatter.ts` (lines 419-434):**
```typescript
const formatters: LanguageFormatter[] = [
  jsFormatter, htmlFormatter, cssFormatter, // ...
];
```
Formatters are registered in a local array - not extensible by plugins.

**`src/lib/file-icon-mapper.ts`:**
Icon mappings are hardcoded - no plugin injection.

### 5.3 Required Architecture for Plugin Support

```
┌─────────────────────────────────────────────────────────┐
│                   PLUGIN HOST                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Theme API   │  │ Icon API    │  │ Language API│     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Formatter   │  │ Terminal    │  │ Debug       │     │
│  │ API         │  │ API         │  │ Adapter API │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Scalability Assessment

### 6.1 Component Communication

**Current Pattern:** Event-driven with CustomEvents
```typescript
this.dispatchEvent(new CustomEvent('open-file', {
  detail: { path },
  bubbles: true,
  composed: true,
}));
```

**Pros:**
- Loose coupling between components
- Events bubble through shadow DOM

**Cons:**
- No global state management (no Redux, Zustand, etc.)
- Event names are string literals - no type safety
- Hard to trace event flows

### 6.2 State Management

**Current:** Local `@state()` properties in each component

**Scalability Issues:**
- No shared state between sibling components
- Parent-child communication requires prop drilling
- No persistence layer for UI state
- No undo/redo capability

### 6.3 Code Organization

```
src/
├── components/      # 20+ web components
├── lib/            # Utilities (formatters, icons, LSP)
├── main.ts         # App root (906 lines)
├── styles.css      # Global styles + CSS variables
└── tailwind-element.ts  # Base class
```

**Missing:**
- Services layer for business logic
- Store/state management
- Plugin registry
- Theme manager
- Icon registry

---

## 7. Recommendations

### 7.1 High Priority (Scalability Blockers)

| Priority | Action | Impact |
|----------|--------|--------|
| 1 | Extract theme variables to dedicated theme service | Enables dynamic theming |
| 2 | Create service abstractions for IPC calls | Enables testing, plugin injection |
| 3 | Implement plugin registry pattern | Enables extensions |
| 4 | Consolidate icon systems to Iconify only | Reduces bundle size, consistency |
| 5 | Break down large components (< 500 lines each) | Improves maintainability |

### 7.2 Medium Priority (Technical Debt)

| Priority | Action | Impact |
|----------|--------|--------|
| 6 | Replace all hardcoded colors with CSS variables | Theme consistency |
| 7 | Add global state management (Zustand or similar) | Simplifies component communication |
| 8 | Create typed event system | Better type safety |
| 9 | Move inline SVGs to Iconify | Consistency |
| 10 | Add CSS custom property fallbacks | Better browser compatibility |

### 7.3 Low Priority (Nice to Have)

| Priority | Action | Impact |
|----------|--------|--------|
| 11 | Add dark theme variant | User preference |
| 12 | Add high contrast theme | Accessibility |
| 13 | Migrate all arbitrary Tailwind values | Cleaner code |
| 14 | Add component documentation | Onboarding |

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
1. Create `ThemeService` with CSS variable management
2. Create `IconRegistry` to consolidate icon systems
3. Extract hardcoded colors to CSS variables

### Phase 2: Architecture (Week 3-4)
4. Create service abstractions (`FileService`, `LspService`, `DebugService`)
5. Implement dependency injection pattern
6. Create plugin registry

### Phase 3: Refactoring (Week 5-8)
7. Break down large components
8. Migrate inline SVGs to Iconify
9. Add global state management

### Phase 4: Polish (Week 9-10)
10. Add dark theme support
11. Add plugin API documentation
12. Create extension examples

---

## 9. File-by-File Action Items

### Critical Files to Refactor

| File | Lines | Actions |
|------|-------|---------|
| `editor-pane.ts` | 2,030 | Extract syntax highlighting, breakpoints, LSP into separate services |
| `debug-panel.ts` | 1,457 | Split into 6 separate panel components |
| `main.ts` | 906 | Move to service-based architecture, lazy loading |
| `project-explorer.ts` | 1,073 | Extract dialog management, context menu logic |
| `terminal-pane.ts` | 907 | Acceptable (Xterm.js integration requires custom CSS) |

### Files with Hardcoded Colors

| File | Colors | Action |
|------|--------|--------|
| `file-icons.ts` | 60+ | Move to CSS variables or theme tokens |
| `folder-types.ts` | 24 | Move to CSS variables |
| `welcome-screen.ts` | 15+ | Use theme tokens |
| `status-bar.ts` | 30+ | Replace arbitrary Tailwind values |
| `icon.ts` | 2 | Replace brand color with CSS variable |

---

## 10. Conclusion

The OpenStorm frontend has a solid foundation with Lit.js and Tailwind CSS, but lacks the architectural patterns needed for:

- **Dynamic theming**: CSS variables exist but are not consistently used
- **Plugin/extension support**: No formal plugin API or registry
- **Scalable component architecture**: Components are too large and coupled
- **Consistent iconography**: Three competing icon systems

**Estimated refactoring effort:** 8-10 weeks for a single developer

**Risk of not refactoring:**
- Adding new themes requires code changes in 20+ files
- Plugin development requires fork/modify core files
- Component bugs are hard to isolate due to size
- Bundle size grows with duplicate icon systems
