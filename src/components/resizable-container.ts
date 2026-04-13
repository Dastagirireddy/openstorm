import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TailwindElement } from '../tailwind-element.js';

@customElement('resizable-container')
export class ResizableContainer extends TailwindElement() {
  @property({ type: String }) direction: 'horizontal' | 'vertical' = 'horizontal';
  @property({ type: Number }) initialSize = 250;
  @property({ type: Number }) minSize = 100;
  @property({ type: Number }) maxSize = 600;
  @property({ type: String }) firstPanelClass = '';
  @property({ type: String }) secondPanelClass = '';

  @state() private currentSize = 0;
  @state() private isDragging = false;

  private dragStartPos = 0;
  private dragStartSize = 0;

  connectedCallback(): void {
    super.connectedCallback();
    this.currentSize = this.initialSize;
    // Add global drag listeners
    window.addEventListener('mousemove', this.handleGlobalDragMove);
    window.addEventListener('mouseup', this.handleGlobalDragEnd);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    // Clean up global drag listeners
    window.removeEventListener('mousemove', this.handleGlobalDragMove);
    window.removeEventListener('mouseup', this.handleGlobalDragEnd);
  }

  private handleDragStart = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging = true;
    this.dragStartPos = this.direction === 'horizontal' ? e.clientX : e.clientY;
    this.dragStartSize = this.currentSize;
    document.body.style.cursor = this.direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  };

  private handleGlobalDragMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;

    const currentPos = this.direction === 'horizontal' ? e.clientX : e.clientY;
    const delta = currentPos - this.dragStartPos;
    let newSize = this.dragStartSize + delta;

    // Clamp to min/max
    newSize = Math.max(this.minSize, Math.min(this.maxSize, newSize));
    this.currentSize = newSize;

    // Emit size change during drag for live preview
    this.dispatchEvent(new CustomEvent('size-change', {
      detail: { size: this.currentSize },
      bubbles: true,
      composed: true,
    }));
  };

  private handleGlobalDragEnd = (): void => {
    if (!this.isDragging) return;
    this.isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    // Emit final size
    this.dispatchEvent(new CustomEvent('size-change', {
      detail: { size: this.currentSize },
      bubbles: true,
      composed: true,
    }));
  };

  render() {
    const isHorizontal = this.direction === 'horizontal';
    const sizeStyle = isHorizontal ? `width: ${this.currentSize}px` : `height: ${this.currentSize}px`;

    return html`
      <div class="resizable-container ${isHorizontal ? 'horizontal' : 'vertical'}">
        <div class="panel first ${this.firstPanelClass} ${this.isDragging ? 'dragging' : ''}" style=${sizeStyle}>
          <slot name="first"></slot>
          <div
            class="resize-handle ${isHorizontal ? 'horizontal' : 'vertical'}"
            @mousedown=${this.handleDragStart}
          >
          </div>
        </div>

        <div class="panel second ${this.secondPanelClass}">
          <slot name="second"></slot>
        </div>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex: 1;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .resizable-container {
      display: flex;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .resizable-container.horizontal {
      flex-direction: row;
    }

    .resizable-container.vertical {
      flex-direction: column;
    }

    .panel {
      overflow: hidden;
      flex-shrink: 0;
      display: flex;
    }

    .panel.first {
      position: relative;
      flex-shrink: 0;
    }

    .resizable-container.horizontal .panel.first {
      height: 100%;
    }

    .resizable-container.vertical .panel.first {
      width: 100%;
    }

    .panel.second {
      flex: 1;
      min-width: 0;
      min-height: 0;
      display: flex;
      width: 100%;
      height: 100%;
    }

    .resizable-container.vertical .panel.first,
    .resizable-container.vertical .panel.second {
      width: 100%;
    }

    .resizable-container.horizontal .panel.first,
    .resizable-container.horizontal .panel.second {
      height: 100%;
    }

    .resize-handle {
      position: absolute;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.1s ease;
    }

    .resize-handle.horizontal {
      width: 6px;
      height: 100%;
      right: -3px;
      top: 0;
      cursor: col-resize;
    }

    .resize-handle.vertical {
      height: 6px;
      width: 100%;
      bottom: -3px;
      left: 0;
      cursor: row-resize;
    }

    .resize-handle:hover,
    .panel.first.dragging .resize-handle {
      background: transparent;
    }
  `;
}
