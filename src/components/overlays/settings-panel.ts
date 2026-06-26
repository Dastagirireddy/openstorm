import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { TailwindElement } from '../../tailwind-element.js';
import { dispatch } from '../../lib/types/events.js';
import { ThemeService } from '../../lib/services/theme-service.js';
import { settingsStore } from '../../lib/services/settings-store.js';
import type { ThemeDefinition, ThemeMode } from '../../lib/services/theme-service.js';
import type { UserSettings } from '../../lib/services/settings-store.js';
import type { AiProviderConfig, ProviderInfo, ModelInfo, McpServerConfig, McpServerStatus, McpToolInfo } from '../../lib/types/ai-types.js';
import '../layout/icon.js';

type SettingsTab = 'general' | 'themes' | 'shortcuts' | 'models' | 'mcp' | 'about';

const SHORTCUTS = [
  { keys: ['Cmd', 'P'], description: 'Quick file search' },
  { keys: ['Cmd', 'S'], description: 'Save file' },
  { keys: ['Cmd', 'Shift', 'P'], description: 'Format document' },
  { keys: ['Cmd', 'B'], description: 'Toggle sidebar' },
  { keys: ['Cmd', '`'], description: 'Toggle terminal' },
  { keys: ['Cmd', 'N'], description: 'New file' },
  { keys: ['Cmd', 'O'], description: 'Open file' },
  { keys: ['Cmd', 'W'], description: 'Close tab' },
  { keys: ['Cmd', 'Tab'], description: 'Next tab' },
  { keys: ['Cmd', 'Shift', 'Tab'], description: 'Previous tab' },
  { keys: ['Cmd', 'F'], description: 'Find in file' },
  { keys: ['Cmd', 'H'], description: 'Find and replace' },
  { keys: ['Cmd', '/'], description: 'Toggle comment' },
  { keys: ['Cmd', 'D'], description: 'Select next occurrence' },
  { keys: ['Cmd', 'Shift', 'O'], description: 'Go to symbol' },
  { keys: ['F12'], description: 'Go to definition' },
  { keys: ['F5'], description: 'Start/continue debugging' },
  { keys: ['F8'], description: 'Step over' },
  { keys: ['F11'], description: 'Step into' },
];

@customElement('settings-panel')
export class SettingsPanel extends TailwindElement() {
  @state() private isOpen = false;
  @state() private activeTab: SettingsTab = 'general';
  @state() private themes: ThemeDefinition[] = [];
  @state() private currentWorkbenchTheme: string = '';
  @state() private currentEditorTheme: string = '';
  @state() private currentThemeMode: ThemeMode = 'system';
  @state() private previewTheme: string | null = null;
  @state() private settings: UserSettings = settingsStore.getAll();
  @state() private aiConfig: AiProviderConfig = { provider: 'ollama', api_key: '', base_url: 'http://localhost:11434', model: '' };
  @state() private aiProviders: ProviderInfo[] = [];
  @state() private aiModels: ModelInfo[] = [];
  @state() private aiConnectionStatus: boolean | null = null;
  @state() private aiLoading = false;
  @state() private mcpServers: McpServerStatus[] = [];
  @state() private mcpTools: McpToolInfo[] = [];
  @state() private mcpLoading = false;
  @state() private mcpNewName = '';
  @state() private mcpNewCommand = 'npx';
  @state() private mcpNewArgs = '-y @playwright/mcp@latest';

  connectedCallback(): Promise<void> | void {
    super.connectedCallback();

    this._handleKeyDown = this._handleKeyDown.bind(this);
    document.addEventListener('keydown', this._handleKeyDown);
    document.addEventListener('open-settings', this._handleOpen);
    document.addEventListener('close-settings', this._handleClose);
    document.addEventListener('open-theme-settings', this._handleOpen);

    const themeService = ThemeService.getInstance();

    const updateThemeState = () => {
      const ids = themeService.getCurrentThemeIds();
      this.currentWorkbenchTheme = ids.workbench;
      this.currentEditorTheme = ids.editor;
      this.currentThemeMode = themeService.getThemeMode();
      this.requestUpdate();
    };

    updateThemeState();
    this._themeDispose = themeService.subscribe(() => updateThemeState());

    this._settingsDispose = settingsStore.subscribe(() => {
      this.settings = settingsStore.getAll();
      this.requestUpdate();
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleKeyDown);
    document.removeEventListener('open-settings', this._handleOpen);
    document.removeEventListener('close-settings', this._handleClose);
    document.removeEventListener('open-theme-settings', this._handleOpen);
    if (this._themeDispose) this._themeDispose();
    if (this._settingsDispose) this._settingsDispose();
  }

  private _themeDispose: (() => void) | null = null;
  private _settingsDispose: (() => void) | null = null;

  private _handleKeyDown(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }

  private _handleOpen = (): void => {
    this.open();
  };

  private _handleClose = (): void => {
    this.close();
  };

  open(): void {
    this.loadThemes();
    this.loadAiConfig();
    this.loadMcpServers();
    this.isOpen = true;
    this.activeTab = 'general';
    this.requestUpdate();
  }

  close(): void {
    this.isOpen = false;
    this.previewTheme = null;
    this.requestUpdate();
    dispatch('settings-closed');
  }

  private loadThemes(): void {
    this.themes = ThemeService.getInstance().getThemes();
  }

  private selectTheme(themeId: string): void {
    ThemeService.getInstance().setTheme(themeId);
  }

  private setWorkbenchTheme(themeId: string): void {
    ThemeService.getInstance().setWorkbenchTheme(themeId);
  }

  private setEditorTheme(themeId: string): void {
    ThemeService.getInstance().setEditorTheme(themeId);
  }

  private setThemeMode(mode: ThemeMode): void {
    ThemeService.getInstance().setThemeMode(mode);
    this.currentThemeMode = mode;
    this.requestUpdate();
  }

  private previewThemeHover(themeId: string | null): void {
    const themeService = ThemeService.getInstance();
    if (themeId) {
      this.previewTheme = themeId;
      const ids = themeService.getCurrentThemeIds();
      if (themeId !== ids.workbench) {
        themeService.setWorkbenchTheme(themeId);
      }
    } else if (this.previewTheme) {
      if (this.currentWorkbenchTheme !== this.previewTheme) {
        themeService.setWorkbenchTheme(this.currentWorkbenchTheme);
      }
      this.previewTheme = null;
    }
  }

  private updateSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
    settingsStore.set(key, value);
  }

  private applyZoom(zoom: number): void {
    this.updateSetting('zoom', zoom);
    const root = document.documentElement;
    const scale = zoom / 100;
    root.style.fontSize = `${16 * scale}px`;
  }

  private tabBtn(tab: SettingsTab, iconName: string, label: string) {
    const active = this.activeTab === tab;
    return html`
      <button
        class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors"
        style="
          background-color: ${active ? 'var(--app-hover-background)' : 'transparent'};
          color: ${active ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'};
        "
        @click=${() => { this.activeTab = tab; this.requestUpdate(); }}>
        <os-icon name=${iconName} size="13" color="${active ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'}"></os-icon>
        <span>${label}</span>
      </button>
    `;
  }

  render() {
    if (!this.isOpen) return html``;

    return html`
      <!-- Backdrop -->
      <div
        class="fixed inset-0 z-[9998]"
        style="background-color: rgba(0, 0, 0, 0.5);"
        @click=${(e: MouseEvent) => {
          if (e.target === e.currentTarget) this.close();
        }}>
      </div>

      <!-- Modal Window -->
      <div class="fixed inset-0 z-[9999] flex items-center justify-center p-6 pointer-events-none">
        <div
          class="flex flex-col rounded-xl shadow-2xl overflow-hidden pointer-events-auto w-full h-full"
          style="
            background-color: var(--app-bg);
            max-width: 720px;
            max-height: 88vh;
            border: 1px solid var(--app-border);
          ">
          <!-- Title Bar with Traffic Lights + Tabs -->
          <div
            class="flex items-center gap-3 px-4 shrink-0"
            style="height: 44px; border-bottom: 1px solid var(--app-border); background-color: var(--activitybar-background);">
            <!-- macOS Traffic Lights -->
            <div class="flex items-center gap-2 shrink-0">
              <button
                class="w-3 h-3 rounded-full"
                style="background-color: #ff5f57;"
                @click=${() => this.close()}>
              </button>
              <button class="w-3 h-3 rounded-full" style="background-color: #febc2e;"></button>
              <button class="w-3 h-3 rounded-full" style="background-color: #28c840;"></button>
            </div>

            <!-- Tabs (centered) -->
            <div class="flex-1 flex items-center justify-center gap-1">
              ${this.tabBtn('general', 'settings', 'General')}
              ${this.tabBtn('themes', 'palette', 'Themes')}
              ${this.tabBtn('shortcuts', 'keyboard', 'Shortcuts')}
              ${this.tabBtn('models', 'cpu', 'Models')}
              ${this.tabBtn('mcp', 'server', 'MCP')}
              ${this.tabBtn('about', 'info', 'About')}
            </div>

            <!-- Spacer to balance traffic lights -->
            <div class="w-[52px] shrink-0"></div>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-8" style="color: var(--app-foreground);">
            ${this.activeTab === 'general' ? this.renderGeneralTab() : ''}
            ${this.activeTab === 'themes' ? this.renderThemesTab() : ''}
            ${this.activeTab === 'shortcuts' ? this.renderShortcutsTab() : ''}
            ${this.activeTab === 'models' ? this.renderModelsTab() : ''}
            ${this.activeTab === 'mcp' ? this.renderMcpTab() : ''}
            ${this.activeTab === 'about' ? this.renderAboutTab() : ''}
          </div>
        </div>
      </div>
    `;
  }

  private renderGeneralTab() {
    return html`
      <div class="space-y-7">
        <div>
          <h1 class="text-xl font-bold mb-1">General</h1>
          <p class="text-sm" style="color: var(--app-disabled-foreground);">Mode, editor, and startup.</p>
        </div>

        <!-- Appearance -->
        <div>
          <h3 class="text-sm font-semibold mb-3" style="color: var(--app-disabled-foreground);">Appearance</h3>
          <div class="grid grid-cols-3 gap-3">
            ${this.renderAppearanceCard('system', 'System', 'monitor')}
            ${this.renderAppearanceCard('light', 'Light', 'sun')}
            ${this.renderAppearanceCard('dark', 'Dark', 'moon')}
          </div>
          <p class="text-xs mt-2" style="color: var(--app-disabled-foreground); opacity: 0.7;">
            For theme, background and customization, see the <strong>Themes</strong> tab.
          </p>
        </div>

        <!-- Zoom -->
        <div>
          <h3 class="text-sm font-semibold mb-3" style="color: var(--app-disabled-foreground);">Zoom</h3>
          <div
            class="rounded-lg px-4 py-3"
            style="border: 1px solid var(--app-border);">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm">UI zoom level</span>
              <span class="text-sm font-medium" style="color: var(--app-disabled-foreground);">${this.settings.zoom}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="200"
              step="10"
              .value=${String(this.settings.zoom)}
              @input=${(e: Event) => {
                this.applyZoom(Number((e.target as HTMLInputElement).value));
              }}
              class="w-full h-1 rounded-full appearance-none cursor-pointer"
              style="background: linear-gradient(to right, var(--app-button-background) 0%, var(--app-button-background) ${((this.settings.zoom - 50) / 150) * 100}%, var(--app-border) ${((this.settings.zoom - 50) / 150) * 100}%, var(--app-border) 100%); accent-color: var(--app-button-background);"
            />
          </div>
        </div>

        <!-- Editor -->
        <div>
          <h3 class="text-sm font-semibold mb-2" style="color: var(--app-disabled-foreground);">Editor</h3>
          <div class="rounded-lg overflow-hidden" style="border: 1px solid var(--app-border);">
            ${this.renderToggleRow('Vim mode', 'Enable Vim keybindings in the code editor.', this.settings.vimMode, (v) => this.updateSetting('vimMode', v), true)}
            ${this.renderToggleRow('Auto save', 'Automatically save files after changes.', this.settings.autoSave, (v) => this.updateSetting('autoSave', v), false)}
            ${this.renderToggleRow('Word wrap', 'Wrap long lines to fit the editor width.', this.settings.wordWrap, (v) => this.updateSetting('wordWrap', v), false)}
            ${this.renderToggleRow('Line numbers', 'Show line numbers in the editor gutter.', this.settings.lineNumbers, (v) => this.updateSetting('lineNumbers', v), false)}
            ${this.renderToggleRow('Minimap', 'Show a minimap preview of the file.', this.settings.minimap, (v) => this.updateSetting('minimap', v), false)}
          </div>
        </div>

        <!-- Explorer -->
        <div>
          <h3 class="text-sm font-semibold mb-2" style="color: var(--app-disabled-foreground);">Explorer</h3>
          <div class="rounded-lg overflow-hidden" style="border: 1px solid var(--app-border);">
            ${this.renderToggleRow('Auto reveal', 'Expand and highlight the active file in the explorer.', this.settings.explorerAutoReveal, (v) => this.updateSetting('explorerAutoReveal', v), true)}
            ${this.renderToggleRow('Indent guides', 'Show indentation guides in the file tree.', this.settings.explorerIndentGuides, (v) => this.updateSetting('explorerIndentGuides', v), false)}
          </div>
        </div>

        <!-- Terminal -->
        <div>
          <h3 class="text-sm font-semibold mb-2" style="color: var(--app-disabled-foreground);">Terminal</h3>
          <div class="rounded-lg overflow-hidden" style="border: 1px solid var(--app-border);">
            ${this.renderToggleRow('Cursor blink', 'Make the terminal cursor blink.', this.settings.terminalCursorBlink, (v) => this.updateSetting('terminalCursorBlink', v), true)}
          </div>
        </div>
      </div>
    `;
  }

  private renderAppearanceCard(mode: ThemeMode, label: string, iconName: string) {
    const isSelected = this.currentThemeMode === mode;
    return html`
      <button
        class="rounded-xl py-5 flex flex-col items-center gap-2.5 transition-all"
        style="
          border: 1px solid ${isSelected ? 'var(--app-disabled-foreground)' : 'var(--app-border)'};
        "
        @click=${() => this.setThemeMode(mode)}>
        <os-icon name=${iconName} size="22" color="${isSelected ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'}"></os-icon>
        <span class="text-xs font-medium" style="color: ${isSelected ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'};">${label}</span>
      </button>
    `;
  }

  private renderToggleRow(label: string, description: string, value: boolean, onChange: (v: boolean) => void, isFirst: boolean) {
    return html`
      <div
        class="flex items-center justify-between px-4 py-3"
        style="${!isFirst ? `border-top: 1px solid var(--app-border);` : ''}">
        <div>
          <div class="text-sm font-medium">${label}</div>
          <div class="text-xs" style="color: var(--app-disabled-foreground);">${description}</div>
        </div>
        <button
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors"
          style="background-color: ${value ? 'var(--app-button-background)' : 'var(--app-border)'};"
          @click=${() => onChange(!value)}>
          <span
            class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
            style="transform: translateX(${value ? '16px' : '2px'}); margin-top: 1px;"
          ></span>
        </button>
      </div>
    `;
  }

  private renderThemesTab() {
    return html`
      <div class="space-y-7">
        <div>
          <h1 class="text-xl font-bold mb-1">Themes</h1>
          <p class="text-sm" style="color: var(--app-disabled-foreground);">Customize the look and feel of OpenStorm.</p>
        </div>

        <!-- Color Theme -->
        <div>
          <h3 class="text-sm font-semibold mb-3" style="color: var(--app-disabled-foreground);">Color Theme</h3>
          <p class="text-xs mb-3" style="color: var(--app-disabled-foreground); opacity: 0.7;">
            ${this.currentThemeMode === 'system' ? 'Theme follows your system appearance.' : 'Select a color theme to use.'}
          </p>
          <div class="grid grid-cols-2 gap-3">
            ${this.themes.map((theme: ThemeDefinition) => {
              const isSelected = theme.id === this.currentWorkbenchTheme;
              return html`
                <div
                  class="rounded-lg cursor-pointer transition-all"
                  style="border: 1px solid ${isSelected ? 'var(--app-disabled-foreground)' : 'var(--app-border)'};"
                  @click=${() => this.selectTheme(theme.id)}
                  @mouseenter=${() => this.previewThemeHover(theme.id)}
                  @mouseleave=${() => this.previewThemeHover(null)}>
                  <div class="p-3">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-xs font-medium">${theme.name}</span>
                      ${isSelected ? html`<os-icon name="check" size="14" color="var(--app-disabled-foreground)"></os-icon>` : ''}
                    </div>
                    <div class="flex gap-1">
                      <div class="w-4 h-4 rounded-sm" style="background-color: ${theme.workbench['app-bg']}; border: 1px solid var(--app-border);"></div>
                      <div class="w-4 h-4 rounded-sm" style="background-color: ${theme.editor['editor-background']}; border: 1px solid var(--app-border);"></div>
                      <div class="w-4 h-4 rounded-sm" style="background-color: ${theme.workbench['statusbar-background']}; border: 1px solid var(--app-border);"></div>
                    </div>
                    <span class="text-xs" style="color: var(--app-disabled-foreground); margin-top: 4px; display: block;">
                      ${theme.type === 'dark' ? 'Dark' : 'Light'}
                    </span>
                  </div>
                </div>
              `;
            })}
          </div>
        </div>

        <!-- Editor Theme -->
        <div>
          <h3 class="text-sm font-semibold mb-3" style="color: var(--app-disabled-foreground);">Editor Syntax Theme</h3>
          <p class="text-xs mb-3" style="color: var(--app-disabled-foreground); opacity: 0.7;">
            Choose a different syntax highlighting theme.
          </p>
          <div class="grid grid-cols-2 gap-3">
            ${this.themes.map((theme: ThemeDefinition) => {
              const isSelected = theme.id === this.currentEditorTheme;
              return html`
                <button
                  class="p-3 rounded-lg text-left transition-all"
                  style="border: 1px solid ${isSelected ? 'var(--app-disabled-foreground)' : 'var(--app-border)'};"
                  @click=${() => this.setEditorTheme(theme.id)}>
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-medium">${theme.name}</span>
                    ${isSelected ? html`<os-icon name="check" size="14" color="var(--app-disabled-foreground)"></os-icon>` : ''}
                  </div>
                  <div class="flex gap-1">
                    <div class="w-6 h-3 rounded-sm" style="background-color: ${theme.editor['app-keyword']};"></div>
                    <div class="w-6 h-3 rounded-sm" style="background-color: ${theme.editor['app-string']};"></div>
                    <div class="w-6 h-3 rounded-sm" style="background-color: ${theme.editor['app-type']};"></div>
                  </div>
                </button>
              `;
            })}
          </div>
        </div>
      </div>
    `;
  }

  private renderShortcutsTab() {
    return html`
      <div class="space-y-7">
        <div>
          <h1 class="text-xl font-bold mb-1">Shortcuts</h1>
          <p class="text-sm" style="color: var(--app-disabled-foreground);">Keyboard shortcuts for OpenStorm.</p>
        </div>

        <div class="rounded-lg overflow-hidden" style="border: 1px solid var(--app-border);">
          ${SHORTCUTS.map((shortcut, i) => html`
            <div
              class="flex items-center justify-between px-4 py-2.5"
              style="${i > 0 ? `border-top: 1px solid var(--app-border);` : ''}">
              <span class="text-sm">${shortcut.description}</span>
              <div class="flex items-center gap-1">
                ${shortcut.keys.map((key, j) => html`
                  ${j > 0 ? html`<span class="text-xs" style="color: var(--app-disabled-foreground);">+</span>` : ''}
                  <kbd
                    class="px-1.5 py-0.5 text-xs rounded font-mono"
                    style="background-color: var(--app-bg); border: 1px solid var(--app-border); color: var(--app-foreground);">
                    ${key}
                  </kbd>
                `)}
              </div>
            </div>
          `)}
        </div>
      </div>
    `;
  }

  private async loadAiConfig() {
    try {
      const [config, providers] = await Promise.all([
        invoke<AiProviderConfig>('ai_get_config'),
        invoke<ProviderInfo[]>('ai_list_providers'),
      ]);
      this.aiConfig = config;
      this.aiProviders = providers;
      await this.testAndFetch();
    } catch (e) {
      console.error('[Settings] Failed to load AI config:', e);
    }
  }

  private async testAndFetch() {
    this.aiLoading = true;
    this.aiConnectionStatus = null;
    this.aiModels = [];
    try {
      this.aiConnectionStatus = await invoke<boolean>('ai_check_connection', {
        providerId: this.aiConfig.provider,
      });
      if (this.aiConnectionStatus) {
        this.aiModels = await invoke<ModelInfo[]>('ai_list_models', {
          providerId: this.aiConfig.provider,
        });
      }
    } catch (e) {
      this.aiConnectionStatus = false;
    } finally {
      this.aiLoading = false;
    }
  }

  private async saveAiConfig() {
    try {
      await invoke('ai_set_config', { config: this.aiConfig });
    } catch (e) {
      console.error('[Settings] Failed to save AI config:', e);
    }
  }

  private renderModelsTab() {
    const providerDefaults: Record<string, string> = {
      ollama: 'http://localhost:11434',
      lmstudio: 'http://localhost:1234/v1',
      nvidia: 'https://integrate.api.nvidia.com/v1',
      openai: 'https://api.openai.com/v1',
      openrouter: 'https://openrouter.ai/api/v1',
      deepseek: 'https://api.deepseek.com',
      qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      groq: 'https://api.groq.com/openai/v1',
      sambanova: 'https://api.sambanova.ai/v1',
      together: 'https://api.together.xyz/v1',
      mistral: 'https://api.mistral.ai/v1',
      cerebras: 'https://api.cerebras.ai/v1',
      fireworks: 'https://api.fireworks.ai/inference/v1',
      anthropic: 'https://api.anthropic.com',
    };

    const activeProvider = this.aiProviders.find(p => p.id === this.aiConfig.provider);
    const showApiKey = activeProvider?.requires_api_key ?? false;

    return html`
      <div class="space-y-7">
        <div>
          <h1 class="text-xl font-bold mb-1">Models</h1>
          <p class="text-sm" style="color: var(--app-disabled-foreground);">Configure AI providers and models.</p>
        </div>

        <!-- Provider -->
        <div>
          <label class="text-sm font-semibold mb-2 block" style="color: var(--app-disabled-foreground);">Provider</label>
          <div class="flex gap-2">
            ${this.aiProviders.map(p => html`
              <button
                class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
                style="
                  background-color: ${this.aiConfig.provider === p.id ? 'var(--app-hover-background)' : 'transparent'};
                  color: ${this.aiConfig.provider === p.id ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'};
                  border: 1px solid ${this.aiConfig.provider === p.id ? 'var(--app-border)' : 'transparent'};
                "
                @click=${() => {
                  if (this.aiConfig.provider === p.id) return;
                  this.aiConfig = {
                    ...this.aiConfig,
                    provider: p.id,
                    base_url: providerDefaults[p.id] || '',
                  };
                  this.testAndFetch();
                }}>
                <span class="w-2 h-2 rounded-full shrink-0 ${
                  this.aiConfig.provider !== p.id ? ''
                  : this.aiLoading ? 'bg-yellow-500 animate-pulse'
                  : this.aiConnectionStatus ? 'bg-green-500'
                  : this.aiConnectionStatus === false ? 'bg-red-500'
                  : ''
                }"></span>
                ${p.name}
              </button>
            `)}
          </div>
        </div>

        <!-- Base URL -->
        <div>
          <label class="text-sm font-semibold mb-2 block" style="color: var(--app-disabled-foreground);">Base URL</label>
          <input
            type="text"
            class="w-full px-3 py-2 text-sm rounded-lg outline-none font-mono"
            style="background: var(--app-input-background, var(--app-hover-background)); border: 1px solid var(--app-border); color: var(--app-foreground);"
            .value=${this.aiConfig.base_url}
            @input=${(e: Event) => {
              this.aiConfig = { ...this.aiConfig, base_url: (e.target as HTMLInputElement).value };
            }}
          />
        </div>

        <!-- API Key -->
        ${showApiKey ? html`
          <div>
            <label class="text-sm font-semibold mb-2 block" style="color: var(--app-disabled-foreground);">API Key</label>
            <input
              type="password"
              class="w-full px-3 py-2 text-sm rounded-lg outline-none font-mono"
              style="background: var(--app-input-background, var(--app-hover-background)); border: 1px solid var(--app-border); color: var(--app-foreground);"
              placeholder="Enter your API key..."
              .value=${this.aiConfig.api_key}
              @input=${(e: Event) => {
                this.aiConfig = { ...this.aiConfig, api_key: (e.target as HTMLInputElement).value };
              }}
            />
          </div>
        ` : ''}

        <!-- Model -->
        ${this.aiConnectionStatus && this.aiModels.length > 0 ? html`
          <div>
            <label class="text-sm font-semibold mb-2 block" style="color: var(--app-disabled-foreground);">Model</label>
            <select
              class="w-full px-3 py-2 text-sm rounded-lg outline-none cursor-pointer"
              style="background: var(--app-input-background, var(--app-hover-background)); border: 1px solid var(--app-border); color: var(--app-foreground);"
              .value=${this.aiConfig.model}
              @change=${(e: Event) => {
                this.aiConfig = { ...this.aiConfig, model: (e.target as HTMLSelectElement).value };
              }}>
              <option value="">Select a model</option>
              ${this.aiModels.map(m => html`
                <option value="${m.id}">${m.name}</option>
              `)}
            </select>
          </div>
        ` : ''}

        <!-- Save -->
        <div>
          <button
            class="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            style="background: var(--app-foreground); color: var(--app-bg);"
            @click=${() => this.saveAiConfig()}>
            Save
          </button>
        </div>
      </div>
    `;
  }

  private async loadMcpServers() {
    this.mcpLoading = true;
    try {
      const [servers, tools] = await Promise.all([
        invoke<McpServerStatus[]>('ai_mcp_list_servers'),
        invoke<McpToolInfo[]>('ai_mcp_list_tools'),
      ]);
      this.mcpServers = servers;
      this.mcpTools = tools;
    } catch (e) {
      console.error('[Settings] Failed to load MCP servers:', e);
      this.mcpServers = [];
      this.mcpTools = [];
    } finally {
      this.mcpLoading = false;
    }
  }

  private async addMcpServer() {
    if (!this.mcpNewName || !this.mcpNewCommand) return;
    const config: McpServerConfig = {
      name: this.mcpNewName,
      command: this.mcpNewCommand,
      args: this.mcpNewArgs.split(' ').filter(Boolean),
      env: {},
      enabled: true,
    };
    try {
      await invoke('ai_mcp_add_server', { config });
      this.mcpNewName = '';
      this.mcpNewCommand = 'npx';
      this.mcpNewArgs = '-y @playwright/mcp@latest';
      await this.loadMcpServers();
    } catch (e) {
      console.error('[Settings] Failed to add MCP server:', e);
    }
  }

  private async removeMcpServer(name: string) {
    try {
      await invoke('ai_mcp_remove_server', { name });
      await this.loadMcpServers();
    } catch (e) {
      console.error('[Settings] Failed to remove MCP server:', e);
    }
  }

  private renderMcpTab() {
    return html`
      <div class="space-y-7">
        <div>
          <h1 class="text-xl font-bold mb-1">MCP Servers</h1>
          <p class="text-sm" style="color: var(--app-disabled-foreground);">Configure Model Context Protocol servers for external tools.</p>
        </div>

        <!-- Add Server Form -->
        <div class="rounded-lg p-4" style="background-color: var(--app-hover-background); border: 1px solid var(--app-border);">
          <h3 class="text-sm font-semibold mb-3">Add New Server</h3>
          <div class="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label class="text-xs mb-1 block" style="color: var(--app-disabled-foreground);">Name</label>
              <input
                type="text"
                class="w-full px-2 py-1.5 text-sm rounded-md outline-none"
                style="background: var(--app-bg); border: 1px solid var(--app-border); color: var(--app-foreground);"
                placeholder="playwright"
                .value=${this.mcpNewName}
                @input=${(e: Event) => { this.mcpNewName = (e.target as HTMLInputElement).value; }}
              />
            </div>
            <div>
              <label class="text-xs mb-1 block" style="color: var(--app-disabled-foreground);">Command</label>
              <input
                type="text"
                class="w-full px-2 py-1.5 text-sm rounded-md outline-none font-mono"
                style="background: var(--app-bg); border: 1px solid var(--app-border); color: var(--app-foreground);"
                placeholder="npx"
                .value=${this.mcpNewCommand}
                @input=${(e: Event) => { this.mcpNewCommand = (e.target as HTMLInputElement).value; }}
              />
            </div>
            <div>
              <label class="text-xs mb-1 block" style="color: var(--app-disabled-foreground);">Arguments (space-separated)</label>
              <input
                type="text"
                class="w-full px-2 py-1.5 text-sm rounded-md outline-none font-mono"
                style="background: var(--app-bg); border: 1px solid var(--app-border); color: var(--app-foreground);"
                placeholder="-y @playwright/mcp@latest"
                .value=${this.mcpNewArgs}
                @input=${(e: Event) => { this.mcpNewArgs = (e.target as HTMLInputElement).value; }}
              />
            </div>
          </div>
          <button
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            style="background: var(--app-button-background); color: var(--app-button-foreground);"
            @click=${() => this.addMcpServer()}>
            <span class="flex items-center gap-1.5">
              <os-icon name="plus" size="13"></os-icon>
              Add Server
            </span>
          </button>
        </div>

        <!-- Server List -->
        <div>
          <h3 class="text-sm font-semibold mb-3" style="color: var(--app-disabled-foreground);">Connected Servers</h3>
          ${this.mcpLoading ? html`
            <div class="flex items-center gap-2 text-sm" style="color: var(--app-disabled-foreground);">
              <div class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
              Loading...
            </div>
          ` : this.mcpServers.length === 0 ? html`
            <p class="text-sm" style="color: var(--app-disabled-foreground); opacity: 0.7;">No MCP servers configured.</p>
          ` : html`
            <div class="space-y-2">
              ${this.mcpServers.map(server => html`
                <div
                  class="flex items-center justify-between p-3 rounded-lg"
                  style="border: 1px solid var(--app-border);">
                  <div class="flex items-center gap-3">
                    <span class="w-2 h-2 rounded-full shrink-0 ${server.connected ? 'bg-green-500' : 'bg-red-500'}"></span>
                    <div>
                      <div class="text-sm font-medium">${server.name}</div>
                      <div class="text-xs" style="color: var(--app-disabled-foreground);">
                        ${server.connected ? `${server.tool_count} tools` : server.error || 'Disconnected'}
                      </div>
                    </div>
                  </div>
                  <button
                    class="p-1 rounded transition-colors hover:bg-red-500/20"
                    @click=${() => this.removeMcpServer(server.name)}>
                    <os-icon name="x" size="14" color="var(--app-disabled-foreground)"></os-icon>
                  </button>
                </div>
              `)}
            </div>
          `}
        </div>

        <!-- Available Tools -->
        ${this.mcpTools.length > 0 ? html`
          <div>
            <h3 class="text-sm font-semibold mb-3" style="color: var(--app-disabled-foreground);">Available MCP Tools</h3>
            <div class="rounded-lg overflow-hidden" style="border: 1px solid var(--app-border);">
              ${this.mcpTools.map((tool, i) => html`
                <div
                  class="flex items-center gap-3 px-4 py-2.5"
                  style="${i > 0 ? `border-top: 1px solid var(--app-border);` : ''}">
                  <os-icon name="server" size="13" color="var(--ai-accent)"></os-icon>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium truncate">${tool.namespaced_name}</div>
                    <div class="text-xs truncate" style="color: var(--app-disabled-foreground);">${tool.description}</div>
                  </div>
                  <span class="text-xs shrink-0 px-1.5 py-0.5 rounded" style="background: var(--app-hover-background); color: var(--app-disabled-foreground);">
                    ${tool.server_name}
                  </span>
                </div>
              `)}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderAboutTab() {
    return html`
      <div class="space-y-7">
        <div>
          <h1 class="text-xl font-bold mb-1">About</h1>
          <p class="text-sm" style="color: var(--app-disabled-foreground);">Information about OpenStorm.</p>
        </div>

        <div class="rounded-xl p-5 flex items-center gap-4" style="background-color: var(--app-hover-background); border: 1px solid var(--app-border);">
          <os-brand-logo size="56"></os-brand-logo>
          <div>
            <h2 class="text-base font-bold">OpenStorm</h2>
            <p class="text-xs" style="color: var(--app-disabled-foreground);">A high-performance, lightweight IDE</p>
            <p class="text-xs font-mono mt-1" style="color: var(--app-disabled-foreground); opacity: 0.6;">v1.3.0</p>
          </div>
        </div>

        <div class="space-y-0 rounded-lg overflow-hidden" style="border: 1px solid var(--app-border);">
          ${[
            { label: 'Build', value: `macOS · ${navigator.platform} · v1.3.0` },
            { label: 'License', value: 'MIT' },
            { label: 'Source code', value: 'github.com/openstorm/openstorm', icon: 'git-branch' },
            { label: 'Website', value: 'openstorm.dev', icon: 'globe' },
          ].map((item, i) => html`
            <div
              class="flex items-center gap-4 px-4 py-3"
              style="${i > 0 ? `border-top: 1px solid var(--app-border);` : ''}">
              <span class="text-xs w-24 shrink-0" style="color: var(--app-disabled-foreground);">${item.label}</span>
              <span class="text-sm font-mono flex items-center gap-1.5">
                ${item.icon ? html`<os-icon name=${item.icon} size="13" color="var(--app-disabled-foreground)"></os-icon>` : ''}
                ${item.value}
              </span>
            </div>
          `)}
        </div>

        <div class="flex items-center gap-3">
          <button
            class="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            style="border: 1px solid var(--app-border); color: var(--app-foreground);"
            @click=${() => dispatch('check-updates')}>
            Check for updates
          </button>
          <button
            class="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
            style="border: 1px solid var(--app-border); color: var(--app-foreground);"
            @click=${() => window.open('https://github.com/openstorm/openstorm', '_blank')}>
            <os-icon name="git-branch" size="13"></os-icon>
            View on GitHub
          </button>
        </div>
      </div>
      </div>
    `;
  }
}
