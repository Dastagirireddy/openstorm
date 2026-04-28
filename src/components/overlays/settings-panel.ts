import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import { dispatch } from '../../lib/types/events.js';
import { ThemeService } from '../../lib/services/theme-service.js';
import type { ThemeDefinition, ThemeMode } from '../../lib/services/theme-service.js';
import '../../layout/icon.js';

@customElement('settings-panel')
export class SettingsPanel extends TailwindElement() {
  @state() private activeSection: 'themes' | 'editor' | 'workbench' = 'themes';
  @state() private themes: ThemeDefinition[] = [];
  @state() private currentWorkbenchTheme: string = '';
  @state() private currentEditorTheme: string = '';
  @state() private currentThemeMode: ThemeMode = 'system';
  @state() private previewTheme: string | null = null;

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    await this.loadThemes();

    // Listen for theme changes
    const themeService = ThemeService.getInstance();

    const updateThemeState = () => {
      const ids = themeService.getCurrentThemeIds();
      this.currentWorkbenchTheme = ids.workbench;
      this.currentEditorTheme = ids.editor;
      this.currentThemeMode = themeService.getThemeMode();
      this.requestUpdate();
    };

    updateThemeState();

    this._themeDispose = themeService.subscribe(() => {
      updateThemeState();
    });

    // Listen for open-theme-settings event to open settings panel
    document.addEventListener('open-theme-settings', () => {
      dispatch('set-active-activity', { activity: 'settings' });
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._themeDispose) {
      this._themeDispose();
    }
  }

  private _themeDispose: (() => void) | null = null;

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
    if (themeId) {
        const themeService = ThemeService.getInstance();
      const currentIds = themeService.getCurrentThemeIds();

      // Store original themes
      this.previewTheme = themeId;

      // Apply preview (only if different from current)
      if (themeId !== currentIds.workbench) {
        themeService.setWorkbenchTheme(themeId);
      }
    } else if (this.previewTheme) {
      // Restore original theme on mouse leave
        const themeService = ThemeService.getInstance();
      const currentIds = themeService.getCurrentThemeIds();

      // Restore workbench theme to what it was before preview
      if (this.currentWorkbenchTheme !== this.previewTheme) {
        themeService.setWorkbenchTheme(this.currentWorkbenchTheme);
      }
      this.previewTheme = null;
    }
  }

  render() {
    return html`
      <div class="flex flex-col h-full bg-[var(--app-bg)]" style="color: var(--app-foreground);">
        <!-- Header -->
        <div class="px-4 py-3 border-b border-[var(--app-border)] flex items-center justify-between">
          <h2 class="text-sm font-semibold">Settings</h2>
          <button
            class="p-1 rounded hover:bg-[var(--app-hover-background)]"
            @click=${() => {
              dispatch('close-settings');
            }}
            title="Close">
            <os-icon name="x" size="16"></os-icon>
          </button>
        </div>

        <div class="flex flex-1 overflow-hidden">
          <!-- Sidebar -->
          <div class="w-40 border-r border-[var(--app-border)] bg-[var(--activitybar-background)] p-2">
            <button
              class="w-full px-3 py-2 text-left text-sm rounded mb-1 flex items-center gap-2"
              style="background-color: ${this.activeSection === 'themes' ? 'var(--app-hover-background)' : 'transparent'}; color: var(--app-foreground);"
              @click=${() => { this.activeSection = 'themes'; this.requestUpdate(); }}>
              <os-icon name="palette" size="14"></os-icon>
              <span>Themes</span>
            </button>
            <button
              class="w-full px-3 py-2 text-left text-sm rounded mb-1 flex items-center gap-2"
              style="background-color: ${this.activeSection === 'editor' ? 'var(--app-hover-background)' : 'transparent'}; color: var(--app-foreground);"
              @click=${() => { this.activeSection = 'editor'; this.requestUpdate(); }}>
              <os-icon name="code" size="14"></os-icon>
              <span>Editor</span>
            </button>
            <button
              class="w-full px-3 py-2 text-left text-sm rounded flex items-center gap-2"
              style="background-color: ${this.activeSection === 'workbench' ? 'var(--app-hover-background)' : 'transparent'}; color: var(--app-foreground);"
              @click=${() => { this.activeSection = 'workbench'; this.requestUpdate(); }}>
              <os-icon name="layout-grid" size="14"></os-icon>
              <span>Workbench</span>
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-4">
            ${this.activeSection === 'themes' ? this.renderThemesTab() : ''}
            ${this.activeSection === 'editor' ? this.renderEditorTab() : ''}
            ${this.activeSection === 'workbench' ? this.renderWorkbenchTab() : ''}
          </div>
        </div>
      </div>
    `;
  }

  private renderThemesTab() {
    return html`
      <div class="space-y-4">
        <h3 class="text-sm font-semibold mb-3">Theme Mode</h3>
        <div class="flex gap-2 mb-4">
          <button
            class="px-3 py-1.5 text-sm rounded border transition-all"
            style="
              background-color: ${this.currentThemeMode === 'system' ? 'var(--app-button-background)' : 'transparent'};
              color: ${this.currentThemeMode === 'system' ? 'var(--app-button-foreground, #fff)' : 'var(--app-foreground)'};
              border-color: ${this.currentThemeMode === 'system' ? 'var(--app-button-background)' : 'var(--app-border)'};
            "
            @click=${() => this.setThemeMode('system')}>
            <span class="flex items-center gap-2">
              <os-icon name="monitor" size="14"></os-icon>
              System
            </span>
          </button>
          <button
            class="px-3 py-1.5 text-sm rounded border transition-all"
            style="
              background-color: ${this.currentThemeMode === 'light' ? 'var(--app-button-background)' : 'transparent'};
              color: ${this.currentThemeMode === 'light' ? 'var(--app-button-foreground, #fff)' : 'var(--app-foreground)'};
              border-color: ${this.currentThemeMode === 'light' ? 'var(--app-button-background)' : 'var(--app-border)'};
            "
            @click=${() => this.setThemeMode('light')}>
            <span class="flex items-center gap-2">
              <os-icon name="sun" size="14"></os-icon>
              Light
            </span>
          </button>
          <button
            class="px-3 py-1.5 text-sm rounded border transition-all"
            style="
              background-color: ${this.currentThemeMode === 'dark' ? 'var(--app-button-background)' : 'transparent'};
              color: ${this.currentThemeMode === 'dark' ? 'var(--app-button-foreground, #fff)' : 'var(--app-foreground)'};
              border-color: ${this.currentThemeMode === 'dark' ? 'var(--app-button-background)' : 'var(--app-border)'};
            "
            @click=${() => this.setThemeMode('dark')}>
            <span class="flex items-center gap-2">
              <os-icon name="moon" size="14"></os-icon>
              Dark
            </span>
          </button>
        </div>

        <h3 class="text-sm font-semibold mb-3">Color Theme</h3>
        <p class="text-xs text-[var(--app-disabled-foreground)] mb-2">
          ${this.currentThemeMode === 'system' ? 'Theme follows your system appearance.' : 'Select a color theme to use.'}
        </p>
        <div class="grid grid-cols-2 gap-3">
          ${this.themes.map((theme: any) => {
            const isSelected = theme.id === this.currentWorkbenchTheme;
            return html`
              <div
                class="border rounded-md cursor-pointer transition-all hover:shadow-md"
                style="border-color: ${isSelected ? 'var(--app-button-background)' : 'var(--app-border)'}; background-color: ${theme.type === 'dark' ? '#2d2d2d' : '#f5f5f5'};"
                @click=${() => this.selectTheme(theme.id)}
                @mouseenter=${() => this.previewThemeHover(theme.id)}
                @mouseleave=${() => this.previewThemeHover(null)}>
                <div class="p-3">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-medium" style="color: ${theme.type === 'dark' ? '#fff' : '#1a1a1a'};">
                      ${theme.name}
                    </span>
                    ${isSelected ? html`
                      <os-icon name="check" size="14" color="var(--app-button-background)"></os-icon>
                    ` : ''}
                  </div>
                  <div class="flex gap-1">
                    <div class="w-4 h-4 rounded-sm" style="background-color: ${theme.workbench['app-bg']}; border: 1px solid ${theme.type === 'dark' ? '#444' : '#ddd'};"></div>
                    <div class="w-4 h-4 rounded-sm" style="background-color: ${theme.editor['editor-background']}; border: 1px solid ${theme.type === 'dark' ? '#444' : '#ddd'};"></div>
                    <div class="w-4 h-4 rounded-sm" style="background-color: ${theme.workbench['statusbar-background']}; border: 1px solid ${theme.type === 'dark' ? '#444' : '#ddd'};"></div>
                  </div>
                  <span class="text-xs" style="color: ${theme.type === 'dark' ? '#888' : '#666'}; margin-top: 4px; display: block;">
                    ${theme.type === 'dark' ? 'Dark' : 'Light'}
                  </span>
                </div>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }

  private renderEditorTab() {
    return html`
      <div class="space-y-4">
        <h3 class="text-sm font-semibold mb-3">Editor Theme</h3>
        <p class="text-xs text-[var(--app-disabled-foreground)] mb-4">
          Choose a different syntax highlighting theme while keeping your current workbench theme.
        </p>
        <div class="grid grid-cols-2 gap-3">
          ${this.themes.map((theme: any) => {
            const isSelected = theme.id === this.currentEditorTheme;
            return html`
              <button
                class="p-3 border rounded-md text-left transition-all hover:bg-[var(--app-hover-background)]"
                style="border-color: ${isSelected ? 'var(--app-button-background)' : 'var(--app-border)'};"
                @click=${() => this.setEditorTheme(theme.id)}>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-medium">${theme.name}</span>
                  ${isSelected ? html`
                    <os-icon name="check" size="14" color="var(--app-button-background)"></os-icon>
                  ` : ''}
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
    `;
  }

  private renderWorkbenchTab() {
    return html`
      <div class="space-y-4">
        <h3 class="text-sm font-semibold mb-3">Workbench Theme</h3>
        <p class="text-xs text-[var(--app-disabled-foreground)] mb-4">
          Choose the UI theme for the sidebar, status bar, and other UI elements.
        </p>
        <div class="grid grid-cols-2 gap-3">
          ${this.themes.map((theme: any) => {
            const isSelected = theme.id === this.currentWorkbenchTheme;
            return html`
              <button
                class="p-3 border rounded-md text-left transition-all hover:bg-[var(--app-hover-background)]"
                style="border-color: ${isSelected ? 'var(--app-button-background)' : 'var(--app-border)'};"
                @click=${() => this.setWorkbenchTheme(theme.id)}>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-medium">${theme.name}</span>
                  ${isSelected ? html`
                    <os-icon name="check" size="14" color="var(--app-button-background)"></os-icon>
                  ` : ''}
                </div>
                <div class="flex gap-1">
                  <div class="w-6 h-4 rounded-sm" style="background-color: ${theme.workbench['app-bg']}; border: 1px solid ${theme.type === 'dark' ? '#444' : '#ddd'};"></div>
                  <div class="w-6 h-4 rounded-sm" style="background-color: ${theme.workbench['statusbar-background']}; border: 1px solid ${theme.type === 'dark' ? '#444' : '#ddd'};"></div>
                </div>
              </button>
            `;
          })}
        </div>
      </div>
    `;
  }
}
