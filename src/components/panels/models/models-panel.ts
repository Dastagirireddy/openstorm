import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { TailwindElement } from '../../../tailwind-element.js';
import type { ProviderInfo } from '../../../lib/types/ai-types.js';
import type { AiProviderConfig } from '../../../lib/types/ai-types.js';
import '../../../components/settings/provider-card.js';
import './provider-config-modal.js';

type Category = 'local' | 'free' | 'cloud';

interface CategorizedProviders {
  local: ProviderInfo[];
  free: ProviderInfo[];
  cloud: ProviderInfo[];
}

export const CATEGORY_COLORS: Record<Category, string> = {
  local: '#f59e0b',
  free: '#3b82f6',
  cloud: '#a855f7',
};

const PROVIDER_CATEGORIES: Record<string, Category> = {
  ollama: 'local',
  lmstudio: 'local',
  nvidia: 'free',
  groq: 'free',
  sambanova: 'free',
  openrouter: 'cloud',
  deepseek: 'cloud',
  qwen: 'cloud',
  cerebras: 'cloud',
  mistral: 'cloud',
  openai: 'cloud',
  anthropic: 'cloud',
  google: 'cloud',
  together: 'cloud',
  fireworks: 'cloud',
};

const componentStyles = css`
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }

  @keyframes tw-pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.7; }
  }

  .skeleton-pulse {
    animation: tw-pulse 1.5s infinite;
  }
`;

@customElement('models-panel')
export class ModelsPanel extends TailwindElement(componentStyles) {
  @state() private aiProviders: ProviderInfo[] = [];
  @state() private providerConfigs: Record<string, AiProviderConfig> = {};
  @state() private enabledProviders: Set<string> = new Set();
  @state() private isLoading = false;
  @state() private error: string | null = null;
  @state() private configuringProvider: ProviderInfo | null = null;
  @state() private healthStatus: Map<string, 'online' | 'offline' | 'checking'> = new Map();

  private unlisteners: (() => void)[] = [];
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 30000;

  async connectedCallback() {
    super.connectedCallback();
    await this.loadProviders();
    this.setupEventListeners();
    this.startHealthChecks();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unlisteners.forEach(unlisten => unlisten());
    this.stopHealthChecks();
  }

  private setupEventListeners() {
    const setup = async () => {
      this.unlisteners.push(
        await listen<{ providerId: string; config: AiProviderConfig }>('ai-provider-config-changed', (event) => {
          this.providerConfigs[event.payload.providerId] = event.payload.config;
          this.requestUpdate();
        }),
        await listen<{ providerId: string; models: any[] }>('ai-provider-models-changed', () => {
          this.requestUpdate();
        }),
        await listen('ai-providers-changed', async () => {
          await this.loadProviders();
        }),
        await listen('ai-settings-changed', async () => {
          await this.loadProviders();
        }),
      );
    };
    setup();
  }

  private startHealthChecks() {
    this.checkAllProvidersHealth();
    this.healthCheckInterval = setInterval(() => {
      this.checkAllProvidersHealth();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private stopHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private async checkAllProvidersHealth() {
    const enabledIds = Array.from(this.enabledProviders);
    await Promise.allSettled(
      enabledIds.map(id => this.checkProviderHealth(id))
    );
  }

  private async checkProviderHealth(providerId: string) {
    const config = this.providerConfigs[providerId];
    if (!config) return;

    this.healthStatus.set(providerId, 'checking');
    this.requestUpdate();

    try {
      await invoke('ai_check_connection', {
        providerId,
        apiKey: config.api_key || undefined,
        baseUrl: config.base_url || undefined,
      });
      this.healthStatus.set(providerId, 'online');
    } catch (e) {
      console.warn(`[Models Panel] Health check failed for ${providerId}:`, e);
      this.healthStatus.set(providerId, 'offline');
    }
    this.requestUpdate();
  }

  private async loadProviders() {
    this.isLoading = true;
    this.error = null;
    try {
      const [providers, config] = await Promise.all([
        invoke<ProviderInfo[]>('ai_list_providers'),
        invoke<{
          provider: string;
          api_key: string;
          base_url: string;
          model: string;
          provider_keys: Record<string, string>;
          provider_base_urls: Record<string, string>;
          provider_models: Record<string, string>;
          enabled_providers: Record<string, boolean>;
        }>('ai_get_settings'),
      ]);
      this.aiProviders = providers;

      const providerConfigs: Record<string, AiProviderConfig> = {};
      for (const p of providers) {
        const isEnabled = config.enabled_providers[p.id] || (p.id === config.provider);
        providerConfigs[p.id] = {
          enabled: isEnabled,
          api_key: config.provider_keys[p.id] || (p.id === config.provider ? config.api_key : ''),
          base_url: config.provider_base_urls[p.id] || (p.id === config.provider ? config.base_url : ''),
          model: config.provider_models[p.id] || (p.id === config.provider ? config.model : ''),
        };
      }
      this.providerConfigs = providerConfigs;

      this.enabledProviders = new Set(
        Object.entries(this.providerConfigs)
          .filter(([_, cfg]) => cfg.enabled)
          .map(([id]) => id)
      );

      this.checkAllProvidersHealth();
    } catch (e: any) {
      console.error('[Models Panel] Failed to load:', e);
      this.error = e?.message || 'Failed to load providers';
      this.aiProviders = [];
    } finally {
      this.isLoading = false;
    }
  }

  private categorizeProviders(): CategorizedProviders {
    const categorized: CategorizedProviders = { local: [], free: [], cloud: [] };
    const seen = new Set<string>();

    for (const provider of this.aiProviders) {
      if (seen.has(provider.id)) continue;
      seen.add(provider.id);

      const category = PROVIDER_CATEGORIES[provider.id] || 'cloud';
      categorized[category].push(provider);
    }

    return categorized;
  }

  private getProviderStatus(providerId: string): 'connected' | 'connecting' | 'error' | 'idle' {
    const config = this.providerConfigs[providerId];
    if (!config) return 'idle';
    if (!config.enabled) return 'idle';

    const health = this.healthStatus.get(providerId);
    if (health === 'checking') return 'connecting';
    if (health === 'online') return 'connected';
    if (health === 'offline') return 'error';

    const isLocal = PROVIDER_CATEGORIES[providerId] === 'local';
    if (isLocal) return 'connecting';
    if (config.api_key) return 'connecting';
    return 'idle';
  }

  private handleOpenConfig(event: CustomEvent) {
    this.configuringProvider = event.detail.provider;
  }

  private handleToggleProvider(event: CustomEvent) {
    const { providerId, enabled } = event.detail;
    const config = this.providerConfigs[providerId] || { enabled: false, api_key: '', base_url: '', model: '' };
    config.enabled = enabled;
    this.providerConfigs[providerId] = config;

    if (enabled) {
      this.enabledProviders.add(providerId);
      this.checkProviderHealth(providerId);
    } else {
      this.enabledProviders.delete(providerId);
      this.healthStatus.delete(providerId);
    }
    this.requestUpdate();

    invoke('ai_update_provider', {
      providerId,
      enabled,
      apiKey: config.api_key || undefined,
      baseUrl: config.base_url || undefined,
      model: config.model || undefined,
    }).catch(() => {});
  }

  private async handleSaveProvider(event: CustomEvent) {
    const { providerId, config } = event.detail;
    this.providerConfigs = { ...this.providerConfigs, [providerId]: config };

    if (config.enabled) {
      this.enabledProviders.add(providerId);
    } else {
      this.enabledProviders.delete(providerId);
      this.healthStatus.delete(providerId);
    }

    this.configuringProvider = null;
    this.requestUpdate();

    try {
      await invoke('ai_update_provider', {
        providerId,
        enabled: config.enabled,
        apiKey: config.api_key || undefined,
        baseUrl: config.base_url || undefined,
        model: config.model || undefined,
      });
      if (config.enabled) {
        this.checkProviderHealth(providerId);
      }
    } catch (e) {
      console.error('Failed to save provider config:', e);
    }
  }

  private renderLoading() {
    return html`
      <div class="flex flex-col gap-3 p-4">
        ${Array.from({ length: 5 }, () => html`
          <div class="flex items-center gap-2.5 px-3 py-2.5 rounded-md">
            <div class="w-2 h-2 rounded-full bg-[var(--app-border)] skeleton-pulse"></div>
            <div class="flex-1 h-3 rounded bg-[var(--app-border)] skeleton-pulse"></div>
            <div class="w-15 h-3 rounded bg-[var(--app-border)] skeleton-pulse"></div>
            <div class="w-9 h-5 rounded-full bg-[var(--app-border)] skeleton-pulse"></div>
          </div>
        `)}
      </div>
    `;
  }

  private renderError() {
    return html`
      <div class="flex flex-col items-center p-8 text-center">
        <div class="w-12 h-12 mb-4 flex items-center justify-center rounded-full bg-red-500/10">
          <iconify-icon icon="codicon:error" width="24" style="color: var(--status-error, #ef4444);"></iconify-icon>
        </div>
        <p class="text-xs font-medium mb-1" style="color: var(--app-foreground);">Could not load providers</p>
        <p class="text-[11px] mb-4 max-w-[200px]" style="color: var(--app-disabled-foreground);">${this.error || 'Check if backend is running'}</p>
        <button class="px-4 py-2 text-xs font-medium rounded-md text-white cursor-pointer" style="background: var(--brand-primary, #6366f1);" @click=${() => this.loadProviders()}>Try Again</button>
      </div>
    `;
  }

  private renderEmpty() {
    return html`
      <div class="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div class="w-14 h-14 mb-4 flex items-center justify-center rounded-xl bg-[var(--app-hover-background)]">
          <iconify-icon icon="mdi:layers-outline" width="28" style="color: var(--brand-primary, #6366f1); opacity: 0.4;"></iconify-icon>
        </div>
        <p class="text-xs font-medium mb-1" style="color: var(--app-disabled-foreground);">No providers configured</p>
        <p class="text-[10px]" style="color: var(--app-disabled-foreground); opacity: 0.7;">Click a provider to get started</p>
      </div>
    `;
  }

  private renderProviderCategory(title: string, providers: ProviderInfo[], category: Category) {
    if (providers.length === 0) return html``;
    const color = CATEGORY_COLORS[category];
    return html`
      <div class="mb-4">
        <div class="text-[10px] font-bold uppercase tracking-wider px-3 py-1" style="color: ${color};">${title}</div>
        <div class="flex flex-col gap-0.5">
          ${providers.map(p => html`
            <provider-card
              .provider=${p}
              .enabled=${this.enabledProviders.has(p.id)}
              .status=${this.getProviderStatus(p.id)}
              .categoryColor=${color}
              @open-config-modal=${this.handleOpenConfig}
              @toggle-provider=${this.handleToggleProvider}
            ></provider-card>
          `)}
        </div>
      </div>
    `;
  }

  private renderProviderList() {
    const { local, free, cloud } = this.categorizeProviders();
    const hasAny = local.length > 0 || free.length > 0 || cloud.length > 0;

    if (!hasAny) {
      return this.renderEmpty();
    }

    return html`
      ${this.renderProviderCategory('Local', local, 'local')}
      ${this.renderProviderCategory('Free Cloud', free, 'free')}
      ${this.renderProviderCategory('Cloud', cloud, 'cloud')}
    `;
  }

  render() {
    return html`
      <div class="flex flex-col h-full w-full" style="background-color: var(--activitybar-background);">
        <div class="flex items-center justify-between h-[35px] px-3 shrink-0 border-b"
             style="background: linear-gradient(to bottom, var(--app-tab-inactive), var(--app-toolbar-hover)); border-bottom-color: var(--app-border);">
          <div class="flex items-center gap-1.5">
            <iconify-icon icon="mdi:cpu-64-bit" width="14"></iconify-icon>
            <span class="text-[10px] font-bold uppercase tracking-wide" style="color: var(--app-disabled-foreground);">Models</span>
          </div>
          <button class="p-1 cursor-pointer rounded" style="color: var(--app-disabled-foreground);"
            @click=${() => this.loadProviders()}
            @mouseenter=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'var(--app-toolbar-hover)'}
            @mouseleave=${(e: Event) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
            title="Refresh"
          >
            <iconify-icon icon="codicon:refresh" width="14" height="14"></iconify-icon>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto">
          ${this.isLoading
            ? this.renderLoading()
            : this.error
              ? this.renderError()
              : this.renderProviderList()}
        </div>
      </div>

      ${this.configuringProvider ? html`
        <provider-config-modal
          .provider=${this.configuringProvider}
          .config=${this.providerConfigs[this.configuringProvider.id] || { enabled: false, api_key: '', base_url: '', model: '' }}
          @close=${() => { this.configuringProvider = null; }}
          @save=${this.handleSaveProvider}
        ></provider-config-modal>
      ` : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'models-panel': ModelsPanel;
  }
}
