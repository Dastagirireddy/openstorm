/**
 * Theme Palette - Command palette style theme picker
 *
 * Provides a quick theme switching overlay similar to VS Code's command palette
 */

import { html } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import { ThemeService } from '../../lib/services/theme-service.js';
import type { ThemeDefinition } from '../../lib/services/theme-service.js';

@customElement('theme-palette')
export class ThemePalette extends TailwindElement() {
  @query('#theme-input') private themeInput!: HTMLInputElement;
  @state() private isOpen: boolean = false;
  @state() private query: string = '';
  @state() private themes: ThemeDefinition[] = [];
  @state() private filteredThemes: ThemeDefinition[] = [];
  @state() private selectedIndex: number = 0;
  @state() private mode: 'all' | 'workbench' | 'editor' = 'all';

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._handleKeyDown as EventListener);
    document.addEventListener('open-theme-palette', this._handleOpenPalette as EventListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleKeyDown as EventListener);
    document.removeEventListener('open-theme-palette', this._handleOpenPalette as EventListener);
  }

  private _handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl/Cmd + Shift + T to open theme palette
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      this.open();
    }

    if (!this.isOpen) return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredThemes.length - 1);
        this.scrollToSelected();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.scrollToSelected();
        break;
      case 'Enter':
        if (this.filteredThemes.length > 0) {
          e.preventDefault();
          this.selectTheme(this.filteredThemes[this.selectedIndex]);
        }
        break;
    }
  };

  private _handleOpenPalette = () => {
    this.open();
  };

  async open() {
    await this.loadThemes();
    this.isOpen = true;
    this.query = '';
    this.filteredThemes = [...this.themes];
    this.selectedIndex = 0;
    this.updateComplete.then(() => {
      this.themeInput?.focus();
    });
  }

  close() {
    this.isOpen = false;
    this.query = '';
    this.filteredThemes = [];
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private loadThemes() {
    this.themes = ThemeService.getInstance().getThemes();
    this.filteredThemes = [...this.themes];
  }

  private selectTheme(theme: ThemeDefinition) {
    const themeService = ThemeService.getInstance();

    if (this.mode === 'editor') {
      themeService.setEditorTheme(theme.id);
    } else {
      themeService.setTheme(theme.id);
    }

    this.close();
  }

  private _handleInput(e: InputEvent) {
    const target = e.target as HTMLInputElement;
    this.query = target.value.toLowerCase();

    if (this.query.length === 0) {
      this.filteredThemes = [...this.themes];
    } else {
      this.filteredThemes = this.themes.filter(theme =>
        theme.name.toLowerCase().includes(this.query) ||
        theme.id.toLowerCase().includes(this.query) ||
        theme.type.toLowerCase().includes(this.query)
      );
    }
    this.selectedIndex = 0;
  }

  private scrollToSelected() {
    const selectedEl = this.renderRoot.querySelector(`[data-index="${this.selectedIndex}"]`);
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  render() {
    if (!this.isOpen) return html``;

    return html`
      <div class="fixed inset-0 z-[9999]" @click=${() => this.close()}>
        <div class="fixed top-24 left-1/2 -translate-x-1/2 w-[500px] max-w-[90vw] rounded-lg shadow-2xl overflow-hidden"
             style="background-color: var(--app-bg); border: 1px solid var(--app-border);"
             @click=${(e: Event) => e.stopPropagation()}>
          <!-- Header -->
          <div class="flex items-center gap-3 p-4 border-b" style="border-color: var(--app-border);">
            <os-icon name="palette" size="18" style="color: var(--app-disabled-foreground);"></os-icon>
            <input
              id="theme-input"
              type="text"
              placeholder="Select theme... (type to filter)"
              class="flex-1 bg-transparent text-[14px] outline-none"
              style="color: var(--app-foreground);"
              .value=${this.query}
              @input=${this._handleInput}/>
            <div class="flex items-center gap-1 flex-shrink-0">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-medium" style="background-color: var(--app-toolbar-hover); color: var(--app-disabled-foreground);">⇧⌘T</span>
            </div>
          </div>

          <!-- Theme List -->
          <div class="max-h-[300px] overflow-y-auto py-2">
            ${this.filteredThemes.length === 0
              ? html`
                  <div class="flex items-center justify-center py-8">
                    <span class="text-[13px]" style="color: var(--app-disabled-foreground);">No themes found</span>
                  </div>
                `
              : this.filteredThemes.map((theme, index) => {
                  const isSelected = index === this.selectedIndex;
                  return html`
                    <div
                      data-index="${index}"
                      class="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                      style="background-color: ${isSelected ? 'var(--app-hover-background)' : 'transparent'};"
                      @click=${() => this.selectTheme(theme)}
                      @mouseenter=${() => { this.selectedIndex = index; }}>
                      <!-- Theme preview swatch -->
                      <div class="flex items-center gap-1 flex-shrink-0">
                        <div class="w-4 h-4 rounded-sm border"
                             style="background-color: ${theme.workbench['app-bg']}; border-color: var(--app-border);">
                        </div>
                        <div class="w-4 h-4 rounded-sm border"
                             style="background-color: ${theme.editor['editor-background']}; border-color: var(--app-border);">
                        </div>
                      </div>

                      <!-- Theme name -->
                      <span class="flex-1 text-[13px]" style="color: var(--app-foreground);">
                        ${theme.name}
                      </span>

                      <!-- Theme type badge -->
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style="background-color: ${theme.type === 'dark' ? 'var(--app-button-background)' : 'var(--app-toolbar-hover)'};
                                   color: ${theme.type === 'dark' ? '#fff' : 'var(--app-disabled-foreground)'};">
                        ${theme.type === 'dark' ? 'Dark' : 'Light'}
                      </span>

                      <!-- Selected indicator -->
                      ${isSelected ? html`
                        <os-icon name="check" size="14" style="color: var(--app-button-background);"></os-icon>
                      ` : ''}
                    </div>
                  `;
                })}
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between px-4 py-2 border-t text-[11px]" style="border-color: var(--app-border); color: var(--app-disabled-foreground);">
            <span>Use ↑↓ to navigate, Enter to select</span>
            <span>Esc to close</span>
          </div>
        </div>
      </div>
    `;
  }
}
