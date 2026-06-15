# Plugin Development Guide

This guide explains how to create plugins/extensions for OpenStorm.

## Overview

OpenStorm has a plugin system that allows extensions to contribute:

- **Themes** - Custom color themes
- **Icons** - Icon sets and file type icons
- **Formatters** - Code formatters for languages
- **Languages** - Language support (syntax, configuration)
- **Toolbar Items** - Custom toolbar actions

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   PluginRegistry                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Theme       │  │ Icon        │  │ Formatter   │     │
│  │ Registry    │  │ Registry    │  │ Registry    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Language    │  │ Toolbar     │  │ Plugin      │     │
│  │ Registry    │  │ Registry    │  │ Lifecycle   │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
                          │
                          │ Register/Activate
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Plugins                               │
│  • my-theme-plugin/                                      │
│  • my-language-support/                                  │
│  • my-formatter-plugin/                                  │
└─────────────────────────────────────────────────────────┘
```

## Creating a Plugin

### Plugin Structure

```
my-plugin/
├── plugin.json        # Plugin manifest
├── src/
│   └── index.ts       # Plugin entry point
└── README.md
```

### Plugin Manifest (plugin.json)

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "A sample OpenStorm plugin",
  "author": "Your Name",
  "engines": {
    "openstorm": "^1.0.0"
  },
  "contributes": {
    "themes": [],
    "icons": [],
    "formatters": [],
    "languages": [],
    "toolbarItems": []
  }
}
```

## Contributing Themes

```typescript
import { getPluginRegistry } from './lib/plugin-registry.js';
import type { ThemeDefinition } from './lib/theme-service.js';

const oceanTheme: ThemeDefinition = {
  id: 'ocean-theme',
  name: 'Ocean Theme',
  colors: {
    // Application
    'app-bg': '#1a1a2e',
    'app-foreground': '#eaeaea',
    'app-border': '#333355',
    // ... (all color properties required)
  },
};

const pluginManifest = {
  id: 'ocean-theme-plugin',
  name: 'Ocean Theme Pack',
  version: '1.0.0',
  contributes: {
    themes: [oceanTheme],
  },
};

getPluginRegistry().registerPlugin({
  manifest: pluginManifest,
  context: { /* ... */ },
  activate: async () => { console.log('Ocean theme activated'); },
  deactivate: async () => { console.log('Ocean theme deactivated'); },
});
```

## Contributing Icons

```typescript
import { getPluginRegistry } from './lib/plugin-registry.js';
import type { IconDefinition } from './lib/icon-registry.js';

const customIcons: IconDefinition[] = [
  {
    name: 'my-custom-icon',
    source: 'iconify',
    iconifyName: 'mdi:star',
    color: 'var(--app-button-background)',
  },
  {
    name: 'rust-logo',
    source: 'iconify',
    iconifyName: 'devicon:rust',
  },
];

const pluginManifest = {
  id: 'my-icon-pack',
  name: 'My Icon Pack',
  version: '1.0.0',
  contributes: {
    icons: customIcons,
  },
};

getPluginRegistry().registerPlugin(/* ... */);
```

## Contributing Formatters

```typescript
import { getPluginRegistry } from './lib/plugin-registry.js';
import type { LanguageFormatterRegistration } from './lib/plugin-registry.js';

const rustFormatter: LanguageFormatterRegistration = {
  language: 'rust',
  extensions: ['rs'],
  format: async (content, options) => {
    // Use rustfmt or implement custom formatting
    const { exec } = await import('child_process');
    return new Promise((resolve, reject) => {
      exec('rustfmt', { input: content }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  },
};

const pluginManifest = {
  id: 'rust-formatter-plugin',
  name: 'Rust Formatter',
  version: '1.0.0',
  contributes: {
    formatters: [rustFormatter],
  },
};

getPluginRegistry().registerPlugin(/* ... */);
```

## Contributing Language Support

```typescript
import { getPluginRegistry } from './lib/plugin-registry.js';
import type { LanguageRegistration } from './lib/plugin-registry.js';

const kotlinLanguage: LanguageRegistration = {
  id: 'kotlin',
  name: 'Kotlin',
  extensions: ['kt', 'kts'],
  icon: 'file-kt',
  color: 'var(--file-kt)',
  configuration: {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
    },
    brackets: ['(', ')', '{', '}', '[', ']'],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '"', close: '"' },
    ],
    surroundingPairs: [
      { open: '(', close: ')' },
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '"', close: '"' },
    ],
  },
};

const pluginManifest = {
  id: 'kotlin-language',
  name: 'Kotlin Language Support',
  version: '1.0.0',
  contributes: {
    languages: [kotlinLanguage],
  },
};

getPluginRegistry().registerPlugin(/* ... */);
```

## Contributing Toolbar Items

```typescript
import { getPluginRegistry } from './lib/plugin-registry.js';
import type { ToolbarItemRegistration } from './lib/plugin-registry.js';

const formatDocumentItem: ToolbarItemRegistration = {
  id: 'format-document',
  label: 'Format Document',
  icon: 'check',
  command: 'editor.formatDocument',
  group: 'editor-actions',
  when: 'editorHasDocument',
};

const pluginManifest = {
  id: 'editor-tools',
  name: 'Editor Tools',
  version: '1.0.0',
  contributes: {
    toolbarItems: [formatDocumentItem],
  },
};

getPluginRegistry().registerPlugin(/* ... */);
```

## Plugin Lifecycle

### Activation

Plugins are activated when:

1. A file of a supported language is opened
2. A toolbar item is clicked
3. A theme is selected
4. The user explicitly enables the plugin

### Deactivation

Plugins should clean up:

- Event listeners
- Timers/intervals
- Open connections
- Cached data

### Example Plugin with Lifecycle

```typescript
import { getPluginRegistry, createPluginContext } from './lib/plugin-registry.js';

class MyPlugin {
  private subscriptions: Array<() => void> = [];

  async activate() {
    console.log('MyPlugin activated');
    
    // Subscribe to events
    const unsubscribe = ThemeService.getInstance().subscribe((event) => {
      console.log('Theme changed:', event.themeId);
    });
    this.subscriptions.push(unsubscribe);
    
    // Register commands
    // Register providers
    // Initialize resources
  }

  async deactivate() {
    console.log('MyPlugin deactivated');
    
    // Clean up subscriptions
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    this.subscriptions = [];
    
    // Clean up other resources
  }
}

const plugin = new MyPlugin();

getPluginRegistry().registerPlugin({
  manifest: {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    contributes: { /* ... */ },
  },
  context: createPluginContext(
    { id: 'my-plugin', name: 'My Plugin', version: '1.0.0' },
    '/path/to/storage'
  ),
  activate: () => plugin.activate(),
  deactivate: () => plugin.deactivate(),
});
```

## Using the Service Layer

Plugins should use the service layer instead of direct `invoke()` calls:

```typescript
import { getFileService, getLspService } from './lib/services/index.js';

// Read a file
const content = await getFileService().readFile('/path/to/file.ts');

// Get LSP completions
const completions = await getLspService().getCompletions({
  uri: 'file:///path/to/file.ts',
  line: 10,
  column: 5,
});
```

## Best Practices

1. **Use the registry** - Always register contributions via PluginRegistry
2. **Clean up resources** - Implement proper deactivate() cleanup
3. **Handle errors gracefully** - Don't crash the host application
4. **Respect theme colors** - Use CSS variables, not hardcoded colors
5. **Document your plugin** - Include README with usage instructions
6. **Test thoroughly** - Test with both light and dark themes

## API Reference

### PluginRegistry

| Method | Description |
|--------|-------------|
| `registerPlugin(plugin)` | Register a plugin instance |
| `activatePlugin(pluginId)` | Activate a plugin |
| `deactivatePlugin(pluginId)` | Deactivate a plugin |
| `getPlugins()` | Get all registered plugins |
| `getThemes()` | Get all contributed themes |
| `getIcons()` | Get all contributed icons |
| `getFormatters()` | Get all contributed formatters |
| `getLanguages()` | Get all contributed languages |
| `getToolbarItems()` | Get all toolbar items |
| `subscribe(listener)` | Subscribe to plugin events |

## Troubleshooting

### Plugin not loading

1. Check plugin.json is valid JSON
2. Verify plugin ID is unique
3. Check console for errors

### Contributions not appearing

1. Ensure plugin is activated
2. Check contribution type is correct
3. Verify all required fields are present

### Theme not applying

1. Ensure all color properties are defined
2. Check CSS variable names match
3. Verify theme is registered and selected
