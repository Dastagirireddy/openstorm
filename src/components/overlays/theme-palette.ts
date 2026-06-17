/**
 * Theme Palette - Zed-style command palette theme picker
 *
 * Provides a quick theme switching overlay similar to Zed editor's command palette
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
      <div class="fixed inset-0 z-[9999]" @click=${() => this.close()} style="background: rgba(0, 0, 0, 0.4);">
        <div
          class="fixed top-24 left-1/2 -translate-x-1/2 w-[520px] max-w-[90vw] rounded-xl shadow-2xl overflow-hidden border"
          style="
            background: var(--app-bg);
            border-color: var(--app-border);
            box-shadow:
              0 0 0 1px rgba(0, 0, 0, 0.05),
              0 20px 60px rgba(0, 0, 0, 0.4);
          "
          @click=${(e: Event) => e.stopPropagation()}>
          <!-- Header -->
          <div class="flex items-center gap-2 px-4 py-3 border-b" style="border-color: var(--app-border);">
            <os-icon name="palette" size="18" style="color: var(--app-disabled-foreground);"></os-icon>
            <input
              id="theme-input"
              type="text"
              placeholder="Select theme..."
              class="flex-1 bg-transparent border-none outline-none text-sm"
              style="color: var(--app-foreground);"
              .value=${this.query}
              @input=${this._handleInput}/>
            <kbd
              class="px-1.5 py-0.5 text-[10px] rounded border"
              style="
                background: var(--app-tab-inactive);
                border-color: var(--app-border);
                color: var(--app-disabled-foreground);
              "
            >
              ESC
            </kbd>
          </div>

          <!-- Theme List -->
          <div class="max-h-[340px] overflow-y-auto">
            ${this.filteredThemes.length === 0
              ? html`
                  <div class="text-center py-10">
                    <p class="text-sm" style="color: var(--app-disabled-foreground);">
                      ${this.query ? `No themes matching "${this.query}"` : 'No themes found'}
                    </p>
                  </div>
                `
              : html`
                  <div class="p-1.5">
                    ${this.filteredThemes.map((theme, index) => {
                      const isSelected = index === this.selectedIndex;
                      return html`
                        <div
                          data-index="${index}"
                          class="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors group"
                          style="background-color: ${isSelected ? 'var(--app-tab-inactive)' : 'transparent'};"
                          @click=${() => this.selectTheme(theme)}
                          @mouseenter=${() => { this.selectedIndex = index; }}>
                          <!-- Theme preview swatches -->
                          <div class="flex items-center gap-1 flex-shrink-0">
                            <div class="w-5 h-5 rounded-md border flex-shrink-0"
                                 style="
                                   background: ${theme.workbench['app-bg']};
                                   border-color: var(--app-border);
                                   box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
                                 ">
                            </div>
                            <div class="w-5 h-5 rounded-md border flex-shrink-0"
                                 style="
                                   background: ${theme.editor['editor-background']};
                                   border-color: var(--app-border);
                                   box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
                                 ">
                            </div>
                          </div>

                          <!-- Theme name -->
                          <span class="flex-1 text-sm font-medium truncate" style="color: var(--app-foreground);">
                            ${theme.name}
                          </span>

                          <!-- Theme type badge -->
                          <span class="px-2 py-0.5 rounded-md text-[10px] font-medium flex-shrink-0"
                                style="
                                  background: ${theme.type === 'dark' ? 'var(--app-button-background)' : 'var(--app-tab-inactive)'};
                                  color: ${theme.type === 'dark' ? 'var(--app-foreground)' : 'var(--app-disabled-foreground)'};
                                ">
                            ${theme.type === 'dark' ? 'Dark' : 'Light'}
                          </span>

                          <!-- Selected indicator -->
                          ${isSelected ? html`
                            <os-icon name="check" size="14" style="color: var(--app-button-background);"></os-icon>
                          ` : html`
                            <os-icon name="chevron-right" size="14" class="opacity-0 group-hover:opacity-100 transition-opacity" style="color: var(--app-disabled-foreground);"></os-icon>
                          `}
                        </div>
                      `;
                    })}
                  </div>
                `}
          </div>

          <!-- Footer -->
          ${this.filteredThemes.length > 0
            ? html`
                <div
                  class="px-4 py-2 border-t text-[11px]"
                  style="
                    border-color: var(--app-border);
                    background: var(--app-toolbar-background);
                    color: var(--app-disabled-foreground);
                  "
                >
                  <span class="flex items-center gap-2">
                    <kbd
                      class="px-1 py-0.5 rounded border"
                      style="background: var(--app-bg); border-color: var(--app-border);"
                    >
                      ↑↓
                    </kbd>
                    <span>to navigate</span>
                    <kbd
                      class="px-1 py-0.5 rounded border"
                      style="background: var(--app-bg); border-color: var(--app-border);"
                    >
                      ↵
                    </kbd>
                    <span>to select</span>
                  </span>
                </div>
              `
            : nothing}
        </div>
      </div>
    `;
  }
}
