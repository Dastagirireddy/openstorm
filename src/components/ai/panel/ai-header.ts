import { html, css, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { dispatchAIEvent } from '../core/ai-events.js';

interface ProviderInfo {
  id: string;
  name: string;
}

@customElement('openstorm-ai-header')
export class AIHeader extends LitElement {
  static styles = css`
    :host { display: block; }
    .hdr {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 35px;
      padding: 0 16px;
      background: var(--ai-tool-header-background, #f3f4f6);
      border-bottom: 1px solid var(--ai-panel-border, #e5e7eb);
      flex-shrink: 0;
      box-sizing: border-box;
    }
    .hdr-left { display: flex; align-items: center; gap: 10px; }
    .hdr-avatar {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: linear-gradient(135deg, var(--ai-primary, #3574f0) 0%, var(--ai-secondary, #5a9cf8) 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: white;
      flex-shrink: 0;
    }
    .hdr-label { font-size: 13px; font-weight: 600; color: var(--ai-text, #1f2937); }
    .hdr-dot { width: 8px; height: 8px; border-radius: 50%; margin-left: 4px; }
    .hdr-dot.on { background: var(--ai-success, #22c55e); box-shadow: 0 0 6px var(--ai-success, #22c55e); }
    .hdr-dot.off { background: var(--ai-error, #ef4444); }
    .hdr-actions { display: flex; align-items: center; gap: 8px; }
    .hdr-btn-icon-only {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 4px;
      color: var(--ai-text-dim, #9ca3af);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .hdr-btn-icon-only:hover {
      background: var(--ai-tool-background, #f9fafb);
      border-color: var(--ai-panel-border, #e5e7eb);
      color: var(--ai-text, #1f2937);
    }

    /* ── Provider Dropdown ── */
    .provider-dropdown { position: relative; }
    .provider-trigger {
      display: flex;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: none;
      color: var(--ai-text, #1f2937);
      font-size: 12px;
      font-weight: 500;
      font-family: 'SF Mono', 'Fira Code', monospace;
      padding: 5px 10px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
      outline: none;
      max-width: 180px;
    }
    .provider-trigger:hover { background: var(--ai-tool-background, #f9fafb); }
    .provider-trigger-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .provider-chevron {
      font-size: 8px;
      color: var(--ai-text-dim, #9ca3af);
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }
    .provider-dropdown.open .provider-chevron { transform: rotate(180deg); }
    .provider-dropdown.open .provider-trigger { background: var(--ai-tool-background, #f9fafb); }

    .provider-list {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      min-width: 200px;
      max-height: 300px;
      overflow-y: auto;
      background: var(--ai-panel-background, #ffffff);
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      padding: 4px;
    }
    .provider-search-wrap {
      position: relative;
      padding: 4px;
      margin-bottom: 2px;
    }
    .provider-search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--ai-text-dim, #9ca3af);
      pointer-events: none;
    }
    .provider-search-input {
      width: 100%;
      padding: 6px 8px 6px 26px;
      font-size: 11px;
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      border-radius: 4px;
      background: var(--ai-panel-background, #ffffff);
      color: var(--ai-text, #1f2937);
      outline: none;
      box-sizing: border-box;
    }
    .provider-search-input:focus { border-color: var(--ai-primary, #3574f0); }
    .provider-search-input::placeholder { color: var(--ai-text-dim, #9ca3af); }
    .provider-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      color: var(--ai-text-muted, #6b7280);
      transition: background 0.1s ease;
    }
    .provider-item:hover {
      background: var(--ai-tool-background, #f9fafb);
      color: var(--ai-text, #1f2937);
    }
    .provider-item.selected {
      background: color-mix(in srgb, var(--ai-primary, #3574f0) 10%, transparent);
      color: var(--ai-primary, #3574f0);
    }
    .provider-item-icon {
      font-size: 10px;
      color: var(--ai-text-dim, #9ca3af);
      flex-shrink: 0;
      width: 14px;
      text-align: center;
    }
    .provider-item.selected .provider-item-icon { color: var(--ai-primary, #3574f0); }
    .provider-empty {
      padding: 12px;
      text-align: center;
      color: var(--ai-text-dim, #9ca3af);
      font-size: 12px;
      font-style: italic;
    }
  `;

  @property({ type: Boolean }) isConnected = true;
  @property({ type: String }) projectPath = '';

  @state() private provider = '';
  @state() private enabledProviders: ProviderInfo[] = [];
  @state() private showProviderDropdown = false;
  @state() private providerSearch = '';
  @state() private hasContent = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._loadConfig();
    this._loadEnabledProviders();
    document.addEventListener('click', this._handleOutsideClick);
    document.addEventListener('settings-closed', this._handleSettingsClosed);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('click', this._handleOutsideClick);
    document.removeEventListener('settings-closed', this._handleSettingsClosed);
  }

  private _handleOutsideClick = (e: MouseEvent) => {
    const path = e.composedPath();
    const dropdown = this.shadowRoot?.querySelector('.provider-dropdown');
    if (dropdown && !path.includes(dropdown)) {
      this.showProviderDropdown = false;
    }
  };

  private _handleSettingsClosed = async () => {
    await this._loadConfig();
    await this._loadEnabledProviders();
  };

  private async _loadConfig() {
    try {
      const c = await invoke<{ provider: string }>('ai_get_settings');
      this.provider = c.provider;
    } catch (e) {
      console.debug('Failed to load AI config:', e);
    }
  }

  private async _loadEnabledProviders() {
    try {
      const [settings, allProviders] = await Promise.all([
        invoke<{
          enabled_providers: Record<string, boolean>;
          provider: string;
        }>('ai_get_settings'),
        invoke<ProviderInfo[]>('ai_list_providers'),
      ]);
      const enabledIds = Object.entries(settings.enabled_providers)
        .filter(([_, enabled]) => enabled)
        .map(([id]) => id);
      if (settings.provider && !enabledIds.includes(settings.provider)) {
        enabledIds.push(settings.provider);
      }
      this.enabledProviders = allProviders.filter(p => enabledIds.includes(p.id));
    } catch (e) {
      console.error('Failed to load enabled providers:', e);
      this.enabledProviders = [];
    }
  }

  private toggleProviderDropdown(): void {
    this.showProviderDropdown = !this.showProviderDropdown;
    if (!this.showProviderDropdown) this.providerSearch = '';
  }

  private async selectProvider(providerId: string) {
    if (providerId === this.provider) {
      this.showProviderDropdown = false;
      return;
    }
    this.provider = providerId;
    this.showProviderDropdown = false;
    try {
      const current = await invoke<{ provider: string; model: string; model_name: string }>('ai_get_config');
      await invoke('ai_set_config', { config: { ...current, provider: providerId, model: '', model_name: '' } });
    } catch (e) {
      console.error('Failed to save provider:', e);
    }
    dispatchAIEvent(this, 'ai:select-provider', { provider: providerId });
  }

  private onClear() {
    this.dispatchEvent(new CustomEvent('ai-clear', { bubbles: true, composed: true }));
  }

  updateHasContent(hasMessages: boolean) {
    this.hasContent = hasMessages;
  }

  private get currentProviderName(): string {
    const p = this.enabledProviders.find(p => p.id === this.provider);
    return p?.name || this.provider || 'Select provider';
  }

  render() {
    const filteredProviders = this.providerSearch
      ? this.enabledProviders.filter(p => p.name.toLowerCase().includes(this.providerSearch.toLowerCase()) || p.id.toLowerCase().includes(this.providerSearch.toLowerCase()))
      : this.enabledProviders;

    return html`
      <div class="hdr">
        <div class="hdr-left">
          <iconify-icon class="hdr-avatar" icon="mdi:robot-outline" width="18"></iconify-icon>
          <span class="hdr-label">AI</span>
          <span class="hdr-dot ${this.isConnected ? 'on' : 'off'}"></span>

          <!-- Provider Dropdown -->
          <div class="provider-dropdown ${this.showProviderDropdown ? 'open' : ''}">
            <button class="provider-trigger" @click=${this.toggleProviderDropdown}>
              <span class="provider-trigger-text">${this.currentProviderName}</span>
              <span class="provider-chevron"><iconify-icon icon="mdi:chevron-down" width="14"></iconify-icon></span>
            </button>
            ${this.showProviderDropdown ? html`
              <div class="provider-list">
                ${this.enabledProviders.length > 3 ? html`
                  <div class="provider-search-wrap">
                    <iconify-icon icon="mdi:magnify" width="13" class="provider-search-icon"></iconify-icon>
                    <input
                      type="text"
                      class="provider-search-input"
                      placeholder="Search providers..."
                      .value=${this.providerSearch}
                      @input=${(e: Event) => { this.providerSearch = (e.target as HTMLInputElement).value; }}
                      @click=${(e: Event) => e.stopPropagation()}
                    />
                  </div>
                ` : ''}
                ${filteredProviders.length === 0 ? html`
                  <div class="provider-empty">No providers enabled</div>
                ` : filteredProviders.map(p => html`
                  <div class="provider-item ${p.id === this.provider ? 'selected' : ''}"
                       @click=${() => this.selectProvider(p.id)}>
                    <span class="provider-item-icon">${p.id === this.provider
                      ? html`<iconify-icon icon="mdi:check" width="14"></iconify-icon>`
                      : html`<iconify-icon icon="mdi:circle-outline" width="14"></iconify-icon>`}</span>
                    <span>${p.name}</span>
                  </div>
                `)}
              </div>
            ` : ''}
          </div>
        </div>

        <div class="hdr-actions">
          ${this.hasContent ? html`
            <button class="hdr-btn-icon-only" @click=${this.onClear} title="Clear conversation and reset context">
              <iconify-icon icon="mdi:delete-outline" width="14"></iconify-icon>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openstorm-ai-header': AIHeader;
  }
}
