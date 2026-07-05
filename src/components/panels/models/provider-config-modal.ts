import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import type { ProviderInfo } from '../../lib/types/ai-types.js';
import type { AiProviderConfig } from '../../lib/types/ai-types.js';
import { CATEGORY_COLORS } from './models-panel.js';

interface ModelState {
  id: string;
  name: string;
  parameter_size?: string;
}

const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  ollama: 'Run open-source models locally on your machine.',
  lmstudio: 'Local model serving with GGUF support.',
  openai: 'GPT-4, GPT-3.5, and DALL·E models.',
  anthropic: 'Claude models with long context.',
  google: 'Gemini and PaLM models.',
  groq: 'Ultra-fast inference on open models.',
  nvidia: 'GPU-accelerated model endpoints.',
  deepseek: 'Cost-effective reasoning models.',
  mistral: 'European AI with multilingual focus.',
  cohere: 'Enterprise NLP and generation.',
  together: 'Open-source model API marketplace.',
  fireworks: 'Fast inference on open models.',
  openrouter: 'Unified API for 100+ models.',
  github_copilot: 'AI pair programming assistant.',
  custom: 'Custom OpenAI-compatible endpoint.',
};

const PROVIDER_ICONS: Record<string, string> = {
  ollama: 'mdi:server',
  lmstudio: 'mdi:monitor-shimmer',
  openai: 'mdi:brain',
  anthropic: 'mdi:brain',
  google: 'mdi:google',
  groq: 'mdi:lightning-bolt',
  nvidia: 'mdi:chip',
  deepseek: 'mdi:eye',
  mistral: 'mdi:weather-windy',
  cohere: 'mdi:shape',
  together: 'mdi:orbit',
  fireworks: 'mdi:fire',
  openrouter: 'mdi:router-network',
  github_copilot: 'mdi:robot',
  custom: 'mdi:cog',
};

@customElement('provider-config-modal')
export class ProviderConfigModal extends LitElement {
  static styles = css`
    :host { display: block; }

    .backdrop {
      position: fixed; inset: 0; z-index: 9998;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
    }

    .modal-wrapper {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      padding: 24px; pointer-events: none;
    }

    .modal {
      pointer-events: auto;
      width: 100%; max-width: 480px; max-height: 85vh;
      display: flex; flex-direction: column;
      border-radius: 12px; overflow: hidden;
      background-color: var(--app-bg);
      border: 1px solid var(--app-border);
      box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.6);
    }

    /* ── Title Bar ── */
    .title-bar {
      display: flex; align-items: center; gap: 12px;
      padding: 0 16px; height: 44px; flex-shrink: 0;
      border-bottom: 1px solid var(--app-border);
      background-color: var(--activitybar-background);
    }

    .traffic-lights { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

    .traffic-light {
      width: 12px; height: 12px; border-radius: 50%;
      border: none; cursor: pointer; padding: 0;
    }
    .traffic-light:hover { filter: brightness(0.85); }

    .title-text {
      flex: 1; text-align: center;
      font-size: 13px; font-weight: 600; color: var(--app-foreground);
    }

    .title-spacer { width: 52px; flex-shrink: 0; }

    /* ── Content ── */
    .content {
      flex: 1; overflow-y: auto;
      padding: 0;
    }

    /* ── Provider Header ── */
    .provider-header {
      display: flex; align-items: center; gap: 14px;
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--app-border);
    }

    .provider-icon-wrap {
      width: 44px; height: 44px;
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; flex-shrink: 0;
    }

    .provider-meta { flex: 1; min-width: 0; }

    .provider-name {
      font-size: 16px; font-weight: 700;
      color: var(--app-foreground); line-height: 1.2;
    }

    .provider-desc {
      font-size: 12px; color: var(--app-disabled-foreground);
      margin-top: 2px; line-height: 1.3;
    }

    .provider-badge {
      padding: 2px 8px; border-radius: 4px;
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.5px; flex-shrink: 0;
    }

    /* ── Status Card ── */
    .status-card {
      margin: 16px 24px; padding: 14px 16px;
      border-radius: 8px; border: 1px solid var(--app-border);
      display: flex; align-items: center; gap: 12px;
    }

    .status-indicator {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
    }

    .status-info { flex: 1; }

    .status-label {
      font-size: 13px; font-weight: 500; color: var(--app-foreground);
    }

    .status-detail {
      font-size: 11px; color: var(--app-disabled-foreground); margin-top: 1px;
    }

    .btn-test {
      padding: 6px 12px; font-size: 11px; font-weight: 500;
      border-radius: 6px; border: 1px solid var(--app-border);
      background: var(--app-hover-background); color: var(--app-foreground);
      cursor: pointer; flex-shrink: 0; display: flex; align-items: center; gap: 5px;
      transition: background-color 0.15s;
    }
    .btn-test:hover { background: var(--app-border); }
    .btn-test:disabled { opacity: 0.5; cursor: not-allowed; }

    /* ── Sections ── */
    .section { padding: 16px 24px; }
    .section + .section { border-top: 1px solid var(--app-border); }

    .section-label {
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.5px; color: var(--app-disabled-foreground);
      margin-bottom: 10px;
    }

    .form-group { margin-bottom: 12px; }
    .form-group:last-child { margin-bottom: 0; }

    .form-label {
      display: block; font-size: 12px; font-weight: 500;
      color: var(--app-disabled-foreground); margin-bottom: 5px;
    }

    .input-wrapper {
      position: relative; display: flex; align-items: center;
    }

    .input-field {
      width: 100%; padding: 8px 12px; font-size: 13px;
      border-radius: 6px; outline: none;
      background: var(--app-input-background, var(--app-bg));
      border: 1px solid var(--app-border); color: var(--app-foreground);
      font-family: monospace; box-sizing: border-box;
    }
    .input-field:focus { border-color: var(--app-button-background, #6366f1); }

    .input-field::placeholder { color: var(--app-disabled-foreground); opacity: 0.5; }

    .btn-icon {
      position: absolute; right: 8px;
      width: 28px; height: 28px; border-radius: 4px;
      border: none; background: transparent; color: var(--app-disabled-foreground);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 14px; transition: color 0.15s;
    }
    .btn-icon:hover { color: var(--app-foreground); }

    .input-hint {
      font-size: 11px; color: var(--app-disabled-foreground);
      margin-top: 4px; opacity: 0.7;
    }

    .select-field {
      width: 100%; padding: 8px 32px 8px 12px; font-size: 13px;
      border-radius: 6px; outline: none;
      background: var(--app-input-background, var(--app-bg));
      border: 1px solid var(--app-border); color: var(--app-foreground);
      cursor: pointer; appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%236b7280' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      transition: border-color 0.15s;
    }
    .select-field:hover { border-color: var(--app-button-background, #6366f1); }
    .select-field:focus { border-color: var(--app-button-background, #6366f1); }

    .model-count {
      font-size: 11px; color: var(--app-disabled-foreground);
      margin-top: 4px;
    }

    .input-row { display: flex; gap: 8px; }
    .input-row .input-field { flex: 1; }

    /* ── Footer ── */
    .footer {
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 24px; border-top: 1px solid var(--app-border);
      background: var(--activitybar-background);
    }

    .footer-link {
      font-size: 11px; color: var(--app-disabled-foreground);
      text-decoration: none; cursor: pointer; display: flex; align-items: center; gap: 4px;
      transition: color 0.15s;
    }
    .footer-link:hover { color: var(--app-foreground); }

    .footer-actions { display: flex; gap: 8px; }

    .btn-secondary {
      padding: 7px 14px; font-size: 12px; font-weight: 500;
      border-radius: 6px; border: 1px solid var(--app-border);
      background: transparent; color: var(--app-foreground);
      cursor: pointer; transition: background-color 0.15s;
    }
    .btn-secondary:hover { background: var(--app-hover-background); }

    .btn-primary {
      padding: 7px 14px; font-size: 12px; font-weight: 500;
      border-radius: 6px; border: none;
      background: var(--app-button-background, #6366f1); color: white;
      cursor: pointer; transition: opacity 0.15s;
    }
    .btn-primary:hover { opacity: 0.9; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spinner { animation: spin 1s linear infinite; display: inline-block; }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .pulse { animation: pulse-dot 1.5s infinite; }
  `;

  @property({ type: Object }) provider?: ProviderInfo;
  @property({ type: Object }) config?: AiProviderConfig;

  @state() private apiKey = '';
  @state() private baseUrl = '';
  @state() private selectedModel = '';
  @state() private models: ModelState[] = [];
  @state() private loadingModels = false;
  @state() private testing = false;
  @state() private testResult: 'success' | 'error' | null = null;
  @state() private showKey = false;

  connectedCallback() {
    super.connectedCallback();
    if (this.config) {
      this.apiKey = this.config.api_key || '';
      this.baseUrl = this.config.base_url || '';
      this.selectedModel = this.config.model || '';
    }
    if (this.provider) {
      this.loadModels();
    }
    document.addEventListener('keydown', this.handleKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  private async loadModels() {
    if (!this.provider) return;
    this.loadingModels = true;
    try {
      this.models = await invoke<ModelState[]>('ai_list_models', {
        providerId: this.provider.id,
        apiKey: this.apiKey || undefined,
        baseUrl: this.baseUrl || undefined,
      });
      if (!this.selectedModel && this.models.length > 0) {
        this.selectedModel = this.models[0].id;
      }
      this.updateComplete.then(() => {
        const select = this.shadowRoot?.querySelector('select') as HTMLSelectElement;
        if (select && this.selectedModel) {
          select.value = this.selectedModel;
        }
      });
    } catch (e) {
      console.error('Failed to load models:', e);
      this.models = [];
    } finally {
      this.loadingModels = false;
    }
  }

  private async testConnection() {
    if (!this.provider) return;
    this.testing = true;
    this.testResult = null;
    try {
      await invoke('ai_check_connection', {
        providerId: this.provider.id,
        apiKey: this.apiKey || undefined,
        baseUrl: this.baseUrl || undefined,
      });
      this.testResult = 'success';
      await this.loadModels();
    } catch {
      this.testResult = 'error';
    } finally {
      this.testing = false;
    }
  }

  private close() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private save() {
    this.dispatchEvent(new CustomEvent('save', {
      detail: {
        providerId: this.provider?.id,
        config: {
          api_key: this.apiKey,
          base_url: this.baseUrl,
          model: this.selectedModel,
          enabled: true,
        },
      },
      bubbles: true, composed: true,
    }));
    this.close();
  }

  private get category(): string {
    if (!this.provider) return 'cloud';
    const map: Record<string, string> = {
      ollama: 'local', lmstudio: 'local',
      nvidia: 'free', groq: 'free',
    };
    return map[this.provider.id] || 'cloud';
  }

  private get categoryColor(): string {
    return (CATEGORY_COLORS as any)[this.category] || '#a855f7';
  }

  private get statusColor(): string {
    if (this.testResult === 'success') return 'var(--status-success, #22c55e)';
    if (this.testResult === 'error') return 'var(--status-error, #ef4444)';
    if (this.testing) return 'var(--status-warning, #eab308)';
    return 'var(--app-disabled-foreground, #6b7280)';
  }

  private get statusLabel(): string {
    if (this.testing) return 'Testing connection...';
    if (this.testResult === 'success') return 'Connected';
    if (this.testResult === 'error') return 'Connection failed';
    if (this.config?.api_key || !this.provider?.requires_api_key) return 'Ready to configure';
    return 'Not configured';
  }

  private get statusDetail(): string {
    if (this.testing) return 'Please wait...';
    if (this.testResult === 'success') return 'Models loaded successfully';
    if (this.testResult === 'error') return 'Check your API key and try again';
    return this.provider?.requires_api_key ? 'Enter your API key to continue' : 'No API key required';
  }

  private get hasRequiredFields(): boolean {
    if (this.provider?.requires_api_key && !this.apiKey) return false;
    return true;
  }

  private get defaultBaseUrl(): string {
    const defaults: Record<string, string> = {
      ollama: 'http://localhost:11434',
      lmstudio: 'http://localhost:1234/v1',
      custom: 'https://your-endpoint.com/v1',
    };
    return defaults[this.provider?.id || ''] || '';
  }

  render() {
    if (!this.provider) return nothing;
    const icon = PROVIDER_ICONS[this.provider.id] || 'mdi:cloud';
    const desc = PROVIDER_DESCRIPTIONS[this.provider.id] || 'AI model provider';

    return html`
      <div class="backdrop" @click=${this.close}></div>
      <div class="modal-wrapper">
        <div class="modal">

          <!-- Title Bar -->
          <div class="title-bar">
            <div class="traffic-lights">
              <button class="traffic-light" style="background-color: #ff5f57;" @click=${this.close}></button>
              <button class="traffic-light" style="background-color: #febc2e;"></button>
              <button class="traffic-light" style="background-color: #28c840;"></button>
            </div>
            <div class="title-text">Configure ${this.provider.name}</div>
            <div class="title-spacer"></div>
          </div>

          <!-- Content -->
          <div class="content">

            <!-- Provider Header -->
            <div class="provider-header">
              <div class="provider-icon-wrap" style="background: ${this.categoryColor}20; color: ${this.categoryColor};">
                <span class="iconify" data-icon="${icon}"></span>
              </div>
              <div class="provider-meta">
                <div class="provider-name">${this.provider.name}</div>
                <div class="provider-desc">${desc}</div>
              </div>
              <span class="provider-badge" style="background: ${this.categoryColor}18; color: ${this.categoryColor};">
                ${this.category}
              </span>
            </div>

            <!-- Status Card (only when test performed or fields ready) -->
            ${(this.testResult || this.testing || this.hasRequiredFields) ? html`
              <div class="status-card">
                <span class="status-indicator ${this.testing ? 'pulse' : ''}" style="background-color: ${this.statusColor};"></span>
                <div class="status-info">
                  <div class="status-label">${this.statusLabel}</div>
                  <div class="status-detail">${this.statusDetail}</div>
                </div>
              </div>
            ` : ''}

            <!-- API Key Section -->
            ${this.provider.requires_api_key ? html`
              <div class="section">
                <div class="section-label" style="display: flex; align-items: center; gap: 5px;">
                  <span class="iconify" data-icon="mdi:key" style="font-size: 13px;"></span>
                  Credentials
                </div>
                <div class="form-group">
                  <label class="form-label">API Key</label>
                  <div class="input-wrapper">
                    <input
                      class="input-field"
                      type=${this.showKey ? 'text' : 'password'}
                      placeholder="sk-..."
                      .value=${this.apiKey}
                      @input=${(e: Event) => { this.apiKey = (e.target as HTMLInputElement).value; }}
                    />
                    <button class="btn-icon" @click=${() => this.showKey = !this.showKey}
                      title=${this.showKey ? 'Hide' : 'Show'}>
                      <span class="iconify" data-icon="${this.showKey ? 'mdi:eye-off' : 'mdi:eye'}"></span>
                    </button>
                  </div>
                  <div class="input-hint">Your key is stored locally and never sent to our servers.</div>
                </div>
              </div>
            ` : ''}

            <!-- Connection Settings -->
            <div class="section">
              <div class="section-label" style="display: flex; align-items: center; gap: 5px;">
                <span class="iconify" data-icon="mdi:link" style="font-size: 13px;"></span>
                Connection
              </div>
              <div class="form-group">
                <label class="form-label">Base URL</label>
                <input
                  class="input-field"
                  type="text"
                  placeholder=${this.defaultBaseUrl || 'https://...'}
                  .value=${this.baseUrl}
                  @input=${(e: Event) => { this.baseUrl = (e.target as HTMLInputElement).value; }}
                />
                ${this.defaultBaseUrl ? html`
                  <div class="input-hint">Default: ${this.defaultBaseUrl}</div>
                ` : ''}
              </div>
            </div>

            <!-- Model Section -->
            <div class="section">
              <div class="section-label" style="display: flex; align-items: center; gap: 5px;">
                <span class="iconify" data-icon="mdi:brain" style="font-size: 13px;"></span>
                Model
              </div>
              <div class="form-group">
                <label class="form-label">Select Model</label>
                ${this.loadingModels
                  ? html`<div style="font-size: 12px; color: var(--app-disabled-foreground); padding: 10px 0;">Loading models...</div>`
                  : html`
                    <select
                      class="select-field"
                      .value=${this.selectedModel}
                      @change=${(e: Event) => { this.selectedModel = (e.target as HTMLSelectElement).value; }}>
                      <option value="">Choose a model...</option>
                      ${this.models.map(m => html`
                        <option value=${m.id}>${m.name}${m.parameter_size ? ` (${m.parameter_size})` : ''}</option>
                      `)}
                    </select>
                  `}
                ${this.models.length > 0 ? html`
                  <div class="model-count">${this.models.length} model${this.models.length !== 1 ? 's' : ''} available</div>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="footer">
            <a class="footer-link" href="https://docs.openstorm.dev/providers/${this.provider.id}" target="_blank" rel="noopener">
              <span class="iconify" data-icon="mdi:open-in-new" style="font-size: 12px;"></span>
              Docs
            </a>
            <div class="footer-actions">
              <button class="btn-test" ?disabled=${this.testing || !this.hasRequiredFields} @click=${this.testConnection}>
                ${this.testing
                  ? html`<span class="spinner">↻</span> Testing`
                  : html`<span class="iconify" data-icon="mdi:connection" style="font-size:13px;"></span> Test`}
              </button>
              <button class="btn-secondary" @click=${this.close}>Cancel</button>
              <button class="btn-primary" @click=${this.save}>Save</button>
            </div>
          </div>

        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'provider-config-modal': ProviderConfigModal;
  }
}
