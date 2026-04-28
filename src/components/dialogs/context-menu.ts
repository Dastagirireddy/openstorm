import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../../tailwind-element.js';
import '../layout/icon.js';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
}

@customElement('context-menu')
export class ContextMenu extends TailwindElement() {
  @property({ type: Boolean }) open = false;
  @property({ type: Array }) items: ContextMenuItem[] = [];
  @property() anchorX = 0;
  @property() anchorY = 0;

  @state() private hoveredIndex = -1;

  private menuRef: HTMLElement | null = null;

  updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('open') && this.open) {
      this.hoveredIndex = -1;
      // Adjust position if menu goes off screen
      setTimeout(() => this.adjustPosition(), 0);
    }
    // Force update when anchor position changes while open
    if (this.open && (changedProperties.has('anchorX') || changedProperties.has('anchorY'))) {
      setTimeout(() => this.adjustPosition(), 0);
    }
  }

  private adjustPosition(): void {
    if (!this.menuRef) return;
    const rect = this.menuRef.getBoundingClientRect();
    const margin = 8;

    let newX = this.anchorX;
    let newY = this.anchorY;

    // Adjust X if menu goes off right edge
    if (rect.right > window.innerWidth - margin) {
      newX = window.innerWidth - rect.width - margin;
    }

    // Adjust Y if menu goes off bottom edge
    if (rect.bottom > window.innerHeight - margin) {
      newY = window.innerHeight - rect.height - margin;
    }

    // Adjust Y if menu goes off top edge
    if (rect.top < margin) {
      newY = margin;
    }

    if (newX !== this.anchorX || newY !== this.anchorY) {
      this.anchorX = newX;
      this.anchorY = newY;
    }
  }

  private handleItemClick = (item: ContextMenuItem): void => {
    if (item.disabled || item.separator) return;
    this.dispatchEvent(
      new CustomEvent('select', {
        detail: { itemId: item.id },
        bubbles: true,
        composed: true,
      }),
    );
    this.open = false;
  };

  private handleOverlayClick = (e: MouseEvent): void => {
    // Only close if clicking directly on overlay (not the menu)
    if (e.target === e.currentTarget) {
      this.open = false;
      // Notify parent to close
      this.dispatchEvent(
        new CustomEvent('close', {
          bubbles: true,
          composed: true,
        }),
      );
    }
  };

  private handleOverlayContextMenu = (e: MouseEvent): void => {
    // Close menu and notify parent
    this.open = false;
    this.dispatchEvent(
      new CustomEvent('close', {
        bubbles: true,
        composed: true,
      }),
    );

    // The overlay will be removed from DOM after Lit re-renders.
    // For immediate pass-through, set pointer-events to none
    const overlay = e.currentTarget as HTMLElement;
    overlay.style.pointerEvents = 'none';

    // Let Lit re-render and restore pointer events on next open
    setTimeout(() => {
      overlay.style.pointerEvents = '';
    }, 100);
  };

  private handleKeydown = (e: KeyboardEvent): void => {
    const visibleItems = this.items.filter(i => !i.separator);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.hoveredIndex = Math.min(this.hoveredIndex + 1, visibleItems.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.hoveredIndex = Math.max(this.hoveredIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.hoveredIndex >= 0 && visibleItems[this.hoveredIndex]) {
        this.handleItemClick(visibleItems[this.hoveredIndex]);
      }
    } else if (e.key === 'Escape') {
      this.open = false;
    }
  };

  render() {
    if (!this.open || this.items.length === 0) return html``;

    return html`
      <div
        class="fixed inset-0 z-40"
        @click=${this.handleOverlayClick}
        @contextmenu=${this.handleOverlayContextMenu}
        @keydown=${this.handleKeydown}
      >
        <div
          class="absolute rounded-md shadow-[0_4px_20px_rgba(0,0,0,0.15)] border overflow-hidden z-50 min-w-[180px] py-1"
          style="left: ${this.anchorX}px; top: ${this.anchorY}px; background-color: var(--app-bg); border-color: var(--app-border);"
          @click=${(e: Event) => e.stopPropagation()}
          @mousedown=${(e: Event) => e.stopPropagation()}
          @contextmenu=${(e: Event) => { e.preventDefault(); e.stopPropagation(); }}
        >
          ${this.items.map((item, index) => {
            if (item.separator) {
              return html`<div class="my-1 border-t" style="border-color: var(--app-border);"></div>`;
            }

            const actualIndex = this.items.filter(i => !i.separator).indexOf(item);
            const isHovered = actualIndex === this.hoveredIndex;

            return html`
              <div
                class="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors"
                style="background-color: ${isHovered ? 'var(--app-selection-background)' : 'transparent'}; color: ${isHovered ? 'var(--app-foreground)' : 'var(--app-foreground)'};"
                @mouseenter=${() => this.hoveredIndex = actualIndex}
                @mouseleave=${() => { if (!isHovered) this.hoveredIndex = -1; }}
                @click=${() => this.handleItemClick(item)}
              >
                ${item.icon ? html`
                  <os-icon name="${item.icon}" color="currentColor" size="14"></os-icon>
                ` : html`<span class="w-3.5"></span>`}
                <span class="flex-1 text-[12px]">${item.label}</span>
                ${item.shortcut ? html`
                  <span class="text-[10px]" style="color: var(--app-disabled-foreground);">${item.shortcut}</span>
                ` : ''}
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }
}
