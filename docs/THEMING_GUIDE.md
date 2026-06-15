# Theming Guide

This guide explains how to use and extend the OpenStorm theming system.

## Overview

OpenStorm now uses a centralized theming system powered by CSS custom properties (CSS variables) and a ThemeService for dynamic theme switching.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ThemeService                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Built-in Themes                                 │   │
│  │  • light (IntelliJ Light)                        │   │
│  │  • dark (IntelliJ Dark)                          │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Plugin Themes (via PluginRegistry)              │   │
│  │  • Custom themes from extensions                 │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                          │ CSS Variables
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Components                            │
│  • All colors reference var(--app-*) variables          │
│  • Automatic theme switching                             │
│  • No hardcoded colors                                   │
└─────────────────────────────────────────────────────────┘
```

## Using Themes

### Get Current Theme

```typescript
import { ThemeService } from './lib/theme-service.js';

const themeService = ThemeService.getInstance();

// Get current theme
const currentTheme = themeService.getCurrentTheme();
console.log(`Current theme: ${currentTheme.name}`);

// Get a specific color
const bgColor = themeService.getColor('app-bg');
console.log(`Background color: ${bgColor}`);
```

### Switch Theme

```typescript
// Switch to dark theme
ThemeService.getInstance().setTheme('dark');

// Switch to light theme
ThemeService.getInstance().setTheme('light');

// Get available themes
const themes = ThemeService.getInstance().getThemes();
themes.forEach(t => console.log(t.name));
```

### Subscribe to Theme Changes

```typescript
import { onThemeChange } from './lib/theme-service.js';

// Subscribe to theme changes
const unsubscribe = onThemeChange((theme) => {
  console.log(`Theme changed to: ${theme.name}`);
  // Re-render your component with new colors
});

// Later, unsubscribe
unsubscribe();
```

## CSS Variable Reference

### Application Colors

| Variable | Description |
|----------|-------------|
| `--app-bg` | Main application background |
| `--app-foreground` | Main text color |
| `--app-disabled-foreground` | Disabled text color |
| `--app-border` | Border color |
| `--app-focus-border` | Focus state border |
| `--app-hover-background` | Hover state background |
| `--app-button-background` | Primary button background |
| `--app-button-foreground` | Primary button text color |

### Editor Colors

| Variable | Description |
|----------|-------------|
| `--editor-background` | Editor background |
| `--editor-gutter-background` | Gutter (line numbers) background |
| `--editor-gutter-border` | Gutter border |
| `--editor-active-line` | Active line highlight |
| `--editor-selection` | Text selection background |
| `--editor-line-numbers` | Line number color |

### Syntax Highlighting

| Variable | Description |
|----------|-------------|
| `--app-keyword` | Keywords (if, for, while, etc.) |
| `--app-type` | Type names |
| `--app-string` | String literals |
| `--app-number` | Numeric literals |
| `--app-boolean` | Boolean literals |

### File Icons

| Variable | Description |
|----------|-------------|
| `--file-rs` | Rust files |
| `--file-ts` | TypeScript files |
| `--file-js` | JavaScript files |
| `--file-py` | Python files |
| `--file-go` | Go files |
| ... | (60+ file types supported) |

### Folder Types

| Variable | Description |
|----------|-------------|
| `--folder-build-color` | Build folders (build, dist, target) |
| `--folder-tmp-color` | Temp folders (tmp, cache) |
| `--folder-node-modules-color` | Dependencies (node_modules, vendor) |
| `--folder-vcs-color` | Version control (.git, .svn) |
| `--folder-ide-color` | IDE settings (.vscode, .idea) |

### Status Bar

| Variable | Description |
|----------|-------------|
| `--statusbar-background` | Status bar background |
| `--statusbar-foreground` | Status bar text |
| `--statusbar-hover-background` | Status bar hover state |
| `--statusbar-border` | Status bar border |

### Activity Bar

| Variable | Description |
|----------|-------------|
| `--activitybar-background` | Activity bar background |
| `--activitybar-border` | Activity bar border |
| `--activitybar-active-background` | Active item background |
| `--activitybar-active-foreground` | Active item text |
| `--activitybar-inactive-foreground` | Inactive item text |

## Creating Custom Themes

### Via Code

```typescript
import { ThemeService, type ThemeDefinition } from './lib/theme-service.js';

const myTheme: ThemeDefinition = {
  id: 'my-custom-theme',
  name: 'My Custom Theme',
  colors: {
    // Include ALL color properties
    'app-bg': '#1a1a2e',
    'app-foreground': '#eaeaea',
    'app-border': '#333355',
    // ... (see ThemeColors interface for full list)
  },
};

ThemeService.getInstance().registerTheme(myTheme);
ThemeService.getInstance().setTheme('my-custom-theme');
```

### Via Plugin

```typescript
import { getPluginRegistry, type PluginManifest } from './lib/plugin-registry.js';

const myPlugin: PluginManifest = {
  id: 'my-theme-plugin',
  name: 'My Theme Pack',
  version: '1.0.0',
  contributes: {
    themes: [
      {
        id: 'ocean-theme',
        name: 'Ocean Theme',
        colors: {
          // Theme colors...
        },
      },
    ],
  },
};

getPluginRegistry().registerPlugin(myPlugin);
```

## Migration Guide

### Before (Hardcoded Colors)

```typescript
// ❌ Don't do this
const colors = {
  background: '#ffffff',
  foreground: '#1a1a1a',
};

<div style="background: #ffffff; color: #1a1a1a;">
```

### After (CSS Variables)

```typescript
// ✅ Do this
<div style="background: var(--app-bg); color: var(--app-foreground);">

// Or in CSS
.my-component {
  background: var(--app-bg);
  color: var(--app-foreground);
}
```

### Tailwind Arbitrary Values

```typescript
// ❌ Don't do this
<div class="bg-[#f6f8fa] text-[#57606a]">

// ✅ Do this
<div class="bg-statusbar text-statusbar-foreground">
// Or with inline styles for new variables
<div style="background: var(--statusbar-background); color: var(--statusbar-foreground);">
```

## Best Practices

1. **Always use CSS variables** for colors that might change with themes
2. **Use the ThemeService API** for programmatic color access
3. **Subscribe to theme changes** if your component needs to re-render
4. **Test with both light and dark themes** to ensure readability
5. **Document new color variables** when adding components

## Troubleshooting

### Colors not updating when theme changes

Ensure you're using CSS variables (`var(--app-*)`) and not hardcoded values. CSS variables automatically update when the theme changes.

### Can't find a color variable

Check `src/styles.css` for the full list of defined variables. If you need a new one, add it to:
1. `styles.css` - CSS variable definition
2. `theme-service.ts` - ThemeColors interface and BUILTIN_THEMES
3. Both light and dark theme definitions

### ThemeService returns wrong color

Make sure ThemeService is initialized before use. It's auto-initialized in `main.ts`, but if you're using it elsewhere, call:

```typescript
ThemeService.getInstance().initialize();
```
