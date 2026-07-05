import { html, css, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { dispatchAIEvent } from '../core/ai-events.js';

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
    .hdr-provider { font-size: 12px; color: var(--ai-text-muted, #6b7280); font-weight: 500; }
    .hdr-actions { display: flex; align-items: center; gap: 8px; }
    .hdr-btn-icon { font-size: 12px; }
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
    .model-dropdown { position: relative; }
    .model-trigger {
      display: flex;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: none;
      color: var(--ai-text, #1f2937);
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 11px;
      padding: 5px 10px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
      outline: none;
      max-width: 200px;
    }
    .model-trigger:hover { background: var(--ai-tool-background, #f9fafb); }
    .model-trigger:focus { background: var(--ai-tool-background, #f9fafb); }
    .model-trigger-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .model-trigger-chevron {
      font-size: 8px;
      color: var(--ai-text-dim, #9ca3af);
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }
    .model-dropdown.open .model-trigger-chevron { transform: rotate(180deg); }
    .model-dropdown.open .model-trigger { background: var(--ai-tool-background, #f9fafb); }
    .model-list {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      min-width: 220px;
      max-height: 300px;
      overflow-y: auto;
      background: var(--ai-panel-background, #ffffff);
      border: 1px solid var(--ai-panel-border, #e5e7eb);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      padding: 4px;
    }
    .model-search-wrap {
      position: relative;
      padding: 4px;
      margin-bottom: 2px;
    }
    .model-search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--ai-text-dim, #9ca3af);
      pointer-events: none;
    }
    .model-search-input {
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
    .model-search-input:focus {
      border-color: var(--ai-primary, #3574f0);
    }
    .model-search-input::placeholder {
      color: var(--ai-text-dim, #9ca3af);
    }
    .model-list-item {
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
    .model-list-item:hover {
      background: var(--ai-tool-background, #f9fafb);
      color: var(--ai-text, #1f2937);
    }
    .model-list-item.selected {
      background: color-mix(in srgb, var(--ai-primary, #3574f0) 10%, transparent);
      color: var(--ai-primary, #3574f0);
    }
    .model-list-item-icon {
      font-size: 10px;
      color: var(--ai-text-dim, #9ca3af);
      flex-shrink: 0;
    }
    .model-list-item.selected .model-list-item-icon {
      color: var(--ai-primary, #3574f0);
    }
    .model-list-empty {
      padding: 12px;
      text-align: center;
      color: var(--ai-text-dim, #9ca3af);
      font-size: 12px;
      font-style: italic;
    }
  `;

  @property({ type: String }) model = '';
  @property({ type: Boolean }) isConnected = true;
  @property({ type: String }) projectPath = '';

  @state() private provider = '';
  @state() private modelName = '';
  @state() private models: Array<{ id: string; name: string }> = [];
  @state() private showModelDropdown = false;
  @state() private modelSearch = '';
  @state() private hasContent = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._loadConfig();
    this._loadModels();
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
    const dropdown = this.shadowRoot?.querySelector('.model-dropdown');
    if (dropdown && !path.includes(dropdown)) {
      this.showModelDropdown = false;
    }
  };

  private _handleSettingsClosed = async () => {
    await this._loadConfig();
    await this._loadModels();
  };

  private async _loadConfig() {
    try {
      const c = await invoke<{ provider: string; model: string; model_name: string; api_key: string; provider_keys: Record<string, string> }>('ai_get_config');
      this.provider = c.provider;
      this.modelName = c.model_name || c.model;
    } catch (e) {
      console.debug('Failed to load AI config:', e);
    }
  }

  private async _loadModels() {
    try {
      const config = await invoke<{ provider: string; model: string; model_name: string; api_key: string; provider_keys: Record<string, string> }>('ai_get_config');
      const providerKeys = config.provider_keys || {};
      const apiKey = providerKeys[config.provider] || config.api_key || '';
      const loadedModels = await invoke<Array<{ id: string; name: string }>>('ai_list_models', {
        providerId: config.provider,
        apiKey: apiKey || null,
        baseUrl: null,
      });
      this.models = loadedModels;
      if (this.model && !this.models.find(m => m.id === this.model)) {
        this.model = this.models[0]?.id || '';
      }
      if (this.model && !this.modelName) {
        const found = this.models.find(m => m.id === this.model);
        this.modelName = found ? found.name : this.model;
      }
    } catch (e) {
      console.error('Failed to load models:', e);
      this.models = [];
    }
  }

  private toggleModelDropdown(): void {
    this.showModelDropdown = !this.showModelDropdown;
    if (!this.showModelDropdown) this.modelSearch = '';
  }

  private async selectModel(modelId: string) {
    const model = this.models.find(m => m.id === modelId);
    this.model = modelId;
    this.modelName = model ? model.name : modelId;
    this.showModelDropdown = false;
    dispatchAIEvent(this, 'ai:select-model', { model: modelId });
    try {
      const current = await invoke<{ provider: string; api_key: string; base_url: string; model: string; model_name: string }>('ai_get_config');
      await invoke('ai_set_config', { config: { ...current, model: modelId, model_name: model ? model.name : modelId } });
    } catch (e) {
      console.error('Failed to save model:', e);
    }
  }

  private onClear() {
    this.dispatchEvent(new CustomEvent('ai-clear', { bubbles: true, composed: true }));
  }

  updateHasContent(hasMessages: boolean) {
    this.hasContent = hasMessages;
  }

  render() {
    const filteredModels = this.modelSearch
      ? this.models.filter(m => m.name.toLowerCase().includes(this.modelSearch.toLowerCase()) || m.id.toLowerCase().includes(this.modelSearch.toLowerCase()))
      : this.models;

    return html`
      <div class="hdr">
        <div class="hdr-left">
          <iconify-icon class="hdr-avatar" icon="mdi:robot-outline" width="18"></iconify-icon>
          <span class="hdr-label">AI</span>
          <span class="hdr-dot ${this.isConnected ? 'on' : 'off'}"></span>
          <span class="hdr-provider">${this.provider}</span>
          <div class="model-dropdown ${this.showModelDropdown ? 'open' : ''}">
            <button class="model-trigger" @click=${this.toggleModelDropdown}>
              <span class="model-trigger-text">${this.modelName || 'Select model'}</span>
              <span class="model-trigger-chevron"><iconify-icon icon="mdi:chevron-down" width="14"></iconify-icon></span>
            </button>
            ${this.showModelDropdown ? html`
              <div class="model-list">
                ${this.models.length > 2 ? html`
                  <div class="model-search-wrap">
                    <iconify-icon icon="mdi:magnify" width="13" class="model-search-icon"></iconify-icon>
                    <input
                      type="text"
                      class="model-search-input"
                      placeholder="Search models..."
                      .value=${this.modelSearch}
                      @input=${(e: Event) => { this.modelSearch = (e.target as HTMLInputElement).value; }}
                      @click=${(e: Event) => e.stopPropagation()}
                    />
                  </div>
                ` : ''}
                ${filteredModels.length === 0 ? html`
                  <div class="model-list-empty">No models found</div>
                ` : filteredModels.map(m => html`
                  <div class="model-list-item ${m.id === this.model ? 'selected' : ''}"
                       @click=${() => this.selectModel(m.id)}>
                    <span class="model-list-item-icon">${m.id === this.model
                      ? html`<iconify-icon icon="mdi:check" width="14"></iconify-icon>`
                      : html`<iconify-icon icon="mdi:circle-outline" width="14"></iconify-icon>`}</span>
                    <span>${m.name}</span>
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
