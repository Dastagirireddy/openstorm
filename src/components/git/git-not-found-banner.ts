/**
 * Git Not Found Banner
 *
 * Displays a notification when git is not installed on the system.
 */

import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import { dispatch } from '../../lib/events.js';
import { listen } from '@tauri-apps/api/event';

@customElement('git-not-found-banner')
export class GitNotFoundBanner extends TailwindElement() {
  @state() private visible = false;
  @state() private dismissed = false;
  @state() private repoNotInitialized = false;

  connectedCallback(): void {
    super.connectedCallback();

    // Listen for git-not-found event from backend
    this.addEventListener('git-not-found', () => {
      if (!this.dismissed) {
        this.visible = true;
        this.repoNotInitialized = false;
      }
    });

    // Listen for git-repo-not-initialized event
    this.addEventListener('git-repo-not-initialized', () => {
      if (!this.dismissed) {
        this.visible = true;
        this.repoNotInitialized = true;
      }
    });

    // Also listen via document for Tauri events
    this.setupTauriListener();
  }

  private async setupTauriListener(): Promise<void> {
    try {
      await listen('git-not-found', () => {
        if (!this.dismissed) {
          this.visible = true;
          this.repoNotInitialized = false;
        }
      });
      await listen('git-repo-not-initialized', () => {
        if (!this.dismissed) {
          this.visible = true;
          this.repoNotInitialized = true;
        }
      });
    } catch (e) {
      // Tauri not available (dev mode)
    }
  }

  private dismiss(): void {
    this.dismissed = true;
    this.visible = false;
    this.repoNotInitialized = false;
  }

  private openInstallPage(): void {
    // Open git download page based on platform
    const platform = navigator.platform.toLowerCase();
    let url = 'https://git-scm.com/downloads';

    if (platform.includes('mac')) {
      url = 'https://git-scm.com/download/mac';
    } else if (platform.includes('win')) {
      url = 'https://git-scm.com/download/win';
    } else if (platform.includes('linux')) {
      url = 'https://git-scm.com/download/linux';
    }

    window.open(url, '_blank');
  }

  private openGitPanel(): void {
    dispatch('set-active-activity', { activity: 'git' });
    this.dismiss();
  }

  render() {
    if (!this.visible) {
      return html``;
    }

    // Repository not initialized - different message and action
    if (this.repoNotInitialized) {
      return html`
        <div
          class="flex items-center justify-between px-4 py-2.5 border-b"
          style="background-color: var(--app-warning-background, #fef3c7); border-color: var(--app-warning-border, #fcd34d);">

          <div class="flex items-center gap-2.5">
            <os-icon name="alert-circle" color="#ca8a04" size="18"></os-icon>
            <span class="text-[13px] font-medium" style="color: var(--app-warning-foreground, #92400e);">
              Git repository not initialized. Initialize to enable version control features.
            </span>
          </div>

          <div class="flex items-center gap-2">
            <button
              class="px-3 py-1 text-[12px] font-medium rounded transition-colors"
              style="background-color: var(--app-button-background, #4f46e5); color: var(--app-button-foreground, white);"
              @mouseenter=${(e: Event) => {
                (e.target as HTMLElement).style.backgroundColor = 'var(--app-button-hover, #4338ca)';
              }}
              @mouseleave=${(e: Event) => {
                (e.target as HTMLElement).style.backgroundColor = 'var(--app-button-background, #4f46e5)';
              }}
              @click=${() => this.openGitPanel()}>
              Open Git Panel
            </button>

            <button
              class="p-1 rounded transition-colors"
              style="color: var(--app-warning-foreground, #92400e);"
              @mouseenter=${(e: Event) => {
                (e.target as HTMLElement).style.backgroundColor = 'var(--app-warning-hover, #fef08a)';
              }}
              @mouseleave=${(e: Event) => {
                (e.target as HTMLElement).style.backgroundColor = 'transparent';
              }}
              @click=${() => this.dismiss()}>
              <os-icon name="x" size="14"></os-icon>
            </button>
          </div>
        </div>
      `;
    }

    // Git not installed
    return html`
      <div
        class="flex items-center justify-between px-4 py-2.5 border-b"
        style="background-color: var(--app-warning-background, #fef3c7); border-color: var(--app-warning-border, #fcd34d);">

        <div class="flex items-center gap-2.5">
          <os-icon name="alert-circle" color="#ca8a04" size="18"></os-icon>
          <span class="text-[13px] font-medium" style="color: var(--app-warning-foreground, #92400e);">
            Git not found. Install Git to enable version control features.
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            class="px-3 py-1 text-[12px] font-medium rounded transition-colors"
            style="background-color: var(--app-button-background, #4f46e5); color: var(--app-button-foreground, white);"
            @mouseenter=${(e: Event) => {
              (e.target as HTMLElement).style.backgroundColor = 'var(--app-button-hover, #4338ca)';
            }}
            @mouseleave=${(e: Event) => {
              (e.target as HTMLElement).style.backgroundColor = 'var(--app-button-background, #4f46e5)';
            }}
            @click=${() => this.openInstallPage()}>
            Install Git
          </button>

          <button
            class="p-1 rounded transition-colors"
            style="color: var(--app-warning-foreground, #92400e);"
            @mouseenter=${(e: Event) => {
              (e.target as HTMLElement).style.backgroundColor = 'var(--app-warning-hover, #fef08a)';
            }}
            @mouseleave=${(e: Event) => {
              (e.target as HTMLElement).style.backgroundColor = 'transparent';
            }}
            @click=${() => this.dismiss()}>
            <os-icon name="x" size="14"></os-icon>
          </button>
        </div>
      </div>
    `;
  }
}
