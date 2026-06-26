import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { TailwindElement, getTailwindStyles } from '../../tailwind-element.js';
import type { ProviderInfo, ModelInfo } from '../../lib/types/ai-types.js';
import { PROVIDER_INFO } from '../../lib/ai/provider-info-data.js';
import '../layout/icon.js';

export interface ProviderCardConfig {
  provider: string;
  api_key: string;
  base_url: string;
  model: string;
}

@customElement('provider-card')
export class ProviderCard extends TailwindElement() {
  static styles = [
    getTailwindStyles(),
    css`
      .provider-header {
        transition: background-color 0.15s ease;
      }
      .provider-header:hover {
        background-color: color-mix(in srgb, var(--ai-primary, var(--app-button-background)) 8%, var(--app-bg));
      }
    `
  ];
  @property({ type: Object }) provider!: ProviderInfo;
  @property({ type: Object }) config!: ProviderCardConfig;
  @property({ type: Boolean }) isExpanded = false;

  @state() private showKey = false;
  @state() private connectionStatus: boolean | null = null;
  @state() private loading = false;
  @state() private models: ModelInfo[] = [];
  @state() private selectedModels: Set<string> = new Set();
  @state() private verifying = false;

  private get maskedKey(): string {
    const key = this.config?.api_key || '';
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return `${key.slice(0, 4)}••••${key.slice(-4)}`;
  }

  private get statusText(): string {
    if (this.loading) return 'Connecting...';
    if (this.provider?.requires_api_key && !this.config?.api_key) return 'API key required';
    if (this.connectionStatus === true) return 'Connected';
    if (this.connectionStatus === false) return 'Connection failed';
    return 'Ready';
  }

  private get statusColor(): string {
    if (this.loading) return 'var(--warning)';
    if (this.provider?.requires_api_key && !this.config?.api_key) return 'var(--app-disabled-foreground)';
    if (this.connectionStatus === true) return 'var(--success)';
    if (this.connectionStatus === false) return 'var(--error)';
    return 'var(--app-disabled-foreground)';
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('provider') && this.provider && this.isExpanded && this.connectionStatus === null) {
      // Only auto-test if API key is available (or not required)
      if (!this.provider.requires_api_key || this.config?.api_key) {
        this.testConnection();
      }
    }
  }

  private async testConnection(): Promise<void> {
    if (this.loading) return;
    // Skip connection check if provider requires API key and none is provided
    if (this.provider?.requires_api_key && !this.config?.api_key) {
      this.connectionStatus = false;
      return;
    }
    this.loading = true;
    this.connectionStatus = null;
    this.models = [];
    try {
      this.connectionStatus = await invoke<boolean>('ai_check_connection', {
        providerId: this.provider.id,
        apiKey: this.config?.api_key || null,
        baseUrl: this.config?.base_url || null,
      });
      if (this.connectionStatus) {
        this.models = await invoke<ModelInfo[]>('ai_list_models', {
          providerId: this.provider.id,
          apiKey: this.config?.api_key || null,
          baseUrl: this.config?.base_url || null,
        });
        const saved = this.config?.model;
        if (saved && this.models.some(m => m.id === saved)) {
          this.selectedModels = new Set([saved]);
        } else if (this.models.length > 0) {
          this.selectedModels = new Set([this.models[0].id]);
          // Notify parent of the auto-selected model
          this.dispatchEvent(new CustomEvent('provider-models-changed', {
            detail: { providerId: this.provider.id, models: [this.models[0].id] },
            bubbles: true,
            composed: true,
          }));
        }
      }
    } catch {
      this.connectionStatus = false;
    } finally {
      this.loading = false;
    }
  }

  private async verifyKey(): Promise<void> {
    this.verifying = true;
    await this.testConnection();
    this.verifying = false;
  }

  private toggleModel(modelId: string): void {
    const next = new Set(this.selectedModels);
    if (next.has(modelId)) {
      next.delete(modelId);
    } else {
      next.add(modelId);
    }
    this.selectedModels = next;
    this.dispatchEvent(new CustomEvent('provider-models-changed', {
      detail: { providerId: this.provider.id, models: Array.from(next) },
      bubbles: true,
      composed: true,
    }));
  }

  private onApiKeyInput(e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    this.dispatchEvent(new CustomEvent('provider-config-changed', {
      detail: { providerId: this.provider.id, field: 'api_key', value: val },
      bubbles: true,
      composed: true,
    }));
    // Force re-render to update status text/color based on new key value
    this.requestUpdate();
  }

  private onBaseUrlInput(e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    this.dispatchEvent(new CustomEvent('provider-config-changed', {
      detail: { providerId: this.provider.id, field: 'base_url', value: val },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (!this.provider) return html``;
    const expanded = this.isExpanded;

    return html`
      <div
        class="rounded-lg overflow-hidden transition-colors"
        style="border: 1px solid var(--app-border);">

        <!-- Header -->
        <button
          class="provider-header w-full flex items-center gap-3 px-4 py-3 text-left"
          style="background-color: color-mix(in srgb, var(--ai-primary, var(--app-button-background)) 5%, var(--app-bg));"
          @click=${() => {
            this.dispatchEvent(new CustomEvent('provider-expanded', {
              detail: { providerId: this.provider.id },
              bubbles: true,
              composed: true,
            }));
            if (!this.isExpanded && this.connectionStatus === null) {
              if (!this.provider.requires_api_key || this.config?.api_key) {
                this.testConnection();
              }
            }
          }}>
          <span
            class="w-2 h-2 rounded-full shrink-0"
            style="background-color: ${this.statusColor}; ${this.loading ? 'animation: pulse 1.5s infinite;' : ''}">
          </span>
          <span class="text-sm font-medium flex-1" style="color: var(--app-foreground);">
            ${this.provider.name}
          </span>
          <span
            class="text-xs shrink-0"
            style="color: var(--app-disabled-foreground);">
            ${this.statusText}
          </span>
          <os-icon
            name=${expanded ? 'chevron-up' : 'chevron-down'}
            size="14"
            color="var(--app-disabled-foreground)">
          </os-icon>
        </button>

        <!-- Expanded Content -->
        ${expanded ? html`
          <div class="px-4 py-4 space-y-4" style="border-top: 1px solid var(--app-border);">

            <!-- API Key -->
            ${this.provider.requires_api_key ? html`
              <div>
                <label class="text-xs font-medium mb-1.5 block" style="color: var(--app-disabled-foreground);">
                  API Key
                </label>
                <div class="flex items-center gap-2">
                  <div class="relative flex-1">
                    <input
                      type=${this.showKey ? 'text' : 'password'}
                      class="w-full px-3 py-1.5 text-sm rounded-md outline-none pr-8 font-mono"
                      style="background: var(--app-input-background, var(--app-bg)); border: 1px solid var(--app-border); color: var(--app-foreground);"
                      placeholder="Enter API key..."
                      .value=${this.config?.api_key || ''}
                      @input=${this.onApiKeyInput}
                    />
                    <button
                      class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors"
                      style="color: var(--app-disabled-foreground);"
                      @click=${() => { this.showKey = !this.showKey; }}>
                      <os-icon name=${this.showKey ? 'eye-off' : 'eye'} size="14"></os-icon>
                    </button>
                  </div>
                  <button
                    class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0 flex items-center gap-1.5"
                    style="
                      background-color: var(--app-hover-background);
                      color: var(--app-foreground);
                      border: 1px solid var(--app-border);
                    "
                    ?disabled=${this.verifying}
                    @click=${() => this.verifyKey()}>
                    ${this.verifying
                      ? html`<os-icon name="loader" size="12" class="animate-spin"></os-icon>`
                      : html`<os-icon name="check" size="12"></os-icon>`
                    }
                    ${this.verifying ? 'Verifying...' : 'Verify'}
                  </button>
                </div>
              </div>
            ` : ''}

            <!-- Base URL (for providers with API key, or local providers with custom URL) -->
            <div>
              <label class="text-xs font-medium mb-1.5 block" style="color: var(--app-disabled-foreground);">
                Base URL
              </label>
              <input
                type="text"
                class="w-full px-3 py-1.5 text-sm rounded-md outline-none font-mono"
                style="background: var(--app-input-background, var(--app-bg)); border: 1px solid var(--app-border); color: var(--app-foreground);"
                .value=${this.config?.base_url || ''}
                @input=${this.onBaseUrlInput}
              />
            </div>

            <!-- Provider Info -->
            ${(() => {
              const info = PROVIDER_INFO[this.provider?.id];
              if (!info) return html``;
              return html`
                <div
                  class="rounded-md px-3 py-2.5 text-xs space-y-1.5"
                  style="background-color: var(--ai-primary, var(--app-button-background)); background-color: color-mix(in srgb, var(--ai-primary, var(--app-button-background)) 8%, transparent); border: 1px solid color-mix(in srgb, var(--ai-primary, var(--app-button-background)) 15%, transparent);">
                  ${info.getApiKeyUrl ? html`
                    <div class="flex items-center gap-1.5">
                      <os-icon name="external-link" size="11" color="var(--ai-primary, var(--app-button-background))"></os-icon>
                      <button
                        class="underline cursor-pointer"
                        style="color: var(--ai-primary, var(--app-button-background)); background: none; border: none; padding: 0; font: inherit;"
                        @click=${() => open(info.getApiKeyUrl)}>
                        Get API Key
                      </button>
                      <span style="color: var(--app-disabled-foreground);">—</span>
                      <span style="color: var(--app-disabled-foreground);">${info.getApiKeyLabel}</span>
                    </div>
                  ` : ''}
                  ${info.freeModels && info.freeModels.length > 0 ? html`
                    <div class="flex items-start gap-1.5">
                      <os-icon name="sparkles" size="11" class="mt-0.5 shrink-0" color="var(--success)"></os-icon>
                      <span style="color: var(--app-foreground);">
                        <strong style="color: var(--success);">Free models:</strong>
                        <span style="color: var(--app-disabled-foreground);">${info.freeModels.length} models available on free tier</span>
                      </span>
                    </div>
                  ` : ''}
                  ${info.tip ? html`
                    <div class="flex items-start gap-1.5">
                      <os-icon name="info" size="11" class="mt-0.5 shrink-0" color="var(--ai-primary, var(--app-button-background))"></os-icon>
                      <span style="color: var(--app-disabled-foreground);">${info.tip}</span>
                    </div>
                  ` : ''}
                </div>
              `;
            })()}

            <!-- Models -->
            ${this.connectionStatus === true && this.models.length > 0 ? html`
              <div>
                <label class="text-xs font-medium mb-2 block" style="color: var(--app-disabled-foreground);">
                  Models
                </label>
                <div
                  class="rounded-md overflow-hidden max-h-48 overflow-y-auto"
                  style="border: 1px solid var(--app-border);">
                  ${this.models.map((m, i) => html`
                    <label
                      class="flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors"
                      style="
                        ${i > 0 ? 'border-top: 1px solid var(--app-border);' : ''}
                        background-color: ${this.selectedModels.has(m.id) ? 'var(--app-selection-background, var(--app-hover-background))' : 'transparent'};
                      "
                      @mouseenter=${(e: MouseEvent) => {
                        if (!this.selectedModels.has(m.id)) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--app-hover-background)';
                        }
                      }}
                      @mouseleave=${(e: MouseEvent) => {
                        if (!this.selectedModels.has(m.id)) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                        }
                      }}>
                      <input
                        type="checkbox"
                        class="w-3.5 h-3.5 rounded shrink-0 cursor-pointer"
                        style="accent-color: var(--app-button-background);"
                        .checked=${this.selectedModels.has(m.id)}
                        @change=${() => this.toggleModel(m.id)}
                      />
                      <div class="flex-1 min-w-0">
                        <div class="text-sm truncate" style="color: var(--app-foreground);">${m.name}</div>
                      </div>
                      <span
                        class="text-xs shrink-0 px-1.5 py-0.5 rounded"
                        style="background-color: var(--app-hover-background); color: var(--app-disabled-foreground);">
                        ${(m.context_window / 1000).toFixed(0)}k
                      </span>
                      ${m.supports_tools ? html`
                        <span
                          class="text-xs shrink-0 px-1.5 py-0.5 rounded"
                          style="background-color: var(--ai-primary, var(--app-button-background)); color: var(--app-button-foreground); opacity: 0.8;">
                          tools
                        </span>
                      ` : ''}
                      ${(m.is_free || PROVIDER_INFO[this.provider?.id]?.freeModels?.includes(m.id)) ? html`
                        <span
                          class="text-xs shrink-0 px-1.5 py-0.5 rounded"
                          style="background-color: var(--success); color: #fff; opacity: 0.8;">
                          free
                        </span>
                      ` : ''}
                    </label>
                  `)}
                </div>
              </div>
            ` : ''}

            <!-- Loading state -->
            ${this.loading ? html`
              <div class="flex items-center gap-2 text-xs" style="color: var(--app-disabled-foreground);">
                <os-icon name="loader" size="12" class="animate-spin"></os-icon>
                Testing connection and fetching models...
              </div>
            ` : ''}

            <!-- Error state -->
            ${this.connectionStatus === false ? html`
              <div class="flex items-center gap-2 text-xs" style="color: var(--error);">
                <os-icon name="x" size="12"></os-icon>
                Could not connect. Check your API key and base URL.
              </div>
            ` : ''}

          </div>
        ` : ''}
      </div>
    `;
  }
}
