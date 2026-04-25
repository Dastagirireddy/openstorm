import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { dispatch } from './events.js';

export interface LspServerInfo {
  language_id: string;
  server_name: string;
  install_command: string;
  is_installed: boolean;
}

export interface LspInstallProgress {
  languageId: string;
  percentage: number;
}

const LSP_DISPLAY_NAMES: Record<string, string> = {
  rust: 'rust-analyzer',
  go: 'gopls',
  python: 'pyright',
  cpp: 'clangd',
  typescript: 'typescript-language-server',
  javascript: 'typescript-language-server',
};

export const getServerDisplayName = (id: string) => LSP_DISPLAY_NAMES[id] || `${id}-language-server`;

export class LspService {
  private static instance: LspService;
  private progressListeners: Map<string, UnlistenFn> = new Map();

  static getInstance(): LspService {
    if (!LspService.instance) {
      LspService.instance = new LspService();
    }
    return LspService.instance;
  }

  async getStatus(): Promise<LspServerInfo[]> {
    try {
      return await invoke('get_lsp_server_status');
    } catch (e) {
      console.error('Failed to get LSP status:', e);
      return [];
    }
  }

  async installServer(
    languageId: string,
    onProgress?: (progress: LspInstallProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    let unlisten: UnlistenFn | null = null;

    try {
      unlisten = await listen('lsp-install-progress', (event: any) => {
        if (event.payload.language_id === languageId && onProgress) {
          onProgress({
            languageId: event.payload.language_id,
            percentage: event.payload.percentage,
          });
        }
      });

      await invoke('install_lsp_server', { languageId });
      dispatch('lsp-server-ready', { languageId });

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  }

  cancelProgress(languageId: string) {
    const unlisten = this.progressListeners.get(languageId);
    if (unlisten) {
      unlisten();
      this.progressListeners.delete(languageId);
    }
  }
}
